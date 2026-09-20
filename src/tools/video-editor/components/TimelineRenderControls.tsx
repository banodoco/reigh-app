import { AlertTriangle, Download, Square } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { useTimelineChromeContext } from '@/tools/video-editor/hooks/timelineStore.ts';

/** Render button, render blocker message, and cancellation control. */
export function TimelineRenderControls({
  previewActionButtonClass,
}: {
  previewActionButtonClass: string;
}) {
  const chrome = useTimelineChromeContext();

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={`gap-1.5 ${previewActionButtonClass}`}
        onClick={() => void chrome.startRender()}
        disabled={chrome.renderStatus === 'rendering'}
      >
        <Download className="h-3.5 w-3.5" />
        {chrome.renderStatus === 'rendering' && chrome.renderProgress
          ? `Render ${chrome.renderProgress.percent}%`
          : 'Render'}
      </Button>
      {chrome.renderStatus === 'rendering' && chrome.activeRenderTaskId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={`gap-1.5 ${previewActionButtonClass}`}
          onClick={() => void chrome.cancelRender()}
          aria-label="Cancel render"
        >
          <Square className="h-3 w-3" />
          Cancel
        </Button>
      )}
      {chrome.renderStatus === 'error' && chrome.renderLog && (
        <div
          className="absolute right-0 top-full mt-1 w-72 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300 backdrop-blur-sm"
          data-video-editor-render-blocker="true"
        >
          <div className="flex items-start gap-1">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-3">{chrome.renderLog.split('\n')[0]}</span>
          </div>
        </div>
      )}
    </>
  );
}
