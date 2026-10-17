import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipEffectsTab } from './ClipEffectsTab';
import {VideoEditorRuntimeContext} from '../../contexts/VideoEditorRuntimeContext';

const panelLifecycle = vi.hoisted(() => ({
  evaluated: 0,
  mounted: 0,
  unmounted: 0,
}));

vi.mock('@/tools/video-editor/components/EffectCreatorPanel.tsx', async () => {
  panelLifecycle.evaluated += 1;
  const { useEffect } = await import('react');

  return {
    EffectCreatorPanel: ({
      open,
      onOpenChange,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => {
      useEffect(() => {
        panelLifecycle.mounted += 1;
        return () => {
          panelLifecycle.unmounted += 1;
        };
      }, []);

      return (
        <div data-testid="effect-creator-panel" data-open={open}>
          <button type="button" onClick={() => onOpenChange(false)}>Close creator</button>
        </div>
      );
    },
  };
});

vi.mock('./ClipEntranceEffectField.tsx', () => ({ ClipEntranceEffectField: () => null }));
vi.mock('./ClipExitEffectField.tsx', () => ({ ClipExitEffectField: () => null }));
vi.mock('./ClipContinuousEffectField.tsx', () => ({ ClipContinuousEffectField: () => null }));
vi.mock('./ClipShaderSection.tsx', () => ({ ClipShaderSection: () => null }));
vi.mock('./ClipTransitionSection.tsx', () => ({ ClipTransitionSection: () => null }));

function Harness() {
  const [creatorOpen, setCreatorOpen] = useState(false);

  return (
    <ClipEffectsTab
      clip={{ assetEntry: undefined } as never}
      onChange={vi.fn()}
      effectResources={{ canCreateEffect: true, canUpdateEffect: true } as never}
      clipDescriptor={undefined}
      clipTypeResolution={{ status: 'unavailable' } as never}
      isEffectLayer={false}
      isSequenceClip={false}
      registry={undefined as never}
      currentTime={0}
      creatorOpen={creatorOpen}
      setCreatorOpen={setCreatorOpen}
      editingEffect={null}
      setEditingEffect={vi.fn()}
    />
  );
}

describe('ClipEffectsTab effect creator loading', () => {
  beforeEach(() => {
    panelLifecycle.evaluated = 0;
    panelLifecycle.mounted = 0;
    panelLifecycle.unmounted = 0;
  });

  it('defers the panel until first open and keeps it mounted across close/reopen', async () => {
    render(<Harness />);

    expect(panelLifecycle.evaluated).toBe(0);
    expect(screen.queryByTestId('effect-creator-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Effect' }));

    await waitFor(() => {
      expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'true');
    });
    expect(panelLifecycle.evaluated).toBe(1);
    expect(panelLifecycle.mounted).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close creator' }));
    expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'false');
    expect(panelLifecycle.unmounted).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Create Effect' }));

    expect(screen.getByTestId('effect-creator-panel')).toHaveAttribute('data-open', 'true');
    expect(panelLifecycle.evaluated).toBe(1);
    expect(panelLifecycle.mounted).toBe(1);
    expect(panelLifecycle.unmounted).toBe(0);
  });
});

function renderUnavailableClipEffects(isClipTypeRegistered: boolean) {
  const props = {
    clip: { id: 'scene-1', clipType: 'haus.astrid.livescene' },
    onChange: vi.fn(),
    effectResources: {},
    clipDescriptor: undefined,
    isClipTypeRegistered,
    clipTypeResolution: { status: 'unknown', clipType: 'haus.astrid.livescene' },
    isEffectLayer: false,
    isSequenceClip: false,
    registry: {},
    currentTime: 0,
    creatorOpen: false,
    setCreatorOpen: vi.fn(),
    editingEffect: null,
    setEditingEffect: vi.fn(),
  } as unknown as ComponentProps<typeof ClipEffectsTab>;

  return render(<ClipEffectsTab {...props} />);
}

