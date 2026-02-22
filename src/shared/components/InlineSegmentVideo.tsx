/**
 * InlineSegmentVideo - Individual segment thumbnail in the output strip.
 *
 * The component routes render behavior through focused view modules:
 * - SegmentPlaceholder: no child generation yet
 * - SegmentProcessing: child exists but no output
 * - SegmentPreview: full thumbnail/hover preview UI
 */

import type React from 'react';
import { SegmentPlaceholder } from './inline-segment-video/SegmentPlaceholder';
import { SegmentPreview } from './inline-segment-video/SegmentPreview';
import { SegmentProcessing } from './inline-segment-video/SegmentProcessing';
import type { InlineSegmentVideoProps } from './inline-segment-video/types';
import { useLayoutProps } from './inline-segment-video/useLayoutProps';
import { useSegmentBadge } from './inline-segment-video/useSegmentBadge';

export const InlineSegmentVideo: React.FC<InlineSegmentVideoProps> = ({
  slot,
  pairIndex,
  onClick,
  projectAspectRatio,
  isMobile = false,
  leftPercent,
  widthPercent,
  layout = 'absolute',
  compact = false,
  onOpenPairSettings,
  onDelete,
  isDeleting = false,
  isPending = false,
  hasSourceChanged = false,
  isScrubbingActive = false,
  onScrubbingStart,
  scrubbingContainerRef,
  scrubbingContainerProps,
  scrubbingProgress,
  readOnly = false,
}) => {
  const layoutProps = useLayoutProps(layout, compact, isMobile, leftPercent, widthPercent);

  const isPlaceholder = slot.type === 'placeholder';
  const child = slot.type === 'child' ? slot.child : null;

  const {
    badgeData,
    showNewBadge,
    isNewWithNoVariants,
    unviewedCount,
    onMarkAllViewed,
  } = useSegmentBadge(child);

  if (isPlaceholder) {
    return (
      <SegmentPlaceholder
        layoutProps={layoutProps}
        isPending={isPending}
        readOnly={readOnly}
        pairIndex={pairIndex}
        onOpenPairSettings={onOpenPairSettings}
      />
    );
  }

  if (!child || !child.location) {
    return (
      <SegmentProcessing
        layoutProps={layoutProps}
        isPending={isPending}
        pairIndex={pairIndex}
        onOpenPairSettings={onOpenPairSettings}
      />
    );
  }

  return (
    <SegmentPreview
      layoutProps={layoutProps}
      child={child}
      pairIndex={pairIndex}
      onClick={onClick}
      projectAspectRatio={projectAspectRatio}
      onDelete={onDelete}
      isDeleting={isDeleting}
      isPending={isPending}
      hasSourceChanged={hasSourceChanged}
      scrubbing={{
        isActive: isScrubbingActive,
        onStart: onScrubbingStart,
        containerRef: scrubbingContainerRef,
        containerProps: scrubbingContainerProps,
        progress: scrubbingProgress,
      }}
      badge={{
        data: badgeData ?? null,
        showNew: showNewBadge,
        isNewWithNoVariants,
        unviewedCount,
        onMarkAllViewed,
      }}
    />
  );
};
