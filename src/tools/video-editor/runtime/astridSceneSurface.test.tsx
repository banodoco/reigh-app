// @vitest-environment jsdom
import {StrictMode} from 'react';
import {render,cleanup,fireEvent,act,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SceneSurface} from '@astrid/packs/rendering/ui/live-scenes/SceneSurface';
import * as sceneRuntime from '@astrid/packs/rendering/ui/live-scenes/runtime';

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function makeSource({html='<html><head></head><body></body></html>', duration=100, trace=false}: {
  html?: string; duration?: number; trace?: boolean;
} = {}) {
  const entryBytes = new TextEncoder().encode(html);
  const entry = {
    object_id: 'entry-object',
    digest: await sha256(entryBytes),
    media_type: 'text/html',
    size: entryBytes.byteLength,
    filename: 'scene.html',
  };
  const manifest = {formatVersion:1 as const,entry:'scene.html',duration,authoredFps:30};
  const packageBody = JSON.stringify({manifest,entry,assets:[]});
  const revision = await sha256(new TextEncoder().encode(packageBody));
  return {
    revision,
    source: {objectId:'package-object',revision},
    packageBody,
    html,
    ...(trace ? {__l1bTrace:true} : {}),
  };
}

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
describe('actual SceneSurface document lifecycle',()=>{
  it('recovers an initially absent owned contentWindow on automatic retry without remount or load',async()=>{
    const messages: Record<string,unknown>[]=[];
    const child={postMessage:(m:Record<string,unknown>)=>messages.push(m)};
    let available=false;
    const getWindow=vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockImplementation(()=>available?child as unknown as Window:null);
    const source=await makeSource();
    const requested=59.06666666666667;
    const view=render(<SceneSurface source={source} sourceTime={requested} width={640} height={360} />);
    await waitFor(()=>expect(view.container.querySelector('iframe')).not.toBeNull());
    const owned=view.container.querySelector('iframe')!;
    await waitFor(()=>expect(getWindow).toHaveBeenCalled());expect(messages).toHaveLength(0);
    expect(view.container.firstChild).toHaveAttribute('data-phase','loading');
    available=true;
    // No remount, onLoad, rerender, or explicit initialize call.
    await waitFor(()=>expect(messages).toHaveLength(1));
    expect(view.container.querySelector('iframe')).toBe(owned);
    expect(messages).toHaveLength(1);expect(messages[0]).toMatchObject({kind:'initialize'});
    const identity=messages[0];
    act(()=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{...identity,kind:'initialized'}})));
    expect(messages.filter(m=>m.kind==='render')).toHaveLength(0);
    act(()=>window.dispatchEvent(new MessageEvent('message',{source:child as unknown as Window,data:{...identity,kind:'initialized'}})));
    expect(messages.filter(m=>m.kind==='render')).toHaveLength(1);
    const request=messages.at(-1)!;
    expect(request).toMatchObject({kind:'render',sourceTime:requested,width:640,height:360,requestId:1});
    act(()=>window.dispatchEvent(new MessageEvent('message',{source:child as unknown as Window,data:{...request,kind:'frame'}})));
    expect(view.container.firstChild).toHaveAttribute('data-phase','ready');
    expect(view.container.firstChild).toHaveAttribute('data-source-time','59.067');
    view.unmount();
    const messageCount=messages.length;
    await new Promise(resolve=>setTimeout(resolve,130));
    expect(messages).toHaveLength(messageCount);
  });
  it('keeps a retained document usable across effect replay and fences replaced documents',async()=>{
    const messages: Record<string,unknown>[]=[];
    const child={postMessage:(m:Record<string,unknown>)=>messages.push(m)};
    vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockReturnValue(child as unknown as Window);
    const source=await makeSource({duration:10});
    const view=render(<StrictMode><SceneSurface source={source} sourceTime={2} width={10} height={10} /></StrictMode>);
    await waitFor(()=>expect(view.container.querySelector('iframe')).not.toBeNull());
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);
    await waitFor(()=>expect(messages.length).toBeGreaterThanOrEqual(2));
    expect(messages.every(m=>m.kind==='initialize')).toBe(true);
    const hellos=messages.length;
    expect(new Set(messages.map(m=>m.instance)).size).toBe(1);
    const iframe=view.container.querySelector('iframe')!;
    fireEvent.load(iframe);
    expect(messages).toHaveLength(hellos+1);
    expect(messages.every(m=>m.kind==='initialize')).toBe(true);
    const identity=messages[0];
    act(()=>window.dispatchEvent(new MessageEvent('message',{data:{...identity,kind:'initialized'},source:window})));
    expect(messages.filter(m=>m.kind==='render')).toHaveLength(0);
    await waitFor(()=>expect(messages.at(-1)?.kind).toBe('initialize'));
    act(()=>window.dispatchEvent(new MessageEvent('message',{data:{...identity,kind:'initialized'},source:child as unknown as Window})));
    expect(messages.filter(m=>m.kind==='render')).toHaveLength(1);
    const request=messages.at(-1)!;
    act(()=>window.dispatchEvent(new MessageEvent('message',{data:{...request,kind:'frame',requestId:99},source:child as unknown as Window})));
    expect(view.container.firstChild).toHaveAttribute('data-phase','rendering');
    act(()=>window.dispatchEvent(new MessageEvent('message',{data:{...request,kind:'frame'},source:child as unknown as Window})));
    expect(view.container.firstChild).toHaveAttribute('data-phase','ready');
    const nextSource=await makeSource({duration:10,html:'<html><head></head><body>next</body></html>'});
    view.rerender(<StrictMode><SceneSurface source={nextSource} sourceTime={4} width={10} height={10} /></StrictMode>);
    await waitFor(()=>expect(messages.some(m=>m.revision===nextSource.revision&&m.kind==='initialize')).toBe(true));
    const nextIframe=view.container.querySelector<HTMLIFrameElement>('iframe[data-scene-role="candidate"]')!;
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(iframe);
    expect(iframe).toHaveStyle({visibility:'visible'});
    expect(nextIframe).toHaveStyle({visibility:'hidden'});
    expect(nextIframe).not.toBe(iframe);
    expect(nextIframe.srcdoc).toContain(`"revision":"${nextSource.revision}"`);
    const next=messages.filter(m=>m.revision===nextSource.revision).at(-1)!;
    expect(next).toMatchObject({kind:'initialize',revision:nextSource.revision});
    expect(next.instance).not.toBe(identity.instance);
    act(()=>window.dispatchEvent(new MessageEvent('message',{data:{...identity,kind:'initialized'},source:child as unknown as Window})));
    expect(messages.filter(m=>m.kind==='render')).toHaveLength(1);
    view.unmount();
    expect(messages.filter(m=>m.kind==='dispose')).toHaveLength(0);
  });

  it('rejects tampered entry bytes before creating or executing the iframe',async()=>{
    const html='<html><head></head><body>aaaa</body></html>';
    const source=await makeSource({html});
    const tampered={...source,html:html.replace('aaaa','bbbb')};
    const onStatus=vi.fn();
    const view=render(<SceneSurface source={tampered} sourceTime={1} width={10} height={10} onStatus={onStatus}/>);
    await waitFor(()=>expect(view.container.firstChild).toHaveAttribute('data-phase','error'));
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(view.container.firstChild).toHaveTextContent('Scene entry digest mismatch');
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({phase:'error',error:'Scene entry digest mismatch'}));
  });

  it('rejects a package/source revision mismatch before iframe creation',async()=>{
    const source=await makeSource();
    const mismatched={...source,source:{...source.source,revision:`sha256:${'0'.repeat(64)}`}};
    const onStatus=vi.fn();
    const view=render(<SceneSurface source={mismatched} sourceTime={1} width={10} height={10} onStatus={onStatus}/>);
    await waitFor(()=>expect(view.container.firstChild).toHaveAttribute('data-phase','error'));
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({phase:'error',error:'Scene package/source revision mismatch'}));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve=ok; reject=fail; });
  return {promise,resolve,reject};
}

