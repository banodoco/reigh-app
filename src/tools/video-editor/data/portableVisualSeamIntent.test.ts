import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import type {ResolvedTimelineConfig} from '@/tools/video-editor/types/index.ts';
import {analyzeVisualSeams, withVisualSeamIntent, withVisualSeamPause} from './visualSeamContract.ts';
import {portableVisualSeamIntent} from './portableVisualSeamIntent.ts';
import {cueIdentity} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/seam-intent';
import type {BoundaryCue} from '../../../../vendor/astrid-browser/astrid/packs/local/elements/boundary';
import fixture from './shotComposition.fixture.json';
import {createShotCompositionAdapter} from './shotCompositionAdapter.ts';
import {projectCanonicalComposition} from './shotCompositionProjection.ts';

const runtime = process.env.VISUAL_SEAM_RUNTIME_CHECKOUT ?? resolve(process.cwd(), '../../../../banodoco-workspace-runtime/.otto/worktrees/visual-seam-contract-20261008');
function report(config: ResolvedTimelineConfig, closure?: Record<string, unknown>) {
  const python = spawnSync('python3', ['-c', `import json,sys
from runtime_protocol.visual_seam import evaluate_closure
c=json.load(sys.stdin)
if 'closure' in c:
    x=c['closure'];p=x['parent'];p['config']['app']=c['config'].get('app',{})
    r,m=evaluate_closure(p,{(s['shot_id'],s['revision_id']):s for s in x['shots']},{i['revision_id']:i for i in x['internal']},timeline_id='main',materialize=True)
else:
    r,_=evaluate_closure({'config':c,'clips':c['clips'],'registry':{'assets':c['registry']},'occurrences':[]},{},{},timeline_id='main')
if 'closure' in c: r['renderConfig']=m['render_config']
print(json.dumps(r))`], {cwd: runtime, input: JSON.stringify(config), encoding: 'utf8',
    ...(closure ? {input: JSON.stringify({config, closure})} : {}),
    env: {...process.env, PYTHONPATH: runtime, PYTHONDONTWRITEBYTECODE: '1'}});
  expect(python.status, python.stderr).toBe(0);
  return JSON.parse(python.stdout) as {blocked: boolean; cues: BoundaryCue[];
    opaqueElements: {span: {path: string[]}; opaque: string[]}[];
    structuralIssues: {code: string; frame?: number}[];
    renderConfig: ResolvedTimelineConfig;
    boundaries: {frame: number; requiresIntent: boolean; canonicalContext: Record<string, unknown>; canonicalCueIds: string[]}[]};
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

describe('Astra round-two cross-consumer regressions', () => {
  const keyframes = [{at: 0, x: 0, y: 0, width: 100, height: 100, opacity: 1},
    {at: 0.5, x: 10, y: 0, width: 100, height: 100, opacity: 1}];
  const cues = (rows: readonly BoundaryCue[]) => rows.map(cueIdentity).sort();

  it.each([[], {}])('canonicalizes empty optional effects to absence without dropping real effect data: %j', empty => {
    const base = config();
    const absent = portableVisualSeamIntent(base, 30, 'synchronized');
    const authored = withVisualSeamIntent(base, 30, 'synchronized');
    authored.clips[1]!.effects = empty;
    const current = portableVisualSeamIntent(authored, 30, 'synchronized');
    expect(current.context).toEqual(absent.context);
    expect(current.context).toEqual(report(authored).boundaries[0]?.canonicalContext);
    expect(analyzeVisualSeams(authored, {enforceIntent: true}).blocked).toBe(false);
    expect(report(authored).blocked).toBe(false);
    const real = [{id: 'real', type: 'animated-media-transform', params: {keyframes}}];
    authored.clips[1]!.effects = real;
    const changed = portableVisualSeamIntent(authored, 30, 'synchronized');
    expect(changed.context).toEqual(report(authored).boundaries[0]?.canonicalContext);
    expect(changed.context.owners).toContainEqual(expect.objectContaining({
      path: ['clip', 'b'], clip: expect.objectContaining({effects: real}),
    }));
    expect(changed.context).not.toEqual(absent.context);
    expect(analyzeVisualSeams(authored, {enforceIntent: true}).blocked).toBe(true);
    expect(report(authored).blocked).toBe(true);
  });

  it('discloses historical EndSpanning phase 1259 and motion 1260 in normal registry-free preflight', () => {
    const vectors = JSON.parse(readFileSync(resolve(runtime, 'conformance/fixtures/visual-boundary-v1.json'), 'utf8'));
    const vector = vectors.vectors.find((v: {name: string}) => v.name === 'old EndSpanning phase 1259 then geometry 1260');
    const base = config();
    const effect = {...vector.context.clip, assetEntry: {file: vector.context.source, type: 'video'}};
    base.registry = {[effect.asset]: effect.assetEntry};
    base.clips = [
      {id: 'a', clipType: 'media', track: 'v', at: 0, hold: 1259 / 30},
      {id: 'b', clipType: 'media', track: 'v', at: 1259 / 30, hold: 20},
      effect,
    ];
    const metadataOnly = new Proxy(base, {get(target, key, receiver) {
      if (key === 'registry') throw new Error('normal disclosure read registry');
      return Reflect.get(target, key, receiver);
    }});
    const editor = analyzeVisualSeams(metadataOnly, {enforceIntent: true});
    const authoritative = report(base);
    expect(editor.blocked).toBe(true);
    expect(authoritative.blocked).toBe(true);
    expect(cues(editor.cues)).toEqual(cues(authoritative.cues));
    expect(editor.opaqueElements).toEqual([]);
    expect(editor.boundaries[0]?.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ownerId: effect.id, path: ['parent', 'timeline', 'clip', effect.id],
        cue: expect.objectContaining({frame: 1259, kind: 'phase-change', id: 'iteration'})}),
      expect.objectContaining({cue: expect.objectContaining({frame: 1260, kind: 'motion-start', id: 'move-up'})}),
    ]));
    const acknowledged = withVisualSeamIntent(base, 1259, 'synchronized');
    expect(analyzeVisualSeams(acknowledged, {enforceIntent: true}).blocked).toBe(false);
    expect(report(acknowledged).blocked).toBe(false);
  });

  it('preserves continuous and deeper nested opacity beside independently known effect cues', () => {
    const base = config();
    base.clips[1]!.effects = [{id: 'nested', type: 'animated-media-transform', entrance: 'fade',
      continuous: 'drift', effects: [{id: 'deeper', type: 'submitted'}], params: {keyframes}}];
    const editor = analyzeVisualSeams(base, {enforceIntent: true});
    const authoritative = report(base);
    expect(editor.blocked).toBe(true);
    expect(authoritative.blocked).toBe(true);
    expect(cues(editor.cues)).toEqual(cues(authoritative.cues));
    const path = ['clip', 'b', 'effect', 'nested'];
    expect(editor.opaqueElements).toContainEqual(expect.objectContaining({
      path: ['parent', 'timeline', ...path],
      opaqueReasons: ['unsupported continuous timing', 'unsupported nested effect timing'],
    }));
    expect(authoritative.opaqueElements).toContainEqual(expect.objectContaining({
      span: expect.objectContaining({path: ['parent', 'main', ...path]}),
      opaque: ['unsupported continuous timing', 'unsupported nested effect timing'],
    }));
  });

  it('does not let an incoming crossfade acknowledge an unrelated parent effect', () => {
    const base = config();
    delete base.clips[1]!.entrance;
    base.clips[1]!.at = 0.8;
    base.clips[1]!.transition = {type: 'crossfade', duration: 0.2};
    expect(analyzeVisualSeams(base, {enforceIntent: true}).blocked).toBe(false);
    expect(report(base).blocked).toBe(false);
    base.effects = [{id: 'unrelated', type: 'animated-media-transform', at: 0.8, hold: 1, params: {keyframes}}];
    expect(analyzeVisualSeams(base, {enforceIntent: true}).boundaries[0]).toMatchObject({intent: 'transition', requiresIntent: true});
    expect(report(base).boundaries[0]?.requiresIntent).toBe(true);
    for (const kind of ['hard-cut', 'transition', 'synchronized'] as const) {
      const authored = withVisualSeamIntent(base, 24, kind);
      expect(analyzeVisualSeams(authored, {enforceIntent: true}).blocked).toBe(kind !== 'synchronized');
      expect(report(authored).blocked).toBe(kind !== 'synchronized');
    }
  });

  it('excludes a spanning cue-free secondary picture lane from the bound context', () => {
    const base = config();
    base.tracks.push({id: 'secondary', kind: 'visual', label: 'Secondary picture'});
    base.clips.push({id: 'spanning', track: 'secondary', clipType: 'media', at: 0, hold: 4});
    const authored = withVisualSeamIntent(base, 30, 'synchronized');
    const intent = portableVisualSeamIntent(base, 30, 'synchronized');
    expect(intent.context).toEqual(report(base).boundaries[0]?.canonicalContext);
    expect(intent.context.owners).toEqual(expect.arrayContaining([
      expect.objectContaining({path: ['clip', 'a']}), expect.objectContaining({path: ['clip', 'b']}),
    ]));
    expect(intent.context.owners).toHaveLength(2);
    expect(analyzeVisualSeams(authored, {enforceIntent: true}).blocked).toBe(false);
    expect(report(authored).blocked).toBe(false);
    const unrelatedEdit = structuredClone(authored);
    unrelatedEdit.clips[2]!.opacity = 0.5;
    expect(analyzeVisualSeams(unrelatedEdit, {enforceIntent: true}).blocked).toBe(false);
    expect(report(unrelatedEdit).blocked).toBe(false);
    unrelatedEdit.clips[1]!.entrance = {type: 'fade', duration: 0.7};
    expect(analyzeVisualSeams(unrelatedEdit, {enforceIntent: true}).blocked).toBe(true);
    expect(report(unrelatedEdit).blocked).toBe(true);
  });

  it('keeps primary live-scene cuts separate from auxiliary opaque activations', () => {
    const base = config();
    delete base.clips[1]!.entrance;
    base.clips.forEach(c => { c.clipType = 'com.reigh.astrid.liveScene'; });
    const editor = analyzeVisualSeams(base, {enforceIntent: true});
    const authoritative = report(base);
    expect(editor.blocked).toBe(false);
    expect(authoritative.blocked).toBe(false);
    expect(editor.cues).toEqual([]);
    expect(authoritative.cues).toEqual([]);
    expect(editor.boundaries[0]?.unacknowledgedRisk).toBe(true);
    expect(authoritative.opaqueElements).toHaveLength(2);
  });

  it('accepts exactly the authored pause interval and rejects unrelated gaps and clip-only markers', () => {
    const base = config();
    delete base.clips[1]!.entrance;
    base.clips[1]!.at = 2;
    base.clips[1]!.app = {visualBoundary: {intentionalPause: true}};
    expect(analyzeVisualSeams(base, {enforceIntent: true}).blocked).toBe(true);
    expect(report(base).blocked).toBe(true);
    const paused = withVisualSeamPause(base, 'v', 30, 60);
    expect(analyzeVisualSeams(paused, {enforceIntent: true}).blocked).toBe(false);
    expect(report(paused).blocked).toBe(false);
    for (const [start, end] of [[29, 60], [30, 61]]) {
      const wrong = withVisualSeamPause(base, 'v', start!, end!);
      expect(analyzeVisualSeams(wrong, {enforceIntent: true}).blocked).toBe(true);
      expect(report(wrong).blocked).toBe(true);
    }
    paused.clips.push({id: 'c', track: 'v', clipType: 'media', at: 4, hold: 1});
    expect(analyzeVisualSeams(paused).structuralIssues).toHaveLength(1);
    expect(report(paused).structuralIssues).toEqual([expect.objectContaining({code: 'boundary/gap', frame: 120})]);
  });

  it.each([
    {entrance: 'fade', exit: ['fade', {id: 'slide-up', durationFrames: 6}], transition: 'crossfade'},
    {entrance: ['fade', {id: 'slide-up', durationFrames: 6}], exit: 'fade', transition: ['crossfade']},
  ])('preserves authored effect shapes and child/parent scopes through real projection and materialization: %j', shape => {
    const graph = structuredClone(fixture);
    graph.occurrences = [{...graph.occurrences[0]!, at_ms: 1000}];
    const child = graph.shot_revisions.find(s => s.shot_id === 'shot-alpha' && s.revision_id === 'rev-a')!;
    const local = {id: 'local', type: 'animated-media-transform', params: {keyframes}};
    const timelineEffect = {id: 'child', type: 'animated-media-transform', at: 1, hold: 1, params: {keyframes}};
    const childTimeline = {tracks: [{id: 'v', kind: 'visual'}], clips: [
      {id: 'a', clipType: 'media', track: 'v', at: 0, hold: 1, ...shape, effects: [local]},
      {id: 'b', clipType: 'media', track: 'v', at: 1, hold: 1},
    ], effects: [timelineEffect]};
    // Canonical wire shapes are intentionally broader than the editor's legacy animation types.
    child.internal_timeline_revision.timeline = childTimeline as unknown as typeof child.internal_timeline_revision.timeline;
    const base = config();
    base.clips = [];
    base.effects = [{id: 'parent', type: 'animated-media-transform', at: 2, hold: 1, params: {keyframes}}];
    base.app = {visualSeamContract: {gaps: [{kind: 'pause', track: 'v', startFrame: 7, endFrame: 9}]}};
    const projected = projectCanonicalComposition(createShotCompositionAdapter({load: async () => graph}).prepare(graph), base).config;
    const closure = {
      parent: {config: base, clips: [], registry: {assets: {}}, occurrences: [
        {occurrence_id: 'occ-1', shot_id: 'shot-alpha', shot_revision_id: 'rev-a', placement: {start_ms: 1000}, track: 'v', duration_ms: 2000, speed: 1}]},
      shots: [{shot_id: 'shot-alpha', revision_id: 'rev-a', internal_timeline_revision_id: 'timeline-alpha-a'}],
      internal: [{revision_id: 'timeline-alpha-a', payload: childTimeline}],
    };
    const authoritative = report(projected, closure);
    const editorClip = projected.clips.find(c => c.id === 'occ-1:a')!;
    const runtimeClip = authoritative.renderConfig.clips.find(c => c.id === 'occ-1:a')!;
    for (const field of ['entrance', 'exit', 'transition', 'effects'] as const) {
      expect(editorClip[field]).toEqual(runtimeClip[field]);
    }
    expect(editorClip).toMatchObject({...shape, effects: [local, timelineEffect]});
    expect(editorClip.app?.canonicalEffects).toEqual(runtimeClip.app?.canonicalEffects);
    expect(projected.effects).toEqual(authoritative.renderConfig.effects);
    expect(projected.app?.visualSeamContract).toMatchObject({gaps: [{kind: 'pause', track: 'v', startFrame: 7, endFrame: 9}]});
    const editor = analyzeVisualSeams(projected, {enforceIntent: true});
    expect(cues(editor.cues)).toEqual(cues(authoritative.cues));
    expect(editor.blocked).toBe(authoritative.blocked);
    expect(portableVisualSeamIntent(projected, 60, 'synchronized').context).toEqual(authoritative.boundaries.find(b => b.frame === 60)?.canonicalContext);
    const authored = withVisualSeamIntent(projected, 60, 'synchronized');
    expect(analyzeVisualSeams(authored, {enforceIntent: true}).blocked).toBe(false);
    expect(report(authored, closure).blocked).toBe(false);
  });
});
