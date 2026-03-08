import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { toOperationResultError } from '@/shared/lib/operationResult';
import { DragEndEvent, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { subscribeJoinClipsIntents } from '@/shared/lib/joinClipsIntentStore';
import type { VideoClip, TransitionPrompt } from '../types';
import type { useJoinClipsSettings } from './useJoinClipsSettings';
import type { useCreateGeneration } from '@/domains/generation/hooks/useGenerationMutations';
import {
  getCachedClipsCount,
  setCachedClipsCount,
  preloadPosterImages,
  consumePendingJoinClips,
  applyPendingClipActions,
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
  createEmptyClip,
  buildClipsToSave,
  buildPromptsToSave,
  getClipsNeedingDuration,
  loadClipDuration,
  normalizeClipSlots,
  uploadClipVideo,
  reorderClipsAndPrompts,
  updateClipInArray,
  clearClipVideo,
} from '../lib/clipManagerService';
interface UseClipManagerParams {
  selectedProjectId: string | null;
  joinSettings: ReturnType<typeof useJoinClipsSettings>;
  settingsLoaded: boolean;
  loopFirstClip: boolean;
  createGenerationMutation: ReturnType<typeof useCreateGeneration>;
}
export function useClipManager({
  selectedProjectId,
  joinSettings,
  settingsLoaded,
  loopFirstClip,
  createGenerationMutation,
}: UseClipManagerParams) {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  const [lightboxClip, setLightboxClip] = useState<VideoClip | null>(null);
  const [transitionPrompts, setTransitionPrompts] = useState<TransitionPrompt[]>([]);
  const [draggingOverClipId, setDraggingOverClipId] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);
  const [initialHydrationComplete, setInitialHydrationComplete] = useState(false);
  const [pendingIntentVersion, setPendingIntentVersion] = useState(0);
  const [cachedClipsCount, setCachedClipsCountState] = useState(() =>
    getCachedClipsCount(selectedProjectId),
  );
  const hasLoadedFromSettings = useRef(false);
  const loadedForProjectRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(selectedProjectId);
  const hydrationRequestVersionRef = useRef(0);
  const durationHydrationVersionRef = useRef(0);
  const pendingConsumeVersionRef = useRef(0);
  const preloadedPostersRef = useRef<Set<string>>(new Set());
  const fileInputRefs = useRef<{ [clipId: string]: HTMLInputElement | null }>({});
  const videoRefs = useRef<{ [clipId: string]: HTMLVideoElement | null }>({});
  useEffect(() => {
    activeProjectIdRef.current = selectedProjectId;
    if (selectedProjectId && selectedProjectId !== loadedForProjectRef.current) {
      hydrationRequestVersionRef.current += 1;
      durationHydrationVersionRef.current += 1;
      pendingConsumeVersionRef.current += 1;
      hasLoadedFromSettings.current = false;
      loadedForProjectRef.current = selectedProjectId;
      setInitialHydrationComplete(false);
      setClips([]);
      setTransitionPrompts([]);
      setIsLoadingPersistedMedia(false);
      preloadedPostersRef.current.clear();
      setCachedClipsCountState(getCachedClipsCount(selectedProjectId));
    }
  }, [selectedProjectId]);
  useEffect(() => {
    if (!selectedProjectId) return;
    const unsubscribe = subscribeJoinClipsIntents((scope) => {
      const scopeProjectId = scope.projectId ?? null;
      if (scopeProjectId && scopeProjectId !== selectedProjectId) {
        return;
      }
      setPendingIntentVersion((prev) => prev + 1);
    });
    return unsubscribe;
  }, [selectedProjectId]);
  useEffect(() => {
    if (!settingsLoaded || !selectedProjectId || !initialHydrationComplete) return;
    const projectIdAtRequestStart = selectedProjectId;
    const requestVersion = pendingConsumeVersionRef.current + 1;
    pendingConsumeVersionRef.current = requestVersion;
    let cancelled = false;
    void consumePendingJoinClips({ projectId: projectIdAtRequestStart }).then(result => {
      if (cancelled) {
        return;
      }
      const isCurrentRequest = (
        pendingConsumeVersionRef.current === requestVersion
        && activeProjectIdRef.current === projectIdAtRequestStart
      );
      if (!isCurrentRequest) {
        return;
      }
      if (!result.ok) {
        normalizeAndPresentError(toOperationResultError(result), {
          context: 'JoinClipsPage.pendingClipsConsume',
          showToast: false,
        });
        return;
      }
      const actions = result.value;
      if (actions.length > 0) {
        setClips(prev => applyPendingClipActions(prev, actions));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, selectedProjectId, initialHydrationComplete, pendingIntentVersion]);
  useEffect(() => {
    if (!selectedProjectId || !settingsLoaded || hasLoadedFromSettings.current) return;
    const projectIdAtHydrationStart = selectedProjectId;
    const requestVersion = hydrationRequestVersionRef.current + 1;
    hydrationRequestVersionRef.current = requestVersion;
    hasLoadedFromSettings.current = true;
    setInitialHydrationComplete(false);
    const isCurrentHydrationRequest = () => (
      hydrationRequestVersionRef.current === requestVersion
      && activeProjectIdRef.current === projectIdAtHydrationStart
    );
    const {
      clips: initialClips,
      transitionPrompts: initialPrompts,
      posterUrlsToPreload,
    } = buildInitialClipsFromSettings(joinSettings.settings);
    if (initialPrompts.length > 0) {
      setTransitionPrompts(initialPrompts);
    }
    if (initialClips.length > 0) {
      const clipsToSet = padClipsWithEmptySlots(initialClips);
      if (posterUrlsToPreload.length > 0) {
        setIsLoadingPersistedMedia(true);
        void preloadPosterImages(posterUrlsToPreload, preloadedPostersRef.current).then(() => {
          if (!isCurrentHydrationRequest()) {
            return;
          }
          setClips(clipsToSet);
          setIsLoadingPersistedMedia(false);
          setInitialHydrationComplete(true);
        });
      } else {
        if (!isCurrentHydrationRequest()) {
          return;
        }
        setClips(clipsToSet);
        setInitialHydrationComplete(true);
      }
    } else {
      if (!isCurrentHydrationRequest()) {
        return;
      }
      setClips([createEmptyClip(), createEmptyClip()]);
      setInitialHydrationComplete(true);
    }
  }, [selectedProjectId, joinSettings.settings, settingsLoaded]);
  useEffect(() => {
    if (!settingsLoaded || !initialHydrationComplete) return;
    const clipsToSave = buildClipsToSave(clips);
    setCachedClipsCount(selectedProjectId, clipsToSave.length);
    const promptsToSave = buildPromptsToSave(clips, transitionPrompts);
    const currentClipsJson = JSON.stringify(joinSettings.settings.clips || []);
    const newClipsJson = JSON.stringify(clipsToSave);
    const currentPromptsJson = JSON.stringify(joinSettings.settings.transitionPrompts || []);
    const newPromptsJson = JSON.stringify(promptsToSave);
    if (currentClipsJson !== newClipsJson || currentPromptsJson !== newPromptsJson) {
      joinSettings.updateFields({
        clips: clipsToSave,
        transitionPrompts: promptsToSave,
      });
    }
  }, [clips, transitionPrompts, settingsLoaded, joinSettings, selectedProjectId, initialHydrationComplete]);
  useEffect(() => {
    const clipsNeedingDuration = getClipsNeedingDuration(clips);
    if (clipsNeedingDuration.length === 0) return;
    const projectIdAtRequestStart = activeProjectIdRef.current;
    const requestVersion = durationHydrationVersionRef.current + 1;
    durationHydrationVersionRef.current = requestVersion;
    let cancelled = false;
    const isCurrentRequest = () => (
      !cancelled
      && durationHydrationVersionRef.current === requestVersion
      && activeProjectIdRef.current === projectIdAtRequestStart
    );
    setClips(prev =>
      prev.map(clip =>
        clipsNeedingDuration.some(c => c.id === clip.id)
          ? { ...clip, metadataLoading: true }
          : clip,
        ),
    );
    clipsNeedingDuration.forEach(async clip => {
      const result = await loadClipDuration(clip);
      if (!isCurrentRequest()) {
        return;
      }
      if (!result.ok) {
        normalizeAndPresentError(toOperationResultError(result), {
          context: 'JoinClipsPage.durationMetadata',
          showToast: false,
          logData: { clipId: clip.id },
        });
      }
      setClips(prev =>
        prev.map(c =>
          c.id === clip.id
            ? {
                ...c,
                ...(result.ok
                  ? {
                    durationSeconds: result.value.durationSeconds,
                    durationLoadFailed: false,
                  }
                  : {
                    durationLoadFailed: true,
                  }),
                metadataLoading: false,
              }
            : c,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [clips]);
  useEffect(() => {
    const result = normalizeClipSlots(clips);
    if (!result) return;
    setClips(result.clips);
    if (result.removedClipIds.length > 0) {
      setTransitionPrompts(prev =>
        prev.filter(p => !result.removedClipIds.includes(p.id)),
      );
    }
  }, [clips]);
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    clips.forEach(clip => {
      const video = videoRefs.current[clip.id];
      if (video) {
        const preventPlay = () => video.pause();
        video.addEventListener('play', preventPlay);
        video.pause();
        cleanups.push(() => {
          video.removeEventListener('play', preventPlay);
        });
      }
    });
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [clips]);
  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
      scrollTimer = setTimeout(() => {
        setIsScrolling(false);
        scrollTimer = null;
      }, 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
    };
  }, []);
  const uploadVideoFile = useCallback(async (
    file: File,
    clipId: string,
  ): Promise<{ videoUrl: string; posterUrl: string; finalFrameUrl: string; durationSeconds: number } | null> => {
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return null;
    }
    setUploadingClipId(clipId);
    try {
      const result = await uploadClipVideo(file);
      if (selectedProjectId) {
        try {
          await createGenerationMutation.mutateAsync({
            imageUrl: result.videoUrl,
            fileName: file.name,
            fileType: 'video',
            fileSize: file.size,
            projectId: selectedProjectId,
            prompt: 'Uploaded clip for Join',
            thumbnailUrl: result.posterUrl,
          });
        } catch (genError) {
          normalizeAndPresentError(genError, { context: 'JoinClipsPage', showToast: false });
        }
      }
      return result;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'JoinClipsPage', toastTitle: 'Upload failed' });
      return null;
    } finally {
      setUploadingClipId(null);
    }
  }, [selectedProjectId, createGenerationMutation]);
  const handleRemoveClip = useCallback((clipId: string) => {
    setClips(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(c => c.id !== clipId);
    });
    setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
  }, []);
  const handleClearVideo = useCallback(
    (clipId: string) => {
      const clipIndex = clips.findIndex(c => c.id === clipId);
      if (clipIndex === 0 && loopFirstClip) {
        joinSettings.updateField('loopFirstClip', false);
      }
      setClips(prev =>
        prev.map(clip => (clip.id === clipId ? clearClipVideo(clip) : clip)),
      );
      const fileInput = fileInputRefs.current[clipId];
      if (fileInput) fileInput.value = '';
      const videoElement = videoRefs.current[clipId];
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
      }
      setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
    },
    [clips, loopFirstClip, joinSettings],
  );
  const handleVideoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, clipId: string) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const result = await uploadVideoFile(file, clipId);
      if (!result) return;
      setClips(prev =>
        updateClipInArray(prev, clipId, {
          url: result.videoUrl,
          posterUrl: result.posterUrl,
          finalFrameUrl: result.finalFrameUrl,
          durationSeconds: result.durationSeconds,
          file,
          loaded: false,
          playing: false,
        }),
      );
    },
    [uploadVideoFile],
  );
  const handleDragOver = useCallback(
    (e: React.DragEvent, _clipId: string) => {
      if (isScrolling) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isScrolling],
  );
  const handleDragEnter = useCallback(
    (e: React.DragEvent, clipId: string) => {
      if (isScrolling) return;
      e.preventDefault();
      e.stopPropagation();
      const items = Array.from(e.dataTransfer.items);
      const hasValidVideo = items.some(
        item => item.kind === 'file' && item.type.startsWith('video/'),
      );
      if (hasValidVideo) {
        setDraggingOverClipId(clipId);
      }
    },
    [isScrolling],
  );
  const handleDragLeave = useCallback(
    (e: React.DragEvent, _clipId: string) => {
      if (isScrolling) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        setDraggingOverClipId(null);
      }
    },
    [isScrolling],
  );
  const handleDrop = useCallback(
    async (e: React.DragEvent, clipId: string) => {
      if (isScrolling) return;
      e.preventDefault();
      e.stopPropagation();
      setDraggingOverClipId(null);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const result = await uploadVideoFile(file, clipId);
      if (!result) return;
      setClips(prev =>
        updateClipInArray(prev, clipId, {
          url: result.videoUrl,
          posterUrl: result.posterUrl,
          finalFrameUrl: result.finalFrameUrl,
          durationSeconds: result.durationSeconds,
          file,
          loaded: false,
          playing: false,
        }),
      );
    },
    [isScrolling, uploadVideoFile],
  );
  const handlePromptChange = useCallback((clipId: string, prompt: string) => {
    setTransitionPrompts(prev => {
      const existing = prev.find(p => p.id === clipId);
      if (existing) {
        return prev.map(p => (p.id === clipId ? { ...p, prompt } : p));
      } else {
        return [...prev, { id: clipId, prompt }];
      }
    });
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const reordered = reorderClipsAndPrompts(
        clips,
        transitionPrompts,
        active.id,
        over.id,
      );
      setClips(reordered.clips);
      setTransitionPrompts(reordered.transitionPrompts);
    },
    [clips, transitionPrompts],
  );
  return {
    clips,
    setClips,
    transitionPrompts,
    uploadingClipId,
    draggingOverClipId,
    isScrolling,
    lightboxClip,
    setLightboxClip,
    isLoadingPersistedMedia,
    cachedClipsCount,
    videoRefs,
    fileInputRefs,
    handleRemoveClip,
    handleClearVideo,
    handleVideoUpload,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePromptChange,
    sensors,
    handleDragEnd,
  };
}
