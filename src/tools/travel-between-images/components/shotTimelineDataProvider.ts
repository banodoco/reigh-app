import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { LoadedTimeline } from '@/tools/video-editor/data/DataProvider.ts';
import {
  clearTimelineDraftIfMatches,
  loadTimelineDraft,
  saveTimelineDraftIfOwner,
  type TimelineDraftRecoveryMetadata,
} from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import type {
  PreparedShotComposition,
  ShotCompositionAdapter,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { ShotCompositionContract } from '@/tools/video-editor/data/shotComposition.ts';
import { StaleWriteError } from '@/tools/video-editor/data/shotComposition.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { recordShotTimelinePhase } from '@/tools/video-editor/lib/shot-timeline-timing.ts';
import {
  enqueueCanonicalShotPublish,
  updateCanonicalShotTimeline,
} from '@/tools/video-editor/data/shotCompositionEditor.ts';
import type {
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';
import { timelineContentExtentMs } from '@/tools/video-editor/data/shotCompositionTiming.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';

export function shotTimelineSessionId(
  parentDocumentId: string,
  occurrenceId: string,
  editorSessionToken: string,
): string {
  // Query cache identity is per popup opening; durable recovery has its own
  // stable occurrence key below and is not tied to React Query freshness.
  return `${parentDocumentId}:shot:${occurrenceId}:session:${editorSessionToken}`;
}

export function shotTimelineRecoveryId(parentDocumentId: string, occurrenceId: string): string {
  return `${parentDocumentId}:shot:${occurrenceId}`;
}

export function createShotTimelineEditorSessionToken(): string {
  // Retained as a mount-local diagnostic token; durable recovery identity is
  // deliberately independent of the popup opening.
  return globalThis.crypto?.randomUUID?.() ?? `editor-${Date.now()}`;
}

export type ShotTimelineEditorHeadState = {
  canonicalHeadRevisionId: string | null;
  displayedHeadRevisionId: string | null;
};

function headRevisionIdFromConfig(config: Pick<TimelineConfig, 'app'>): string | null {
  const app = config.app && typeof config.app === 'object' && !Array.isArray(config.app)
    ? config.app as Record<string, unknown>
    : null;
  const canonical = app?.canonicalComposition && typeof app.canonicalComposition === 'object'
    && !Array.isArray(app.canonicalComposition)
    ? app.canonicalComposition as Record<string, unknown>
    : null;
  return typeof canonical?.headRevisionId === 'string' ? canonical.headRevisionId : null;
}

export function shotTimelineDurationSeconds(
  config: Pick<ResolvedTimelineConfig, 'clips'>,
  hardDurationSeconds?: number,
): number {
  const contentSeconds = timelineContentExtentMs({ clips: config.clips }) / 1000;
  return hardDurationSeconds === undefined
    ? contentSeconds
    : Math.min(contentSeconds, Math.max(0, hardDurationSeconds));
}

function createShotTimelineConfig(config: ResolvedTimelineConfig): TimelineConfig {
  return {
    output: config.output,
    clips: config.clips,
    tracks: config.tracks,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.theme_overrides ? { theme_overrides: config.theme_overrides } : {}),
    ...(config.generation_defaults ? { generation_defaults: config.generation_defaults } : {}),
    ...(config.app ? { app: config.app } : {}),
  };
}

function createCanonicalTimeline(config: TimelineConfig, occurrenceId: string): Record<string, unknown> {
  const clipPrefix = `${occurrenceId}:`;
  const clips = (config.clips ?? []).map((clip) => {
    const app = clip.app && typeof clip.app === 'object' && !Array.isArray(clip.app)
      ? Object.fromEntries(Object.entries(clip.app).filter(([key]) => !['canonical', 'canonicalTiming'].includes(key)))
      : clip.app;
    const { assetEntry: _assetEntry, ...persistedClip } = clip as typeof clip & { assetEntry?: unknown };
    return {
      ...persistedClip,
      id: persistedClip.id.startsWith(clipPrefix) ? persistedClip.id.slice(clipPrefix.length) : persistedClip.id,
      ...(app && typeof app === 'object' ? { app } : {}),
    };
  });
  return {
    tracks: config.tracks ?? [],
    clips,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.theme_overrides ? { theme_overrides: config.theme_overrides } : {}),
    ...(config.generation_defaults ? { generation_defaults: config.generation_defaults } : {}),
    ...(config.app ? { app: config.app } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type PendingCanonicalPublication = {
  configSignature: string;
  expectedHeadRevisionId: string;
  idempotencyKey: string;
  graph: ShotCompositionContract;
};

type ShotTimelineDataProvider = DataProvider & {
  timelineQueryIdentity: string;
  setPublishCallback: (callback?: (composition: PreparedShotComposition) => void) => void;
  setDraftState: (dirty: boolean) => void;
  adoptCleanBaseline: (config: ResolvedTimelineConfig, composition: PreparedShotComposition) => boolean;
};

/** DataProvider bridge for the shot-local popup's canonical CAS publication. */
export function createShotTimelineDataProvider(
  config: ResolvedTimelineConfig,
  composition: PreparedShotComposition,
  occurrenceId: string,
  shotCompositionAdapter?: ShotCompositionAdapter,
  onCanonicalCompositionPublished?: (composition: PreparedShotComposition) => void,
  editorHeadState?: { current: ShotTimelineEditorHeadState },
): ShotTimelineDataProvider {
  let registry: { assets: Record<string, ResolvedAssetRegistryEntry> } = {
    assets: Object.fromEntries(Object.entries(config.registry).map(([assetId, entry]) => ([assetId, {
      ...entry,
      file: entry.file ?? entry.media_id ?? entry.url,
    }]))),
  };
  const resolve = async (file: string): Promise<string> => {
    const entry = Object.values(registry.assets).find((candidate) => (
      candidate.file === file || candidate.media_id === file || candidate.url === file
    ));
    // Canonical projection has already resolved managed object IDs into src.
    // Prefer that display address over the persisted file/media identity so
    // opaque sha256: references never reach <img>/<video> as a request URL.
    if (entry?.src) return entry.src;
    if (entry?.url) return entry.url;
    return file.startsWith('sha256:')
      ? bridgeMediaUrl(composition.projectId, file)
      : file;
  };
  let timelineConfig = createShotTimelineConfig(config);
  let canonicalTimelineConfig = timelineConfig;
  let configVersion = 1;
  // This is the CAS base for the mounted popup session. Never reload here:
  // doing so would turn a stale local draft into an unconditional write over
  // a concurrent canonical head. Advance the base only after its publication
  let canonicalBase = composition;
  const editorHeadStateIsMounted = editorHeadState !== undefined;
  const activeEditorHeadState = editorHeadState ?? {
    current: {
      canonicalHeadRevisionId: composition.headRevisionId,
      displayedHeadRevisionId: headRevisionIdFromConfig(config),
    },
  };
  activeEditorHeadState.current.canonicalHeadRevisionId = composition.headRevisionId;
  const adoptCanonicalBase = (next: PreparedShotComposition, advanceDisplayedHead = false) => {
    canonicalBase = next;
    activeEditorHeadState.current.canonicalHeadRevisionId = next.headRevisionId;
    if (!editorHeadStateIsMounted || advanceDisplayedHead) {
      activeEditorHeadState.current.displayedHeadRevisionId = next.headRevisionId;
    }
  };
  const assertEditorHeadIsCurrent = () => {
    const { canonicalHeadRevisionId, displayedHeadRevisionId } = activeEditorHeadState.current;
    if (canonicalHeadRevisionId
      && displayedHeadRevisionId !== canonicalHeadRevisionId) {
      throw new StaleWriteError(
        'The shot timeline is still adopting the latest canonical revision; retry after the displayed shot updates.',
      );
    }
  };
  const recoveryKey = shotTimelineRecoveryId(composition.parentDocumentId, occurrenceId);
  let timelineQueryIdentity = composition.headRevisionId;
  let pendingPublication: PendingCanonicalPublication | null = null;
  let activeTimingTraceId: string | null = null;
  let publishCallback = onCanonicalCompositionPublished;
  let draftDirty = false;
  let pendingPublishes = 0;

  const provider: ShotTimelineDataProvider = {
    get timelineQueryIdentity() {
      return timelineQueryIdentity;
    },
    persistenceEnabled: Boolean(shotCompositionAdapter?.publish),
    supportsEditorSync: false,
    setShotTimelineTraceId: (traceId) => { activeTimingTraceId = traceId; },
    getTimelineDraftRecoveryMetadata: (): TimelineDraftRecoveryMetadata => ({
      recoveryKey,
      baseHeadRevisionId: canonicalBase.headRevisionId,
      baseCanonicalGraph: canonicalBase.contract as unknown as Record<string, unknown>,
      draftIdentity: globalThis.crypto?.randomUUID?.() ?? `edit-${Date.now()}-${Math.random()}`,
    }),
    resolveAssetUrl: resolve,
    onResolve: async ({ file }) => resolve(file),
    loadTimeline: async (_timelineId) => {
      timelineConfig = canonicalTimelineConfig;
      const recovery = await loadTimelineDraft(recoveryKey).catch(() => null);
      if (recovery?.baseCanonicalGraph && shotCompositionAdapter) {
        try {
          adoptCanonicalBase(shotCompositionAdapter.prepare(recovery.baseCanonicalGraph));
        } catch {
          // A malformed recovery base is not authority; keep the fresh graph.
        }
      }
      const recoveredConfig = recovery?.draft.config;
      if (recoveredConfig && typeof recoveredConfig === 'object' && !Array.isArray(recoveredConfig)) {
        timelineConfig = recoveredConfig as TimelineConfig;
      }
      const savedPublication = recovery?.draft.canonicalPublication;
      if (savedPublication && typeof savedPublication === 'object' && !Array.isArray(savedPublication)) {
        const candidate = savedPublication as Record<string, unknown>;
        if (typeof candidate.configSignature === 'string'
          && typeof candidate.expectedHeadRevisionId === 'string'
          && typeof candidate.idempotencyKey === 'string'
          && candidate.graph && typeof candidate.graph === 'object' && !Array.isArray(candidate.graph)) {
          pendingPublication = {
            configSignature: candidate.configSignature,
            expectedHeadRevisionId: candidate.expectedHeadRevisionId,
            idempotencyKey: candidate.idempotencyKey,
            graph: candidate.graph as unknown as ShotCompositionContract,
          };
        }
      }
      return { config: timelineConfig, configVersion };
    },
    loadCanonicalTimeline: async (_timelineId): Promise<LoadedTimeline> => {
      if (shotCompositionAdapter) {
        const latest = await shotCompositionAdapter.load({
          projectId: composition.projectId,
          parentDocumentId: composition.parentDocumentId,
        });
        if (!latest) throw new Error('The canonical shot composition is unavailable');
        adoptCanonicalBase(latest);
        timelineQueryIdentity = latest.headRevisionId;
        const occurrence = latest.occurrences.find((candidate) => candidate.occurrenceId === occurrenceId);
        if (!occurrence) throw new Error('The canonical shot occurrence is unavailable');
        const projected = projectCanonicalComposition(
          { ...latest, occurrences: [occurrence] },
          { ...canonicalTimelineConfig, clips: [], tracks: [], registry: {} },
          { clampToOccurrenceDuration: false },
        ).config;
        const offsetSeconds = occurrence.atMs / 1000;
        const canonicalResolvedConfig = {
          ...projected,
          clips: projected.clips.map((clip) => {
            const app = clip.app && typeof clip.app === 'object' && !Array.isArray(clip.app) ? clip.app : null;
            const timing = app?.canonicalTiming && typeof app.canonicalTiming === 'object'
              && !Array.isArray(app.canonicalTiming) ? app.canonicalTiming : null;
            return {
              ...clip,
              at: Math.max(0, clip.at - offsetSeconds),
              ...(app && timing
                ? { app: { ...app, canonicalTiming: { ...timing, occurrenceStartMs: 0 } } }
                : {}),
            };
          }),
        };
        registry = {
          assets: Object.fromEntries(Object.entries(canonicalResolvedConfig.registry).map(([assetId, entry]) => ([assetId, {
            ...entry,
            file: entry.file ?? entry.media_id ?? entry.url,
          }]))),
        };
        canonicalTimelineConfig = createShotTimelineConfig(canonicalResolvedConfig);
      }
      timelineConfig = canonicalTimelineConfig;
      pendingPublication = null;
      return { config: timelineConfig, configVersion };
    },
    loadAssetRegistry: async () => registry,
    saveTimeline: async (timelineId, nextConfig, expectedVersion) => {
      assertEditorHeadIsCurrent();
      if (!shotCompositionAdapter?.publish) {
        throw new Error('The canonical shot-composition provider is read-only');
      }
      pendingPublishes += 1;
      const requestedAt = import.meta.env.DEV ? performance.now() : 0;
      const timingTraceId = activeTimingTraceId;
      if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'request-start', { expectedVersion });
      try {
        const timeline = createCanonicalTimeline(nextConfig, occurrenceId);
        // Reserve the project queue synchronously in caller order before any
        // async recovery read or hashing. Otherwise a later edit can finish
        // preparation first and publish ahead of the save that was requested
        // before it.
        const published = await enqueueCanonicalShotPublish(
          composition.projectId,
          composition.parentDocumentId,
          async () => {
            // The queued publication may have waited behind another shot edit
            // while the mounted popup adopted a newer head. Recheck at the
            // actual write boundary, not just when the UI requested the save.
            assertEditorHeadIsCurrent();
            // Another edit can become durable while this publication hashes
            // and prepares its graph, so owner comparison and write below are
            // still transactional.
            const recoveryAtStart = await loadTimelineDraft(recoveryKey).catch(() => null);
            const configSignature = await digest(timeline);
            let candidate = pendingPublication?.configSignature === configSignature
              ? pendingPublication
              : null;
            if (!candidate) {
              const identitySeed = (await digest({
                projectId: canonicalBase.projectId,
                parentDocumentId: canonicalBase.parentDocumentId,
                occurrenceId,
                expectedHeadRevisionId: canonicalBase.headRevisionId,
                configSignature,
              })).slice(0, 32);
              const graph = await updateCanonicalShotTimeline(
                canonicalBase.contract,
                occurrenceId,
                timeline,
                identitySeed,
              );
              candidate = {
                configSignature,
                expectedHeadRevisionId: canonicalBase.headRevisionId,
                idempotencyKey: `reigh.shot-popup.${identitySeed}`,
                graph,
              };
              pendingPublication = candidate;
            }
            const recoveryDraftConfig = recoveryAtStart?.draft.config;
            const recoveryMatchesThisSave = Boolean(
              recoveryAtStart?.draftIdentity
              && recoveryDraftConfig
              && typeof recoveryDraftConfig === 'object'
              && !Array.isArray(recoveryDraftConfig)
              && await digest(createCanonicalTimeline(
                recoveryDraftConfig as TimelineConfig,
                occurrenceId,
              )) === configSignature,
            );
            const expectedRecoveryOwner = recoveryAtStart === null
              ? null
              : recoveryMatchesThisSave
                ? recoveryAtStart.draftIdentity!
                // A different durable config is newer than this save or has
                // no trustworthy owner token. Force the conflict-merge path;
                // never adopt its owner token and overwrite its config.
                : `superseded:${candidate.idempotencyKey}`;
            const publicationDraft = {
              ...(recoveryAtStart?.draft ?? {}),
              config: nextConfig,
              registry,
              canonicalPublication: candidate,
            };
            await saveTimelineDraftIfOwner(
              timelineId,
              publicationDraft,
              expectedVersion,
              {
                recoveryKey,
                baseHeadRevisionId: candidate.expectedHeadRevisionId,
                baseCanonicalGraph: canonicalBase.contract as unknown as Record<string, unknown>,
                draftIdentity: candidate.idempotencyKey,
                acknowledgementIdentity: candidate.idempotencyKey,
              },
              expectedRecoveryOwner,
              (current, candidateRecord) => ({
                ...current,
                // Keep B's config/base/owner, but make A's exact publication
                // candidate available as a retry without making A the owner.
                draft: {
                  ...current.draft,
                  canonicalPublication: candidateRecord.draft.canonicalPublication,
                },
              }),
            );
            const publishStartedAt = import.meta.env.DEV ? performance.now() : 0;
            const acknowledged = await shotCompositionAdapter.publish!({
              projectId: canonicalBase.projectId,
              parentDocumentId: canonicalBase.parentDocumentId,
              expectedHeadRevisionId: candidate.expectedHeadRevisionId,
              graph: candidate.graph,
              idempotencyKey: candidate.idempotencyKey,
              timingTraceId: timingTraceId ?? undefined,
            });
            // This head is our own acknowledged publication. The mounted
            // editor contains that saved revision plus any newer local edits,
            // so it can continue on the new CAS base without waiting for a
            // redundant query echo to rewrite its head marker.
            adoptCanonicalBase(acknowledged, true);
            canonicalTimelineConfig = nextConfig;
            timelineConfig = canonicalTimelineConfig;
            pendingPublication = null;
            await clearTimelineDraftIfMatches(recoveryKey, candidate.idempotencyKey).catch(() => false);
            if (import.meta.env.DEV) {
              console.debug('[ShotTimelineLatency]', {
                phase: 'canonical-publish-ack',
                occurrenceId,
                queueWaitMs: Math.round(publishStartedAt - requestedAt),
                publishMs: Math.round(performance.now() - publishStartedAt),
              });
            }
            if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'canonical-ack', {
              headRevisionId: acknowledged.headRevisionId,
            });
            return acknowledged;
          },
        );
        if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'request-end', {
          durationMs: Math.round(performance.now() - requestedAt),
        });
        // A publication can finish after React has rendered a newer callback.
        // Keep the callback current without rebuilding the editor's provider.
        publishCallback?.(published);
        configVersion += 1;
        return configVersion;
      } finally {
        pendingPublishes -= 1;
      }
    },
    setPublishCallback: (callback) => { publishCallback = callback; },
    setDraftState: (dirty) => { draftDirty = dirty; },
    adoptCleanBaseline: (nextConfig, nextComposition) => {
      if (draftDirty || pendingPublishes > 0) {
        return false;
      }
      timelineConfig = createShotTimelineConfig(nextConfig);
      canonicalTimelineConfig = timelineConfig;
      registry = {
        assets: Object.fromEntries(Object.entries(nextConfig.registry).map(([assetId, entry]) => ([assetId, {
          ...entry,
          file: entry.file ?? entry.media_id ?? entry.url,
        }]))),
      };
      adoptCanonicalBase(nextComposition);
      timelineQueryIdentity = nextComposition.headRevisionId;
      return true;
    },
  };
  return provider;
}
