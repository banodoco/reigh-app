import {describe,it,expect,vi} from 'vitest';
import {runElementAcpRoundtrip} from './elementAcpRoundtrip';
const scope={sessionId:'session',turnId:'turn',projectId:'project',timelineId:'timeline'};
const block=(operation:unknown)=>`<astrid_element_operation>${JSON.stringify(operation)}</astrid_element_operation>`;
const options=()=>({scope,signal:new AbortController().signal,checkCurrent:vi.fn()});
describe('ref-only Elements receipt acknowledgement',()=>{
 it('returns one bounded actual saved-head receipt before completion prose, without source/config feedback',async()=>{
  const execute=vi.fn().mockResolvedValue({operation:'timeline.update_element',head:{projectId:'project',timelineId:'timeline',headRevisionId:'saved'},config_version:2,config:{app:{elements:{secret:{source:'WHOLE JSX SOURCE'}}}}});
  const followup=vi.fn().mockResolvedValue('Saved your controls.');
  const result=await runElementAcpRoundtrip({...options(),content:block({name:'timeline.update_element',clip_id:'existing',duration:6}),adapter:{execute},followup});
  expect(execute).toHaveBeenCalledOnce();expect(followup).toHaveBeenCalledOnce();expect(followup.mock.calls[0][0]).toContain('saved');expect(followup.mock.calls[0][0]).not.toContain('WHOLE JSX SOURCE');expect(result).toContain('Effect saved');expect(result).toContain('Saved your controls.');
 });
 it('rejects source authoring before the adapter and never turns a failure into Done',async()=>{
  const execute=vi.fn();const followup=vi.fn().mockResolvedValue('Done, applied!');
  const result=await runElementAcpRoundtrip({...options(),content:block({name:'elements.create_draft',source:'export default()=>null'}),adapter:{execute},followup});
  expect(execute).not.toHaveBeenCalled();expect(result).toContain('Embedded element source is unsupported');expect(result).not.toContain('Done');
 });
 it('does not open another authoring/execute round from the receipt acknowledgement',async()=>{
  const execute=vi.fn().mockResolvedValue({operation:'elements.list'});const followup=vi.fn().mockResolvedValue(block({name:'timeline.apply_element'}));
  const result=await runElementAcpRoundtrip({...options(),content:block({name:'elements.list'}),adapter:{execute},followup});
  expect(execute).toHaveBeenCalledOnce();expect(followup).toHaveBeenCalledOnce();expect(result).toContain('not executed');
 });
 it('stops dependent operations on an actual failure and rejects mixed authority before either executes',async()=>{
  const execute=vi.fn().mockRejectedValue(new Error('head CAS conflict'));const followup=vi.fn().mockResolvedValue('Done');
  const result=await runElementAcpRoundtrip({...options(),content:block({name:'first'})+block({name:'second'}),adapter:{execute},followup});
  expect(execute).toHaveBeenCalledOnce();expect(result).toContain('head CAS conflict');expect(result).not.toContain('Done');
  execute.mockClear();await runElementAcpRoundtrip({...options(),content:block({name:'elements.list'})+'<astrid_live_scene_request>{}</astrid_live_scene_request>',adapter:{execute},followup});expect(execute).not.toHaveBeenCalled();
 });
 it('preserves an acknowledged commit even if cancellation follows, without another prompt',async()=>{
  const controller=new AbortController();const execute=vi.fn(async()=>{controller.abort();return {operation:'timeline.update_element' as const,head:{projectId:'project',timelineId:'timeline',headRevisionId:'committed'}};});const followup=vi.fn();
  const result=await runElementAcpRoundtrip({...options(),signal:controller.signal,content:block({name:'timeline.update_element'}),adapter:{execute},followup});expect(result).toContain('committed');expect(followup).not.toHaveBeenCalled();
 });
 it('bounds payload/batch and respects retired or cancelled captures',async()=>{
  const execute=vi.fn(),followup=vi.fn().mockResolvedValue('');
  for(const content of [Array(9).fill(block({name:'elements.list'})).join(''),block({name:'elements.list',value:'x'.repeat(8193)})])await runElementAcpRoundtrip({...options(),content,adapter:{execute},followup});
  const controller=new AbortController();controller.abort();await runElementAcpRoundtrip({...options(),signal:controller.signal,content:block({name:'elements.list'}),adapter:{execute},followup});
  await runElementAcpRoundtrip({...options(),checkCurrent:()=>{throw new Error('retired');},content:block({name:'elements.list'}),adapter:{execute},followup});expect(execute).not.toHaveBeenCalled();
 });
});
