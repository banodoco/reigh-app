import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { registerExportsForReactRefresh, validateRefreshBoundaryAndEnqueueUpdate } from '@test-react-refresh';
import { ClipTypeRegistryProvider, useClipTypeRegistryContext } from '../clip-types/ClipTypeRegistryContext';
import { EffectRegistryProvider, useEffectRegistryContext } from '../effects/registry/EffectRegistryContext';
import { TransitionRegistryProvider, useTransitionRegistryContext } from '../transitions/registry/TransitionRegistryContext';
import { ShaderEffectRegistryProvider, useShaderEffectRegistryContext } from '../shaders/registry/ShaderEffectRegistryContext';
import { DataKindRegistryProvider, useDataKindRegistryContext } from '../data-kinds/DataKindRegistryContext';
import { createDataKindRegistry } from '../data-kinds/DataKindRegistry';

const renderability = {
  defaultRoute: 'preview', determinism: 'preview-only',
  capabilities: [{ route: 'preview', status: 'supported', determinism: 'preview-only' }],
} as const;
const renderer = () => null;

function Providers({ children }: { children: ReactNode }) {
  return <ClipTypeRegistryProvider><EffectRegistryProvider><TransitionRegistryProvider><ShaderEffectRegistryProvider><DataKindRegistryProvider>{children}</DataKindRegistryProvider></ShaderEffectRegistryProvider></TransitionRegistryProvider></EffectRegistryProvider></ClipTypeRegistryProvider>;
}

function useRegistries() {
  return {
    clip: useClipTypeRegistryContext(),
    effect: useEffectRegistryContext(),
    transition: useTransitionRegistryContext(),
    shader: useShaderEffectRegistryContext(),
    data: useDataKindRegistryContext(),
  };
}

describe('registry provider resource lifetimes', () => {
  it('registers all five families during replay, preserves reactive subscriptions, isolates owners, and disposes once on real unmount', async () => {
    let latest!: ReturnType<typeof useRegistries>;
    let other!: ReturnType<typeof useRegistries>;
    const release = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const registrations = vi.fn();
    function Register() {
      latest = useRegistries();
      const { clip, effect, transition, shader, data } = latest;
      useEffect(() => {
        registrations();
        const base = { ownerExtensionId: 'lifetime.owner', contributionId: 'lifetime.record', status: 'active' as const, renderability };
        const handles = [
          clip.registry.register({ ...base, clipTypeId: 'lifetime.clip', renderer, dispose: release[0] }),
          effect.registry.register({ ...base, effectId: 'lifetime.effect', component: renderer, provenance: 'trusted-loader', dispose: release[1] }),
          transition.registry.register({ ...base, transitionId: 'lifetime.transition', renderer, provenance: 'bundled-extension', dispose: release[2] }),
          shader.registry.register({ ...base, shaderId: 'lifetime.shader', source: { kind: 'inline', fragment: 'void main() { gl_FragColor = vec4(1.0); }' }, pass: 'postprocess', provenance: 'trusted-loader', dispose: release[3] }),
          data.registry.register({ ...base, kindId: 'lifetime.data', schemaRef: 'lifetime/v1', shape: 'interval', domain: 'source_seconds', laneRenderer: renderer, provenance: 'bundled-extension', dispose: release[4] }),
        ];
        return () => handles.forEach(handle => handle.dispose());
      }, [clip.registry, effect.registry, transition.registry, shader.registry, data.registry]);
      return null;
    }
    function Other() { other = useRegistries(); return null; }
    const view = render(<StrictMode><Providers><Register /></Providers><Providers><Other /></Providers></StrictMode>);
    await act(async () => {});
    expect(registrations).toHaveBeenCalledTimes(2);
    const registries = Object.values(latest).map(value => value.registry);
    const disposed = registries.map(registry => vi.spyOn(registry, 'dispose'));
    Object.values(latest).forEach(value => {
      expect(value.snapshot.records).toHaveLength(1);
      expect(value.snapshot.diagnostics.some(diagnostic => diagnostic.code.endsWith('/disposed'))).toBe(false);
    });
    Object.values(other).forEach(value => expect(value.snapshot.records).toHaveLength(0));
    act(() => latest.clip.registry.unregisterOwner('lifetime.owner'));
    expect(latest.clip.snapshot.records).toHaveLength(0);
    expect(latest.effect.snapshot.records).toHaveLength(1);
    view.unmount();
    await act(async () => {});
    disposed.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
    release.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(2));
    registries.forEach(registry => expect(registry.getSnapshot().records).toHaveLength(0));
  });

  it('preserves state-held registry identities when the registry provider families themselves Fast Refresh', async () => {
    const providers = { ClipTypeRegistryProvider, EffectRegistryProvider, TransitionRegistryProvider, ShaderEffectRegistryProvider, DataKindRegistryProvider };
    for (const [name, provider] of Object.entries(providers)) registerExportsForReactRefresh(`lifetime-${name}`, { [name]: provider });
    let latest!: ReturnType<typeof useRegistries>;
    function Capture() { latest = useRegistries(); return null; }
    const view = render(<Providers><Capture /></Providers>);
    const before = Object.values(latest).map(value => value.registry);
    await act(async () => {
      for (const [name, provider] of Object.entries(providers)) {
        function RefreshedProvider(props: { children: ReactNode }) { return provider(props); }
        const next = { [name]: RefreshedProvider };
        registerExportsForReactRefresh(`lifetime-${name}`, next);
        expect(validateRefreshBoundaryAndEnqueueUpdate(`lifetime-${name}`, { [name]: provider }, next)).toBeUndefined();
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    Object.values(latest).forEach((value, index) => expect(value.registry).toBe(before[index]));
    act(() => latest.clip.registry.register({ clipTypeId: 'after-refresh', contributionId: 'after-refresh', ownerExtensionId: 'owner', renderer, status: 'active', renderability }));
    expect(latest.clip.snapshot.has('after-refresh')).toBe(true);
    view.unmount();
    await act(async () => {});
    expect(before[0].getSnapshot().records).toHaveLength(0);
  });

  it('leaves an injected data-kind registry with its owner after replay and provider unmount', async () => {
    const registry = createDataKindRegistry();
    const dispose = vi.spyOn(registry, 'dispose');
    const view = render(<StrictMode><DataKindRegistryProvider registry={registry}><div /></DataKindRegistryProvider></StrictMode>);
    view.unmount();
    await act(async () => {});
    expect(dispose).not.toHaveBeenCalled();
    registry.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
