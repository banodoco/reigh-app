import { useState, useRef, useEffect, useMemo } from 'react';
import { useAutoTopup } from '@/shared/hooks/billing/useAutoTopup';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { AutoTopupState } from '../types';

interface UseAutoTopupStateProps {
  initialPurchaseAmount: number;
}

interface UseAutoTopupStateReturn {
  // State
  purchaseAmount: number;
  localAutoTopupEnabled: boolean;
  localAutoTopupThreshold: number;
  autoTopupState: AutoTopupState;
  isUpdatingAutoTopup: boolean;

  // Handlers
  handlePurchaseAmountChange: (amount: number) => void;
  handleAutoTopupToggle: (enabled: boolean) => void;
  handleAutoTopupThresholdChange: (threshold: number) => void;
}

export function useAutoTopupState({ initialPurchaseAmount }: UseAutoTopupStateProps): UseAutoTopupStateReturn {
  const {
    preferences: autoTopupPreferences,
    updatePreferences: updateAutoTopup,
    isUpdatingPreferences: isUpdatingAutoTopup,
  } = useAutoTopup();

  const [purchaseAmount, setPurchaseAmount] = useState(initialPurchaseAmount);
  const [localAutoTopupEnabled, setLocalAutoTopupEnabled] = useState(true);
  const [localAutoTopupThreshold, setLocalAutoTopupThreshold] = useState(10);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Debounce timer for threshold changes
  const thresholdDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize from server preferences
  useEffect(() => {
    if (autoTopupPreferences && !hasInitialized) {
      setLocalAutoTopupEnabled(autoTopupPreferences.enabled);
      setLocalAutoTopupThreshold(autoTopupPreferences.threshold || 10);

      if (autoTopupPreferences.amount && autoTopupPreferences.amount !== 50) {
        setPurchaseAmount(autoTopupPreferences.amount);
      }

      setHasInitialized(true);
    }
  }, [autoTopupPreferences, hasInitialized]);

  // Auto-update threshold for new users when purchase amount changes
  useEffect(() => {
    if (hasInitialized && autoTopupPreferences && autoTopupPreferences.threshold === 10 && purchaseAmount !== 50) {
      const defaultThreshold = Math.max(1, Math.floor(purchaseAmount / 5));
      setLocalAutoTopupThreshold(defaultThreshold);
    }
  }, [purchaseAmount, hasInitialized, autoTopupPreferences]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (thresholdDebounceRef.current) {
        clearTimeout(thresholdDebounceRef.current);
      }
    };
  }, []);

  // Computed auto-top-up state
  const autoTopupState = useMemo((): AutoTopupState => {
    if (!autoTopupPreferences) return 'loading';

    const { setupCompleted } = autoTopupPreferences;
    const enabled = localAutoTopupEnabled;

    if (enabled && setupCompleted) return 'active';
    if (!enabled && setupCompleted) return 'setup-but-disabled';
    if (enabled && !setupCompleted) return 'enabled-but-not-setup';
    return 'not-setup';
  }, [autoTopupPreferences, localAutoTopupEnabled]);

  const handleAutoTopupToggle = (enabled: boolean) => {
    const previousEnabled = localAutoTopupEnabled;
    setLocalAutoTopupEnabled(enabled);

    const saveData = {
      enabled,
      amount: purchaseAmount,
      threshold: localAutoTopupThreshold,
    };
    updateAutoTopup(saveData, {
      onError: (error) => {
        setLocalAutoTopupEnabled(previousEnabled);
        normalizeAndPresentError(error, {
          context: 'useAutoTopupState',
          toastTitle: 'Failed to update auto top-up',
        });
      },
    });
  };

  const handleAutoTopupThresholdChange = (threshold: number) => {
    setLocalAutoTopupThreshold(threshold);

    // Debounce the save
    if (thresholdDebounceRef.current) {
      clearTimeout(thresholdDebounceRef.current);
    }
    thresholdDebounceRef.current = setTimeout(() => {
      updateAutoTopup({
        enabled: localAutoTopupEnabled,
        amount: purchaseAmount,
        threshold,
      }, {
        onError: (error) => {
          normalizeAndPresentError(error, {
            context: 'useAutoTopupState',
            toastTitle: 'Failed to update auto top-up',
          });
        },
      });
    }, 500);
  };

  const handlePurchaseAmountChange = (amount: number) => {
    const previousAmount = purchaseAmount;
    const previousThreshold = localAutoTopupThreshold;
    setPurchaseAmount(amount);

    if (localAutoTopupEnabled) {
      const newThreshold = Math.max(1, Math.floor(amount / 5));

      setLocalAutoTopupThreshold(newThreshold);

      updateAutoTopup({
        enabled: localAutoTopupEnabled,
        amount: amount,
        threshold: newThreshold,
      }, {
        onError: (error) => {
          setPurchaseAmount(previousAmount);
          setLocalAutoTopupThreshold(previousThreshold);
          normalizeAndPresentError(error, {
            context: 'useAutoTopupState',
            toastTitle: 'Failed to update auto top-up',
          });
        },
      });
    }
  };

  return {
    purchaseAmount,
    localAutoTopupEnabled,
    localAutoTopupThreshold,
    autoTopupState,
    isUpdatingAutoTopup,
    handlePurchaseAmountChange,
    handleAutoTopupToggle,
    handleAutoTopupThresholdChange,
  };
}
