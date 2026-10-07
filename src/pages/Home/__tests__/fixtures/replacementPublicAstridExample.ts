import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { createPublicAstridExampleBundle } from '../../publicAstridExample.tsx';
import type { ScriptedReplayScript } from '../../replay/scriptedReplay.ts';

/** A deliberately different single-clip package for proving the shared editor seam. */
export const REPLACEMENT_PUBLIC_EXAMPLE = createPublicAstridExampleBundle({
  metadata: {
    id: 'replacement-wildlife-v1',
    title: 'Wildlife sequence',
    timelineName: 'Wildlife sequence',
    posterUrl: '/replacement/wildlife-poster.webp',
    durationSeconds: 18,
    clipCount: 1,
  },
  timelineId: 'replacement-wildlife-timeline',
  timeline: {
    output: { resolution: '1920x1080', fps: 24, file: 'wildlife-sequence.mp4' },
    tracks: [{ id: 'V1', kind: 'visual', label: 'Wildlife sequence' }],
    clips: [{ id: 'wildlife-clip-01', asset: 'wildlife-source-01', track: 'V1', at: 0, from: 0, to: 18 }],
  } satisfies TimelineConfig,
  assetRegistry: {
    assets: {
      'wildlife-source-01': {
        file: '/replacement/wildlife-source-01.mp4',
        type: 'video/mp4',
        duration: 18,
        resolution: '1920x1080',
        fps: 24,
        content_sha256: 'a'.repeat(64),
        origin: 'immutable-public',
      },
    },
  } satisfies AssetRegistry,
  script: {
    fixture_version: 'replacement-wildlife-v1',
    label: 'Wildlife example',
    logical_key: 'wildlife-script-v1',
    result_logical_key: 'wildlife-result-v1',
    request: 'Assemble a short wildlife sequence.',
    response: 'The wildlife sequence is ready for review.',
    steps: [{
      id: 'sequence',
      title: 'Sequence',
      detail: 'One source clip fills the timeline.',
      clip_ids: ['wildlife-clip-01'],
    }],
  } satisfies ScriptedReplayScript,
  providerBinding: {
    state: 'unbound',
    provider: null,
    projectId: null,
    projectSlug: null,
    timelineId: null,
    timelineVersion: null,
    readbackReceiptSha256: null,
  },
  verifiedResult: {
    state: 'unavailable',
    exportSource: null,
    target: null,
    taskId: null,
    outputObjectId: null,
    outputFilename: null,
    outputSha256: null,
    durationSeconds: null,
    frameCount: null,
    verificationReceiptSha256: null,
  },
  resultTarget: null,
  silentVideoWaveformAssetHashes: {},
});
