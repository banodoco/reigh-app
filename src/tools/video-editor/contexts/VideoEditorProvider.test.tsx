import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoEditorProvider } from '@/tools/video-editor/contexts/VideoEditorProvider';
import { useTimelineChromeContext } from '@/tools/video-editor/contexts/TimelineChromeContext';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
} from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useTimelinePlaybackContext } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';

vi.mock('@/tools/video-editor/hooks/useEffects', () => ({
  useEffects: () => ({ data: [] }),
}));

vi.mock('@/tools/video-editor/hooks/useEffectRegistry', () => ({
  useEffectRegistry: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/useEffectResources', () => ({
  useEffectResources: () => ({ effects: [] }),
}));

vi.mock('@/tools/video-editor/hooks/useTimelineState', () => ({
  useTimelineState: () => ({
    editor: {
      selectedClipId: 'clip-1',
      selectClip: vi.fn(),
    },
    chrome: { saveStatus: 'saved' },
    playback: { currentTime: 12.5 },
  }),
}));

function Consumer() {
  const editorData = useTimelineEditorData();
  const editorOps = useTimelineEditorOps();
  const chrome = useTimelineChromeContext();
  const playback = useTimelinePlaybackContext();

  return (
    <div>
      <span>{editorData.selectedClipId}</span>
      <span>{typeof editorOps.selectClip}</span>
      <span>{chrome.saveStatus}</span>
      <span>{playback.currentTime}</span>
    </div>
  );
}

describe('VideoEditorProvider', () => {
  it('provides editor data, editor ops, chrome, and playback contexts together', () => {
    const provider: DataProvider = {
      loadTimeline: vi.fn(),
      saveTimeline: vi.fn(),
      loadAssetRegistry: vi.fn(),
      resolveAssetUrl: vi.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <VideoEditorProvider dataProvider={provider} timelineId="timeline-1" userId="user-1">
          <Consumer />
        </VideoEditorProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('clip-1')).toBeInTheDocument();
    expect(screen.getByText('function')).toBeInTheDocument();
    expect(screen.getByText('saved')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
  });
});