function ownedChildren() {
  const children=new Map<HTMLIFrameElement,{postMessage:ReturnType<typeof vi.fn>}>();
  vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockImplementation(function(this:HTMLIFrameElement) {
    if (!children.has(this)) children.set(this,{postMessage:vi.fn()});
    return children.get(this)! as unknown as Window;
  });
  const messages=(iframe:HTMLIFrameElement):Record<string,unknown>[]=>children.get(iframe)?.postMessage.mock.calls.map(([message])=>message) ?? [];
  const mounted=async(container:HTMLElement,selector='iframe')=>{
    let iframe!:HTMLIFrameElement;
    await waitFor(()=>{
      iframe=container.querySelector<HTMLIFrameElement>(selector)!;
      expect(iframe).not.toBeNull();
      expect(messages(iframe).some(message=>message.kind==='initialize')).toBe(true);
    });
    return iframe;
  };
  const ack=(iframe:HTMLIFrameElement,message:Record<string,unknown>)=>act(()=>{
    const identity=messages(iframe)[0];
    window.dispatchEvent(new MessageEvent('message',{source:children.get(iframe)! as unknown as Window,data:{...identity,...message}}));
  });
  const initialize=(iframe:HTMLIFrameElement)=>ack(iframe,{kind:'initialized'});
  const ready=(iframe:HTMLIFrameElement)=>ack(iframe,{...messages(iframe).filter(message=>message.kind==='render').at(-1),kind:'frame'});
  return {children,messages,mounted,ack,initialize,ready};
}

