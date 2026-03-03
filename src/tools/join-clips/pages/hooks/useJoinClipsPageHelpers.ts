import { useEffect, useMemo, useRef } from 'react';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import {
  calculateEffectiveFrameCount,
  type ClipFrameInfo,
  type ValidationResult,
  validateClipsForJoin,
} from '@/tools/join-clips/utils/validation';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm';
import type { useClipManager } from '@/tools/join-clips/hooks/useClipManager';
import type { useJoinClipsSettings } from '@/tools/join-clips/hooks/useJoinClipsSettings';
import type { useLoraManager } from '@/shared/hooks/useLoraManager';

export type JoinSettingsState = ReturnType<typeof useJoinClipsSettings>;
export type ClipManagerState = ReturnType<typeof useClipManager>;
export type LoraManagerState = ReturnType<typeof useLoraManager>;

export function useSyncJoinClipsLoras(
  settingsLoaded: boolean,
  selectedLoras: LoraManagerState['selectedLoras'],
  joinSettings: JoinSettingsState,
) {
  const lorasSyncStateRef = useRef<{ lastSyncedKey: string }>({ lastSyncedKey: '' });

  useEffect(() => {
    if (!settingsLoaded) return;

    const lorasKey = selectedLoras
      .map((lora) => `${lora.id}:${lora.strength}`)
      .sort((a, b) => a.localeCompare(b))
      .join(',');

    if (lorasKey === lorasSyncStateRef.current.lastSyncedKey) return;

    lorasSyncStateRef.current.lastSyncedKey = lorasKey;
    joinSettings.updateField(
      'loras',
      selectedLoras.map((lora) => ({
        id: lora.id,
        strength: lora.strength,
      })),
    );
  }, [settingsLoaded, selectedLoras, joinSettings]);
}

export function useEnsureKeepBridgingImages(
  keepBridgingImages: boolean | undefined,
  settingsLoaded: boolean,
  joinSettings: JoinSettingsState,
) {
  useEffect(() => {
    if (keepBridgingImages === undefined && settingsLoaded) {
      joinSettings.updateField('keepBridgingImages', false);
    }
  }, [keepBridgingImages, settingsLoaded, joinSettings]);
}

export function useJoinValidationResult(
  clips: ClipManagerState['clips'],
  contextFrameCount: number,
  gapFrameCount: number,
  replaceMode: boolean,
  useInputVideoFps: boolean,
): ValidationResult | null {
  return useMemo(() => {
    const validClips = clips.filter((clip) => clip.url);
    if (validClips.length < 2) return null;

    const stillLoading = validClips.some(
      (clip) => clip.metadataLoading || clip.durationSeconds === undefined,
    );
    if (stillLoading) return null;

    const clipFrameInfos: ClipFrameInfo[] = validClips.map((clip, index) => ({
      index,
      name: `Clip #${index + 1}`,
      frameCount: clip.durationSeconds
        ? calculateEffectiveFrameCount(clip.durationSeconds, useInputVideoFps)
        : 0,
      durationSeconds: clip.durationSeconds,
      source: clip.durationSeconds ? 'estimated' : 'unknown',
    }));

    return validateClipsForJoin(clipFrameInfos, contextFrameCount, gapFrameCount, replaceMode);
  }, [clips, contextFrameCount, gapFrameCount, replaceMode, useInputVideoFps]);
}

export function useJoinClipPairs(
  clips: ClipManagerState['clips'],
  useInputVideoFps: boolean,
): ClipPairInfo[] {
  return useMemo(() => {
    const validClips = clips.filter((clip) => clip.url);
    if (validClips.length < 2) return [];

    const pairs: ClipPairInfo[] = [];
    for (let i = 0; i < validClips.length - 1; i++) {
      const clipA = validClips[i];
      const clipB = validClips[i + 1];

      const clipAFrameCount = clipA.durationSeconds
        ? calculateEffectiveFrameCount(clipA.durationSeconds, useInputVideoFps)
        : 0;
      const clipBFrameCount = clipB.durationSeconds
        ? calculateEffectiveFrameCount(clipB.durationSeconds, useInputVideoFps)
        : 0;

      pairs.push({
        pairIndex: i,
        clipA: {
          name: `Clip ${i + 1}`,
          frameCount: clipAFrameCount,
          finalFrameUrl: clipA.finalFrameUrl,
        },
        clipB: {
          name: `Clip ${i + 2}`,
          frameCount: clipBFrameCount,
          posterUrl: clipB.posterUrl,
        },
      });
    }

    return pairs;
  }, [clips, useInputVideoFps]);
}

export function useRefreshOnVisibility(
  selectedProjectId: string | null,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unified.projectPrefix(selectedProjectId),
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedProjectId, queryClient]);
}
