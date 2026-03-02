/**
 * useSteerableMotionHandlers - Steerable motion settings handlers
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles:
 * - Accelerated mode changes
 * - Random seed changes
 * - Steps changes with recommendations
 * - Model selection based on turbo mode
 */

import { useCallback, useRef, useEffect } from 'react';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../../state/types';

interface UseSteerableMotionHandlersOptions {
  // Settings values
  accelerated: boolean;
  randomSeed: boolean;
  turboMode: boolean;
  steerableMotionSettings?: {
    model_name?: string;
    seed?: number;
    debug?: boolean;
  };
  // Settings loading state
  isShotUISettingsLoading: boolean;
  settingsLoadingFromContext: boolean;
  // Setters
  updateShotUISettings: (scope: 'shot' | 'project', settings: Record<string, unknown>) => void;
  setSteerableMotionSettings: (settings: Partial<{ model_name: string; seed: number; negative_prompt: string; debug: boolean }>) => void;
  setSteps: (steps: number) => void;
  setShowStepsNotification: (show: boolean) => void;
  // Shot ID for change detection
  selectedShotId?: string;
}

interface UseSteerableMotionHandlersReturn {
  handleRandomSeedChange: (value: boolean) => void;
  handleAcceleratedChange: (value: boolean) => void;
  handleStepsChange: (steps: number) => void;
}

export function useSteerableMotionHandlers({
  accelerated,
  turboMode,
  steerableMotionSettings,
  isShotUISettingsLoading,
  settingsLoadingFromContext,
  updateShotUISettings,
  setSteerableMotionSettings,
  setSteps,
  setShowStepsNotification,
  selectedShotId,
}: UseSteerableMotionHandlersOptions): UseSteerableMotionHandlersReturn {
  // Ref for stable callback
  const steerableMotionSettingsSetterRef = useRef(setSteerableMotionSettings);
  steerableMotionSettingsSetterRef.current = setSteerableMotionSettings;

  // Always use 6 steps for the hardcoded model
  const getRecommendedSteps = useCallback((_modelName: string, _isAccelerated: boolean) => {
    return 6;
  }, []);

  const updateStepsForCurrentSettings = useCallback(() => {
    const recommendedSteps = getRecommendedSteps(steerableMotionSettings?.model_name || '', accelerated);
    setSteps(recommendedSteps);
  }, [getRecommendedSteps, steerableMotionSettings?.model_name, accelerated, setSteps]);

  // Track previous values to detect changes
  const prevAcceleratedRef = useRef(accelerated);
  const prevModelRef = useRef(steerableMotionSettings?.model_name);
  const hasInitializedStepsRef = useRef(false);

  useEffect(() => {
    if (isShotUISettingsLoading || settingsLoadingFromContext) {
      return;
    }

    const currentModelName = steerableMotionSettings?.model_name;
    if (!hasInitializedStepsRef.current) {
      hasInitializedStepsRef.current = true;
      prevAcceleratedRef.current = accelerated;
      prevModelRef.current = currentModelName;
      return;
    }

    const acceleratedChanged = prevAcceleratedRef.current !== accelerated;
    const modelChanged = prevModelRef.current !== currentModelName;

    if (acceleratedChanged || modelChanged) {
      updateStepsForCurrentSettings();
    }

    prevAcceleratedRef.current = accelerated;
    prevModelRef.current = currentModelName;
  }, [accelerated, steerableMotionSettings?.model_name, updateStepsForCurrentSettings, isShotUISettingsLoading, settingsLoadingFromContext]);

  // Reset initialization flag when shot changes
  useEffect(() => {
    hasInitializedStepsRef.current = false;
  }, [selectedShotId]);

  // Set model based on turbo mode
  useEffect(() => {
    const currentModelName = steerableMotionSettings?.model_name;
    const targetModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'wan_2_2_i2v_lightning_baseline_2_2_2';
    if (currentModelName !== targetModel) {
      setSteerableMotionSettings({ model_name: targetModel });
    }
  }, [turboMode, steerableMotionSettings?.model_name, setSteerableMotionSettings]);

  // Setters
  const setAccelerated = useCallback((value: boolean) => {
    updateShotUISettings('shot', { acceleratedMode: value });
  }, [updateShotUISettings]);

  const setRandomSeed = useCallback((value: boolean) => {
    updateShotUISettings('shot', { randomSeed: value });
  }, [updateShotUISettings]);

  // Handle random seed changes
  const handleRandomSeedChange = useCallback((value: boolean) => {
    setRandomSeed(value);
    if (value) {
      const newSeed = Math.floor(Math.random() * 1000000);
      steerableMotionSettingsSetterRef.current({ seed: newSeed });
    } else {
      steerableMotionSettingsSetterRef.current({ seed: DEFAULT_STEERABLE_MOTION_SETTINGS.seed });
    }
  }, [setRandomSeed]);

  // Handle accelerated mode changes
  const handleAcceleratedChange = useCallback((value: boolean) => {
    setAccelerated(value);
    setShowStepsNotification(false);
  }, [setAccelerated, setShowStepsNotification]);

  // Handle manual steps change
  const handleStepsChange = useCallback((steps: number) => {
    setSteps(steps);

    const currentModelName = steerableMotionSettings?.model_name || '';
    const recommendedSteps = getRecommendedSteps(currentModelName, accelerated);
    if (steps !== recommendedSteps) {
      setShowStepsNotification(true);
      setTimeout(() => setShowStepsNotification(false), 5000);
    } else {
      setShowStepsNotification(false);
    }
  }, [accelerated, steerableMotionSettings?.model_name, getRecommendedSteps, setSteps, setShowStepsNotification]);

  return {
    handleRandomSeedChange,
    handleAcceleratedChange,
    handleStepsChange,
  };
}
