import type { ComponentProps } from 'react';
import EndSpanningLayer from '@astrid/packs/local/elements/effects/end-spanning-layer/component.tsx';
import card0 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-0.png?url';
import card1 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-1.png?url';
import card2 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-2.png?url';
import card3 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-3.png?url';
import card4 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-4.png?url';
import card5 from '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-5.png?url';
import { createAstridPreviewAssetWrapper } from './createAstridPreviewAssetWrapper.tsx';

type EndSpanningLayerProps = ComponentProps<typeof EndSpanningLayer>;

const END_SPANNING_ASSETS: Record<string, string> = {
  card0,
  card1,
  card2,
  card3,
  card4,
  card5,
};

/**
 * The Astrid worker stages pack assets and injects `__astridAssets` before a
 * Remotion render. Reigh previews do not run that worker staging step, so
 * provide the same asset map from the pack's Vite-imported files.
 */
const EndSpanningLayerSequence = createAstridPreviewAssetWrapper<EndSpanningLayerProps>(
  EndSpanningLayer,
  END_SPANNING_ASSETS,
);

export default EndSpanningLayerSequence;
export { EndSpanningLayerSequence };
