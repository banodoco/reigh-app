/**
 * useSaveFieldAsDefault
 *
 * Shared hook for the "save a single field value as the shot default" pattern.
 * Used by both SegmentSettingsForm and AdvancedSettingsSection to avoid duplicating
 * the save-field-as-default callback and its associated loading state.
 */

import { useState, useCallback } from 'react';
import type { SegmentSettings } from '../types';

interface UseSaveFieldAsDefaultProps {
  onSaveFieldAsDefault?: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<boolean>;
  onChange: (updates: Partial<SegmentSettings>) => void;
}

interface UseSaveFieldAsDefaultReturn {
  savingField: string | null;
  handleSaveFieldAsDefault: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<void>;
}

export function useSaveFieldAsDefault({
  onSaveFieldAsDefault,
  onChange,
}: UseSaveFieldAsDefaultProps): UseSaveFieldAsDefaultReturn {
  const [savingField, setSavingField] = useState<string | null>(null);

  const handleSaveFieldAsDefault = useCallback(async (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => {
    if (!onSaveFieldAsDefault) return;
    setSavingField(String(field));
    try {
      const success = await onSaveFieldAsDefault(field, value);
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 0));
        onChange({ [field]: undefined } as Partial<SegmentSettings>);
      }
    } finally {
      setSavingField(null);
    }
  }, [onSaveFieldAsDefault, onChange]);

  return { savingField, handleSaveFieldAsDefault };
}
