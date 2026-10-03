// @vitest-environment jsdom
import {render, cleanup, act, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {SceneSurface} from '@astrid/packs/rendering/editor/live-scenes/SceneSurface';
import {sceneTrace, traceId} from '@astrid/packs/rendering/editor/live-scenes/diagnostics';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();document.getElementById('astrid-l1b-trace-ledger')?.remove();});
const records=()=>JSON.parse(document.getElementById('astrid-l1b-trace-ledger')!.textContent!);
async function sha256(bytes:Uint8Array):Promise<string>{
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return `sha256:${Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
async function makeSource(){
  const html='<html><head></head><body></body></html>';
  const htmlBytes=new TextEncoder().encode(html);
  const entry={object_id:'entry-object',digest:await sha256(htmlBytes),media_type:'text/html',size:htmlBytes.byteLength,filename:'scene.html'};
  const manifest={formatVersion:1 as const,entry:'scene.html',duration:100,authoredFps:30};
  const packageBody=JSON.stringify({manifest,entry,assets:[]});
  const revision=await sha256(new TextEncoder().encode(packageBody));
  return {revision,source:{objectId:'package-object',revision},packageBody,html,__l1bTrace:true as const};
}
it('gates the durable ledger and protects owner identity from message fields',()=>{
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  sceneTrace(false,{document:'owner'},'ignored');
  expect(document.getElementById('astrid-l1b-trace-ledger')).toBeNull();
  const object={};expect(traceId(object,'source')).toBe(traceId(object,'source'));
  const owner={document:'owner',revision:'r'};
  sceneTrace(true,owner,'received',{document:'attacker',revision:'other',message:{instance:'stale'}});
  owner.document='changed';
  expect(records().at(-1)).toMatchObject({owner:{document:'owner',revision:'r'},detail:{document:'attacker',revision:'other'}});
});
it('correlates same-revision document replacement and retains cleanup/child records',async()=>{
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  const messages:Record<string,unknown>[]=[];
  const child={postMessage:(message:Record<string,unknown>)=>messages.push(message)};
  vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockReturnValue(child as unknown as Window);
  const source=await makeSource();
  const view=render(<SceneSurface source={source} sourceTime={59.06666666666666} width={10} height={10}/>);
  await waitFor(()=>expect(messages.some(message=>message.kind==='initialize')).toBe(true));
  const old=messages[0];
  const oldIframe=view.container.querySelector('iframe')!;
  act(()=>window.dispatchEvent(new MessageEvent('message',{source:child as unknown as Window,data:{protocol:'astrid.scene/trace',record:{owner:{document:old.instance},stage:'child-listener-installed'}}})));
  view.rerender(<SceneSurface source={{...source}} sourceTime={59.06666666666666} width={10} height={10}/>);
  await waitFor(()=>expect(messages.filter(message=>message.kind==='initialize').length).toBeGreaterThan(1));
  const next=messages.filter(message=>message.kind==='initialize').at(-1)!;
  expect(next.instance).not.toBe(old.instance);expect(next.revision).toBe(old.revision);
  const nextIframe=view.container.querySelector('iframe')!;
  expect(nextIframe).not.toBe(oldIframe);
  act(()=>window.dispatchEvent(new MessageEvent('message',{source:child as unknown as Window,data:{...old,kind:'initialized'}})));
  expect(records().at(-1)).toMatchObject({owner:{document:next.instance},detail:{reason:'instance',message:{instance:old.instance}}});
  const setups=records().filter((r:any)=>r.stage==='parent-effect-setup').slice(-2);
  expect(setups[0].owner.source).not.toBe(setups[1].owner.source);
  expect(setups[0].owner.component).toBe(setups[1].owner.component);
  expect(setups[0].owner.iframe).not.toBe(setups[1].owner.iframe);
  expect(setups[0].owner.host).not.toBe(setups[1].owner.host);
  view.unmount();
  expect(records().some((r:any)=>r.stage==='child-record')).toBe(true);
  expect(records().at(-1).stage).toBe('parent-listener-removed');
});
