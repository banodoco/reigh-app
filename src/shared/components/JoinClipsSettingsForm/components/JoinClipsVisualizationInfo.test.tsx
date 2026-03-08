import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JoinClipsVisualizationInfo } from './JoinClipsVisualizationInfo';

describe('JoinClipsVisualizationInfo', () => {
  it('shows quantized total delta when actual total is not 4N+1 aligned', () => {
    render(
      <JoinClipsVisualizationInfo
        actualTotal={46}
        quantizedTotal={49}
        shortestClipFrames={undefined}
        minClipFramesRequired={20}
        replaceMode={false}
        gapFrames={12}
        contextFrames={6}
      />,
    );

    expect(screen.getByText('Total generation:')).toBeInTheDocument();
    expect(screen.getByText('46')).toBeInTheDocument();
    expect(screen.getByText('→ 49 (4N+1)')).toBeInTheDocument();
    expect(screen.queryByText(/Constrained by/)).not.toBeInTheDocument();
  });

  it('renders max-generation constraint and red min-required warning when min exceeds shortest', () => {
    render(
      <JoinClipsVisualizationInfo
        actualTotal={81}
        quantizedTotal={81}
        shortestClipFrames={120}
        minClipFramesRequired={130}
        replaceMode={true}
        gapFrames={24}
        contextFrames={8}
      />,
    );

    expect(screen.getByText('Constrained by max generation:')).toBeInTheDocument();
    expect(screen.getByText('(24 gap + 2×8 context)')).toBeInTheDocument();

    const minRequired = screen.getByText('130');
    expect(minRequired.className).toContain('text-red-600');
  });

  it('renders shortest-clip constraint and yellow warning when near limit', () => {
    render(
      <JoinClipsVisualizationInfo
        actualTotal={33}
        quantizedTotal={33}
        shortestClipFrames={40}
        minClipFramesRequired={37}
        replaceMode={false}
        gapFrames={12}
        contextFrames={6}
      />,
    );

    expect(screen.getByText('Constrained by shortest clip:')).toBeInTheDocument();
    const minRequired = screen.getByText('37');
    expect(minRequired.className).toContain('text-yellow-600');
  });
});
