import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import type {ResolvedTimelineConfig} from '@/tools/video-editor/types/index.ts';
import {analyzeVisualSeams, withVisualSeamIntent} from './visualSeamContract.ts';

const runtime = process.env.VISUAL_SEAM_RUNTIME_CHECKOUT ?? resolve(process.cwd(), '../../../../banodoco-workspace-runtime/.otto/worktrees/visual-seam-contract-20261008');
function report(config: ResolvedTimelineConfig, closure?: Record<string, unknown>) {
  const python = spawnSync('python3', ['-c', `import json,sys
from runtime_protocol.visual_seam import evaluate_closure
c=json.load(sys.stdin)
if 'closure' in c:
    x=c['closure'];p=x['parent'];p['config']['app']=c['config'].get('app',{})
    r,_=evaluate_closure(p,{(s['shot_id'],s['revision_id']):s for s in x['shots']},{i['revision_id']:i for i in x['internal']},timeline_id='main')
else:
    r,_=evaluate_closure({'config':c,'clips':c['clips'],'registry':{'assets':c['registry']},'occurrences':[]},{},{},timeline_id='main')
print(json.dumps(r))`], {cwd: runtime, input: JSON.stringify(config), encoding: 'utf8',
    ...(closure ? {input: JSON.stringify({config, closure})} : {}),
    env: {...process.env, PYTHONPATH: runtime, PYTHONDONTWRITEBYTECODE: '1'}});
  expect(python.status, python.stderr).toBe(0);
  return JSON.parse(python.stdout) as {blocked: boolean; boundaries: {frame: number; requiresIntent: boolean}[]};
}
function config(): ResolvedTimelineConfig {
  return {output: {resolution: '1920x1080', fps: 30, file: 'intent.mp4'},
    tracks: [{id: 'v', kind: 'visual', label: 'Picture'}], registry: {}, clips: [
      {id: 'a', clipType: 'media', track: 'v', at: 0, hold: 1},
      {id: 'b', clipType: 'media', track: 'v', at: 1, hold: 1, entrance: {type: 'fade', duration: 0.5}},
    ]};
}
describe('portable Reigh intent admitted by authoritative Runtime', () => {
  it('acknowledges only the same context and named cues', () => {
    const base = config();
    expect(report(base).blocked).toBe(true);
    const acknowledged = withVisualSeamIntent(base, 30, 'synchronized');
    expect(report(acknowledged).blocked).toBe(false);
    const missingParticipant = structuredClone(acknowledged);
    const stored = missingParticipant.app?.visualSeamContract as {intents: Record<string, {canonical: {participants: string[]}}>};
    stored.intents['30']!.canonical.participants = [];
    expect(report(missingParticipant).blocked).toBe(true);
    const changed = structuredClone(acknowledged);
    changed.clips[1]!.entrance = {type: 'fade', duration: 0.7};
    expect(report(changed).blocked).toBe(true);
    const extra = structuredClone(acknowledged);
    extra.clips.push({id: 'extra', clipType: 'media', track: 'fx', at: 1, hold: 1,
      keyframes: {x: [{time: 0, value: 0, interpolation: 'linear'}, {time: 0.5, value: 10, interpolation: 'linear'}]}});
    expect(report(extra).blocked).toBe(true);
    const otherBoundary = structuredClone(acknowledged);
    otherBoundary.clips.push({id: 'c', clipType: 'media', track: 'v', at: 2, hold: 1, entrance: {type: 'fade', duration: 0.5}});
    expect(report(otherBoundary).boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({frame: 30, requiresIntent: false}),
      expect.objectContaining({frame: 60, requiresIntent: true}),
    ]));
  });
  it('retains old authored data but a hard cut never grants additional motion', () => {
    const base = config();
    base.app = {visualSeamIntents: {'10': 'hard-cut'}, visualSeamContract: {intents: {'10': 'hard-cut'}}};
    const acknowledged = withVisualSeamIntent(base, 30, 'hard-cut');
    expect((acknowledged.app?.visualSeamContract as {intents: Record<string, unknown>}).intents['10']).toBe('hard-cut');
    expect(report(acknowledged).blocked).toBe(true);
  });
  it('binds registry source metadata even without a resolved assetEntry', () => {
    const base = config();
    base.clips[1]!.asset = 'source';
    base.registry = {source: {file: 'source.mp4', type: 'video'}};
    const acknowledged = withVisualSeamIntent(base, 30, 'synchronized');
    expect(report(acknowledged).blocked).toBe(false);
    const changed = structuredClone(acknowledged);
    changed.registry.source!.file = 'replacement.mp4';
    expect(report(changed).blocked).toBe(true);
  });
  it('names independently disclosed clip-local and parent effect cues', () => {
    const base = config();
    const keyframes = [{at: 0, x: 0, y: 0, width: 100, height: 100, opacity: 1},
      {at: 0.5, x: 10, y: 0, width: 100, height: 100, opacity: 1}];
    base.clips[1]!.effects = [{id: 'nested', type: 'animated-media-transform', params: {keyframes}}];
    base.effects = [{id: 'parent', type: 'animated-media-transform', at: 1, hold: 1, params: {keyframes}}];
    expect(report(base).blocked).toBe(true);
    expect(report(withVisualSeamIntent(base, 30, 'synchronized')).blocked).toBe(false);
  });
  it('rejects stale and incomplete portable records in editor preflight too', () => {
    const acknowledged = withVisualSeamIntent(config(), 30, 'synchronized');
    const changed = structuredClone(acknowledged);
    changed.clips[1]!.entrance = {type: 'fade', duration: 0.7};
    expect(analyzeVisualSeams(changed, {enforceIntent: true}).blocked).toBe(true);
    const missingParticipant = structuredClone(acknowledged);
    const stored = missingParticipant.app?.visualSeamContract as {intents: Record<string, {canonical: {participants: string[]}}>};
    stored.intents['30']!.canonical.participants = [];
    expect(analyzeVisualSeams(missingParticipant, {enforceIntent: true}).blocked).toBe(true);
  });
  it('rejects unsupported, outgoing-only and undersized transition overlap in preflight', () => {
    for (const transition of [{type: 'not-real', duration: 0.2}, {type: 'crossfade', duration: 0.1}]) {
      const base = config();
      base.clips[1]!.at = 0.8;
      base.clips[1]!.transition = transition;
      expect(analyzeVisualSeams(base).blocked).toBe(true);
      expect(report(base).blocked).toBe(true);
    }
    const outgoing = config();
    outgoing.clips[1]!.at = 0.8;
    outgoing.clips[0]!.transition = {type: 'crossfade', duration: 0.2};
    expect(analyzeVisualSeams(outgoing).blocked).toBe(true);
  });
  it('uses original child owner IDs across canonical occurrence projection', () => {
    const base = config();
    base.clips = base.clips.map((c, index) => ({...c, id: `o-${index}:${c.id}`,
      app: {canonical: {parentDocumentId: 'main', occurrenceId: `o-${index}`}}}));
    const closure = {parent: {config: {output: {fps: 30}, tracks: [{id: 'v', kind: 'visual'}]}, clips: [], registry: {},
      occurrences: ['a', 'b'].map((_, i) => ({occurrence_id: `o-${i}`, shot_id: `s-${i}`, shot_revision_id: `sr-${i}`,
        placement: {start_ms: i * 1000}, track: 'v', duration_ms: 1000, speed: 1}))},
      shots: ['a', 'b'].map((_, i) => ({shot_id: `s-${i}`, revision_id: `sr-${i}`, internal_timeline_revision_id: `ir-${i}`, payload: {}})),
      internal: config().clips.map((c, i) => ({revision_id: `ir-${i}`, payload: {clips: [{...c, at: 0}]}}))};
    const acknowledged = withVisualSeamIntent(base, 30, 'synchronized');
    expect(report(base, closure).blocked).toBe(true);
    expect(report(acknowledged, closure).blocked).toBe(false);
  });
});
