// @vitest-environment jsdom
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PropsWithChildren} from 'react';
import {ThreeTimelineComposition} from '@astrid/../remotion/src/ThreeTimelineComposition';

vi.mock('remotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('remotion')>();
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ width: 320, height: 180, fps: 30 }),
  };
});
vi.mock('@astrid/../remotion/node_modules/@remotion/three/dist/esm/index.mjs',()=>({ThreeCanvas:({children}:PropsWithChildren)=><div data-testid="text-canvas">{children}</div>}));
vi.mock('@astrid/../remotion/src/LiveSceneClip',()=>({LiveSceneClip:({sourceTime}:{sourceTime:number})=><div data-testid="scene-surface" data-source-time={sourceTime} />}));
beforeEach(()=>vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({measureText:()=>({width:10}),fillText:()=>{}} as unknown as CanvasRenderingContext2D));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Astrid existing composition scene boundary',()=>{
  const props = (clips: unknown[]) => ({timeline:{theme:'default',tracks:[{id:'v',kind:'visual',label:'v'}],clips},assets:{assets:{}}}) as Parameters<typeof ThreeTimelineComposition>[0];
  it('keeps the existing ThreeCanvas for empty and text-only timelines',()=>{
    const view=render(<ThreeTimelineComposition {...props([])} />);
    expect(screen.getByTestId('text-canvas')).toBeInTheDocument();
    view.rerender(<ThreeTimelineComposition {...props([{id:'text',clipType:'text',at:0,hold:1,track:'v',text:{content:'hi'}}])} />);
    expect(screen.getByTestId('text-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-surface')).not.toBeInTheDocument();
  });
  it('uses only the authored surface and exact source offset for a live scene',()=>{
    render(<ThreeTimelineComposition {...props([{id:'scene',clipType:'com.reigh.astrid.liveScene',at:0,from:59.0666666667,to:59.5666666667,track:'v',app:{liveScene:{revision:'pinned'}}}])} />);
    expect(screen.queryByTestId('text-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('scene-surface')).toHaveAttribute('data-source-time','59.0666666667');
  });
});
