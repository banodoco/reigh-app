import { describe, expect, it } from 'vitest';
import { isRuntimeDocumentMode } from './runtimeDocument';

describe('isRuntimeDocumentMode', () => {
  it('recognizes a complete ordinary Runtime editor URL', () => {
    expect(isRuntimeDocumentMode(
      '?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1',
      '/tools/video-editor',
    )).toBe(true);
  });

  it.each([
    ['missing runtime selector', '?runtimeProject=project-1&runtimeTimeline=timeline-1', '/tools/video-editor'],
    ['missing project', '?runtime=1&runtimeTimeline=timeline-1', '/tools/video-editor'],
    ['missing timeline', '?runtime=1&runtimeProject=project-1', '/tools/video-editor'],
    ['other route', '?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1', '/tools/settings'],
  ])('rejects %s', (_label, search, pathname) => {
    expect(isRuntimeDocumentMode(search, pathname)).toBe(false);
  });
});
