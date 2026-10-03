import { createContext, useContext, type ReactNode } from 'react';
import { TimelineNotFoundError } from '@/tools/video-editor/data/DataProvider.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { getPairTimelineDuration } from '@/tools/video-editor/lib/timeline-domain.ts';
import type { ScriptedReplayScript } from './replay/scriptedReplay.ts';

export type PublicAstridProviderBinding =
  | Readonly<{
      state: 'unbound';
      provider: null;
      projectId: null;
      projectSlug: null;
      timelineId: null;
      timelineVersion: null;
      readbackReceiptSha256: null;
    }>
  | Readonly<{
      state: 'verified';
      provider: 'astrid-runtime-v1';
      projectId: string;
      projectSlug: string;
      timelineId: string;
      timelineVersion: number;
      readbackReceiptSha256: string;
    }>;

export type PublicAstridVerifiedResult =
  | Readonly<{
      state: 'unavailable';
      exportSource: null;
      target: null;
      taskId: null;
      outputObjectId: null;
      outputFilename: null;
      outputSha256: null;
      durationSeconds: null;
      frameCount: null;
      verificationReceiptSha256: null;
    }>
  | Readonly<{
      state: 'verified';
      /** The project/timeline version actually rendered; may differ from the target tuple. */
      exportSource: Readonly<{ projectId: string; timelineId: string; timelineVersion: number }>;
      /** The read-back timeline containing the exact existing result clip. */
      target: Readonly<{
        projectId: string;
        timelineId: string;
        timelineVersion: number;
        assetId: string;
        clipId: string;
      }>;
      taskId: string;
      outputObjectId: string;
      outputFilename: string;
      outputSha256: string;
      durationSeconds: number;
      frameCount: number;
      verificationReceiptSha256: string;
    }>;

export interface PublicAstridExampleMetadata {
  id: string;
  title: string;
  timelineName: string;
  posterUrl: string;
  durationSeconds: number;
  clipCount: number;
}

export interface PublicAstridExampleBundle {
  metadata: PublicAstridExampleMetadata;
  timelineId: string;
  timeline: TimelineConfig;
  assetRegistry: AssetRegistry;
  timelineSummary: Readonly<{ durationSeconds: number; clipCount: number }>;
  dataProvider: DataProvider;
  script: ScriptedReplayScript;
  providerBinding: PublicAstridProviderBinding;
  verifiedResult: PublicAstridVerifiedResult;
  /** Null until the verified result is receipt-mapped to its exact registered output asset and clip. */
  resultTarget: Readonly<{ outputObjectId: string; assetId: string; clipId: string }> | null;
  /** Only proven-silent media is listed; unknown audio is never suppressed by default. */
  silentVideoWaveformAssetHashes: Readonly<Record<string, string>>;
}

interface CreatePublicAstridDataProviderOptions {
  timelineId: string;
  timeline: TimelineConfig;
  assetRegistry: AssetRegistry;
}

interface CreatePublicAstridExampleOptions extends CreatePublicAstridDataProviderOptions {
  metadata: PublicAstridExampleMetadata;
  script: ScriptedReplayScript;
  providerBinding: PublicAstridProviderBinding;
  verifiedResult: PublicAstridVerifiedResult;
  resultTarget: Readonly<{ outputObjectId: string; assetId: string; clipId: string }> | null;
  silentVideoWaveformAssetHashes: Readonly<Record<string, string>>;
}

