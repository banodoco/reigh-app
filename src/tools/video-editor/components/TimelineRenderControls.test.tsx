import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineRenderControls } from './TimelineRenderControls';

const mocks = vi.hoisted(() => ({
  useTimelineChromeContext: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineChromeContext: mocks.useTimelineChromeContext,
}));

function chrome(overrides: Record<string, unknown> = {}) {
  return {
    renderDestination: 'download',
    renderStatus: 'done',
    renderDirty: false,
    renderResultUrl: '/api/astrid/v1/objects/render.mp4',
    renderResultFilename: 'render.mp4',
    renderProgress: null,
    activeRenderTaskId: null,
    startRender: vi.fn(),
    cancelRender: vi.fn(),
    setRenderDestination: vi.fn(),
    ...overrides,
  };
}

describe('TimelineRenderControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show a destination selector or inline result preview', () => {
    mocks.useTimelineChromeContext.mockReturnValue(chrome());

    render(<TimelineRenderControls previewActionButtonClass="" />);

    expect(screen.queryByTestId('timeline-render-preview')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Render destination' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('keeps cancellation visible for an active render', () => {
    mocks.useTimelineChromeContext.mockReturnValue(chrome({
      renderStatus: 'rendering',
      activeRenderTaskId: 'task-1',
      renderProgress: { current: 4, total: 10, percent: 40, phase: 'render' },
    }));

    render(<TimelineRenderControls previewActionButtonClass="" />);

    expect(screen.getByRole('button', { name: 'Cancel render' })).toBeTruthy();
  });
});