describe('ClipEffectsTab unavailable clip state', () => {
  it('uses a neutral message for a registered extension clip without built-in effect controls', () => {
    renderUnavailableClipEffects(true);

    expect(screen.getByText('This clip type has no built-in effect controls.')).toBeInTheDocument();
    expect(screen.queryByText(/not available in this editor build/i)).not.toBeInTheDocument();
  });

  it('keeps an availability warning for a clip type with no editor registration', () => {
    renderUnavailableClipEffects(false);

    expect(screen.getByText('haus.astrid.livescene is not available in this editor build.')).toBeInTheDocument();
  });
});


describe('saved generated element inspector', () => {
  const props = () => ({
    clip: { id: 'tile', clipType: 'thirty-block-reveal', elementRef: { id: 'thirty-block-reveal', kind: 'effect', revision: 'draft-thirty-block-reveal' }, params: {seed: 7} },
    elementRegistry: { elements: { 'thirty-block-reveal': { kind: 'effect', revision: 'draft-thirty-block-reveal', label: 'Thirty Block Reveal', source: 'export default function Tiles() { return <div />; }', schema: [{ name: 'seed', label: 'Seed', type: 'number', default: 7 }] } } },
    onChange: vi.fn(), effectResources: {}, clipTypeResolution: {status: 'unavailable'}, isEffectLayer: false, isSequenceClip: false, registry: {}, currentTime: 0, creatorOpen: false, setCreatorOpen: vi.fn(), editingEffect: null, setEditingEffect: vi.fn(),
  } as unknown as ComponentProps<typeof ClipEffectsTab>);
  it('preserves legacy source as migration data without offering executable inline controls', () => {
    const p = props(); render(<ClipEffectsTab {...p} />);
    expect(screen.getByTestId('legacy-element-migration')).toHaveClass('text-foreground', 'bg-card', 'border-border');
    expect(screen.getByText(/needs migration to a pack/)).toBeInTheDocument();
    expect(screen.queryByRole('slider', {name: /Seed/})).not.toBeInTheDocument();
    expect(screen.queryByText(/not available in this editor build/)).not.toBeInTheDocument();
  });
  it.each(['revision', 'kind', 'packId'])('keeps readable unavailable feedback for a mismatched %s', (field) => {
    const p = props(); const registry = p.elementRegistry as any;
    registry.elements['thirty-block-reveal'][field] = 'wrong';
    render(<ClipEffectsTab {...p} />);
    expect(screen.getByText('thirty-block-reveal is not available in this editor build.')).toHaveClass('text-foreground', 'bg-muted/50', 'border-border');
    expect(screen.queryByTestId('generated-element-params')).not.toBeInTheDocument();
  });
});


describe('exact admitted pack effects without legacy clip-type registration',()=>{
  const ref={id:'thirty-block-reveal',kind:'effect' as const,packId:'project_fixture',revision:'sha256:exact'};
  const props={clip:{id:'tile',track:'V1',clipType:ref.id,elementRef:ref},onChange:vi.fn(),effectResources:{},clipTypeResolution:{status:'unavailable'},isEffectLayer:false,isSequenceClip:false,registry:{},currentTime:0,creatorOpen:false,setCreatorOpen:vi.fn(),editingEffect:null,setEditingEffect:vi.fn()} as unknown as ComponentProps<typeof ClipEffectsTab>;
  it.each(['available','wrong-owner','wrong-revision','missing-component'])('reports %s from the exact executable host, independently of editable schema',mode=>{
    const descriptor={...ref,componentPath:'external/fixture.tsx',...(mode==='wrong-owner'?{packId:'other'}:{}),...(mode==='wrong-revision'?{revision:'old'}:{})};
    const resolveComponent=vi.fn(()=>mode==='missing-component'?undefined:()=>null);
    render(<VideoEditorRuntimeContext.Provider value={{astridElementHost:{descriptors:[descriptor],resolveComponent}} as never}><ClipEffectsTab {...props} hasActiveAstridElementParams/></VideoEditorRuntimeContext.Provider>);
    if(mode==='available'){
      expect(screen.queryByText(/not available in this editor build/)).not.toBeInTheDocument();
      expect(resolveComponent).toHaveBeenCalledWith(ref.id,ref.kind,ref.packId,ref.revision);
    }else expect(screen.getByText(ref.id+' is not available in this editor build.')).toBeInTheDocument();
  });
});
