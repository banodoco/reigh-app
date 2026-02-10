/**
 * useStructureVideoHandlers - Structure video setting handlers
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles:
 * - Uni3c end percent changes
 * - Motion strength changes
 * - Structure type changes with auto mode switching
 * - Structure video change with mode switch wrapper
 * - Auto-switch effect when structure video is added/removed
 */

import { useCallback, useRef, useEffect } from 'react';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { UseStructureVideoReturn } from './useStructureVideo';

interface StructureVideoEntry {
  structure_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  [key: string]: unknown;
}

interface UseStructureVideoHandlersOptions {
  // Structure video hook return values
  structureVideoConfig: UseStructureVideoReturn['structureVideoConfig'];
  setStructureVideoConfig: UseStructureVideoReturn['setStructureVideoConfig'];
  structureVideoPath: UseStructureVideoReturn['structureVideoPath'];
  structureVideoMetadata: UseStructureVideoReturn['structureVideoMetadata'];
  structureVideoTreatment: UseStructureVideoReturn['structureVideoTreatment'];
  structureVideoMotionStrength: UseStructureVideoReturn['structureVideoMotionStrength'];
  structureVideoType: UseStructureVideoReturn['structureVideoType'];
  handleStructureVideoChange: UseStructureVideoReturn['handleStructureVideoChange'];
  structureVideos: StructureVideoEntry[];
  updateStructureVideo: (index: number, updates: Partial<StructureVideoEntry>) => void;
  // Generation type mode from context
  generationTypeMode: 'i2v' | 'vace';
  setGenerationTypeMode: (mode: 'i2v' | 'vace') => void;
}

interface UseStructureVideoHandlersReturn {
  handleUni3cEndPercentChange: (value: number) => void;
  handleStructureVideoMotionStrengthChange: (strength: number) => void;
  handleStructureTypeChangeFromMotionControl: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  handleStructureVideoChangeWithModeSwitch: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
}

export function useStructureVideoHandlers({
  structureVideoConfig,
  setStructureVideoConfig,
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment,
  structureVideoMotionStrength,
  structureVideoType,
  handleStructureVideoChange,
  structureVideos,
  updateStructureVideo,
  generationTypeMode,
  setGenerationTypeMode,
}: UseStructureVideoHandlersOptions): UseStructureVideoHandlersReturn {
  // Handler for changing uni3c end percent
  const handleUni3cEndPercentChange = useCallback((value: number) => {
    setStructureVideoConfig({
      ...structureVideoConfig,
      uni3c_end_percent: value,
    });
  }, [structureVideoConfig, setStructureVideoConfig]);

  // Handler for changing just the structure video motion strength (from MotionControl)
  const handleStructureVideoMotionStrengthChange = useCallback((strength: number) => {
    if (structureVideoPath && structureVideoMetadata) {
      handleStructureVideoChange(
        structureVideoPath,
        structureVideoMetadata,
        structureVideoTreatment,
        strength,
        structureVideoType
      );
    }
  }, [structureVideoPath, structureVideoMetadata, structureVideoTreatment, structureVideoType, handleStructureVideoChange]);

  // Handler for changing just the structure video type (from MotionControl)
  const handleStructureTypeChangeFromMotionControl = useCallback((type: 'uni3c' | 'flow' | 'canny' | 'depth') => {
    // Update legacy single-video config
    handleStructureVideoChange(
      structureVideoPath,
      structureVideoMetadata,
      structureVideoTreatment,
      structureVideoMotionStrength,
      type
    );

    // Also update ALL videos in the structureVideos array to keep them in sync
    structureVideos.forEach((_, index) => {
      updateStructureVideo(index, { structure_type: type });
    });

    // Auto-switch generation type mode based on structure type
    if (type === 'uni3c') {
      if (generationTypeMode !== 'i2v') {
        setGenerationTypeMode('i2v');
      }
    } else {
      if (generationTypeMode !== 'vace') {
        setGenerationTypeMode('vace');
      }
    }
  }, [structureVideoPath, structureVideoMetadata, structureVideoTreatment, structureVideoMotionStrength, handleStructureVideoChange, structureVideos, updateStructureVideo, setGenerationTypeMode, generationTypeMode]);

  // Wrapper for structure video change that also auto-switches generation type mode
  const handleStructureVideoChangeWithModeSwitch = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => {
    // Call the original handler
    handleStructureVideoChange(videoPath, metadata, treatment, motionStrength, structureType, resourceId);

    // Auto-switch generation type mode based on structure type
    if (videoPath) {
      if (structureType === 'uni3c') {
        // Uni3C uses I2V mode
        if (generationTypeMode !== 'i2v') {
          setGenerationTypeMode('i2v');
        }
      } else {
        // flow, canny, depth use VACE mode
        if (generationTypeMode !== 'vace') {
          setGenerationTypeMode('vace');
        }
      }
    }
  }, [handleStructureVideoChange, setGenerationTypeMode, generationTypeMode]);

  // Auto-switch generationTypeMode when structure video is added/removed
  const prevStructureVideoPath = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip on first render (undefined -> initial value)
    if (prevStructureVideoPath.current === undefined) {
      prevStructureVideoPath.current = structureVideoPath;
      return;
    }

    const wasAdded = !prevStructureVideoPath.current && structureVideoPath;
    const wasRemoved = prevStructureVideoPath.current && !structureVideoPath;

    if (wasAdded) {
      // When adding structure video, switch to appropriate mode based on structure type
      const targetMode = structureVideoType === 'uni3c' ? 'i2v' : 'vace';
      if (generationTypeMode !== targetMode) {
        setGenerationTypeMode(targetMode);
      }
    } else if (wasRemoved && generationTypeMode !== 'i2v') {
      setGenerationTypeMode('i2v');
    }

    prevStructureVideoPath.current = structureVideoPath;
  }, [structureVideoPath, structureVideoType, generationTypeMode, setGenerationTypeMode]);

  return {
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoChangeWithModeSwitch,
  };
}
