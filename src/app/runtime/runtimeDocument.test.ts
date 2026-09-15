import { describe, expect, it } from 'vitest';
import { isRuntimeDocumentMode, withRuntimeDocumentParams } from './runtimeDocument';

describe('isRuntimeDocumentMode', () => {
  it('recognizes a complete ordinary Runtime editor URL', () => {
    expect(isRuntimeDocumentMode(
      '?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1',
      '/tools/video-editor',
    )).toBe(true);
  });

  it('recognizes the image-generation tool when it carries the same explicit document identity', () => {
    expect(isRuntimeDocumentMode(
      '?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1',
      '/tools/image-generation',
    )).toBe(true);
  });

  it('carries only the complete Runtime document identity to a tool route', () => {
    expect(withRuntimeDocumentParams(
      '/tools/image-generation',
      '?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1&stale=ignored',
    )).toBe('/tools/image-generation?runtime=1&runtimeProject=project-1&runtimeTimeline=timeline-1');
    expect(withRuntimeDocumentParams('/tools/image-generation', '?runtime=1&runtimeProject=project-1'))
      .toBe('/tools/image-generation');
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
