import type { CSSProperties } from 'react';
import { Outlet } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import { GlobalProcessingWarning } from '@/shared/components/ProcessingWarnings';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useHeaderState } from '@/shared/contexts/ToolPageHeaderContext';
import { useViewportResponsive } from '@/shared/hooks/responsive/useViewportResponsive';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useVideoEditorRouteState } from '@/app/hooks/useVideoEditorRouteState';

interface LayoutMainContentProps {
  isMobileSplitView: boolean;
  onOpenSettings: (initialTab?: string, creditsTab?: 'purchase' | 'history') => void;
}

export function LayoutMainContent(props: LayoutMainContentProps) {
  const { isMobileSplitView, onOpenSettings } = props;
  const { isVideoEditorShellActive } = useVideoEditorRouteState();
  const {
    isEditorPaneLocked,
    effectiveEditorPaneHeight,
    isTasksPaneLocked,
    tasksPaneWidth,
    isShotsPaneLocked,
    shotsPaneWidth,
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
    effectiveGenerationsPaneHeight,
  } = usePanes();
  const { header } = useHeaderState();
  const { isSm, isMd, isLg, isXl, is2Xl, contentWidth, contentHeight } = useViewportResponsive();

  const containerPadding = isLg ? 'px-6' : isSm ? 'px-4' : 'px-2';
  const containerSpacing = 'py-1';

  const contentStyle = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingTop: isEditorPaneLocked && isVideoEditorShellActive ? `${effectiveEditorPaneHeight}px` : '0px',
    paddingBottom: isMobileSplitView ? '0px' : ((isGenerationsPaneLocked || isGenerationsPaneOpen) ? `${effectiveGenerationsPaneHeight}px` : '0px'),
    '--content-width': `${contentWidth}px`,
    '--content-height': `${contentHeight}px`,
    '--content-sm': isSm ? '1' : '0',
    '--content-md': isMd ? '1' : '0',
    '--content-lg': isLg ? '1' : '0',
    '--content-xl': isXl ? '1' : '0',
    '--content-2xl': is2Xl ? '1' : '0',
    willChange: 'margin, padding',
  } as CSSProperties;

  return (
    <>
      {!isVideoEditorShellActive && (
        <GlobalHeader
          contentOffsetRight={isTasksPaneLocked ? tasksPaneWidth + 16 : 16}
          contentOffsetLeft={isShotsPaneLocked ? shotsPaneWidth : 0}
          onOpenSettings={onOpenSettings}
        />
      )}

      <div
        className={cn(
          'relative z-10 content-container',
          isVideoEditorShellActive
            ? 'h-screen overflow-hidden transition-[margin,padding] duration-300 ease-smooth'
            : 'transition-[margin,padding] duration-300 ease-smooth',
        )}
        style={contentStyle}
      >
        {!isVideoEditorShellActive && <GlobalProcessingWarning onOpenSettings={onOpenSettings} />}

        <main
          className={cn(
            isVideoEditorShellActive
              ? 'h-full w-full overflow-hidden'
              : cn('container mx-auto', containerPadding, containerSpacing),
          )}
        >
          {!isVideoEditorShellActive && header}
          <Outlet />
        </main>
      </div>
    </>
  );
}
