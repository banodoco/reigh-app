// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineDurationGuide } from './TimelineDurationGuide';

describe('TimelineDurationGuide', () => {
  it('shows the soft shot end, extension capacity, hard blocker, and overflow reason', () => {
    render(
      <div>
        <TimelineDurationGuide
          durationSeconds={2}
          hardDurationSeconds={4}
          maxClipEndSeconds={4.5}
          startLeft={0}
          pixelsPerSecond={100}
          totalWidth={600}
          height={100}
        />
      </div>,
    );

    expect(screen.getByTestId('timeline-duration-limit')).toHaveAttribute('data-overrun', 'true');
    expect(screen.getByTestId('timeline-duration-expandable')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-duration-hard-limit')).toHaveAttribute('data-hard-overrun', 'true');
    expect(screen.getByTestId('timeline-duration-overflow-reason')).toHaveTextContent(
      'Content exceeds the next shot blocker by 0.50s.',
    );
  });

  it('shows a proposed drag end without inventing a blocked area when no blocker exists', () => {
    render(
      <div>
        <TimelineDurationGuide
          durationSeconds={2}
          maxClipEndSeconds={2}
          proposedMaxClipEndSeconds={3.5}
          startLeft={0}
          pixelsPerSecond={100}
          totalWidth={600}
          height={100}
        />
      </div>,
    );

    expect(screen.getByTestId('timeline-duration-proposed-end')).toHaveAttribute('data-proposed-end-seconds', '3.5');
    expect(screen.getByTestId('timeline-duration-overflow-reason')).toHaveTextContent(
      'Content extends beyond the current shot end by 1.50s; extend the shot to keep it.',
    );
    expect(screen.queryByTestId('timeline-duration-blocked')).not.toBeInTheDocument();
  });

  it('surfaces a rejected proposal without painting a hard blocker that does not exist', () => {
    render(
      <div>
        <TimelineDurationGuide
          durationSeconds={2}
          hardDurationSeconds={undefined}
          maxClipEndSeconds={2}
          proposedMaxClipEndSeconds={2.5}
          proposalRejected
          startLeft={0}
          pixelsPerSecond={100}
          totalWidth={600}
          height={100}
        />
      </div>,
    );

    expect(screen.getByTestId('timeline-duration-overflow-reason')).toHaveTextContent(
      'Move rejected: this placement is not valid on the selected lane.',
    );
    expect(screen.queryByTestId('timeline-duration-blocked')).not.toBeInTheDocument();
  });
});
