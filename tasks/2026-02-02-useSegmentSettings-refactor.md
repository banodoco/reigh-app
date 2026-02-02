# useSegmentSettings Refactoring Plan

## Goal
Refactor the 1,160-line `useSegmentSettings.ts` into focused, reusable modules by extracting a generic "form over server state" pattern.

## Current State
- **File:** `src/shared/hooks/useSegmentSettings.ts` (1,160 lines)
- **Returns:** 16 fields (too many concerns)
- **Problems:** Mixed data fetching, transformation, local state, persistence, auto-save, enhanced prompt handling

## Target Structure

```
src/shared/
├── lib/
│   └── segmentSettings/
│       ├── index.ts              # Barrel
│       ├── merge.ts              # Pure merge logic (~80 lines)
│       ├── overrides.ts          # Override detection (~50 lines)
│       └── transforms.ts         # To/from DB formats (~60 lines)
│
├── hooks/
│   ├── useServerForm.ts          # Reusable pattern (~120 lines) ⭐ KEY
│   │
│   └── segments/
│       ├── index.ts              # Barrel
│       ├── usePairMetadata.ts    # Query hook (~40 lines)
│       ├── useShotVideoSettings.ts # Query hook (~50 lines)
│       ├── useSegmentMutations.ts  # All mutations (~200 lines)
│       └── useSegmentSettings.ts   # Composed hook (~150 lines)
```

**Total: ~750 lines across 9 files** (vs 1,160 in 1 file)

---

## Master Checklist

- [ ] **Phase 1: Extract Pure Functions**
  - [ ] 1.1 Create `src/shared/lib/segmentSettings/merge.ts`
  - [ ] 1.2 Create `src/shared/lib/segmentSettings/overrides.ts`
  - [ ] 1.3 Create `src/shared/lib/segmentSettings/transforms.ts`
  - [ ] 1.4 Create barrel `src/shared/lib/segmentSettings/index.ts`
  - [ ] 1.5 Add unit tests for pure functions

- [ ] **Phase 2: Create Reusable useServerForm Hook**
  - [ ] 2.1 Create `src/shared/hooks/useServerForm.ts`
  - [ ] 2.2 Add unit tests for useServerForm

- [ ] **Phase 3: Extract Query Hooks**
  - [ ] 3.1 Create `src/shared/hooks/segments/usePairMetadata.ts`
  - [ ] 3.2 Create `src/shared/hooks/segments/useShotVideoSettings.ts`

- [ ] **Phase 4: Extract Mutations**
  - [ ] 4.1 Create `src/shared/hooks/segments/useSegmentMutations.ts`

- [ ] **Phase 5: Compose New useSegmentSettings**
  - [ ] 5.1 Create new `src/shared/hooks/segments/useSegmentSettings.ts`
  - [ ] 5.2 Create barrel `src/shared/hooks/segments/index.ts`
  - [ ] 5.3 Update imports across codebase
  - [ ] 5.4 Delete old `src/shared/hooks/useSegmentSettings.ts`

- [ ] **Phase 6: Cleanup**
  - [ ] 6.1 Remove debug logging (or migrate to structured logger)
  - [ ] 6.2 Update code_quality_audit.md

---

## Phase 1: Extract Pure Functions

### 1.1 `src/shared/lib/segmentSettings/merge.ts`

Extract settings merge logic from the hook's `useMemo` blocks.

