// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  createPublicAstridExampleBundle,
  PublicAstridExampleProvider,
  PublicAstridExampleWriteError,
  usePublicAstridExample,
} from './publicAstridExample.tsx';
import type { ScriptedReplayScript } from './replay/scriptedReplay.ts';
import { render, screen } from '@testing-library/react';
import { formatPublicAstridExampleClipCount } from './publicAstridExampleSelection.ts';
import {
  TEST_OUTPUT_OBJECT_ID,
  TEST_OUTPUT_SHA256,
  verifiedPublicAstridExampleOptions,
} from './__tests__/fixtures/verifiedPublicAstridExample.ts';

const replacementTimeline: TimelineConfig = {
  output: { resolution: '1920x1080', fps: 24, file: 'replacement.mp4' },
  tracks: [{ id: 'V1', kind: 'visual', label: 'Wildlife sequence' }],
  clips: [{ id: 'wildlife-clip-01', asset: 'wildlife-source-01', track: 'V1', at: 0, from: 0, to: 18 }],
};

const replacementRegistry: AssetRegistry = {
  assets: {
    'wildlife-source-01': {
      file: '/local-example/wildlife-source-01.mp4',
      type: 'video/mp4',
      duration: 18,
      resolution: '1920x1080',
      fps: 24,
      content_sha256: 'a'.repeat(64),
      origin: 'immutable-public',
    },
  },
};

const replacementScript: ScriptedReplayScript = {
  fixture_version: 'wildlife-example-v1',
  label: 'Scripted example',
  logical_key: 'wildlife-script-v1',
  result_logical_key: 'wildlife-result-v1',
  request: 'Assemble a short wildlife scene with a steady ending.',
  response: 'The example arranges one source clip into an 18-second sequence.',
  steps: [
    { id: 'source-media', title: 'Wildlife footage', detail: 'One local source clip.', asset_ids: ['wildlife-source-01'] },
    { id: 'sequence', title: 'Sequence', detail: 'Place the clip on the timeline.', clip_ids: ['wildlife-clip-01'] },
    { id: 'timing', title: 'Timing', detail: 'Keep the ending steady.', clip_ids: ['wildlife-clip-01'] },
    { id: 'result', title: 'Result', detail: 'A verified output will be linked when available.', result_logical_key: 'wildlife-result-v1' },
  ],
};

