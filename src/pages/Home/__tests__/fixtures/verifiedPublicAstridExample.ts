import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  createPublicAstridExampleBundle,
  type PublicAstridExampleMetadata,
  type PublicAstridProviderBinding,
  type PublicAstridVerifiedResult,
} from '../../publicAstridExample.tsx';
import type { ScriptedReplayScript } from '../../replay/scriptedReplay.ts';

export const TEST_OUTPUT_SHA256 = 'c'.repeat(64);
export const TEST_OUTPUT_OBJECT_ID = 'test-output-object-01';
export const TEST_OUTPUT_ASSET_ID = 'test-rendered-output';
export const TEST_OUTPUT_CLIP_ID = 'test-rendered-output-clip';

const options: Parameters<typeof createPublicAstridExampleBundle>[0] = {
  metadata: {
    id: 'verified-output-test-v1',
    title: 'Test output',
    timelineName: 'Test output',
    posterUrl: '/test/verified-output.webp',
    durationSeconds: 18,
    clipCount: 1,
  } satisfies PublicAstridExampleMetadata,
  timelineId: 'verified-output-test-timeline',
  timeline: {
    output: { resolution: '1920x1080', fps: 24, file: 'verified-output.mp4' },
    tracks: [{ id: 'V1', kind: 'visual', label: 'Rendered output' }],
    clips: [{ id: TEST_OUTPUT_CLIP_ID, asset: TEST_OUTPUT_ASSET_ID, track: 'V1', at: 0, from: 0, to: 18 }],
  } satisfies TimelineConfig,
  assetRegistry: {
    assets: {
      'source-footage': {
        file: '/test/source-footage.mp4',
        type: 'video/mp4',
        duration: 18,
        resolution: '1920x1080',
        fps: 24,
        content_sha256: 'a'.repeat(64),
        origin: 'immutable-public',
      },
      [TEST_OUTPUT_ASSET_ID]: {
        file: '/test/verified-output.mp4',
        type: 'video/mp4',
        duration: 18,
        resolution: '1920x1080',
        fps: 24,
        content_sha256: TEST_OUTPUT_SHA256,
        origin: 'immutable-public',
        derivedFrom: {
          assetId: 'source-footage',
          content_sha256: 'a'.repeat(64),
          role: 'render-output',
        },
      },
    },
  } satisfies AssetRegistry,
  script: {
    fixture_version: 'verified-output-test-v1',
    label: 'Scripted example',
    logical_key: 'verified-output-test-script',
    result_logical_key: 'verified-output-test-result',
    request: 'Create a short example sequence.',
    response: 'The example sequence is ready.',
    steps: [
      { id: 'result', title: 'Result', detail: 'The verified output is available.', result_logical_key: 'verified-output-test-result' },
    ],
  } satisfies ScriptedReplayScript,
  providerBinding: {
    state: 'verified',
    provider: 'astrid-runtime-v1',
    projectId: 'test-project-01',
    projectSlug: 'verified-output-test',
    timelineId: 'verified-output-test-timeline',
    timelineVersion: 1,
    readbackReceiptSha256: 'b'.repeat(64),
  } satisfies PublicAstridProviderBinding,
  verifiedResult: {
    state: 'verified',
    exportSource: {
      projectId: 'test-export-project-01',
      timelineId: 'test-export-timeline-v07',
      timelineVersion: 7,
    },
    target: {
      projectId: 'test-project-01',
      timelineId: 'verified-output-test-timeline',
      timelineVersion: 1,
      assetId: TEST_OUTPUT_ASSET_ID,
      clipId: TEST_OUTPUT_CLIP_ID,
    },
    taskId: 'test-task-01',
    outputObjectId: TEST_OUTPUT_OBJECT_ID,
    outputFilename: 'verified-output.mp4',
    outputSha256: TEST_OUTPUT_SHA256,
    durationSeconds: 18,
    frameCount: 432,
    verificationReceiptSha256: 'd'.repeat(64),
  } satisfies PublicAstridVerifiedResult,
  resultTarget: {
    outputObjectId: TEST_OUTPUT_OBJECT_ID,
    assetId: TEST_OUTPUT_ASSET_ID,
    clipId: TEST_OUTPUT_CLIP_ID,
  },
  silentVideoWaveformAssetHashes: {},
};

export function verifiedPublicAstridExampleOptions(
  overrides: Partial<Parameters<typeof createPublicAstridExampleBundle>[0]> = {},
) {
  return { ...structuredClone(options), ...overrides };
}

export function createVerifiedPublicAstridExampleForTest() {
  return createPublicAstridExampleBundle(verifiedPublicAstridExampleOptions());
}