```typescript
import type { SegmentSettings, PairMetadata, ShotVideoSettings } from './types';

/**
 * Merge segment settings from multiple sources.
 * Priority: segment overrides > shot defaults > hardcoded defaults
 */
export function mergeSegmentSettings(
  pairOverrides: Partial<SegmentSettings> | null,
  shotDefaults: ShotVideoSettings | null,
  hardcodedDefaults: { numFrames?: number; makePrimaryVariant?: boolean }
): SegmentSettings {
  return {
    // Prompts: undefined = no override (show shot default as placeholder)
    prompt: pairOverrides?.prompt,
    negativePrompt: pairOverrides?.negativePrompt,
    textBeforePrompts: pairOverrides?.textBeforePrompts,
    textAfterPrompts: pairOverrides?.textAfterPrompts,

    // Motion: undefined = use shot default
    motionMode: pairOverrides?.motionMode,
    amountOfMotion: pairOverrides?.amountOfMotion,
    phaseConfig: pairOverrides?.phaseConfig,
    selectedPhasePresetId: pairOverrides?.selectedPhasePresetId,
    loras: pairOverrides?.loras,

    // Frame count from timeline (source of truth)
    numFrames: hardcodedDefaults.numFrames ?? 25,

    // Seed settings
    randomSeed: pairOverrides?.randomSeed ?? true,
    seed: pairOverrides?.seed,

    // Regeneration behavior
    makePrimaryVariant: hardcodedDefaults.makePrimaryVariant ?? false,

    // Structure video overrides
    structureMotionStrength: pairOverrides?.structureMotionStrength,
    structureTreatment: pairOverrides?.structureTreatment,
    structureUni3cEndPercent: pairOverrides?.structureUni3cEndPercent,
  };
}

/**
 * Get effective value for a field (segment override or shot default).
 * Used when creating tasks or saving as shot defaults.
 */
export function getEffectiveValue<K extends keyof SegmentSettings>(
  field: K,
  segmentSettings: SegmentSettings,
  shotDefaults: ShotVideoSettings | null
): SegmentSettings[K] {
  const segmentValue = segmentSettings[field];
  if (segmentValue !== undefined) return segmentValue;

  // Map shot defaults to segment settings fields
  const shotValue = shotDefaults?.[field as keyof ShotVideoSettings];
  return shotValue as SegmentSettings[K];
}

/**
 * Build effective settings for task creation.
 * Merges segment overrides with shot defaults, combines text prompts.
 */
export function buildEffectiveSettings(
  segmentSettings: SegmentSettings,
  shotDefaults: ShotVideoSettings | null,
  hasOverride: Record<string, boolean>
): SegmentSettings {
  // Get base prompt
  const basePrompt = segmentSettings.prompt ?? shotDefaults?.prompt ?? '';

  // Merge text before/after
  const textBefore = segmentSettings.textBeforePrompts ?? shotDefaults?.textBeforePrompts ?? '';
  const textAfter = segmentSettings.textAfterPrompts ?? shotDefaults?.textAfterPrompts ?? '';
  const mergedPrompt = [textBefore, basePrompt, textAfter]
    .map(s => s.trim())
    .filter(Boolean)
    .join(' ');

  return {
    prompt: mergedPrompt,
    negativePrompt: segmentSettings.negativePrompt ?? shotDefaults?.negativePrompt ?? '',
    motionMode: segmentSettings.motionMode ?? shotDefaults?.motionMode ?? 'basic',
    amountOfMotion: segmentSettings.amountOfMotion ?? shotDefaults?.amountOfMotion ?? 50,
    phaseConfig: segmentSettings.phaseConfig ?? shotDefaults?.phaseConfig,
    selectedPhasePresetId: segmentSettings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null,
    loras: hasOverride.loras ? segmentSettings.loras : (shotDefaults?.loras ?? []),
    numFrames: segmentSettings.numFrames,
    randomSeed: segmentSettings.randomSeed ?? true,
    seed: segmentSettings.seed,
    makePrimaryVariant: segmentSettings.makePrimaryVariant ?? false,
    structureMotionStrength: segmentSettings.structureMotionStrength,
    structureTreatment: segmentSettings.structureTreatment,
    structureUni3cEndPercent: segmentSettings.structureUni3cEndPercent,
  };
}
```

### 1.2 `src/shared/lib/segmentSettings/overrides.ts`

Extract override detection logic.

