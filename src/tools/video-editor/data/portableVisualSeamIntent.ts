import type {ResolvedTimelineConfig, ResolvedTimelineClip} from '@/tools/video-editor/types/index.ts';
import {boundaryReport} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/boundary';
import {cueIdentity, intentContext, type IntentOwner, type SeamIntent} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/seam-intent';

type Json = Record<string, unknown>;
const record = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const number = (v: unknown, fallback = 0): number => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
function owner(clip: ResolvedTimelineClip, fps: number, registry: ResolvedTimelineConfig['registry']): IntentOwner {
  const authored = record(clip);
  const canonical = record(clip.app?.canonical);
  const occurrence = typeof canonical.occurrenceId === 'string' ? canonical.occurrenceId : undefined;
  const id = typeof canonical.sourceClipId === 'string' ? canonical.sourceClipId
    : occurrence && clip.id.startsWith(`${occurrence}:`) ? clip.id.slice(occurrence.length + 1) : clip.id;
  const speed = number(clip.speed, 1);
  const at = authored.at_ms === undefined ? clip.at : number(authored.at_ms) / 1000;
  const duration = clip.hold ?? (authored.duration_ms === undefined
    ? authored.duration === undefined ? number(clip.to) - number(clip.from) : number(authored.duration)
    : number(authored.duration_ms) / 1000);
  const start = Math.round(at * fps);
  const entry = record(clip.assetEntry ?? (clip.asset ? registry[clip.asset] : undefined));
  const source = ['content_sha256', 'object_id', 'media_id', 'digest', 'file'].map(k => entry[k]).find(v => typeof v === 'string');
  return {path: occurrence ? ['parent', 'timeline', 'occurrence', occurrence, 'clip', id] : ['parent', 'timeline', 'clip', id],
    startFrame: start, endFrame: start + Math.max(1, Math.round(duration / speed * fps)), originFrame: start,
    clip: {...authored, clipType: clip.clipType ?? 'media', at, speed, assetEntry: entry}, source: typeof source === 'string' ? source : null};
}

/** Preflight authors a portable acknowledgement; Runtime independently derives
 * witnesses from the immutable publication closure before accepting it. */
export function portableVisualSeamIntent(config: ResolvedTimelineConfig, frame: number, kind: SeamIntent['kind']): SeamIntent {
  const fps = config.output.fps;
  const owners = config.clips.filter(c => c.enabled !== false && c.active !== false && c.disabled !== true && c.hidden !== true && c.deleted !== true).map(c => owner(c, fps, config.registry));
  const tracks = new Map(config.tracks.map(t => [t.id, t.kind]));
  const primary = owners.filter(o => tracks.get(String(o.clip.track)) === 'visual'
    && ['media', 'hold', 'video', 'image', 'animated-media-transform', 'com.reigh.astrid.liveScene'].includes(String(o.clip.clipType)));
  const extent = Math.max(1, ...owners.map(o => o.endFrame / fps));
  for (const o of [...owners]) {
    if (!Array.isArray(o.clip.effects)) continue;
    o.clip.effects.forEach((raw, index) => {
      const effect = record(raw);
      const id = String(effect.id ?? index);
      owners.push({...o, path: [...o.path, 'effect', id], clip: {id, clipType: effect.type ?? 'unknown',
        at: o.clip.at, hold: (o.endFrame - o.startFrame) / fps, track: o.clip.track,
        params: effect.params ?? effect}});
    });
  }
  if (Array.isArray(config.effects)) config.effects.forEach((raw, index) => {
    const effect = record(raw);
    const clip = {...effect, id: String(effect.id ?? index), clipType: effect.type ?? 'unknown',
      at: number(effect.at), hold: effect.hold ?? extent, track: effect.track ?? 'fx'} as ResolvedTimelineClip;
    owners.push({...owner(clip, fps, config.registry), path: ['parent', 'timeline', 'effect', clip.id]});
  });
  const nearby = owners.flatMap(o => boundaryReport({clip: o.clip, fps, startFrame: o.startFrame,
    endFrame: o.endFrame, originFrame: o.originFrame, path: o.path, source: o.source,
    sourceType: String(record(o.clip.assetEntry).type ?? '')}).cues).filter(c => Math.abs(c.frame - frame) <= 2);
  const paths = new Set(nearby.map(c => JSON.stringify(c.path)));
  const relevant = owners.filter(o => paths.has(JSON.stringify(o.path)) || primary.includes(o) && o.startFrame <= frame + 2 && o.endFrame >= frame - 2);
  return {contextVersion: 'visual-seam/v1', kind, frame,
    participants: kind === 'synchronized' ? nearby.map(cueIdentity).sort() : [],
    context: intentContext(fps, frame, relevant)};
}
