import type { ComponentProps, ReactElement } from 'react';
import EndSpanningLayer from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/component.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import card0 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-0-canonical-mink.png?url';
import card1 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-1.png?url';
import card2 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-2.png?url';
import card3 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-3.png?url';
import card4 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-4-canonical-mink.png?url';
import card5 from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/assets/card-5-canonical-mink.png?url';

type EndSpanningLayerProps = ComponentProps<typeof EndSpanningLayer>;

const END_SPANNING_ASSETS: Record<string, string> = {
  card0,
  card1,
  card2,
  card3,
  card4,
  card5,
};

const asParamsRecord = (params: unknown): Record<string, unknown> => (
  params !== null && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {}
);

const CARD_KEYS = new Set(['card0', 'card1', 'card2', 'card3', 'card4', 'card5']);

/** Resolve this effect's authored card registry keys through the editor's existing media projection. */
export function resolveEndSpanningLayerPreviewParams(
  params: unknown,
  resolvedAssets: ResolvedTimelineConfig['registry'],
): Record<string, unknown> {
  const record = asParamsRecord(params);
  const overrides = record.cardAssets;
  if (overrides === undefined || overrides === null) return record;
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('end-spanning-layer cardAssets must be an object');
  }

  const resolved: Record<string, string> = {};
  for (const [card, assetId] of Object.entries(overrides)) {
    if (!CARD_KEYS.has(card) || typeof assetId !== 'string' || assetId.trim().length === 0) {
      throw new Error('end-spanning-layer cardAssets requires card0–card5 registry keys');
    }
    const source = resolvedAssets[assetId]?.src;
    if (typeof source !== 'string' || source.trim().length === 0) {
      throw new Error(`end-spanning-layer card ${JSON.stringify(card)} references unresolved asset ${JSON.stringify(assetId)}`);
    }
    resolved[card] = source;
  }

  return {
    ...record,
    __astridAssets: {
      ...asParamsRecord(record.__astridAssets),
      ...resolved,
    },
  };
}

/**
 * The Astrid worker stages pack assets and injects `__astridAssets` before a
 * Remotion render. Reigh previews do not run that worker staging step, so
 * provide the same asset map from the pack's Vite-imported files.
 */
export default function EndSpanningLayerSequence(
  props: EndSpanningLayerProps,
): ReactElement | null {
  const params = asParamsRecord(props.params);
  const stagedAssets = asParamsRecord(params.__astridAssets);

  return (
    <EndSpanningLayer
      {...props}
      params={{
        ...params,
        __astridAssets: {
          ...END_SPANNING_ASSETS,
          ...stagedAssets,
        },
      }}
    />
  );
}

export { EndSpanningLayerSequence };
