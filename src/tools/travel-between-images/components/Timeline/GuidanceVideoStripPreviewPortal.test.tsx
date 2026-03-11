// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuidanceVideoStripPreviewPortal } from './GuidanceVideoStripPreviewPortal';

describe('GuidanceVideoStripPreviewPortal', () => {
  it('renders the preview portal into document.body and toggles visibility from props', () => {
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement>;
    const { rerender } = render(
      <GuidanceVideoStripPreviewPortal
        hoverPosition={{ x: 32, y: 48 }}
        isVisible
        canvasRef={canvasRef}
        currentVideoFrame={42}
      />,
    );

    const frameLabel = screen.getByText('Frame 42');
    expect(frameLabel).toBeInTheDocument();
    expect(frameLabel.closest('.fixed')).toHaveStyle({
      left: '32px',
      top: '48px',
      display: 'block',
    });

    rerender(
      <GuidanceVideoStripPreviewPortal
        hoverPosition={{ x: 32, y: 48 }}
        isVisible={false}
        canvasRef={canvasRef}
        currentVideoFrame={42}
      />,
    );

    expect(frameLabel.closest('.fixed')).toHaveStyle({ display: 'none' });
  });
});
