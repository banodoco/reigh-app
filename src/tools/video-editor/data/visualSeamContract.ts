import type {
  ResolvedTimelineClip,
  ResolvedTimelineConfig,
  TrackDefinition,
} from '@/tools/video-editor/types/index.ts';
import { timelineClipDurationMs } from './shotCompositionTiming.ts';
import { portableVisualSeamIntent } from './portableVisualSeamIntent.ts';
import type {SeamIntent} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/seam-intent';
import {sameContext} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/seam-intent';
import {transitionFrames} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/boundary';

export const VISUAL_SEAM_CONTRACT_VERSION = 1 as const;

export type VisualSeamIntent = 'hard-cut' | 'transition' | 'synchronized';
type StoredVisualSeamIntent = VisualSeamIntent | Readonly<{
  kind: VisualSeamIntent;
  frame: number;
  participants: readonly string[];
  context: string;
  canonical?: SeamIntent;
}>;

export type VisualBoundaryBehavior =
  | 'continues'
  | 'enters'
  | 'exits'
  | 'source-change'
  | 'motion-start'
  | 'phase-change'
  | 'opaque';

export type VisualSeamParticipant = Readonly<{
  ownerId: string;
  path: readonly string[];
  behavior: VisualBoundaryBehavior;
  clipId: string;
}>;

export type VisualSeamBoundary = Readonly<{
  frame: number;
  timeSeconds: number;
  intent?: VisualSeamIntent;
  participants: readonly VisualSeamParticipant[];
  structuralIssues: readonly string[];
  unacknowledgedRisk: boolean;
  requiresIntent: boolean;
}>;

export type VisualSeamOpaqueElement = Readonly<{
  clipId: string;
  clipType: string;
  ownerId: string;
  path: readonly string[];
  startFrame: number;
  endFrame: number;
  reason: 'custom-clip-type' | 'element-ref' | 'unsupported-transition';
  elementRef?: Readonly<{
    id: string;
    kind: string;
    revision?: string;
    packId?: string;
  }>;
}>;

export type VisualSeamReport = Readonly<{
  version: typeof VISUAL_SEAM_CONTRACT_VERSION;
  fps: number;
  guardFrames: number;
  boundaries: readonly VisualSeamBoundary[];
  opaqueElements: readonly VisualSeamOpaqueElement[];
  structuralIssues: readonly string[];
  warningCount: number;
  blocked: boolean;
}>;

export type VisualSeamAnalysisOptions = Readonly<{
  guardFrames?: number;
  /** Tracks whose picture continuity is structural. Overlay/effect tracks are not. */
  continuityTracks?: readonly string[];
  /** Turn an unacknowledged visual-risk warning into admission failure. */
  enforceIntent?: boolean;
}>;

export class VisualSeamAdmissionError extends Error {
  readonly code = 'visual_seam_admission_blocked' as const;
  readonly report: VisualSeamReport;

  constructor(message: string, report: VisualSeamReport) {
    super(message);
    this.name = 'VisualSeamAdmissionError';
    this.report = report;
  }
}

type JsonRecord = Record<string, unknown>;

type ClipSpan = Readonly<{
  clip: ResolvedTimelineClip;
  track: TrackDefinition | undefined;
  startFrame: number;
  endFrame: number;
  primary: boolean;
}>;

type Cue = Readonly<{
  frame: number;
  participant: VisualSeamParticipant;
}>;

type BoundaryCandidate = Readonly<{
  frame: number;
  intent?: VisualSeamIntent;
  participants: readonly VisualSeamParticipant[];
  structuralIssues: readonly string[];
}>;

const AUXILIARY_CLIP_TYPES = new Set([
  'effect-layer',
  'frame-overlay',
  'end-spanning-layer',
]);

const BUILTIN_CLIP_TYPES = new Set([
  'media',
  'hold',
  'text',
  'effect-layer',
  'frame-overlay',
  'end-spanning-layer',
]);

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function active(clip: ResolvedTimelineClip): boolean {
  return clip.enabled !== false
    && clip.active !== false
    && clip.disabled !== true
    && clip.hidden !== true
    && clip.deleted !== true;
}

function clipDurationSeconds(clip: ResolvedTimelineClip): number {
  return timelineClipDurationMs(clip) / 1000;
}

function clipType(clip: ResolvedTimelineClip): string {
  return text(clip.clipType) ?? 'media';
}