```typescript
import type { PairMetadata } from './types';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

export interface FieldOverrides {
  prompt: boolean;
  negativePrompt: boolean;
  textBeforePrompts: boolean;
  textAfterPrompts: boolean;
  motionMode: boolean;
  amountOfMotion: boolean;
  phaseConfig: boolean;
  loras: boolean;
  selectedPhasePresetId: boolean;
  structureMotionStrength: boolean;
  structureTreatment: boolean;
  structureUni3cEndPercent: boolean;
}

/**
 * Detect which fields have segment-level overrides.
 * Returns undefined during loading so UI knows to show merged values.
 */
export function detectOverrides(
  pairMetadata: PairMetadata | null | undefined,
  localSettings: Record<string, unknown> | null,
  isLoading: boolean
): FieldOverrides | undefined {
  if (isLoading) return undefined;

  const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);

  const hasFieldOverride = (field: string): boolean => {
    // Check local state first (for immediate UI feedback)
    if (localSettings !== null && field in localSettings) {
      return (localSettings as any)[field] !== undefined;
    }
    // Fall back to DB state
    return (pairOverrides as any)[field] !== undefined;
  };

  return {
    prompt: hasFieldOverride('prompt'),
    negativePrompt: hasFieldOverride('negativePrompt'),
    textBeforePrompts: hasFieldOverride('textBeforePrompts'),
    textAfterPrompts: hasFieldOverride('textAfterPrompts'),
    motionMode: hasFieldOverride('motionMode'),
    amountOfMotion: hasFieldOverride('amountOfMotion'),
    phaseConfig: hasFieldOverride('phaseConfig'),
    loras: hasFieldOverride('loras'),
    selectedPhasePresetId: hasFieldOverride('selectedPhasePresetId'),
    structureMotionStrength: hasFieldOverride('structureMotionStrength'),
    structureTreatment: hasFieldOverride('structureTreatment'),
    structureUni3cEndPercent: hasFieldOverride('structureUni3cEndPercent'),
  };
}
```

### 1.3 `src/shared/lib/segmentSettings/transforms.ts`

Extract transformation logic for DB operations.

```typescript
import type { SegmentSettings } from './types';
import { buildMetadataUpdate } from '@/shared/components/segmentSettingsUtils';

/**
 * Build metadata update for saving segment settings.
 * Handles the old/new format migration via buildMetadataUpdate.
 */
export function toMetadataUpdate(
  currentMetadata: Record<string, any>,
  settings: SegmentSettings
): Record<string, any> {
  return buildMetadataUpdate(currentMetadata, {
    prompt: settings.prompt,
    negativePrompt: settings.negativePrompt,
    textBeforePrompts: settings.textBeforePrompts,
    textAfterPrompts: settings.textAfterPrompts,
    motionMode: settings.motionMode,
    amountOfMotion: settings.amountOfMotion,
    phaseConfig: settings.motionMode === 'basic' ? null : settings.phaseConfig,
    loras: settings.loras,
    randomSeed: settings.randomSeed,
    seed: settings.seed,
    selectedPhasePresetId: settings.selectedPhasePresetId,
    structureMotionStrength: settings.structureMotionStrength,
    structureTreatment: settings.structureTreatment,
    structureUni3cEndPercent: settings.structureUni3cEndPercent,
    // Note: numFrames intentionally omitted - timeline is source of truth
  });
}

/**
 * Build shot settings patch for "Save as Shot Defaults".
 */
export function toShotSettingsPatch(
  settings: SegmentSettings,
  shotDefaults: Record<string, any>
): Record<string, any> {
  // Get effective values (segment override or shot default)
  return {
    prompt: settings.prompt ?? shotDefaults.prompt ?? '',
    negativePrompt: settings.negativePrompt ?? shotDefaults.negativePrompt ?? '',
    motionMode: settings.motionMode ?? shotDefaults.motionMode ?? 'basic',
    amountOfMotion: settings.amountOfMotion ?? shotDefaults.amountOfMotion ?? 50,
    phaseConfig: settings.phaseConfig ?? shotDefaults.phaseConfig,
    selectedPhasePresetId: settings.selectedPhasePresetId ?? shotDefaults.selectedPhasePresetId ?? null,
    loras: settings.loras !== undefined ? settings.loras : (shotDefaults.loras ?? []),
    textBeforePrompts: settings.textBeforePrompts ?? shotDefaults.textBeforePrompts ?? '',
    textAfterPrompts: settings.textAfterPrompts ?? shotDefaults.textAfterPrompts ?? '',
    randomSeed: settings.randomSeed ?? true,
    seed: settings.seed,
  };
}

/**
 * Create cleared settings for "Reset to Shot Defaults".
 */
export function createClearedSettings(numFrames: number, makePrimaryVariant: boolean): SegmentSettings {
  return {
    prompt: '',
    negativePrompt: '',
    textBeforePrompts: '',
    textAfterPrompts: '',
    motionMode: null as any,
    amountOfMotion: null as any,
    phaseConfig: null,
    selectedPhasePresetId: null as any,
    loras: null as any,
    numFrames,
    randomSeed: true,
    seed: undefined,
    makePrimaryVariant,
    structureMotionStrength: null as any,
    structureTreatment: null as any,
    structureUni3cEndPercent: null as any,
  };
}
```

