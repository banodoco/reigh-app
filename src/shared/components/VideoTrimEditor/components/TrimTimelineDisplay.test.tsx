// @vitest-environment jsdom

import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrimTimelineDisplay } from './TrimTimelineDisplay';

const trimTimelineBarSpy = vi.fn();

vi.mock('./TrimTimelineBar', () => ({
  TrimTimelineBar: (props: Record<string, unknown>) => {
    trimTimelineBarSpy(props);
    return <div data-testid="trim-timeline-bar" />;
  },
}));

describe('TrimTimelineDisplay', () => {
  it('shows the loading warning until duration is available', () => {
    const onStartTrimChange = vi.fn();
    const onEndTrimChange = vi.fn();
    const videoRef = { current: null };
    const { container } = render(
      <TrimTimelineDisplay
        trimState={{
          startTrim: 0.5,
          endTrim: 0.25,
          videoDuration: 0,
          isValid: false,
        }}
        onStartTrimChange={onStartTrimChange}
        onEndTrimChange={onEndTrimChange}
        currentTime={1}
        videoRef={videoRef}
        isSaving
        labelSize="text-xs"
      />,
    );
    const scope = within(container);

    expect(
      scope.getByText(
        'Warning: Video duration not loaded yet. Wait for video to load.',
      ),
    ).toBeTruthy();
    expect(scope.getByTestId('trim-timeline-bar')).toBeTruthy();
    expect(trimTimelineBarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 0,
        startTrim: 0.5,
        endTrim: 0.25,
        onStartTrimChange,
        onEndTrimChange,
        currentTime: 1,
        videoRef,
        disabled: true,
      }),
    );
  });

  it('renders the instructions without the warning once duration is loaded', () => {
    const { container } = render(
      <TrimTimelineDisplay
        trimState={{
          startTrim: 1,
          endTrim: 2,
          videoDuration: 12,
          isValid: true,
        }}
        onStartTrimChange={vi.fn()}
        onEndTrimChange={vi.fn()}
        currentTime={3}
        videoRef={{ current: null }}
        isSaving={false}
        labelSize="text-sm"
      />,
    );
    const scope = within(container);

    expect(
      scope.getByText(/Drag the handles to trim the beginning or end of the video/),
    ).toBeTruthy();
    expect(
      scope.queryByText(
        'Warning: Video duration not loaded yet. Wait for video to load.',
      ),
    ).toBeNull();
  });
});
