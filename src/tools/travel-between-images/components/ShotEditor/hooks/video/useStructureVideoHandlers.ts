/**
 * useStructureVideoHandlers - Structure video setting handlers
 *
 * Array-first handlers for the travel structure video state.
 * Keeps the mode-switch behavior centralized while avoiding legacy config shims.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { UseStructureVideoReturn } from './useStructureVideo';

interface UseStructureVideoHandlersOptions {
  structureVideos: StructureVideoConfigWithMetadata[];
  setStructureVideos: UseStructureVideoReturn['setStructureVideos'];
  updateStructureVideo: UseStructureVideoReturn['updateStructureVideo'];
  structureVideoPath: UseStructureVideoReturn['structureVideoPath'];
  structureVideoType: UseStructureVideoReturn['structureVideoType'];
  generationTypeMode: 'i2v' | 'vace';
  setGenerationTypeMode: (mode: 'i2v' | 'vace') => void;
}

interface UseStructureVideoHandlersReturn {
  handleUni3cEndPercentChange: (value: number) => void;
  handleStructureVideoMotionStrengthChange: (strength: number) => void;
  handleStructureTypeChangeFromMotionControl: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  handleStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
}

export function useStructureVideoHandlers({
  structureVideos,
  setStructureVideos,
  updateStructureVideo,
  structureVideoPath,
  structureVideoType,
  generationTypeMode,
  setGenerationTypeMode,
}: UseStructureVideoHandlersOptions): UseStructureVideoHandlersReturn {
  const switchModeForStructureType = useCallback((type: 'uni3c' | 'flow' | 'canny' | 'depth') => {
    const targetMode = type === 'uni3c' ? 'i2v' : 'vace';
    if (generationTypeMode !== targetMode) {
      setGenerationTypeMode(targetMode);
    }
  }, [generationTypeMode, setGenerationTypeMode]);

  const handleUni3cEndPercentChange = useCallback((value: number) => {
    if (structureVideos.length === 0) return;
    updateStructureVideo(0, { uni3c_end_percent: value });
  }, [structureVideos.length, updateStructureVideo]);

  const handleStructureVideoMotionStrengthChange = useCallback((strength: number) => {
    if (structureVideos.length === 0) return;
    updateStructureVideo(0, { motion_strength: strength });
  }, [structureVideos.length, updateStructureVideo]);

  const handleStructureTypeChangeFromMotionControl = useCallback((type: 'uni3c' | 'flow' | 'canny' | 'depth') => {
    if (structureVideos.length > 0) {
      structureVideos.forEach((_, index) => {
        updateStructureVideo(index, { structure_type: type });
      });
    }
    switchModeForStructureType(type);
  }, [structureVideos, updateStructureVideo, switchModeForStructureType]);

  const handleStructureVideoInputChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => {
    if (!videoPath) {
      setStructureVideos([]);
      if (generationTypeMode !== 'i2v') {
        setGenerationTypeMode('i2v');
      }
      return;
    }

    const existing = structureVideos[0];
    const nextPrimary: StructureVideoConfigWithMetadata = {
      path: videoPath,
      start_frame: existing?.start_frame ?? 0,
      end_frame: existing?.end_frame ?? 81,
      treatment,
      motion_strength: motionStrength,
      structure_type: structureType,
      uni3c_end_percent: existing?.uni3c_end_percent ?? 0.1,
      metadata: metadata ?? null,
      resource_id: resourceId ?? null,
    };

    if (structureVideos.length > 0) {
      setStructureVideos([nextPrimary, ...structureVideos.slice(1)]);
    } else {
      setStructureVideos([nextPrimary]);
    }

    switchModeForStructureType(structureType);
  }, [
    generationTypeMode,
    setGenerationTypeMode,
    setStructureVideos,
    structureVideos,
    switchModeForStructureType,
  ]);

  const prevStructureVideoPath = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevStructureVideoPath.current === undefined) {
      prevStructureVideoPath.current = structureVideoPath;
      return;
    }

    const wasAdded = !prevStructureVideoPath.current && structureVideoPath;
    const wasRemoved = prevStructureVideoPath.current && !structureVideoPath;

    if (wasAdded) {
      switchModeForStructureType(structureVideoType);
    } else if (wasRemoved && generationTypeMode !== 'i2v') {
      setGenerationTypeMode('i2v');
    }

    prevStructureVideoPath.current = structureVideoPath;
  }, [
    generationTypeMode,
    setGenerationTypeMode,
    structureVideoPath,
    structureVideoType,
    switchModeForStructureType,
  ]);

  return {
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoInputChange,
  };
}