function isPrimaryVisualClip(clip: ResolvedTimelineClip, track: TrackDefinition | undefined): boolean {
  if (track?.kind !== 'visual' || AUXILIARY_CLIP_TYPES.has(clipType(clip))) return false;
  const elementKind = record(clip.elementRef)?.kind;
  return !['effect', 'animation', 'transition'].includes(String(elementKind));
}

function ownerPath(clip: ResolvedTimelineClip): { ownerId: string; path: readonly string[] } {
  const canonical = record(clip.app?.canonical);
  const occurrenceId = text(canonical?.occurrenceId);
  const parentDocumentId = text(canonical?.parentDocumentId);
  if (occurrenceId && parentDocumentId) {
    return {
      ownerId: occurrenceId,
      path: ['parent', parentDocumentId, 'occurrence', occurrenceId, 'clip', clip.id],
    };
  }
  return {
    ownerId: clip.id,
    path: ['track', clip.track, 'clip', clip.id],
  };
}

function participant(
  clip: ResolvedTimelineClip,
  behavior: VisualBoundaryBehavior,
): VisualSeamParticipant {
  const owner = ownerPath(clip);
  return Object.freeze({
    ownerId: owner.ownerId,
    path: owner.path,
    behavior,
    clipId: clip.id,
  });
}

function motionKeyframeTimes(clip: ResolvedTimelineClip): number[] {
  const keyframes = clip.keyframes;
  if (!keyframes || typeof keyframes !== 'object' || Array.isArray(keyframes)) return [];
  const motionKeys = new Set(['x', 'y', 'width', 'height', 'scale', 'rotation', 'translateX', 'translateY', 'position', 'transform']);
  return Object.entries(keyframes).flatMap(([key, raw]) => {
    if (!motionKeys.has(key) || !Array.isArray(raw)) return [];
    const ordered = raw.map(record).filter((item): item is JsonRecord => item !== undefined)
      .map((item) => ({ time: finite(item.time), value: item.value }))
      .filter((item): item is { time: number; value: unknown } => item.time !== undefined)
      .sort((left, right) => left.time - right.time);
    return ordered.slice(1).flatMap((item, index) => (
      JSON.stringify(item.value) === JSON.stringify(ordered[index]?.value) ? [] : [item.time]
    ));
  });
}

function hasBoundaryMarker(clip: ResolvedTimelineClip, key: string): boolean {
  const app = record(clip.app);
  const marker = record(app?.visualBoundary);
  return marker?.[key] === true;
}

function participantKey(value: VisualSeamParticipant): string {
  return `${value.path.join('/')}:${value.clipId}:${value.behavior}`;
}

function intentContext(frame: number, participants: readonly VisualSeamParticipant[]): string {
  return `${frame}|${participants.filter((item) => item.behavior !== 'opaque').map(participantKey).sort().join('|')}`;
}

function explicitIntentAt(config: ResolvedTimelineConfig, frame: number, participants: readonly VisualSeamParticipant[], clips: readonly ResolvedTimelineClip[]): VisualSeamIntent | undefined {
  const app = record(config.app);
  const contract = record(app?.visualSeamContract);
  const intents = record(contract?.intents) ?? record(app?.visualSeamIntents);
  const candidate = intents?.[String(frame)] as StoredVisualSeamIntent | undefined;
  if (candidate && typeof candidate === 'object' && candidate.frame === frame
    && candidate.context === intentContext(frame, participants)
    && candidate.participants.every((key) => participants.some((item) => participantKey(item) === key))) {
    if ('canonical' in candidate) {
      const current = portableVisualSeamIntent(config, frame, candidate.kind);
      const stored = candidate.canonical;
      if (!stored || stored.contextVersion !== current.contextVersion || stored.frame !== frame || stored.kind !== candidate.kind
        || !sameContext(stored.context, current.context) || !Array.isArray(stored.participants)
        || stored.participants.some(id => !current.participants.includes(id))
        || current.participants.some(id => !stored.participants.includes(id))) return undefined;
    }
    return candidate.kind;
  }
  if (candidate && typeof candidate === 'object' && 'canonical' in candidate) return undefined;
  // A typed transition on a clip is itself an explicit authoring choice. Keep
  // it as a fallback so a persisted scoped declaration can override it.
  if (clips.some((clip) => transitionFrames(clip.transition, config.output.fps) !== null)) return 'transition';
  return undefined;
}

