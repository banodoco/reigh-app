// [CONVERGE-WITH-M1] Transcript → canonical source-data adapter. Pure and
// synchronous: callers provide already-associated transcript data; this file
// performs identity normalization and never fetches or persists anything.

import { freezeDataItem, freezeSourceDataItem, type FrozenDataItem, type SourceFrozenDataItem } from './envelope.ts';

export const TRANSCRIPT_SCHEMA_REF = 'astrid.transcript_segment/v1';
export const ADAPT_TRANSCRIPT_ADAPTER_ID = 'astrid.adaptTranscript';

const ADAPTER_VERSION = '2';

/** Canonical and legacy word shapes accepted at the source boundary. */
export interface TranscriptSourceWord {
  /** Upstream logical word ID. Missing IDs get a deterministic legacy ID. */
  id?: string;
  start: number;
  end: number;
  /** Canonical text field. It wins over the legacy `word` alias. */
  text?: string;
  /** Legacy text alias accepted only when `text` is absent or identical. */
  word?: string;
}

/** Rich source segment input. Legacy `{start,end,text}` remains valid. */
export interface TranscriptSourceSegment {
  /** Upstream logical segment ID. Missing IDs get a deterministic legacy ID. */
  id?: string;
  start: number;
  end: number;
  text: string;
  /** Missing and explicit null are kept distinct in the canonical payload. */
  speaker?: string | null;
  words?: readonly TranscriptSourceWord[];
}

/** Producer/import boundary consumed by T1i/T1j. */
export interface TranscriptSourceDocument {
  /** Existing media artifact key used to associate this transcript with clips. */
  assetId: string;
  /** Logical transcript-document identity; omitted only for legacy payloads. */
  sourceId?: string;
  segments: readonly TranscriptSourceSegment[];
}

export interface AdaptTranscriptOptions {
  assetId: string;
  /** Same-media sources remain distinct when they provide different IDs. */
  sourceId?: string;
  clipId?: string;
}

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const encodeIdPart = (value: string): string => encodeURIComponent(value);

const assertTimeRange = (start: number, end: number, label: string): void => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    throw new TypeError(`${label} must have finite non-negative source times with end >= start`);
  }
};

/**
 * Make a supplied upstream id unique without dropping records. The first
 * duplicate keeps the unsuffixed ID; later duplicates get `~2`, `~3`, … in
 * input order. Collision checks include already-suffixed upstream IDs, so the
 * output is unique even for adversarial inputs such as `x`, `x`, `x~2`.
 */
const uniqueLogicalId = (baseId: string, used: Set<string>): string => {
  if (!used.has(baseId)) {
    used.add(baseId);
    return baseId;
  }
  let suffix = 2;
  let candidate = `${baseId}~${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}~${suffix}`;
  }
  used.add(candidate);
  return candidate;
};

const normalizeSourceId = (assetId: string, sourceId?: string): string => {
  if (!nonEmptyString(assetId)) throw new TypeError('Transcript source requires a non-empty assetId');
  if (sourceId !== undefined && !nonEmptyString(sourceId)) {
    throw new TypeError('Transcript sourceId must be non-empty when provided');
  }
  return sourceId ?? `transcript:${assetId}`;
};

const segmentLogicalId = (
  assetId: string,
  sourceId: string,
  rawId: string,
  sourceIdWasProvided: boolean,
): string => sourceIdWasProvided
  ? `transcript-source:${encodeIdPart(assetId)}:source:${encodeIdPart(sourceId)}:segment:${encodeIdPart(rawId)}`
  // Legacy payloads without a sourceId already derive one from assetId. Keep
  // that established identity format stable while scoping explicit IDs.
  : `transcript-source:${encodeIdPart(sourceId)}:segment:${encodeIdPart(rawId)}`;

const wordLogicalId = (segmentId: string, rawId: string): string =>
  `${segmentId}:word:${encodeIdPart(rawId)}`;

const normalizeWordText = (word: TranscriptSourceWord, segmentIndex: number, wordIndex: number): string => {
  const label = `Transcript segment ${segmentIndex + 1}, word ${wordIndex + 1}`;
  if (word.text !== undefined && typeof word.text !== 'string') {
    throw new TypeError(`${label} text must be a string`);
  }
  if (word.word !== undefined && typeof word.word !== 'string') {
    throw new TypeError(`${label} legacy word alias must be a string`);
  }
  if (word.text !== undefined && word.word !== undefined && word.text !== word.word) {
    throw new TypeError(`${label} has conflicting text and legacy word fields`);
  }
  const text = word.text ?? word.word;
  if (typeof text !== 'string') {
    throw new TypeError(`${label} requires text or the legacy word alias`);
  }
  return text;
};

