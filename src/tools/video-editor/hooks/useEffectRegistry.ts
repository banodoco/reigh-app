import { useEffect, useMemo } from 'react';
import { DynamicEffectRegistry } from '@/tools/video-editor/effects/DynamicEffectRegistry';
import {
  continuousEffects,
  entranceEffects,
  exitEffects,
  replaceEffectRegistry,
} from '@/tools/video-editor/effects';
import { loadDraftEffects } from '@/tools/video-editor/effects/effect-store';
import type { EffectResource } from '@/tools/video-editor/hooks/useEffectResources';

const BUILT_INS = {
  ...entranceEffects,
  ...exitEffects,
  ...continuousEffects,
};

/**
 * Dual-read registry: registers effects from both the legacy `effects` table
 * (keyed by slug) and the newer `resources` table (keyed by resource UUID).
 * Resource-based effects are stored in clips as `custom:{resourceId}`.
 */
export function useEffectRegistry(
  dbEffects: Array<{ slug: string; code: string }> | undefined,
  resourceEffects?: EffectResource[],
) {
  const draftEffects = useMemo(() => loadDraftEffects(), []);
  const registry = useMemo(() => new DynamicEffectRegistry(BUILT_INS), []);

  useEffect(() => {
    replaceEffectRegistry(registry);
    const drafts = Object.entries(draftEffects);
    const db = dbEffects ?? [];
    const resources = resourceEffects ?? [];
    console.log('[EffectRegistry] registering drafts=%d db=%d resources=%d', drafts.length, db.length, resources.length);
    if (resources.length > 0) {
      console.log('[EffectRegistry] resource IDs:', resources.map((e) => e.id));
    }
    void Promise.all([
      ...drafts.map(([name, code]) => registry.registerAsync(name, code)),
      ...db.map((effect) => registry.registerAsync(effect.slug, effect.code)),
      ...resources.map((effect) => registry.registerAsync(effect.id, effect.code).then(() => {
        console.log('[EffectRegistry] registered resource effect id=%s', effect.id);
      })),
    ]).then(() => {
      console.log('[EffectRegistry] all done, registry has:', registry.listAll());
    });
  }, [dbEffects, resourceEffects, draftEffects, registry]);

  return registry;
}
