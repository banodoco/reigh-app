// @vitest-environment jsdom
import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {sceneDocument,SceneFrameHost,validateScenePackage} from '@astrid/packs/rendering/editor/live-scenes/runtime';

afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

const digest=(value:string)=>`sha256:${createHash('sha256').update(value,'utf8').digest('hex')}`;
const html='<html><head></head><body></body></html>';
const manifest={formatVersion:1 as const,entry:'scene.html',duration:10,authoredFps:30};
const entry={object_id:'entry-object',digest:digest(html),media_type:'text/html',size:Buffer.byteLength(html,'utf8'),filename:'scene.html'};
const packageBody=JSON.stringify({manifest,entry,assets:[]});
const revision=digest(packageBody);
const source=()=>validateScenePackage({revision,source:{objectId:'package-object',revision},packageBody,html});

describe('prepared iframe boot ordering',()=>{
  it('acknowledges parent hello after fast child boot and retries without lost readiness',async()=>{
    const sent: Record<string,unknown>[] = [], delivered: Record<string,unknown>[] = [];
    let listening=false;
    const parent={postMessage:(message:Record<string,unknown>)=>{sent.push(message);if(listening)delivered.push(message);}};
    const scene=source();
    const rendered=sceneDocument(scene,'i');
    const script=rendered.match(/<script>([\s\S]*?)<\/script>/)![1];
    const child={astridScene:{initialize:async()=>{},render:async()=>{},dispose:()=>{}}};
    const doc={fonts:{ready:Promise.resolve()},images:[]};
    const handlers: Record<string,(event:{source:unknown;data:unknown})=>void> = {};
    // Execute the exact emitted bridge, with real promise microtasks and a
    // controlled listener installation order (no WebGL dependency).
    new Function('window','document','parent','addEventListener',script)(child,doc,parent,(name:string,fn:(event:{source:unknown;data:unknown})=>void)=>{handlers[name]=fn;});
    for(let i=0;i<10;i++)await Promise.resolve();
    expect(sent).toHaveLength(0);
    listening=true;
    const commands: Record<string,unknown>[]=[];
    const host=new SceneFrameHost(scene,'i',m=>{commands.push(m);handlers.message({source:parent,data:m});},()=>{});
    host.request({sourceTime:2,width:10,height:10});
    expect(delivered).toHaveLength(0);
    expect(commands).toHaveLength(0);
    host.initialize();
    for(let i=0;i<10;i++)await Promise.resolve();
    expect(delivered.map(m=>m.kind)).toEqual(['initialized']);
    host.initialize();
    for(let i=0;i<10;i++)await Promise.resolve();
    expect(delivered.map(m=>m.kind)).toEqual(['initialized','initialized']);
    host.receive(delivered[0]);
    expect(commands.at(-1)).toMatchObject({kind:'render',sourceTime:2});
    for(let i=0;i<10;i++)await Promise.resolve();
    expect(delivered.at(-1)).toMatchObject({kind:'frame',sourceTime:2,requestId:1});
    host.dispose();
  });
  it('recovers a hello lost before load; awaits one initialization despite duplicate hellos; disposes on pagehide',async()=>{
    vi.useFakeTimers();
    const scene=source();
    const script=sceneDocument(scene,'i').match(/<script>([\s\S]*?)<\/script>/)![1];
    const handlers: Record<string,(event:{source:unknown;data:unknown})=>void>={};
    const states: Array<{phase:string}>=[],commands: Record<string,unknown>[]=[];
    let finish!:()=>void;
    const wait=new Promise<void>(resolve=>{finish=resolve;});
    const initialize=vi.fn(()=>wait),render=vi.fn(async()=>{}),dispose=vi.fn();
    const child={astridScene:{initialize,render,dispose}};
    const parent={postMessage:(m:Record<string,unknown>)=>host.receive(m)};
    const host=new SceneFrameHost(scene,'i',m=>{commands.push(m);handlers.message?.({source:parent,data:m});},s=>states.push(s));
    host.request({sourceTime:3,width:10,height:10});host.initialize(); // lost before bridge/load
    new Function('window','document','parent','addEventListener',script)(child,{fonts:{ready:Promise.resolve()},images:[]},parent,(name:string,fn:(event:{source:unknown;data:unknown})=>void)=>{handlers[name]=fn;});
    // No load/manual hello: the same host-owned interval discovers the child.
    vi.advanceTimersByTime(100);await flush();
    vi.advanceTimersByTime(500);await flush();
    expect(initialize).toHaveBeenCalledTimes(1);expect(render).not.toHaveBeenCalled();
    expect(commands.filter(m=>m.kind==='render')).toHaveLength(0);
    finish();await flush();
    expect(commands.filter(m=>m.kind==='render')).toHaveLength(1);
    expect(states.at(-1)?.phase).toBe('ready');expect(render).toHaveBeenCalledWith({sourceTime:3,width:10,height:10});
    expect(vi.getTimerCount()).toBe(0);
    host.dispose(false);expect(dispose).not.toHaveBeenCalled();
    handlers.pagehide({source:parent,data:null});expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('keeps cached init, fonts and image decode gates across automatic retries',async()=>{
    vi.useFakeTimers();
    const scene=source();
    const handlers: Record<string,(event:{source:unknown;data:unknown})=>void>={};
    let finishInit!:()=>void,finishFonts!:()=>void,finishImage!:()=>void;
    const initialize=vi.fn(()=>new Promise<void>(r=>{finishInit=r;}));
    const fonts=new Promise<void>(r=>{finishFonts=r;});
    const decode=vi.fn(()=>new Promise<void>(r=>{finishImage=r;}));
    const render=vi.fn(async()=>{}),states: Array<{phase:string}>=[],commands:Record<string,unknown>[]=[];
    const parent={postMessage:(m:Record<string,unknown>)=>host.receive(m)};
    const host=new SceneFrameHost(scene,'gates',m=>{commands.push(m);handlers.message?.({source:parent,data:m});},s=>states.push(s));
    new Function('window','document','parent','addEventListener',sceneDocument(scene,'gates').match(/<script>([\s\S]*?)<\/script>/)![1])({astridScene:{initialize,render}}, {fonts:{ready:fonts},images:[{decode}]},parent,(n:string,fn:(e:{source:unknown;data:unknown})=>void)=>{handlers[n]=fn;});
    host.request({sourceTime:4,width:10,height:10});host.initialize();await flush();
    vi.advanceTimersByTime(500);await flush();expect(initialize).toHaveBeenCalledTimes(1);expect(render).not.toHaveBeenCalled();
    finishInit();await flush();vi.advanceTimersByTime(500);await flush();expect(decode).not.toHaveBeenCalled();
    finishFonts();await flush();vi.advanceTimersByTime(500);await flush();expect(decode).toHaveBeenCalledTimes(1);expect(render).not.toHaveBeenCalled();
    finishImage();await flush();expect(render).toHaveBeenCalledTimes(1);expect(commands.filter(m=>m.kind==='render')).toHaveLength(1);expect(states.at(-1)?.phase).toBe('ready');expect(vi.getTimerCount()).toBe(0);host.dispose(false);
  });
  it('terminates at the original deadline when readiness never settles, ignoring late completion',async()=>{
    vi.useFakeTimers();
    const scene=source();
    const handlers: Record<string,(event:{source:unknown;data:unknown})=>void>={};
    const states:Array<{phase:string}>=[],commands:Record<string,unknown>[]=[];
    let ready!:()=>void;const fonts=new Promise<void>(r=>{ready=r;});const render=vi.fn(async()=>{});
    const parent={postMessage:(m:Record<string,unknown>)=>host.receive(m)};
    const host=new SceneFrameHost(scene,'pending',m=>{commands.push(m);handlers.message?.({source:parent,data:m});},s=>states.push(s));
    new Function('window','document','parent','addEventListener',sceneDocument(scene,'pending').match(/<script>([\s\S]*?)<\/script>/)![1])({astridScene:{initialize:async()=>{},render}}, {fonts:{ready:fonts},images:[]},parent,(n:string,fn:(e:{source:unknown;data:unknown})=>void)=>{handlers[n]=fn;});
    host.request({sourceTime:4,width:10,height:10});host.initialize();await flush();vi.advanceTimersByTime(29999);await flush();expect(states.at(-1)?.phase).toBe('loading');
    vi.advanceTimersByTime(1);expect(states.at(-1)?.phase).toBe('error');expect(vi.getTimerCount()).toBe(0);
    const count=commands.length;host.initialize();ready();await flush();expect(commands).toHaveLength(count);expect(render).not.toHaveBeenCalled();expect(states.filter(s=>s.phase==='error')).toHaveLength(1);host.dispose(false);
  });
  it('reports cached initialization failure and keeps the unchanged deadline',async()=>{
    vi.useFakeTimers();
    const scene=source();
    const script=sceneDocument(scene,'i').match(/<script>([\s\S]*?)<\/script>/)![1];
    const handlers: Record<string,(event:{source:unknown;data:unknown})=>void>={};
    const states: Array<{phase:string;error?:string}>=[];
    const parent={postMessage:(m:Record<string,unknown>)=>host.receive(m)};
    const host=new SceneFrameHost(scene,'i',m=>handlers.message?.({source:parent,data:m}),s=>states.push(s));
    const initialize=vi.fn(async()=>{throw Error('bad init');});
    new Function('window','document','parent','addEventListener',script)({astridScene:{initialize}}, {fonts:{ready:Promise.resolve()},images:[]},parent,(name:string,fn:(event:{source:unknown;data:unknown})=>void)=>{handlers[name]=fn;});
    host.initialize();host.initialize();await flush();
    expect(initialize).toHaveBeenCalledTimes(1);expect(states.at(-1)).toMatchObject({phase:'error',error:'bad init'});expect(states.filter(s=>s.phase==='error')).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);host.dispose(false);
    const timed: Array<{phase:string}>=[];
    const silent=new SceneFrameHost(scene,'never',()=>{},s=>timed.push(s));
    silent.initialize();vi.advanceTimersByTime(29999);silent.initialize();expect(timed.at(-1)?.phase).toBe('loading');
    vi.advanceTimersByTime(1);expect(timed.at(-1)?.phase).toBe('error');expect(vi.getTimerCount()).toBe(0);silent.dispose(false);
  });
});