/**
 * Normalize rich or legacy transcript segments into persisted canonical
 * source items. Item `id` is a logical segment ID, never a content hash.
 * Missing IDs are deterministic for the same legacy source ordering; once
 * admitted, edits retain those IDs in the canonical source item. Upstream
 * duplicate IDs are retained with deterministic input-order suffixes.
 */
export function normalizeTranscriptSource(
  source: TranscriptSourceDocument,
): readonly SourceFrozenDataItem[] {
  const { assetId, segments } = source;
  const sourceIdWasProvided = source.sourceId !== undefined;
  const sourceId = normalizeSourceId(assetId, source.sourceId);
  const usedSegmentIds = new Set<string>();
  const normalized = (segments ?? []).map((segment, segmentIndex): SourceFrozenDataItem => {
    const segmentLabel = `Transcript segment ${segmentIndex + 1}`;
    assertTimeRange(segment.start, segment.end, segmentLabel);
    if (typeof segment.text !== 'string') throw new TypeError(`${segmentLabel} text must be a string`);
    if (segment.speaker !== undefined && segment.speaker !== null && typeof segment.speaker !== 'string') {
      throw new TypeError(`${segmentLabel} speaker must be a string or null`);
    }

    const rawSegmentId = nonEmptyString(segment.id) ? segment.id.trim() : `legacy-index-${segmentIndex}`;
    const id = uniqueLogicalId(segmentLogicalId(assetId, sourceId, rawSegmentId, sourceIdWasProvided), usedSegmentIds);
    const usedWordIds = new Set<string>();
    const words = segment.words?.map((word, wordIndex) => {
      const wordLabel = `${segmentLabel}, word ${wordIndex + 1}`;
      assertTimeRange(word.start, word.end, wordLabel);
      const rawWordId = nonEmptyString(word.id) ? word.id.trim() : `legacy-index-${wordIndex}`;
      // Per-segment IDs need only be unique within their owning segment.
      const wordId = uniqueLogicalId(wordLogicalId(id, rawWordId), usedWordIds);
      return Object.freeze({
        id: wordId,
        start: word.start,
        end: word.end,
        text: normalizeWordText(word, segmentIndex, wordIndex),
      });
    });
    const payload = Object.freeze({
      sourceId,
      segmentId: id,
      text: segment.text,
      ...(segment.speaker !== undefined ? { speaker: segment.speaker } : {}),
      ...(words !== undefined ? { words: Object.freeze(words) } : {}),
    });
    return freezeSourceDataItem({
      id,
      shape: 'interval',
      domain: 'source_seconds',
      extent: { start: segment.start, end: segment.end },
      schemaRef: TRANSCRIPT_SCHEMA_REF,
      payload,
      sourceArtifactRef: { assetId },
      provenance: { adapterId: ADAPT_TRANSCRIPT_ADAPTER_ID, adapterVersion: ADAPTER_VERSION },
    });
  });
  return Object.freeze(normalized);
}

/**
 * Adapt transcript source items into one asset-level or clip-level view.
 * Source identity stays logical and stable; occurrence IDs are derived for
 * views and are never written back into the bundle.
 */
export function adaptTranscript(
  segments: readonly TranscriptSourceSegment[] | null | undefined,
  options: AdaptTranscriptOptions,
): readonly FrozenDataItem[] {
  const sourceItems = normalizeTranscriptSource({
    assetId: options.assetId,
    ...(options.sourceId !== undefined ? { sourceId: options.sourceId } : {}),
    segments: segments ?? [],
  });
  return Object.freeze(sourceItems.map((sourceItem): FrozenDataItem => {
    const item: FrozenDataItem = {
      id: options.clipId === undefined ? `${sourceItem.id}@source` : `${sourceItem.id}@${encodeIdPart(options.clipId)}`,
      sourceItemId: sourceItem.id,
      shape: sourceItem.shape,
      domain: sourceItem.domain,
      extent: sourceItem.extent,
      schemaRef: sourceItem.schemaRef,
      payload: sourceItem.payload,
      provenance: sourceItem.provenance,
      sourceArtifactRef: sourceItem.sourceArtifactRef,
    };
    if (options.clipId !== undefined) {
      item.entityRef = { kind: 'clip', id: options.clipId };
    }
    return freezeDataItem(item);
  }));
}
