import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneFrameHost, sceneDocument, validateScenePackage, type SceneStatus } from '@astrid/packs/rendering/ui/live-scenes/runtime';
import { clipSourceTime } from '../clip-types/sourceTime';

const entry = {object_id:'entry-object',digest:`sha256:${'1'.repeat(64)}`,media_type:'text/html',size:39,filename:'scene.html'};
const manifest = {formatVersion:1 as const,entry:'scene.html',duration:100,authoredFps:30};
const packageBody = JSON.stringify({manifest,entry,assets:[]});
const revision = `sha256:${'2'.repeat(64)}`;
const source = validateScenePackage({revision,source:{objectId:'package-object',revision},packageBody,html:'<html><head></head><body></body></html>'});
function setup(instance = 'clip-a') {
  const sent: Record<string,unknown>[] = [], states: SceneStatus[] = [];
  const host = new SceneFrameHost(source, instance, m=>sent.push(m), s=>states.push(s),1000);
  const ack = (m: Record<string,unknown>) => host.receive({protocol:'astrid.scene/1',instance,revision:source.package.revision,...m});
  return {host,sent,states,ack};
}
afterEach(()=>vi.useRealTimers());
describe('scene public frame boundary',()=>{
  it('maps independent placement/trim/rate including a backward seek',()=>{
    expect(clipSourceTime({at:2,from:55,speed:1},6)).toBe(59);
    expect(clipSourceTime({at:22,from:20,speed:2},26.75)).toBe(29.5);
    expect(clipSourceTime({at:2,from:55,speed:1},3)).toBe(56);
  });
  it('does not claim ready on initialization; coalesces and fences obsolete frames',()=>{
    const t=setup();t.host.request({sourceTime:50,width:640,height:360});
    expect(t.sent).toHaveLength(0);t.ack({kind:'initialized'});
    expect(t.states.at(-1)?.phase).toBe('rendering');
    t.host.request({sourceTime:30,width:640,height:360});
    t.host.request({sourceTime:10,width:640,height:360});
    t.ack({kind:'frame',requestId:1,sourceTime:50});
    expect(t.states.some(s=>s.phase==='ready')).toBe(false);
    expect(t.sent.at(-1)).toMatchObject({requestId:2,sourceTime:10});
    t.ack({kind:'frame',requestId:1,sourceTime:50});
    t.ack({kind:'frame',requestId:2,sourceTime:10,revision:'rev-old'});
    t.ack({kind:'frame',requestId:2,sourceTime:10,instance:'clip-other'});
    expect(t.states.some(s=>s.phase==='ready')).toBe(false);
    t.ack({kind:'frame',requestId:2,sourceTime:10});
    expect(t.states.at(-1)).toMatchObject({phase:'ready',sourceTime:10});t.host.dispose();
  });
  it('bounds timeout/error and ignores late frames after failure/disposal',()=>{
    vi.useFakeTimers();const t=setup();t.host.request({sourceTime:2,width:10,height:10});
    vi.advanceTimersByTime(1000);expect(t.states.at(-1)?.phase).toBe('error');
    t.ack({kind:'initialized'});expect(t.sent).toHaveLength(0);t.host.dispose();
    t.host.dispose();expect(t.sent.filter(s=>s.kind==='dispose')).toHaveLength(1);
    t.ack({kind:'frame',requestId:1,sourceTime:2});expect(t.states.at(-1)?.phase).toBe('disposed');
  });
  it('reports frame errors without accepting mismatched requests',()=>{
    const t=setup();t.host.request({sourceTime:2,width:10,height:10});t.ack({kind:'initialized'});
    t.ack({kind:'error',requestId:99,error:'stale'});expect(t.states.at(-1)?.phase).toBe('rendering');
    t.ack({kind:'error',requestId:1,error:'broken'});expect(t.states.at(-1)).toMatchObject({phase:'error',error:'broken'});t.host.dispose();
  });
  it('separate instances never share request state',()=>{
    const a=setup('a'),b=setup('b');a.host.request({sourceTime:12,width:10,height:10});b.host.request({sourceTime:5,width:10,height:10});
    a.ack({kind:'initialized'});b.ack({kind:'initialized'});a.ack({kind:'frame',requestId:1,sourceTime:12});
    expect(b.states.at(-1)?.phase).toBe('rendering');expect(a.states.at(-1)?.sourceTime).toBe(12);a.host.dispose();b.host.dispose();
  });
  it('checks format/entry/timing/source and scopes prepared HTML',()=>{
    expect(validateScenePackage(source.package)).toMatchObject({package:source.package,manifest,entry});
    for(const override of [{formatVersion:2},{entry:'../bad.html'},{duration:NaN},{authoredFps:0}]) {
      const body = {manifest:{...manifest,...override},entry,assets:[]};
      expect(()=>validateScenePackage({...source.package,packageBody:JSON.stringify(body)})).toThrow();
    }
    expect(sceneDocument(source,'clip')).toContain("connect-src 'none'");
    expect(sceneDocument(source,'clip')).toContain('await window.astridScene.render');
  });
  it('owns one retry timer; rejected identities cannot stop it; success clears before flush',()=>{
    vi.useFakeTimers();const t=setup();
    expect(vi.getTimerCount()).toBe(1); // constructor deadline only
    t.host.request({sourceTime:2,width:10,height:10});t.host.initialize();t.host.initialize();
    expect(vi.getTimerCount()).toBe(2);
    for(const identity of [{protocol:'wrong'},{instance:'wrong'},{revision:'wrong'}])t.ack({kind:'initialized',...identity});
    vi.advanceTimersByTime(100);expect(t.sent.filter(m=>m.kind==='initialize')).toHaveLength(3);expect(vi.getTimerCount()).toBe(2);
    t.ack({kind:'error',requestId:99,error:'wrong request'});expect(vi.getTimerCount()).toBe(2);
    t.ack({kind:'initialized'});expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(900);t.ack({kind:'initialized'});t.host.initialize();expect(t.sent.filter(m=>m.kind==='render')).toHaveLength(1);
    t.ack({kind:'frame',requestId:99,sourceTime:2});t.ack({kind:'frame',requestId:1,sourceTime:3});expect(t.states.at(-1)?.phase).toBe('rendering');
    vi.advanceTimersByTime(100);expect(t.states.at(-1)).toMatchObject({phase:'error',error:'Scene frame 2s timed out'});expect(vi.getTimerCount()).toBe(0);t.host.dispose(false);
  });
  it('establishes ownership before synchronous success, and clears before error/disposal callbacks',()=>{
    vi.useFakeTimers();let host!:SceneFrameHost;
    host=new SceneFrameHost(source,'sync',m=>{if(m.kind==='initialize')host.receive({...m,kind:'initialized'});},()=>{});
    host.initialize();expect(vi.getTimerCount()).toBe(0);host.dispose(false);
    const t=setup();t.host.initialize();t.ack({kind:'error',error:'bad init'});expect(vi.getTimerCount()).toBe(0);t.host.dispose(false);
    const d=setup();d.host.initialize();d.host.dispose(false);expect(vi.getTimerCount()).toBe(0);const count=d.sent.length;vi.advanceTimersByTime(2000);d.host.initialize();expect(d.sent).toHaveLength(count);
  });
});