---

## Phase 2: Create Reusable useServerForm Hook

This is the **key abstraction** that makes the pattern reusable.

### 2.1 `src/shared/hooks/useServerForm.ts`

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseServerFormOptions<TServer, TLocal> {
  /** Server data (from React Query) */
  serverData: TServer | undefined;
  /** Whether server data is still loading */
  isLoading: boolean;
  /** Transform server data to local form state */
  toLocal: (server: TServer) => TLocal;
  /** Save local state back to server */
  save: (local: TLocal) => Promise<boolean>;
  /** Auto-save debounce delay (ms). 0 = no auto-save. */
  autoSaveMs?: number;
  /** Called when switching contexts (e.g., different segment) */
  contextKey?: string;
  /** Validate before allowing updates */
  validate?: (updates: Partial<TLocal>, current: TLocal) => Partial<TLocal>;
}

export interface UseServerFormReturn<TLocal> {
  /** Current form data (local edits or server data) */
  data: TLocal;
  /** Update local state */
  update: (updates: Partial<TLocal>) => void;
  /** Save to server */
  save: () => Promise<boolean>;
  /** Reset to server data (discard local edits) */
  reset: () => void;
  /** Whether there are unsaved local edits */
  isDirty: boolean;
  /** Whether server data is loading */
  isLoading: boolean;
}

export function useServerForm<TServer, TLocal extends Record<string, any>>({
  serverData,
  isLoading,
  toLocal,
  save: saveFn,
  autoSaveMs = 0,
  contextKey,
  validate,
}: UseServerFormOptions<TServer, TLocal>): UseServerFormReturn<TLocal> {
  // Local state for user edits
  const [localData, setLocalData] = useState<TLocal | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);
  const hasUserEdited = useRef(false);
  const saveFnRef = useRef(saveFn);
  const prevContextKeyRef = useRef(contextKey);

  // Keep refs in sync
  useEffect(() => {
    isDirtyRef.current = isDirty;
    saveFnRef.current = saveFn;
  }, [isDirty, saveFn]);

  // Reset on context change (e.g., switching segments)
  useEffect(() => {
    if (contextKey !== prevContextKeyRef.current) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setLocalData(null);
      setIsDirty(false);
      hasUserEdited.current = false;
      prevContextKeyRef.current = contextKey;
    }
  }, [contextKey]);

  // Compute current data
  const transformedServer = serverData ? toLocal(serverData) : null;
  const data = localData ?? transformedServer ?? ({} as TLocal);

  // Update local state
  const update = useCallback((updates: Partial<TLocal>) => {
    setLocalData(prev => {
      const current = prev ?? transformedServer ?? ({} as TLocal);
      const validated = validate ? validate(updates, current) : updates;
      return { ...current, ...validated };
    });
    setIsDirty(true);
    hasUserEdited.current = true;
  }, [transformedServer, validate]);

  // Save to server
  const save = useCallback(async (): Promise<boolean> => {
    if (!localData) return true; // Nothing to save
    const result = await saveFnRef.current(localData);
    if (result) {
      setIsDirty(false);
    }
    return result;
  }, [localData]);

  // Reset to server data
  const reset = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setLocalData(null);
    setIsDirty(false);
    hasUserEdited.current = false;
  }, []);

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!autoSaveMs || !hasUserEdited.current || !isDirty) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await save();
    }, autoSaveMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localData, isDirty, autoSaveMs, save]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (isDirtyRef.current && hasUserEdited.current) {
        saveFnRef.current(localData as TLocal);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    update,
    save,
    reset,
    isDirty,
    isLoading,
  };
}
```

---

## Phase 3: Extract Query Hooks

### 3.1 `src/shared/hooks/segments/usePairMetadata.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { PairMetadata } from '@/shared/lib/segmentSettings';

