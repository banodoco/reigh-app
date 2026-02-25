import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutMainContent } from './LayoutMainContent';

const usePanesMock = vi.fn();
const useHeaderStateMock = vi.fn();
const useViewportResponsiveMock = vi.fn();
const globalHeaderMock = vi.fn();
const globalProcessingWarningMock = vi.fn();

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="layout-outlet" />,
}));

vi.mock('@/shared/components/GlobalHeader', () => ({
  GlobalHeader: (props: unknown) => {
    globalHeaderMock(props);
    return <div data-testid="global-header" />;
  },
}));

vi.mock('@/shared/components/ProcessingWarnings', () => ({
  GlobalProcessingWarning: (props: unknown) => {
    globalProcessingWarningMock(props);
    return <div data-testid="processing-warning" />;
  },
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => usePanesMock(),
}));

vi.mock('@/shared/contexts/ToolPageHeaderContext', () => ({
  useHeaderState: () => useHeaderStateMock(),
}));

vi.mock('@/shared/hooks/responsive/useViewportResponsive', () => ({
  useViewportResponsive: () => useViewportResponsiveMock(),
}));

describe('LayoutMainContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePanesMock.mockReturnValue({
      isTasksPaneLocked: true,
      tasksPaneWidth: 320,
      isShotsPaneLocked: true,
      shotsPaneWidth: 260,
      isGenerationsPaneLocked: true,
      isGenerationsPaneOpen: false,
      generationsPaneHeight: 180,
    });
    useHeaderStateMock.mockReturnValue({
      header: <div data-testid="tool-header">Header</div>,
    });
    useViewportResponsiveMock.mockReturnValue({
      isSm: false,
      isMd: false,
      isLg: true,
      isXl: true,
      is2Xl: false,
      contentWidth: 1280,
      contentHeight: 720,
    });
  });

  it('renders global layout pieces and applies pane offsets', () => {
    const onOpenSettings = vi.fn();
    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} onOpenSettings={onOpenSettings} />
    );

    expect(screen.getByTestId('global-header')).toBeInTheDocument();
    expect(screen.getByTestId('processing-warning')).toBeInTheDocument();
    expect(screen.getByTestId('tool-header')).toBeInTheDocument();
    expect(screen.getByTestId('layout-outlet')).toBeInTheDocument();
    expect(globalHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentOffsetRight: 336,
        contentOffsetLeft: 260,
        onOpenSettings,
      })
    );
    expect(globalProcessingWarningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onOpenSettings,
      })
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      marginRight: '320px',
      marginLeft: '260px',
      paddingBottom: '180px',
      willChange: 'margin, padding',
    });
  });
});
