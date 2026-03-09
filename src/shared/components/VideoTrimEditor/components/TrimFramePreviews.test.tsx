// @vitest-environment jsdom

import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrimFramePreviews } from './TrimFramePreviews';

describe('TrimFramePreviews', () => {
  it('renders both preview frames and formatted trim times', () => {
    const { container } = render(
      <TrimFramePreviews
        startFrame="start-frame.png"
        endFrame="end-frame.png"
        trimState={{
          startTrim: 1.2,
          endTrim: 0.7,
          videoDuration: 10,
          isValid: true,
        }}
        labelSize="text-xs"
      />,
    );
    const scope = within(container);

    expect(scope.getByText('First frame')).toBeTruthy();
    expect(scope.getByAltText('Start frame').getAttribute('src')).toBe('start-frame.png');
    expect(scope.getByText('0:01.1')).toBeTruthy();
    expect(scope.getByText('Last frame')).toBeTruthy();
    expect(scope.getByAltText('End frame').getAttribute('src')).toBe('end-frame.png');
    expect(scope.getByText('0:09.3')).toBeTruthy();
  });

  it('renders fallback empty states when frames are unavailable', () => {
    const { container } = render(
      <TrimFramePreviews
        startFrame={null}
        endFrame={null}
        trimState={{
          startTrim: 0,
          endTrim: 0,
          videoDuration: 5,
          isValid: true,
        }}
        labelSize="text-xs"
      />,
    );
    const scope = within(container);

    expect(scope.getAllByText('No frame')).toHaveLength(2);
  });
});