export function usePairMetadata(pairShotGenerationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId || ''),
    queryFn: async (): Promise<PairMetadata | null> => {
      if (!pairShotGenerationId) return null;

      const { data, error } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (error) {
        console.error('[usePairMetadata] Error:', error);
        return null;
      }

      return (data?.metadata as PairMetadata) || null;
    },
    enabled: !!pairShotGenerationId,
    staleTime: 10000,
  });
}
```

### 3.2 `src/shared/hooks/segments/useShotVideoSettings.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import { readShotSettings, type ShotVideoSettings } from '@/shared/utils/settingsMigration';

export function useShotVideoSettings(shotId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.shots.batchSettings(shotId || ''),
    queryFn: async (): Promise<ShotVideoSettings | null> => {
      if (!shotId) return null;

      const { data, error } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();

      if (error) {
        console.error('[useShotVideoSettings] Error:', error);
        return null;
      }

      const allSettings = data?.settings as Record<string, any>;
      const rawSettings = allSettings?.['travel-between-images'] ?? {};

      return readShotSettings(rawSettings);
    },
    enabled: !!shotId,
    staleTime: 0, // Always refetch - settings can change from BatchSettingsForm
  });
}
```

---

## Phase 4: Extract Mutations

### 4.1 `src/shared/hooks/segments/useSegmentMutations.ts`

```typescript
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { toMetadataUpdate, toShotSettingsPatch } from '@/shared/lib/segmentSettings';
import type { SegmentSettings } from '@/shared/lib/segmentSettings';

export interface UseSegmentMutationsOptions {
  pairShotGenerationId: string | null | undefined;
  shotId: string | null | undefined;
}

export function useSegmentMutations({ pairShotGenerationId, shotId }: UseSegmentMutationsOptions) {
  const queryClient = useQueryClient();

  // Save segment settings to pair metadata
  const savePairMetadata = useCallback(async (settings: SegmentSettings): Promise<boolean> => {
    if (!pairShotGenerationId) return false;

    try {
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) return false;

      const newMetadata = toMetadataUpdate(current?.metadata || {}, settings);

      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) return false;

      // Refetch caches
      await queryClient.refetchQueries({ queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId) });
      if (shotId) {
        queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
      }

      return true;
    } catch (error) {
      console.error('[useSegmentMutations] savePairMetadata error:', error);
      return false;
    }
  }, [pairShotGenerationId, shotId, queryClient]);

  // Save as shot defaults
  const saveAsShotDefaults = useCallback(async (
    settings: SegmentSettings,
    shotDefaults: Record<string, any>
  ): Promise<boolean> => {
    if (!shotId) return false;

    try {
      const shotPatch = toShotSettingsPatch(settings, shotDefaults);

      await updateToolSettingsSupabase({
        scope: 'shot',
        id: shotId,
        toolId: 'travel-between-images',
        patch: shotPatch,
      }, undefined, 'immediate');

      await queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(shotId) });
      await queryClient.refetchQueries({ queryKey: ['toolSettings', 'travel-between-images'] });

      return true;
    } catch (error) {
      console.error('[useSegmentMutations] saveAsShotDefaults error:', error);
      return false;
    }
  }, [shotId, queryClient]);

  // Save single field as shot default
  const saveFieldAsDefault = useCallback(async (
    field: keyof SegmentSettings,
    value: any
  ): Promise<boolean> => {
    if (!shotId) return false;

    try {
      await updateToolSettingsSupabase({
        scope: 'shot',
        id: shotId,
        toolId: 'travel-between-images',
        patch: { [field]: value },
      }, undefined, 'immediate');

      await queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(shotId) });
      await queryClient.refetchQueries({ queryKey: ['toolSettings', 'travel-between-images'] });

      return true;
    } catch (error) {
      console.error('[useSegmentMutations] saveFieldAsDefault error:', error);
      return false;
    }
  }, [shotId, queryClient]);

  // Clear enhanced prompt
  const clearEnhancedPrompt = useCallback(async (): Promise<boolean> => {
    if (!pairShotGenerationId) return false;

    try {
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) return false;

      const { enhance_prompt_enabled: _, ...rest } = (current?.metadata || {}) as Record<string, any>;
      const updatedMetadata = { ...rest, enhanced_prompt: '' };

      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: updatedMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) return false;

      await queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId) });
      return true;
    } catch (error) {
      console.error('[useSegmentMutations] clearEnhancedPrompt error:', error);
      return false;
    }
  }, [pairShotGenerationId, queryClient]);

  // Save enhance prompt preference
  const saveEnhancePromptEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!pairShotGenerationId) return false;

    try {
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) return false;

      const updatedMetadata = {
        ...(current?.metadata || {}),
        enhance_prompt_enabled: enabled,
      };

      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: updatedMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) return false;

      await queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId) });
      return true;
    } catch (error) {
      console.error('[useSegmentMutations] saveEnhancePromptEnabled error:', error);
      return false;
    }
  }, [pairShotGenerationId, queryClient]);

  return {
    savePairMetadata,
    saveAsShotDefaults,
    saveFieldAsDefault,
    clearEnhancedPrompt,
    saveEnhancePromptEnabled,
  };
}
```

---

## Phase 5: Compose New useSegmentSettings

### 5.1 `src/shared/hooks/segments/useSegmentSettings.ts`

```typescript
import { useMemo, useCallback } from 'react';
import { useServerForm } from '../useServerForm';
import { usePairMetadata } from './usePairMetadata';
import { useShotVideoSettings } from './useShotVideoSettings';
import { useSegmentMutations } from './useSegmentMutations';
import {
  mergeSegmentSettings,
  buildEffectiveSettings,
  detectOverrides,
  createClearedSettings,
  type SegmentSettings,
  type FieldOverrides,
} from '@/shared/lib/segmentSettings';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

