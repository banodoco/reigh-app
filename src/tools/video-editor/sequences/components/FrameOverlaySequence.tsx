import type { ComponentProps } from 'react';
import FrameOverlay from '@astrid/packs/local/elements/effects/frame-overlay/component.tsx';
import frame from '@astrid/packs/local/elements/effects/frame-overlay/assets/frame.png?url';
import { createAstridPreviewAssetWrapper } from './createAstridPreviewAssetWrapper.tsx';

type FrameOverlayProps = ComponentProps<typeof FrameOverlay>;

/** Supply the pack asset that Astrid's worker normally stages for Remotion. */
const FrameOverlaySequence = createAstridPreviewAssetWrapper<FrameOverlayProps>(
  FrameOverlay,
  { frame },
);

export default FrameOverlaySequence;
export { FrameOverlaySequence };