export const replacementExample = createPublicAstridExampleBundle({
  metadata: {
    id: 'wildlife-example-v1',
    title: 'Wildlife sequence',
    timelineName: 'Wildlife sequence',
    posterUrl: '/local-example/wildlife-poster.webp',
    durationSeconds: 18,
    clipCount: 1,
  },
  timelineId: 'wildlife-timeline-v1',
  timeline: replacementTimeline,
  assetRegistry: replacementRegistry,
  script: replacementScript,
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

function ExampleSummary() {
  const example = usePublicAstridExample();
  return <p>{example.metadata.title} · {example.timelineSummary.durationSeconds}s · {formatPublicAstridExampleClipCount(example.timelineSummary.clipCount)}</p>;
}

describe('replaceable public example bundle', () => {
  it('drives metadata, script and timeline summary from a different example package', () => {
    render(<PublicAstridExampleProvider example={replacementExample}><ExampleSummary /></PublicAstridExampleProvider>);
    expect(screen.getByText('Wildlife sequence · 18s · 1 clip')).toBeInTheDocument();
    expect(replacementExample.script.request).toContain('wildlife scene');
    expect(replacementExample.timelineSummary).toEqual({ durationSeconds: 18, clipCount: 1 });
    expect(replacementExample.silentVideoWaveformAssetHashes).toEqual({});
    expect(Object.isFrozen(replacementExample.timeline.clips[0])).toBe(true);
    expect(Object.isFrozen(replacementTimeline.clips[0])).toBe(false);
  });

  it('keeps arbitrary selected examples immutable and denies unregistered resources', async () => {
    const first = await replacementExample.dataProvider.loadTimeline(replacementExample.timelineId);
    first.config.clips[0].at = 71;
    const second = await replacementExample.dataProvider.loadTimeline(replacementExample.timelineId);
    expect(second.config.clips[0].at).toBe(0);
    await expect(replacementExample.dataProvider.resolveAssetUrl('/local-example/wildlife-source-01.mp4'))
      .resolves.toBe('/local-example/wildlife-source-01.mp4');
    await expect(replacementExample.dataProvider.resolveAssetUrl('https://external.example/unlisted.mp4'))
      .rejects.toThrow('public example has no asset');
    await expect(replacementExample.dataProvider.saveTimeline(replacementExample.timelineId, second.config, 1))
      .rejects.toBeInstanceOf(PublicAstridExampleWriteError);
  });

  it('rejects a shell summary that no longer matches the canonical timeline', () => {
    expect(() => createPublicAstridExampleBundle({
      metadata: { ...replacementExample.metadata, clipCount: 3 },
      timelineId: replacementExample.timelineId,
      timeline: replacementExample.timeline,
      assetRegistry: replacementExample.assetRegistry,
      script: replacementExample.script,
      providerBinding: replacementExample.providerBinding,
      verifiedResult: replacementExample.verifiedResult,
      resultTarget: replacementExample.resultTarget,
      silentVideoWaveformAssetHashes: replacementExample.silentVideoWaveformAssetHashes,
    })).toThrow('shell summary does not match');
  });

  it('accepts a receipt-mapped output only when its object ID and bytes match the target asset', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();
    const verified = createPublicAstridExampleBundle(verifiedOptions);

    expect(verified.resultTarget).toEqual({
      outputObjectId: TEST_OUTPUT_OBJECT_ID,
      assetId: 'test-rendered-output',
      clipId: 'test-rendered-output-clip',
    });
    expect(verified.verifiedResult.state).toBe('verified');
    expect(verifiedOptions.verifiedResult.exportSource).not.toEqual(verifiedOptions.providerBinding);
    expect(verified.assetRegistry.assets[verified.resultTarget!.assetId].content_sha256)
      .toBe(TEST_OUTPUT_SHA256);

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      resultTarget: { ...verifiedOptions.resultTarget!, outputObjectId: 'different-output-object' },
    })).toThrow('receipt-bound output object, asset, and clip identities');

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedOptions.verifiedResult, outputSha256: 'e'.repeat(64) },
    })).toThrow('asset bytes must match');
  });

  it('rejects a clip that exists but does not reference the exact verified output asset', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();
    const verifiedResult = verifiedOptions.verifiedResult;
    if (verifiedResult.state !== 'verified') throw new Error('The test fixture must be verified.');
    const timeline = structuredClone(verifiedOptions.timeline);
    timeline.tracks.push({ id: 'V2', kind: 'visual', label: 'Source' });
    timeline.clips.push({
      id: 'source-footage-clip',
      asset: 'source-footage',
      track: 'V2',
      at: 0,
      from: 0,
      to: 18,
    });

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      metadata: { ...verifiedOptions.metadata, clipCount: 2 },
      timeline,
      verifiedResult: {
        ...verifiedResult,
        target: { ...verifiedResult.target, clipId: 'source-footage-clip' },
      },
      resultTarget: { ...verifiedOptions.resultTarget!, clipId: 'source-footage-clip' },
    })).toThrow('existing clip and registered asset');
  });

  it('requires the receipt-bound target project and timeline version to match the displayed provider binding', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();
    const verifiedResult = verifiedOptions.verifiedResult;
    if (verifiedResult.state !== 'verified') throw new Error('The test fixture must be verified.');

    expect(verifiedResult.exportSource).toEqual({
      projectId: 'test-export-project-01',
      timelineId: 'test-export-timeline-v07',
      timelineVersion: 7,
    });
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, projectId: 'other-project' } },
    })).toThrow('target project and timeline version must match');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, timelineId: 'other-timeline' } },
    })).toThrow('target project and timeline version must match');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, timelineVersion: 2 } },
    })).toThrow('target project and timeline version must match');
  });

  it('rejects receipt target IDs that disagree with the explicit result handoff target', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();
    const verifiedResult = verifiedOptions.verifiedResult;
    if (verifiedResult.state !== 'verified') throw new Error('The test fixture must be verified.');

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, assetId: 'other-asset' } },
    })).toThrow('receipt-bound output object, asset, and clip identities');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, clipId: 'other-clip' } },
    })).toThrow('receipt-bound output object, asset, and clip identities');
  });

  it('rejects missing verified identities and malformed SHA-256 receipt values', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      providerBinding: { ...verifiedOptions.providerBinding, projectId: ' ' },
    })).toThrow('non-empty identities');

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      providerBinding: { ...verifiedOptions.providerBinding, readbackReceiptSha256: 'not-a-sha256' },
    })).toThrow('SHA-256 readback receipt');

    const verifiedResult = verifiedOptions.verifiedResult;
    if (verifiedResult.state !== 'verified') throw new Error('The test fixture must be verified.');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, outputSha256: 'not-a-sha256' },
    })).toThrow('SHA-256 output and verification receipts');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, exportSource: { ...verifiedResult.exportSource, projectId: ' ' } },
    })).toThrow('non-empty identities');
    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
      verifiedResult: { ...verifiedResult, target: { ...verifiedResult.target, timelineVersion: 0 } },
    })).toThrow('non-empty identities');
  });

  it('rejects a target for an unavailable result', () => {
    const verifiedOptions = verifiedPublicAstridExampleOptions();

    expect(() => createPublicAstridExampleBundle({
      ...verifiedOptions,
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
    })).toThrow('unavailable result cannot expose a clip/asset target');
  });
});