describe('last-good replacement ownership',()=>{
  it('keeps the same displayed iframe through verification and initialization, then promotes without remount',async()=>{
    const first=await makeSource(),next=await makeSource({html:'<html><head></head><body>next</body></html>'});
    const gate=deferred<void>(),verify=sceneRuntime.verifyScenePackageIntegrity;
    vi.spyOn(sceneRuntime,'verifyScenePackageIntegrity').mockImplementation(pkg=>pkg.package.revision===next.revision?gate.promise:verify(pkg));
    const t=ownedChildren(),onStatus=vi.fn();
    const view=render(<SceneSurface source={first} sourceTime={2} width={640} height={360} onStatus={onStatus}/>);
    const old=await t.mounted(view.container);
    expect(old).toHaveStyle({visibility:'hidden'});t.initialize(old);t.ready(old);
    expect(old).toHaveStyle({visibility:'visible'});
    view.rerender(<SceneSurface source={next} sourceTime={4} width={640} height={360} onStatus={onStatus}/>);
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);
    expect(view.container.querySelector('iframe')).toBe(old);
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',first.revision);
    expect(view.container.firstChild).toHaveAttribute('data-desired-revision',next.revision);
    expect(view.container.firstChild).toHaveAttribute('data-source-time','2.000');
    expect(view.container.firstChild).toHaveAttribute('data-phase','loading');
    await act(async()=>gate.resolve());
    await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const candidate=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    expect(old).toHaveStyle({visibility:'visible'});expect(candidate).toHaveStyle({visibility:'hidden'});
    t.initialize(candidate);
    const hellos=t.messages(candidate).filter(m=>m.kind==='initialize').length;
    expect(view.container.firstChild).toHaveAttribute('data-phase','rendering');
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(old);
    t.ready(candidate);
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);
    expect(view.container.querySelector('iframe')).toBe(candidate);
    expect(candidate).toHaveStyle({visibility:'visible'});expect(old.isConnected).toBe(false);
    expect(t.messages(candidate).filter(m=>m.kind==='initialize')).toHaveLength(hellos);
    expect(t.messages(candidate).filter(m=>m.kind==='render')).toHaveLength(1);
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',next.revision);
    expect(view.container.firstChild).toHaveAttribute('data-source-time','4.000');
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({phase:'ready',revision:next.revision,sourceTime:4}));
  });

  it('preserves the displayed document on integrity, structural and initialization errors, then repairs',async()=>{
    const first=await makeSource(),broken=await makeSource({html:'<html><head></head><body>aaaa</body></html>'});
    const repaired=await makeSource({html:'<html><head></head><body>repaired</body></html>'});
    const t=ownedChildren(),onStatus=vi.fn();
    const show=(source:unknown)=><SceneSurface source={source} sourceTime={3} width={10} height={10} onStatus={onStatus}/>;
    const view=render(show(first));
    const old=await t.mounted(view.container);t.initialize(old);t.ready(old);
    view.rerender(show({...broken,html:broken.html.replace('aaaa','bbbb')}));
    await waitFor(()=>expect(view.container.firstChild).toHaveTextContent('Scene entry digest mismatch'));
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);
    expect(view.container.querySelector('iframe')).toBe(old);expect(old).toHaveStyle({visibility:'visible'});
    view.rerender(show({revision:'bad'}));
    expect(view.container.firstChild).toHaveTextContent('Missing scene source/revision');
    expect(view.container.querySelector('iframe')).toBe(old);
    view.rerender(show(broken));
    await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const failed=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    t.ack(failed,{kind:'error',error:'broken initialization'});
    expect(failed.isConnected).toBe(false);
    expect(view.container.querySelector('iframe')).toBe(old);expect(old).toHaveStyle({visibility:'visible'});
    expect(view.container.firstChild).toHaveAttribute('data-phase','error');
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',first.revision);
    expect(view.container.firstChild).toHaveTextContent('broken initialization');
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({phase:'error',revision:broken.revision,error:'broken initialization'}));
    t.initialize(failed);t.ack(failed,{kind:'frame',requestId:1,sourceTime:3});
    expect(view.container.firstChild).toHaveAttribute('data-phase','error');
    view.rerender(show(repaired));
    await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const repair=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    t.initialize(repair);t.ready(repair);
    expect(view.container.querySelector('iframe')).toBe(repair);
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',repaired.revision);
    expect(view.container.firstChild).not.toHaveTextContent('broken initialization');
  });

  it('does not promote a candidate until readiness matches the latest seek and viewport',async()=>{
    const first=await makeSource(),next=await makeSource({html:'<html><head></head><body>next</body></html>'});
    const t=ownedChildren();
    const view=render(<SceneSurface source={first} sourceTime={8} width={10} height={10}/>);
    const old=await t.mounted(view.container);t.initialize(old);t.ready(old);
    view.rerender(<SceneSurface source={next} sourceTime={8} width={10} height={10}/>);
    await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const candidate=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    t.initialize(candidate);const obsolete=t.messages(candidate).at(-1)!;
    view.rerender(<SceneSurface source={next} sourceTime={2} width={20} height={15}/>);
    t.ack(candidate,{...obsolete,kind:'frame'});
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(old);
    expect(candidate).toHaveStyle({visibility:'hidden'});
    expect(t.messages(candidate).at(-1)).toMatchObject({kind:'render',sourceTime:2,width:20,height:15,requestId:2});
    const beforeResize=t.messages(candidate).at(-1)!;
    view.rerender(<SceneSurface source={next} sourceTime={2} width={25} height={15}/>);
    t.ack(candidate,{...beforeResize,kind:'frame'});
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(old);
    expect(t.messages(candidate).at(-1)).toMatchObject({kind:'render',sourceTime:2,width:25,height:15,requestId:3});
    t.ready(candidate);
    expect(view.container.querySelector('iframe')).toBe(candidate);
    expect(view.container.firstChild).toHaveAttribute('data-source-time','2.000');
  });

  it.each(['resolve','reject'] as const)('fences an obsolete integrity %s after the newest revision is ready',async(completion)=>{
    const first=await makeSource(),slow=await makeSource({html:'<html><head></head><body>slow</body></html>'});
    const newest=await makeSource({html:'<html><head></head><body>newest</body></html>'});
    const gate=deferred<void>(),verify=sceneRuntime.verifyScenePackageIntegrity;
    vi.spyOn(sceneRuntime,'verifyScenePackageIntegrity').mockImplementation(pkg=>pkg.package.revision===slow.revision?gate.promise:verify(pkg));
    const t=ownedChildren(),onStatus=vi.fn();
    const show=(source:unknown)=><SceneSurface source={source} sourceTime={1} width={10} height={10} onStatus={onStatus}/>;
    const view=render(show(first));
    const old=await t.mounted(view.container);t.initialize(old);t.ready(old);
    view.rerender(show(slow));view.rerender(show(newest));
    await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const next=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    t.initialize(next);t.ready(next);const count=onStatus.mock.calls.length;
    await act(async()=>completion==='resolve'?gate.resolve():gate.reject(Error('obsolete integrity failure')));
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);expect(view.container.querySelector('iframe')).toBe(next);
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',newest.revision);
    expect(view.container.firstChild).toHaveAttribute('data-phase','ready');expect(onStatus).toHaveBeenCalledTimes(count);
  });

  it('cleans abandoned hosts and rejects their late frames without disposing the displayed host',async()=>{
    const first=await makeSource(),slow=await makeSource({html:'<html><head></head><body>slow</body></html>'});
    const newest=await makeSource({html:'<html><head></head><body>newest</body></html>'});
    const t=ownedChildren(),onStatus=vi.fn();
    const dispose=vi.spyOn(sceneRuntime.SceneFrameHost.prototype,'dispose');
    const show=(source:unknown)=><SceneSurface source={source} sourceTime={1} width={10} height={10} onStatus={onStatus}/>;
    const view=render(show(first));
    const old=await t.mounted(view.container);t.initialize(old);t.ready(old);
    view.rerender(show(slow));await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    const abandoned=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    t.initialize(abandoned);const late=t.messages(abandoned).at(-1)!;
    view.rerender(show(newest));await waitFor(()=>expect(view.container.querySelectorAll('iframe')).toHaveLength(2));
    expect(abandoned.isConnected).toBe(false);expect(old.isConnected).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);expect(dispose.mock.instances[0]).toEqual(expect.objectContaining({instance:late.instance}));
    const next=await t.mounted(view.container,'iframe[data-scene-role="candidate"]');
    const count=onStatus.mock.calls.length;
    t.ack(abandoned,{...late,kind:'frame'});t.ack(abandoned,{kind:'error',error:'obsolete error'});
    expect(onStatus).toHaveBeenCalledTimes(count);
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(old);
    t.initialize(next);t.ready(next);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose.mock.instances[1]).toEqual(expect.objectContaining({instance:t.messages(old)[0].instance}));
    const adopted=onStatus.mock.calls.length;
    t.ack(abandoned,{...late,kind:'frame'});t.ack(abandoned,{kind:'error',error:'late after adoption'});
    expect(onStatus).toHaveBeenCalledTimes(adopted);
    expect(view.container.firstChild).toHaveAttribute('data-displayed-revision',newest.revision);
    expect(view.container.firstChild).toHaveAttribute('data-phase','ready');
    view.unmount();expect(dispose).toHaveBeenCalledTimes(3);
  });

  it('clears candidate deadlines/retries and listeners on supersession and unmount',async()=>{
    const first=await makeSource(),slow=await makeSource({html:'<html><head></head><body>slow</body></html>'});
    const newest=await makeSource({html:'<html><head></head><body>newest</body></html>'});
    vi.spyOn(sceneRuntime,'verifyScenePackageIntegrity').mockResolvedValue();
    vi.useFakeTimers();
    const t=ownedChildren(),onStatus=vi.fn();
    const add=vi.spyOn(window,'addEventListener'),remove=vi.spyOn(window,'removeEventListener');
    const show=(source:unknown)=><SceneSurface source={source} sourceTime={1} width={10} height={10} onStatus={onStatus}/>;
    let view!:ReturnType<typeof render>;
    await act(async()=>{view=render(show(first));});
    const old=view.container.querySelector('iframe')!;t.initialize(old);t.ready(old);
    expect(vi.getTimerCount()).toBe(0);
    await act(async()=>view.rerender(show(slow)));
    const abandoned=view.container.querySelector<HTMLIFrameElement>('iframe[data-scene-role="candidate"]')!;
    expect(vi.getTimerCount()).toBe(2); // initialization deadline and retry
    await act(async()=>view.rerender(show(newest)));
    expect(vi.getTimerCount()).toBe(2); // only the newest candidate's timers
    const messages=t.messages(abandoned).length;
    act(()=>vi.advanceTimersByTime(500));
    expect(t.messages(abandoned)).toHaveLength(messages);
    expect(view.container.querySelector('iframe[data-scene-role="displayed"]')).toBe(old);
    const count=onStatus.mock.calls.length;
    view.unmount();expect(vi.getTimerCount()).toBe(0);
    act(()=>vi.advanceTimersByTime(31000));
    t.initialize(abandoned);expect(onStatus).toHaveBeenCalledTimes(count);
    const installed=add.mock.calls.filter(([name])=>name==='message').map(([,listener])=>listener);
    const removed=remove.mock.calls.filter(([name])=>name==='message').map(([,listener])=>listener);
    expect(installed).toHaveLength(3);expect(removed).toHaveLength(3);
    expect(new Set(removed)).toEqual(new Set(installed));
  });
});