function intentCovers(intent: VisualSeamIntent | undefined, item: VisualSeamParticipant): boolean {
  if (!intent || item.behavior === 'opaque') return false;
  if (intent === 'hard-cut') return ['enters', 'exits', 'source-change'].includes(item.behavior);
  return true;
}

function opaqueReason(clip: ResolvedTimelineClip, fps: number): VisualSeamOpaqueElement['reason'] | undefined {
  const type = clipType(clip);
  const elementRef = record(clip.elementRef);
  // An element reference identifies the owner and revision, but does not by
  // itself disclose frame-level behavior. Unknown clip types therefore stay
  // opaque even when their element identity is available.
  if (!BUILTIN_CLIP_TYPES.has(type)) return 'custom-clip-type';
  if (elementRef) return 'element-ref';
  if (clip.transition !== undefined && transitionFrames(clip.transition, fps) === null) return 'unsupported-transition';
  return undefined;
}

function opaqueElement(span: ClipSpan, reason: VisualSeamOpaqueElement['reason']): VisualSeamOpaqueElement {
  const { clip } = span;
  const owner = ownerPath(clip);
  const elementRef = record(clip.elementRef);
  const elementId = text(elementRef?.id);
  const elementKind = text(elementRef?.kind);
  const elementRevision = text(elementRef?.revision);
  const packId = text(elementRef?.packId);
  return Object.freeze({
    clipId: clip.id,
    clipType: clipType(clip),
    ownerId: owner.ownerId,
    path: Object.freeze([...owner.path]),
    startFrame: span.startFrame,
    endFrame: span.endFrame,
    reason,
    ...(elementId && elementKind ? {
      elementRef: Object.freeze({
        id: elementId,
        kind: elementKind,
        ...(elementRevision ? { revision: elementRevision } : {}),
        ...(packId ? { packId } : {}),
      }),
    } : {}),
  });
}

