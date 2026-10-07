// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicAstridPlaybackCoordinator } from './PublicAstridEditorParts';

const playback = vi.hoisted(() => ({
  previewRef: { current: { pause: vi.fn(), play: vi.fn(), seek: vi.fn() } },
}));
vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({ useTimelinePlaybackContext: () => playback }));
vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({ RemotionPreview: () => null }));
vi.mock('@/tools/video-editor/components/TimelineEditor/TimelineEditorCoreBody.tsx', () => ({ TimelineEditorCoreBody: () => null }));

describe('public preview activity policy', () => {
  it('pauses on deactivation and Agent, keeps playback position, and never auto-resumes', () => {
    vi.clearAllMocks();
    const view = render(<PublicAstridPlaybackCoordinator audience="app" active />);
    expect(playback.previewRef.current.pause).not.toHaveBeenCalled();
    view.rerender(<PublicAstridPlaybackCoordinator audience="app" active={false} />);
    expect(playback.previewRef.current.pause).toHaveBeenCalledTimes(1);
    view.rerender(<PublicAstridPlaybackCoordinator audience="app" active />);
    expect(playback.previewRef.current.pause).toHaveBeenCalledTimes(1);
    view.rerender(<PublicAstridPlaybackCoordinator audience="agent" active />);
    expect(playback.previewRef.current.pause).toHaveBeenCalledTimes(1);
    view.rerender(<PublicAstridPlaybackCoordinator audience="app" active />);
    expect(playback.previewRef.current.play).not.toHaveBeenCalled();
    expect(playback.previewRef.current.seek).not.toHaveBeenCalled();
  });

  it('pauses an editor that completes its import while Home is already retained', () => {
    vi.clearAllMocks();
    render(<PublicAstridPlaybackCoordinator audience="app" active={false} />);
    expect(playback.previewRef.current.pause).toHaveBeenCalledTimes(1);
    expect(playback.previewRef.current.play).not.toHaveBeenCalled();
  });
});
