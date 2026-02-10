/**
 * Handles persistence of stroke data across media switches.
 * Three-layer persistence: localStorage, in-memory cache, and database (for editMode).
 */

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { BrushStroke, EditMode, AnnotationMode, MediaStateCache, StrokeCache } from './types';
import { useEditModePersistence } from './useEditModePersistence';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

interface UseMediaPersistenceProps {
  media: GenerationRow;
  activeVariantId?: string | null;
  isInpaintMode: boolean;
  initialEditMode?: EditMode;
}

interface UseMediaPersistenceReturn {
  // State
  editMode: EditMode;
  annotationMode: AnnotationMode;
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  brushSize: number;
  // Setters
  setEditMode: (mode: EditMode | ((prev: EditMode) => EditMode)) => void;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;
  setInpaintStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setAnnotationStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
}

export function useMediaPersistence({
  media,
  activeVariantId,
  isInpaintMode,
  initialEditMode,
}: UseMediaPersistenceProps): UseMediaPersistenceReturn {
  // Storage key uses variant ID if available, otherwise falls back to generation ID
  const storageKey = activeVariantId
    ? `inpaint-data-${media.id}-variant-${activeVariantId}`
    : `inpaint-data-${media.id}`;

  // Get actual generation ID (may differ from media.id for shot_generations)
  const actualGenerationId = getGenerationId(media);

  // DB persistence hooks
  const { loadEditModeFromDB, saveEditModeToDB } = useEditModePersistence();

  // ============================================
  // State
  // ============================================
  const [editMode, setEditModeInternal] = useState<EditMode>(initialEditMode || 'text');
  const [annotationMode, setAnnotationModeInternal] = useState<AnnotationMode>(null);
  const [inpaintStrokes, setInpaintStrokes] = useState<BrushStroke[]>([]);
  const [annotationStrokes, setAnnotationStrokes] = useState<BrushStroke[]>([]);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintNumGenerations, setInpaintNumGenerations] = useState(4);
  const [brushSize, setBrushSize] = useState(20);

  // ============================================
  // Refs for caching and tracking
  // ============================================
  const prevStorageKeyRef = useRef<string>(storageKey);
  const prevMediaIdRef = useRef(media.id);
  const lastUsedEditModeRef = useRef<EditMode>('text');
  const transitionRafRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMediaTransitioningRef = useRef(false);

  // Per-media state caches
  const mediaStateRef = useRef<Map<string, MediaStateCache>>(new Map());
  const mediaStrokeCacheRef = useRef<Map<string, StrokeCache>>(new Map());
  const hydratedMediaIdsRef = useRef<Set<string>>(new Set());

  // ============================================
  // Wrapped setters that persist to cache and DB
  // ============================================
  const setEditMode = useCallback((value: EditMode | ((prev: EditMode) => EditMode)) => {
    setEditModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'text', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, editMode: newValue });

      // Update global last-used mode (for inheritance)
      lastUsedEditModeRef.current = newValue;

      // Save to database (async, non-blocking)
      saveEditModeToDB(actualGenerationId, newValue);

      return newValue;
    });
  }, [media.id, actualGenerationId, saveEditModeToDB]);

  const setAnnotationMode = useCallback((value: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => {
    setAnnotationModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'text', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, annotationMode: newValue });
      return newValue;
    });
  }, [media.id]);

  // ============================================
  // Save to localStorage (with error handling)
  // ============================================
  const saveToLocalStorage = useCallback(() => {
    if (!isInpaintMode) return;

    try {
      const data = {
        inpaintStrokes,
        annotationStrokes,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        brushSize,
        savedAt: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
    }
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, storageKey]);

  // ============================================
  // Media switching (synchronous for no flicker)
  // ============================================
  useLayoutEffect(() => {
    // Only run if media.id actually changed
    if (prevMediaIdRef.current === media.id) {
      return;
    }

    const oldMediaId = prevMediaIdRef.current;
    const newMediaId = media.id;
    const newActualGenerationId = getGenerationId(media);

    // Cancel any pending transition completion callback from previous switch
    if (transitionRafRef.current !== null) {
      cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }

    // Set transition flag to prevent issues mid-swap
    isMediaTransitioningRef.current = true;

    // Cancel any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // 1. Save current media's state to cache before switching
    if (oldMediaId) {
      mediaStrokeCacheRef.current.set(oldMediaId, {
        inpaintStrokes,
        annotationStrokes,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        brushSize,
      });
    }

    // 2. Clear stroke state immediately (prevents stale strokes from rendering)
    setInpaintStrokes([]);
    setAnnotationStrokes([]);

    // 3. Try to load from in-memory cache first (instant, no flicker)
    const cached = mediaStrokeCacheRef.current.get(newMediaId);
    if (cached) {
      setInpaintStrokes(cached.inpaintStrokes);
      setAnnotationStrokes(cached.annotationStrokes);
      setInpaintPrompt(cached.prompt);
      setInpaintNumGenerations(cached.numGenerations);
      setBrushSize(cached.brushSize);
    } else if (isInpaintMode && !hydratedMediaIdsRef.current.has(storageKey)) {
      // 4. Load from localStorage if not in cache (only once per media/variant combo)
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];

          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          setInpaintPrompt(parsed.prompt || '');
          setInpaintNumGenerations(parsed.numGenerations || 1);
          setBrushSize(parsed.brushSize || 20);

          hydratedMediaIdsRef.current.add(storageKey);

        }
      } catch (e) {
      }
    }

    // 5. Restore UI state (mode, annotation mode)
    const savedState = mediaStateRef.current.get(newMediaId);
    if (savedState) {
      setEditModeInternal(savedState.editMode);
      setAnnotationModeInternal(savedState.annotationMode);
      lastUsedEditModeRef.current = savedState.editMode;
    } else {
      // Not in cache - try loading from database
      loadEditModeFromDB(newActualGenerationId).then(dbMode => {
        // Only apply if we're still on the same media
        if (prevMediaIdRef.current === newMediaId) {
          if (dbMode) {
            setEditModeInternal(dbMode);
            lastUsedEditModeRef.current = dbMode;
            mediaStateRef.current.set(newMediaId, { editMode: dbMode, annotationMode: null });
          } else {
            // Inherit from last used or default to 'text'
            const inheritedMode = lastUsedEditModeRef.current;
            setEditModeInternal(inheritedMode);
            mediaStateRef.current.set(newMediaId, { editMode: inheritedMode, annotationMode: null });
            saveEditModeToDB(newActualGenerationId, inheritedMode);
          }
        }
      }).catch(() => {
        // Fallback to inherited mode
        if (prevMediaIdRef.current === newMediaId) {
          const inheritedMode = lastUsedEditModeRef.current;
          setEditModeInternal(inheritedMode);
          mediaStateRef.current.set(newMediaId, { editMode: inheritedMode, annotationMode: null });
        }
      });

      // Set initial mode immediately (will be updated by DB response)
      setEditModeInternal(lastUsedEditModeRef.current);
      setAnnotationModeInternal(null);
    }

    prevMediaIdRef.current = newMediaId;

    // Clear transition flag after a frame
    transitionRafRef.current = requestAnimationFrame(() => {
      if (prevMediaIdRef.current === newMediaId) {
        isMediaTransitioningRef.current = false;
      }
      transitionRafRef.current = null;
    });
  }, [media.id, isInpaintMode, loadEditModeFromDB, saveEditModeToDB, storageKey,
      inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize]);

  // ============================================
  // Variant switching
  // ============================================
  useEffect(() => {
    if (prevStorageKeyRef.current !== storageKey) {

      // Save current strokes to old key before switching
      if (isInpaintMode && (inpaintStrokes.length > 0 || annotationStrokes.length > 0)) {
        try {
          const data = {
            inpaintStrokes,
            annotationStrokes,
            prompt: inpaintPrompt,
            numGenerations: inpaintNumGenerations,
            brushSize,
            savedAt: Date.now()
          };
          localStorage.setItem(prevStorageKeyRef.current, JSON.stringify(data));
        } catch (e) {
        }
      }

      // Load strokes from new variant's key
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];

          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
        } else {
          setInpaintStrokes([]);
          setAnnotationStrokes([]);
        }
      } catch (e) {
        setInpaintStrokes([]);
        setAnnotationStrokes([]);
      }

      prevStorageKeyRef.current = storageKey;
    }
  }, [storageKey, isInpaintMode, inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize]);

  // ============================================
  // Debounced auto-save (500ms delay)
  // ============================================
  useEffect(() => {
    if (!isInpaintMode) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage();
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, saveToLocalStorage]);

  // ============================================
  // Immediate save on unmount
  // ============================================
  useEffect(() => {
    return () => {
      if (isInpaintMode) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveToLocalStorage();
      }
    };
  }, [isInpaintMode, saveToLocalStorage]);

  return {
    editMode,
    annotationMode,
    inpaintStrokes,
    annotationStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    setEditMode,
    setAnnotationMode,
    setInpaintStrokes,
    setAnnotationStrokes,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
  };
}
