import { cn } from '@/shared/components/ui/contracts/cn.ts';

export interface TimelineDurationGuideProps {
  durationSeconds: number;
  hardDurationSeconds?: number;
  maxClipEndSeconds: number;
  startLeft: number;
  pixelsPerSecond: number;
  totalWidth: number;
  height: number;
}

const formatSeconds = (seconds: number): string => `${seconds.toFixed(2)}s`;

/**
 * Shows the fixed output boundary for an embedded shot timeline.
 *
 * The editor intentionally keeps a little runway after the content so clips
 * can be moved. A shot, however, has a canonical occurrence duration. This
 * guide makes that distinction visible without changing the shared timeline
 * data model used by the full-document editor.
 */
export function TimelineDurationGuide({
  durationSeconds,
  hardDurationSeconds,
  maxClipEndSeconds,
  startLeft,
  pixelsPerSecond,
  totalWidth,
  height,
}: TimelineDurationGuideProps) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(pixelsPerSecond)) {
    return null;
  }

  const boundaryLeft = startLeft + durationSeconds * pixelsPerSecond;
  const hardBoundarySeconds = hardDurationSeconds !== undefined
    ? Math.max(0, hardDurationSeconds)
    : undefined;
  const hardBoundaryLeft = hardBoundarySeconds === undefined
    ? undefined
    : startLeft + hardBoundarySeconds * pixelsPerSecond;
  const contentEndLeft = startLeft + Math.max(0, maxClipEndSeconds) * pixelsPerSecond;
  const remainingSeconds = Math.max(0, durationSeconds - Math.max(0, maxClipEndSeconds));
  const hasOverrun = maxClipEndSeconds > durationSeconds + 0.001;
  const hasHardOverrun = hardDurationSeconds !== undefined && maxClipEndSeconds > hardDurationSeconds + 0.001;
  const remainingWidth = Math.max(0, boundaryLeft - contentEndLeft);
  const expandableWidth = hardBoundaryLeft === undefined
    ? 0
    : Math.max(0, hardBoundaryLeft - boundaryLeft);
  const blockedLeft = hardBoundaryLeft ?? boundaryLeft;
  const blockedWidth = Math.max(0, totalWidth - blockedLeft);

  return (
    <>
      {remainingWidth > 0 && (
        <div
          data-testid="timeline-duration-remaining"
          className="timeline-duration-remaining"
          style={{ left: contentEndLeft, top: 0, width: remainingWidth, height }}
          aria-hidden="true"
        />
      )}
      {expandableWidth > 0 && (
        <div
          data-testid="timeline-duration-expandable"
          className="timeline-duration-expandable"
          style={{ left: boundaryLeft, top: 0, width: expandableWidth, height }}
          aria-hidden="true"
        />
      )}
      {blockedWidth > 0 && (
        <div
          data-testid="timeline-duration-blocked"
          className="timeline-duration-blocked"
          style={{ left: blockedLeft, top: 0, width: blockedWidth, height }}
          aria-hidden="true"
        />
      )}
      <div
        data-testid="timeline-duration-limit"
        data-duration-seconds={durationSeconds}
        data-remaining-seconds={remainingSeconds}
        data-overrun={String(hasOverrun)}
        className={cn('timeline-duration-limit', hasOverrun && 'timeline-duration-limit--overrun')}
        style={{ left: boundaryLeft, top: 0, height }}
        aria-label={`Shot duration limit ${formatSeconds(durationSeconds)}${hasOverrun ? ', content is over the limit' : ''}`}
      >
        <span className="timeline-duration-limit-label">
          shot ends · {formatSeconds(durationSeconds)}
        </span>
      </div>
      {hardBoundaryLeft !== undefined && Math.abs(hardBoundaryLeft - boundaryLeft) > 0.5 && (
        <div
          data-testid="timeline-duration-hard-limit"
          data-hard-duration-seconds={hardDurationSeconds}
          data-hard-overrun={String(hasHardOverrun)}
          className={cn('timeline-duration-hard-limit', hasHardOverrun && 'timeline-duration-hard-limit--overrun')}
          style={{ left: hardBoundaryLeft, top: 0, height }}
          aria-label={`Shot blocked at ${formatSeconds(hardDurationSeconds!)}`}
        >
          <span className="timeline-duration-hard-limit-label">
            blocked · {formatSeconds(hardDurationSeconds!)}
          </span>
        </div>
      )}
    </>
  );
}
