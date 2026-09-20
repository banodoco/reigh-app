import type { ComponentProps, ReactElement } from 'react';
import FrameOverlay from '@astrid/packs/local/elements/effects/frame-overlay/component.tsx';
import frame from '@astrid/packs/local/elements/effects/frame-overlay/assets/frame.png?url';

type FrameOverlayProps = ComponentProps<typeof FrameOverlay>;

const asParamsRecord = (params: unknown): Record<string, unknown> => (
  params !== null && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {}
);

/** Supply the pack asset that Astrid's worker normally stages for Remotion. */
export default function FrameOverlaySequence(props: FrameOverlayProps): ReactElement | null {
  const params = asParamsRecord(props.params);
  const stagedAssets = asParamsRecord(params.__astridAssets);

  return (
    <FrameOverlay
      {...props}
      params={{
        ...params,
        __astridAssets: {
          frame,
          ...stagedAssets,
        },
      }}
    />
  );
}

export { FrameOverlaySequence };