function dedupeParticipants(participants: readonly VisualSeamParticipant[]): VisualSeamParticipant[] {
  const seen = new Set<string>();
  return participants.filter((item) => {
    const key = `${item.clipId}\u0000${item.behavior}\u0000${item.path.join('/')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trackMap(config: ResolvedTimelineConfig): Map<string, TrackDefinition> {
  return new Map(config.tracks.map((track) => [track.id, track]));
}

function lowerBoundCue(cues: readonly Cue[], frame: number): number {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (cues[middle]!.frame < frame) low = middle + 1;
    else high = middle;
  }
  return low;
}

function cuesNearFrame(cues: readonly Cue[], frame: number, guardFrames: number): VisualSeamParticipant[] {
  const result: VisualSeamParticipant[] = [];
  const endFrame = frame + guardFrames;
  for (let index = lowerBoundCue(cues, frame - guardFrames); index < cues.length; index += 1) {
    const cue = cues[index]!;
    if (cue.frame > endFrame) break;
    result.push(cue.participant);
  }
  return result;
}

function buildSpans(config: ResolvedTimelineConfig): ClipSpan[] {
  const tracks = trackMap(config);
  const fps = finite(config.output.fps) && config.output.fps > 0 ? config.output.fps : 30;
  return config.clips
    .filter(active)
    .map((clip) => {
      const track = tracks.get(clip.track);
      const startFrame = Math.round(Math.max(0, clip.at) * fps);
      const durationFrames = Math.max(1, Math.round(clipDurationSeconds(clip) * fps));
      return {
        clip,
        track,
        startFrame,
        endFrame: startFrame + durationFrames,
        primary: isPrimaryVisualClip(clip, track),
      };
    });
}

function buildCues(
  spans: readonly ClipSpan[],
  opaqueReasons: ReadonlyMap<ResolvedTimelineClip, VisualSeamOpaqueElement['reason']>,
  fps: number,
): Cue[] {
  const cues: Cue[] = [];
  for (const span of spans) {
    if (span.track?.kind !== 'visual') continue;
    const clip = span.clip;
    cues.push({ frame: span.startFrame, participant: participant(clip, span.primary ? 'enters' : 'phase-change') });
    cues.push({ frame: span.endFrame, participant: participant(clip, span.primary ? 'exits' : 'phase-change') });
    if (clip.transition || clip.entrance || hasBoundaryMarker(clip, 'startsMotion')) {
      cues.push({ frame: span.startFrame, participant: participant(clip, clip.transition ? 'phase-change' : 'motion-start') });
    }
    if (clip.exit || hasBoundaryMarker(clip, 'endsMotion')) {
      cues.push({ frame: span.endFrame, participant: participant(clip, clip.exit ? 'phase-change' : 'motion-start') });
    }
    for (const time of motionKeyframeTimes(clip)) {
      cues.push({ frame: span.startFrame + Math.round(time * fps), participant: participant(clip, 'motion-start') });
    }
    if (opaqueReasons.has(clip)) {
      cues.push({ frame: span.startFrame, participant: participant(clip, 'opaque') });
    }
  }
  return cues;
}

function continuityTracksFor(spans: readonly ClipSpan[], options: VisualSeamAnalysisOptions): Set<string> {
  if (options.continuityTracks) return new Set(options.continuityTracks);
  const candidateTracks = new Set<string>();
  for (const span of spans) {
    if (span.primary) candidateTracks.add(span.clip.track);
  }
  return candidateTracks;
}

export function analyzeVisualSeams(
  config: ResolvedTimelineConfig,
  options: VisualSeamAnalysisOptions = {},
): VisualSeamReport {
  const fps = finite(config.output.fps) && config.output.fps > 0 ? config.output.fps : 30;
  const requestedGuardFrames = finite(options.guardFrames);
  const guardFrames = Math.max(0, Math.floor(requestedGuardFrames ?? 2));
  const spans = buildSpans(config);
  const opaqueReasons = new Map<ResolvedTimelineClip, VisualSeamOpaqueElement['reason']>();
  const opaqueSpans: { span: ClipSpan; reason: VisualSeamOpaqueElement['reason'] }[] = [];
  for (const span of spans) {
    const reason = opaqueReason(span.clip, fps);
    if (reason === undefined) continue;
    opaqueReasons.set(span.clip, reason);
    if (span.track?.kind === 'visual') opaqueSpans.push({ span, reason });
  }
  const cues = buildCues(spans, opaqueReasons, fps).sort((left, right) => left.frame - right.frame);
  opaqueSpans
    .sort((left, right) => left.span.startFrame - right.span.startFrame || left.span.clip.id.localeCompare(right.span.clip.id));
  const opaqueElements = opaqueSpans.map(({ span, reason }) => opaqueElement(span, reason));
  const continuityTracks = continuityTracksFor(spans, options);
  const candidates: BoundaryCandidate[] = [];
  const structuralIssues: string[] = [];
  const spansByTrack = new Map<string, ClipSpan[]>();
  for (const span of spans) {
    if (!span.primary || !continuityTracks.has(span.clip.track)) continue;
    const current = spansByTrack.get(span.clip.track) ?? [];
    current.push(span);
    spansByTrack.set(span.clip.track, current);
  }

  for (const [trackId, trackSpans] of spansByTrack) {
    trackSpans.sort((left, right) => left.startFrame - right.startFrame || left.clip.id.localeCompare(right.clip.id));
    for (let index = 1; index < trackSpans.length; index += 1) {
      const previous = trackSpans[index - 1]!;
      const next = trackSpans[index]!;
      const frame = next.startFrame;
      const delta = next.startFrame - previous.endFrame;
      // Every undeclared gap or overlap is structural regardless of the cue
      // guard. Explicit pause metadata is the only gap exemption.
      const gapDeclared = delta > 0 && (hasBoundaryMarker(previous.clip, 'intentionalPause') || hasBoundaryMarker(next.clip, 'intentionalPause'));
      const transitionDuration = transitionFrames(next.clip.transition, fps);
      const transitionDeclared = delta < 0 && transitionDuration !== null && -delta <= transitionDuration
        && transitionDuration <= Math.min(previous.endFrame - previous.startFrame, next.endFrame - next.startFrame);
      const issues = delta !== 0 && !(delta > 0 && gapDeclared) && !(delta < 0 && transitionDeclared)
        ? [`${trackId}: ${previous.clip.id} ends at frame ${previous.endFrame}, ${next.clip.id} starts at frame ${next.startFrame}`]
        : [];
      structuralIssues.push(...issues);
      const nearby = cuesNearFrame(cues, frame, guardFrames);
      const sourceChanged = previous.clip.asset !== next.clip.asset;
      const participants = dedupeParticipants([
        ...nearby,
        ...(sourceChanged ? [participant(next.clip, 'source-change')] : []),
      ]);
      const intent = explicitIntentAt(config, frame, participants, [previous.clip, next.clip]);
      candidates.push(Object.freeze({
        frame,
        ...(intent ? { intent } : {}),
        participants,
        structuralIssues: issues,
      }));
    }
  }

  candidates.sort((left, right) => left.frame - right.frame);
  const boundaries: VisualSeamBoundary[] = [];
  let nextOpaqueIndex = 0;
  let activeOpaque: typeof opaqueSpans = [];
  for (const candidate of candidates) {
    while (nextOpaqueIndex < opaqueSpans.length
      && opaqueSpans[nextOpaqueIndex]!.span.startFrame <= candidate.frame) {
      activeOpaque.push(opaqueSpans[nextOpaqueIndex]!);
      nextOpaqueIndex += 1;
    }
    activeOpaque = activeOpaque.filter(({ span }) => span.endFrame > candidate.frame);
    const participants = dedupeParticipants([
      ...candidate.participants,
      ...activeOpaque.map(({ span }) => participant(span.clip, 'opaque')),
    ]);
    const knownRisk = participants.some((item) => item.behavior === 'motion-start' || item.behavior === 'phase-change');
    const uncoveredKnownRisk = participants.some((item) => (
      (item.behavior === 'motion-start' || item.behavior === 'phase-change')
      && !intentCovers(candidate.intent, item)
    ));
    const opaqueRisk = participants.some((item) => item.behavior === 'opaque');
    boundaries.push(Object.freeze({
      frame: candidate.frame,
      timeSeconds: candidate.frame / fps,
      ...(candidate.intent ? { intent: candidate.intent } : {}),
      participants,
      structuralIssues: candidate.structuralIssues,
      unacknowledgedRisk: opaqueRisk || uncoveredKnownRisk,
      requiresIntent: knownRisk && uncoveredKnownRisk,
    }));
  }

  const warningCount = boundaries.filter((boundary) => boundary.unacknowledgedRisk).length;
  const blocked = structuralIssues.length > 0 || (options.enforceIntent === true && boundaries.some((boundary) => boundary.requiresIntent));
  return Object.freeze({
    version: VISUAL_SEAM_CONTRACT_VERSION,
    fps,
    guardFrames,
    boundaries: Object.freeze(boundaries.sort((left, right) => left.frame - right.frame)),
    opaqueElements: Object.freeze(opaqueElements),
    structuralIssues: Object.freeze(structuralIssues),
    warningCount,
    blocked,
  });
}

export function assertVisualSeamAdmission(
  config: ResolvedTimelineConfig,
  options: VisualSeamAnalysisOptions = {},
): VisualSeamReport {
  const report = analyzeVisualSeams(config, options);
  if (report.blocked) {
    const firstIssue = report.structuralIssues[0]
      ?? `boundary at frame ${report.boundaries.find((boundary) => boundary.unacknowledgedRisk)?.frame ?? 'unknown'} has undeclared visual cues`;
    throw new VisualSeamAdmissionError(`Visual seam admission blocked: ${firstIssue}`, report);
  }
  return report;
}

export function withVisualSeamIntent(
  config: ResolvedTimelineConfig,
  frame: number,
  intent: VisualSeamIntent,
): ResolvedTimelineConfig {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('visual seam intent frame must be a non-negative integer');
  const app = record(config.app) ?? {};
  const contract = record(app.visualSeamContract) ?? {};
  const intents = record(contract.intents) ?? {};
  const report = analyzeVisualSeams(config);
  const boundary = report.boundaries.find((item) => item.frame === frame);
  const participants = boundary?.participants ?? [];
  const scopedParticipants = intent === 'hard-cut'
    ? participants.filter((item) => item.behavior === 'enters' || item.behavior === 'exits' || item.behavior === 'source-change')
    : participants.filter((item) => item.behavior !== 'opaque');
  const keys = scopedParticipants.map(participantKey).sort();
  return {
    ...config,
    app: {
      ...app,
      visualSeamContract: {
        ...contract,
        version: VISUAL_SEAM_CONTRACT_VERSION,
        mode: 'enforced',
        intents: {
          ...intents,
          [String(frame)]: {
            kind: intent,
            frame,
            participants: keys,
            context: intentContext(frame, participants),
            canonical: portableVisualSeamIntent(config, frame, intent),
          } satisfies StoredVisualSeamIntent,
        },
      },
    },
  };
}
