import { describe, expect, it } from 'vitest';
import { defineExtension } from '@reigh/editor-sdk';
import type {
  ProjectObjectMetadata,
  ProjectObjectStorage,
  TimelineDiff,
  TimelineOps,
  TimelinePatch,
  TimelineReader,
  TimelineSnapshot,
} from '@reigh/editor-sdk';
import { createExtensionContext } from './extensionContextFactory.ts';

const EXTENSION_ID = 'com.example.public-project-object-editor';
const ORIGINAL_OBJECT_ID = 'project-object-original-entry';
const ORIGINAL_PACKAGE_OBJECT_ID = 'project-object-original-package';
const NEXT_OBJECT_ID = 'project-object-next-entry';
const NEXT_PACKAGE_OBJECT_ID = 'project-object-next-package';

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function packageBytes(
  manifest: Readonly<Record<string, unknown>>,
  entry: ProjectObjectMetadata,
  assets: readonly ProjectObjectMetadata[] = [],
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ manifest, entry, assets }));
}

function emptyDiff(version: number): TimelineDiff {
  return { version, entries: [], affectedObjectIds: [] };
}

describe('public project-object scene edit boundary/unit', () => {
  it('reads package and entry bytes, then replaces one immutable package on two ranges', async () => {
    const originalBytes = new TextEncoder().encode('<html>original</html>');
    const nextBytes = new TextEncoder().encode('<html>edited</html>');
    const originalDigest = await sha256Digest(originalBytes);
    const nextDigest = await sha256Digest(nextBytes);
    const originalMetadata: ProjectObjectMetadata = {
      object_id: ORIGINAL_OBJECT_ID,
      digest: originalDigest,
      media_type: 'text/html',
      size: originalBytes.byteLength,
      filename: 'scene.html',
    };
    const originalManifest = { formatVersion: 1, entry: 'scene.html', duration: 100, authoredFps: 30 };
    const nextManifest = { ...originalManifest, duration: 120, title: 'edited manifest' };
    const nextMetadata: ProjectObjectMetadata = {
      object_id: NEXT_OBJECT_ID,
      digest: nextDigest,
      media_type: 'text/html',
      size: nextBytes.byteLength,
      filename: 'scene.html',
    };
    const originalPackageBody = { manifest: originalManifest, entry: originalMetadata, assets: [] };
    const nextPackageBody = { manifest: nextManifest, entry: nextMetadata, assets: [] };
    const originalPackageBytes = packageBytes(originalManifest, originalMetadata);
    const nextPackageBytes = packageBytes(nextManifest, nextMetadata);
    const originalPackageDigest = await sha256Digest(originalPackageBytes);
    const nextPackageDigest = await sha256Digest(nextPackageBytes);
    const originalPackageMetadata: ProjectObjectMetadata = {
      object_id: ORIGINAL_PACKAGE_OBJECT_ID,
      digest: originalPackageDigest,
      media_type: 'application/json',
      size: originalPackageBytes.byteLength,
      filename: 'scene.package.json',
    };
    const nextPackageMetadata: ProjectObjectMetadata = {
      object_id: NEXT_PACKAGE_OBJECT_ID,
      digest: nextPackageDigest,
      media_type: 'application/json',
      size: nextPackageBytes.byteLength,
      filename: 'scene.package.json',
    };
    const objectBytes = new Map<string, Uint8Array>([
      [ORIGINAL_OBJECT_ID, originalBytes],
      [ORIGINAL_PACKAGE_OBJECT_ID, originalPackageBytes],
    ]);
    const projectObjects: ProjectObjectStorage = {
      ingest: async (bytes, mediaType, filename) => {
        const metadata = filename === 'scene.html' ? nextMetadata : nextPackageMetadata;
        const copy = new Uint8Array(bytes);
        expect(await sha256Digest(copy)).toBe(metadata.digest);
        objectBytes.set(metadata.object_id, copy);
        return { ...metadata, media_type: mediaType, size: copy.byteLength };
      },
      read: async (objectId) => {
        const bytes = objectBytes.get(objectId);
        if (!bytes) throw new Error(`unknown object ${objectId}`);
        return new Uint8Array(bytes);
      },
    };

    const originalPackageBodyText = new TextDecoder().decode(originalPackageBytes);
    const originalLiveScene = {
      revision: originalPackageMetadata.digest,
      source: { objectId: originalPackageMetadata.object_id, revision: originalPackageMetadata.digest },
      packageBody: originalPackageBodyText,
      html: new TextDecoder().decode(originalBytes),
    };
    const clips = [
      {
        id: 'scene-a',
        at: 2,
        from: 55,
        to: 75,
        speed: 1,
        label: 'first range',
        app: {
          liveScene: originalLiveScene,
          unrelated: { sentinel: 'keep-scene-a' },
        },
      },
      {
        id: 'scene-b',
        at: 22,
        from: 20,
        to: 30,
        speed: 2,
        label: 'second range',
        app: {
          liveScene: originalLiveScene,
          unrelated: { sentinel: 'keep-scene-b' },
        },
      },
    ];
    const snapshot: TimelineSnapshot = {
      projectId: 'project-public-sdk',
      baseVersion: 17,
      currentVersion: 17,
      extensionRequirements: [],
      clips: clips.map((clip) => ({
        id: clip.id,
        track: 'V1',
        at: clip.at,
        clipType: 'com.reigh.astrid.liveScene',
        duration: clip.to - clip.from,
        sourceOffset: clip.from,
        sourceEnd: clip.to,
        rate: clip.speed,
        label: clip.label,
        app: clip.app,
        managed: true,
        managedBy: EXTENSION_ID,
        sourceRefs: [{
          id: `source-${clip.id}`,
          clipId: clip.id,
          sourceKind: 'provider',
          sourceObjectId: originalPackageMetadata.object_id,
          sourceRevision: originalPackageMetadata.digest,
          packageRevision: originalPackageMetadata.digest,
        }],
      })),
      tracks: [{ id: 'V1', kind: 'visual', label: 'Scenes', muted: false }],
      assetKeys: [],
      app: {},
      sourceRefs: clips.map((clip) => ({
        id: `source-${clip.id}`,
        clipId: clip.id,
        sourceKind: 'provider' as const,
        sourceObjectId: originalPackageMetadata.object_id,
        sourceRevision: originalPackageMetadata.digest,
        packageRevision: originalPackageMetadata.digest,
      })),
    };

    let appliedPatch: TimelinePatch | undefined;
    // TimelineOps is a test double, not durable Runtime proof; save/reopen/CAS proof is in the RuntimeDataProvider test.
    const timeline: TimelineOps = {
      validate: (patch) => ({ valid: true, diagnostics: [] }),
      preview: (patch) => ({ diff: emptyDiff(patch.version), fullyPreviewable: true, diagnostics: [] }),
      apply: (patch) => {
        appliedPatch = patch;
        for (const operation of patch.operations) {
          const clip = clips.find((candidate) => candidate.id === operation.target);
          if (!clip || operation.op !== 'clip.update' || !operation.payload) continue;
          Object.assign(clip, operation.payload);
        }
        return emptyDiff(patch.version);
      },
      checkpoint: () => 'checkpoint',
      flush: async () => { throw new Error('Durable persistence is unavailable in this test host.'); },
      rollback: () => null,
      setAllTracksMuted: () => emptyDiff(snapshot.baseVersion),
    };
    let run: Promise<void> | undefined;
    const extension = defineExtension({
      manifest: {
        id: EXTENSION_ID,
        version: '1.0.0',
        label: 'Public project-object editor',
        apiVersion: 1,
      },
      activate(ctx) {
        run = (async () => {
          const current = ctx.creative.reader.snapshot();
          const source = current.sourceRefs?.find((ref) => ref.sourceObjectId === ORIGINAL_PACKAGE_OBJECT_ID);
          if (!source?.sourceObjectId || !source.sourceRevision || !source.packageRevision || !ctx.creative.projectObjects) {
            throw new Error('public scene source capability unavailable');
          }

          const originalPackageReadback = await ctx.creative.projectObjects.read(source.sourceObjectId);
          expect(Array.from(originalPackageReadback)).toEqual(Array.from(originalPackageBytes));
          expect(await sha256Digest(originalPackageReadback)).toBe(originalPackageMetadata.digest);
          expect(source.sourceRevision).toBe(originalPackageMetadata.digest);
          expect(source.packageRevision).toBe(originalPackageMetadata.digest);
          const readPackage = JSON.parse(new TextDecoder().decode(originalPackageReadback)) as {
            manifest: Record<string, unknown>;
            entry: ProjectObjectMetadata;
            assets: ProjectObjectMetadata[];
          };
          expect(readPackage).toEqual(originalPackageBody);

          const originalEntryReadback = await ctx.creative.projectObjects.read(readPackage.entry.object_id);
          expect(Array.from(originalEntryReadback)).toEqual(Array.from(originalBytes));
          expect(await sha256Digest(originalEntryReadback)).toBe(readPackage.entry.digest);

          const ingestedEntry = await ctx.creative.projectObjects.ingest(nextBytes, 'text/html', 'scene.html');
          const nextEntryReadback = await ctx.creative.projectObjects.read(ingestedEntry.object_id);
          expect(Array.from(nextEntryReadback)).toEqual(Array.from(nextBytes));
          expect(await sha256Digest(nextEntryReadback)).toBe(ingestedEntry.digest);

          const ingestedPackage = await ctx.creative.projectObjects.ingest(
            nextPackageBytes,
            'application/json',
            'scene.package.json',
          );
          const nextPackageReadback = await ctx.creative.projectObjects.read(ingestedPackage.object_id);
          expect(Array.from(nextPackageReadback)).toEqual(Array.from(nextPackageBytes));
          expect(await sha256Digest(nextPackageReadback)).toBe(ingestedPackage.digest);
          expect(ingestedPackage.digest).not.toBe(ingestedEntry.digest);
          expect(JSON.parse(new TextDecoder().decode(nextPackageReadback))).toEqual(nextPackageBody);

          const nextPackageBodyText = new TextDecoder().decode(nextPackageReadback);
          const nextLiveScene = {
            revision: ingestedPackage.digest,
            source: { objectId: ingestedPackage.object_id, revision: ingestedPackage.digest },
            packageBody: nextPackageBodyText,
            html: new TextDecoder().decode(nextEntryReadback),
          };
          const patch: TimelinePatch = {
            version: current.baseVersion,
            source: EXTENSION_ID,
            operations: current.clips.map((clip) => ({
              op: 'clip.update' as const,
              target: clip.id,
              payload: {
                app: {
                  ...clip.app,
                  liveScene: nextLiveScene,
                },
              },
            })),
          };
          if (!ctx.creative.timeline.validate(patch).valid) throw new Error('public timeline patch rejected');
          ctx.creative.timeline.apply(patch);
        })();
        return { dispose() {} };
      },
    });
    const context = createExtensionContext(extension, { reader: {
      snapshot: () => snapshot,
    } satisfies TimelineReader, timeline, projectObjects });

    extension.activate?.(context);
    await run;

    expect(appliedPatch?.version).toBe(17);
    expect(appliedPatch?.operations).toHaveLength(2);
    expect(appliedPatch?.operations.map((operation) => operation.target)).toEqual(['scene-a', 'scene-b']);
    expect(appliedPatch?.operations.every((operation) => !('at' in (operation.payload ?? {})))).toBe(true);
    expect(clips.map(({ id, at, from, to, speed, label }) => ({ id, at, from, to, speed, label }))).toEqual([
      { id: 'scene-a', at: 2, from: 55, to: 75, speed: 1, label: 'first range' },
      { id: 'scene-b', at: 22, from: 20, to: 30, speed: 2, label: 'second range' },
    ]);
    expect(clips.map((clip) => clip.app?.unrelated)).toEqual([
      { sentinel: 'keep-scene-a' },
      { sentinel: 'keep-scene-b' },
    ]);
    expect(clips.map((clip) => clip.app?.liveScene.source)).toEqual([
      { objectId: nextPackageMetadata.object_id, revision: nextPackageMetadata.digest },
      { objectId: nextPackageMetadata.object_id, revision: nextPackageMetadata.digest },
    ]);
    expect(clips.map((clip) => clip.app?.liveScene)).toEqual([
      {
        revision: nextPackageMetadata.digest,
        source: { objectId: nextPackageMetadata.object_id, revision: nextPackageMetadata.digest },
        packageBody: new TextDecoder().decode(nextPackageBytes),
        html: new TextDecoder().decode(nextBytes),
      },
      {
        revision: nextPackageMetadata.digest,
        source: { objectId: nextPackageMetadata.object_id, revision: nextPackageMetadata.digest },
        packageBody: new TextDecoder().decode(nextPackageBytes),
        html: new TextDecoder().decode(nextBytes),
      },
    ]);
    expect(nextPackageMetadata.digest).not.toBe(nextMetadata.digest);
    expect(nextPackageMetadata.digest).not.toBe(originalPackageMetadata.digest);
  });
});