export interface UseSegmentSettingsOptions {
  pairShotGenerationId?: string | null;
  shotId?: string | null;
  defaults: {
    prompt: string;
    negativePrompt: string;
    numFrames?: number;
    makePrimaryVariant?: boolean;
  };
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  } | null;
  onUpdateStructureVideoDefaults?: (updates: Record<string, any>) => Promise<void>;
}

export function useSegmentSettings({
  pairShotGenerationId,
  shotId,
  defaults,
  structureVideoDefaults,
  onUpdateStructureVideoDefaults,
}: UseSegmentSettingsOptions) {
  // 1. Fetch server data
  const { data: pairMetadata, isLoading: loadingPair } = usePairMetadata(pairShotGenerationId);
  const { data: shotVideoSettings, isLoading: loadingShot } = useShotVideoSettings(shotId);

  // 2. Get mutations
  const mutations = useSegmentMutations({ pairShotGenerationId, shotId });

  // 3. Compute merged settings from server data
  const mergedSettings = useMemo(() => {
    const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);
    return mergeSegmentSettings(pairOverrides, shotVideoSettings, defaults);
  }, [pairMetadata, shotVideoSettings, defaults]);

  // 4. Shot defaults for placeholders
  const shotDefaults = useMemo(() => ({
    prompt: shotVideoSettings?.prompt || '',
    negativePrompt: shotVideoSettings?.negativePrompt || '',
    motionMode: shotVideoSettings?.motionMode || 'basic',
    amountOfMotion: shotVideoSettings?.amountOfMotion ?? 50,
    phaseConfig: shotVideoSettings?.phaseConfig,
    loras: shotVideoSettings?.loras || [],
    selectedPhasePresetId: shotVideoSettings?.selectedPhasePresetId ?? null,
    textBeforePrompts: shotVideoSettings?.textBeforePrompts || '',
    textAfterPrompts: shotVideoSettings?.textAfterPrompts || '',
  }), [shotVideoSettings]);

  // 5. Use server form pattern for local edits + auto-save
  const form = useServerForm({
    serverData: mergedSettings,
    isLoading: loadingPair || loadingShot,
    toLocal: (server) => server,
    save: mutations.savePairMetadata,
    autoSaveMs: 500,
    contextKey: pairShotGenerationId || undefined,
    validate: (updates, current) => {
      // Enforce: basic mode = no phase config
      if (updates.motionMode === 'basic') {
        return { ...updates, phaseConfig: undefined };
      }
      return updates;
    },
  });

  // 6. Compute overrides (considering local state for immediate UI feedback)
  const hasOverride = useMemo((): FieldOverrides | undefined => {
    return detectOverrides(
      pairMetadata,
      form.isDirty ? form.data : null,
      loadingPair
    );
  }, [pairMetadata, form.data, form.isDirty, loadingPair]);

  // 7. Wrap reset to also clear enhanced prompt
  const resetSettings = useCallback(async () => {
    const cleared = createClearedSettings(
      defaults.numFrames ?? 25,
      defaults.makePrimaryVariant ?? false
    );
    await mutations.savePairMetadata(cleared);
    await mutations.clearEnhancedPrompt();
    form.reset();
  }, [mutations, form, defaults]);

  // 8. Wrap saveAsShotDefaults with structure video handling
  const saveAsShotDefaults = useCallback(async (): Promise<boolean> => {
    const result = await mutations.saveAsShotDefaults(form.data, shotDefaults);

    if (result && onUpdateStructureVideoDefaults) {
      const hasStructureOverrides =
        form.data.structureMotionStrength !== undefined ||
        form.data.structureTreatment !== undefined ||
        form.data.structureUni3cEndPercent !== undefined;

      if (hasStructureOverrides) {
        await onUpdateStructureVideoDefaults({
          motionStrength: form.data.structureMotionStrength ?? structureVideoDefaults?.motionStrength,
          treatment: form.data.structureTreatment ?? structureVideoDefaults?.treatment,
          uni3cEndPercent: form.data.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent,
        });

        // Clear structure overrides from segment
        form.update({
          structureMotionStrength: undefined,
          structureTreatment: undefined,
          structureUni3cEndPercent: undefined,
        });
      }
    }

    return result;
  }, [mutations, form, shotDefaults, onUpdateStructureVideoDefaults, structureVideoDefaults]);

  // 9. Extract enhanced prompt from metadata
  const enhancedPrompt = (pairMetadata as any)?.enhanced_prompt?.trim() || undefined;
  const basePromptForEnhancement = (pairMetadata as any)?.base_prompt_for_enhancement?.trim() || undefined;
  const enhancePromptEnabled = (pairMetadata as any)?.enhance_prompt_enabled as boolean | undefined;

  return {
    // Form state
    settings: form.data,
    updateSettings: form.update,
    saveSettings: form.save,
    resetSettings,
    isDirty: form.isDirty,
    isLoading: form.isLoading,

    // Override tracking
    hasOverride,
    shotDefaults,

    // Shot-level operations
    saveAsShotDefaults,
    saveFieldAsDefault: mutations.saveFieldAsDefault,

    // Enhanced prompt
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt: mutations.clearEnhancedPrompt,
    enhancePromptEnabled,
    saveEnhancePromptEnabled: mutations.saveEnhancePromptEnabled,

    // For debugging/compatibility
    pairMetadata: pairMetadata ?? null,
    shotBatchSettings: shotVideoSettings ? {
      amountOfMotion: shotVideoSettings.amountOfMotion / 100,
      motionMode: shotVideoSettings.motionMode,
      selectedLoras: shotVideoSettings.loras,
      phaseConfig: shotVideoSettings.phaseConfig,
      prompt: shotVideoSettings.prompt,
      negativePrompt: shotVideoSettings.negativePrompt,
    } : null,
  };
}
```

---

## Migration Notes

### Import Updates
```typescript
// Before
import { useSegmentSettings } from '@/shared/hooks/useSegmentSettings';

// After
import { useSegmentSettings } from '@/shared/hooks/segments';
```

### Breaking Changes
- None expected - return type is compatible
- `getSettingsForTaskCreation` removed from return (use `buildEffectiveSettings` utility directly if needed)

### Testing Strategy
1. Unit test pure functions in `lib/segmentSettings/`
2. Unit test `useServerForm` with mock save function
3. Integration test composed `useSegmentSettings` hook

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Lines | 1,160 in 1 file | ~750 across 9 files |
| Testability | Hard (many entangled concerns) | Easy (pure functions, isolated hooks) |
| Reusability | None | `useServerForm` reusable everywhere |
| Debug logging | 100+ lines inline | Removed (or separate debug hook) |
| Cognitive load | High | Low (each file is single-purpose) |