export class PublicAstridExampleWriteError extends Error {
  constructor(operation: string) {
    super(`This public example is read only: ${operation} is unavailable.`);
    this.name = 'PublicAstridExampleWriteError';
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function isNonEmptyIdentity(value: string): boolean {
  return value.trim().length > 0;
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Build the one immutable host provider for a selected local example package. */
export function createPublicAstridDataProvider({
  timelineId,
  timeline,
  assetRegistry,
}: CreatePublicAstridDataProviderOptions): DataProvider {
  const allowedFiles = new Set(
    Object.values(assetRegistry.assets)
      .map((asset) => asset.file)
      .filter((file): file is string => typeof file === 'string'),
  );
  const requireTimeline = (requestedId: string) => {
    if (requestedId !== timelineId) throw new TimelineNotFoundError(requestedId);
  };

  return Object.freeze({
    persistenceEnabled: false,
    supportsEditorSync: false,
    supportsDirectAssetUpload: false,
    async loadTimeline(requestedId: string) {
      requireTimeline(requestedId);
      return { config: copy(timeline), configVersion: 1 };
    },
    async loadAssetRegistry(requestedId: string) {
      requireTimeline(requestedId);
      return copy(assetRegistry);
    },
    async resolveAssetUrl(file: string): Promise<string> {
      if (allowedFiles.has(file)) return file;
      throw new Error(`The public example has no asset at ${file}.`);
    },
    async saveTimeline(): Promise<number> {
      throw new PublicAstridExampleWriteError('saveTimeline');
    },
  });
}

/**
 * Assemble one fixed local example from canonical timeline/registry data.
 * The public page stays read-only regardless of the supplied example content.
 */
export function createPublicAstridExampleBundle({
  metadata,
  timelineId,
  timeline,
  assetRegistry,
  script,
  providerBinding,
  verifiedResult,
  resultTarget,
  silentVideoWaveformAssetHashes,
}: CreatePublicAstridExampleOptions): PublicAstridExampleBundle {
  const selectedMetadata = freezeDeep(copy(metadata));
  const selectedTimeline = freezeDeep(copy(timeline));
  const selectedAssetRegistry = freezeDeep(copy(assetRegistry));
  const selectedScript = freezeDeep(copy(script));
  const selectedProviderBinding = freezeDeep(copy(providerBinding));
  const selectedVerifiedResult = freezeDeep(copy(verifiedResult));
  const selectedResultTarget = resultTarget ? freezeDeep(copy(resultTarget)) : null;
  const selectedSilentHashes = freezeDeep(copy(silentVideoWaveformAssetHashes));
  const timelineSummary = Object.freeze({
    durationSeconds: getPairTimelineDuration(selectedTimeline.clips, selectedAssetRegistry),
    clipCount: selectedTimeline.clips.length,
  });
  if (Math.abs(selectedMetadata.durationSeconds - timelineSummary.durationSeconds) > 0.001
    || selectedMetadata.clipCount !== timelineSummary.clipCount) {
    throw new Error(`Public example shell summary does not match timeline ${timelineId}.`);
  }
  if (selectedProviderBinding.state === 'verified' && selectedProviderBinding.timelineId !== timelineId) {
    throw new Error(`Verified provider binding does not match timeline ${timelineId}.`);
  }
  if (selectedProviderBinding.state === 'verified'
    && (!isNonEmptyIdentity(selectedProviderBinding.projectId)
      || !isNonEmptyIdentity(selectedProviderBinding.projectSlug)
      || !isNonEmptyIdentity(selectedProviderBinding.timelineId)
      || !Number.isSafeInteger(selectedProviderBinding.timelineVersion)
      || selectedProviderBinding.timelineVersion <= 0
      || !isSha256(selectedProviderBinding.readbackReceiptSha256))) {
    throw new Error('Verified provider binding requires non-empty identities, a positive timeline version, and a SHA-256 readback receipt.');
  }
  if (selectedVerifiedResult.state === 'verified') {
    if (selectedProviderBinding.state !== 'verified' || !selectedResultTarget) {
      throw new Error('A verified result requires a verified provider binding and exact existing clip/asset target.');
    }
    // F06 must source these tuples from the same verification receipt and verify the packaged bytes.
    // This constructor checks consistency only; copying matching values is not provider/export proof.
    if (!isNonEmptyIdentity(selectedVerifiedResult.exportSource.projectId)
      || !isNonEmptyIdentity(selectedVerifiedResult.exportSource.timelineId)
      || !Number.isSafeInteger(selectedVerifiedResult.exportSource.timelineVersion)
      || selectedVerifiedResult.exportSource.timelineVersion <= 0
      || !isNonEmptyIdentity(selectedVerifiedResult.target.projectId)
      || !isNonEmptyIdentity(selectedVerifiedResult.target.timelineId)
      || !Number.isSafeInteger(selectedVerifiedResult.target.timelineVersion)
      || selectedVerifiedResult.target.timelineVersion <= 0
      || !isNonEmptyIdentity(selectedVerifiedResult.target.assetId)
      || !isNonEmptyIdentity(selectedVerifiedResult.target.clipId)
      || !isNonEmptyIdentity(selectedVerifiedResult.taskId)
      || !isNonEmptyIdentity(selectedVerifiedResult.outputObjectId)
      || !isNonEmptyIdentity(selectedVerifiedResult.outputFilename)
      || !isSha256(selectedVerifiedResult.outputSha256)
      || !Number.isFinite(selectedVerifiedResult.durationSeconds)
      || selectedVerifiedResult.durationSeconds <= 0
      || !Number.isSafeInteger(selectedVerifiedResult.frameCount)
      || selectedVerifiedResult.frameCount <= 0
      || !isSha256(selectedVerifiedResult.verificationReceiptSha256)) {
      throw new Error('Verified result requires non-empty identities, valid output metadata, and SHA-256 output and verification receipts.');
    }
    if (selectedVerifiedResult.target.projectId !== selectedProviderBinding.projectId
      || selectedVerifiedResult.target.timelineId !== selectedProviderBinding.timelineId
      || selectedVerifiedResult.target.timelineVersion !== selectedProviderBinding.timelineVersion) {
      throw new Error('Verified result target project and timeline version must match the displayed provider binding.');
    }
    if (!isNonEmptyIdentity(selectedResultTarget.outputObjectId)
      || !isNonEmptyIdentity(selectedResultTarget.assetId)
      || !isNonEmptyIdentity(selectedResultTarget.clipId)
      || selectedResultTarget.outputObjectId !== selectedVerifiedResult.outputObjectId
      || selectedResultTarget.assetId !== selectedVerifiedResult.target.assetId
      || selectedResultTarget.clipId !== selectedVerifiedResult.target.clipId) {
      throw new Error('Verified result target must match the receipt-bound output object, asset, and clip identities.');
    }
    const targetClip = selectedTimeline.clips.find((clip) => clip.id === selectedResultTarget.clipId);
    const targetAsset = selectedAssetRegistry.assets[selectedResultTarget.assetId];
    if (!targetClip || targetClip.asset !== selectedResultTarget.assetId || !targetAsset) {
      throw new Error('Verified result target must map to an existing clip and registered asset.');
    }
    if (!isSha256(targetAsset.content_sha256 ?? '')
      || targetAsset.content_sha256 !== selectedVerifiedResult.outputSha256) {
      throw new Error('Verified result target asset bytes must match the verified output SHA-256.');
    }
  } else if (selectedResultTarget) {
    throw new Error('An unavailable result cannot expose a clip/asset target.');
  }
  for (const [assetId, sha256] of Object.entries(selectedSilentHashes)) {
    if (selectedAssetRegistry.assets[assetId]?.content_sha256 !== sha256) {
      throw new Error(`Silent media fact does not match the registered asset ${assetId}.`);
    }
  }

  return Object.freeze({
    metadata: selectedMetadata,
    timelineId,
    timeline: selectedTimeline,
    assetRegistry: selectedAssetRegistry,
    timelineSummary,
    dataProvider: createPublicAstridDataProvider({
      timelineId,
      timeline: selectedTimeline,
      assetRegistry: selectedAssetRegistry,
    }),
    script: selectedScript,
    providerBinding: selectedProviderBinding,
    verifiedResult: selectedVerifiedResult,
    resultTarget: selectedResultTarget,
    silentVideoWaveformAssetHashes: selectedSilentHashes,
  });
}

const PublicAstridExampleContext = createContext<PublicAstridExampleBundle | null>(null);

export function PublicAstridExampleProvider({
  example,
  children,
}: {
  example: PublicAstridExampleBundle;
  children: ReactNode;
}) {
  return <PublicAstridExampleContext.Provider value={example}>{children}</PublicAstridExampleContext.Provider>;
}

export function usePublicAstridExample(): PublicAstridExampleBundle {
  const example = useContext(PublicAstridExampleContext);
  if (!example) throw new Error('PublicAstridExampleProvider is missing.');
  return example;
}
