import { describe, expect, it, vi } from 'vitest';

import {
  AstridCapabilityBindingError,
  AstridLocalCatalogRoutes,
} from './catalogRoutes';
import type { AstridBridgeTransport } from './transport';
import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract';

function capability(overrides: Partial<RuntimeCapability> = {}): RuntimeCapability {
  return {
    capability_id: 'astrid.image_generation',
    definition_digest: `sha256:${'a'.repeat(64)}`,
    status: 'ready',
    required_resource_keys: [],
    estimated_scratch_bytes: 0,
    estimated_output_bytes: 0,
    ...overrides,
  };
}

function catalog(pages: Array<{ items: RuntimeCapability[]; next_cursor: string | null }>) {
  let pageIndex = 0;
  const requestJson = vi.fn(async () => pages[Math.min(pageIndex++, pages.length - 1)]);
  return {
    routes: new AstridLocalCatalogRoutes({ requestJson } as unknown as AstridBridgeTransport),
    requestJson,
  };
}

describe('Astrid capability catalog binding', () => {
  it('rejects a non-ready capability before a producer can admit', async () => {
    const { routes, requestJson } = catalog([{
      items: [capability({ status: 'unavailable', unavailable_reason: 'model_missing' })],
      next_cursor: null,
    }]);

    await expect(routes.get('astrid.image_generation'))
      .rejects.toThrow('capability is not ready');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate capability IDs across catalog pages', async () => {
    const first = capability();
    const { routes, requestJson } = catalog([
      { items: [first], next_cursor: 'page-2' },
      { items: [first], next_cursor: null },
    ]);

    await expect(routes.get(first.capability_id))
      .rejects.toThrow('duplicate ID');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects a catalog cursor cycle before returning a capability', async () => {
    const { routes, requestJson } = catalog([
      { items: [capability()], next_cursor: 'page-2' },
      { items: [], next_cursor: 'page-2' },
    ]);

    const error = await routes.get('missing.capability').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AstridCapabilityBindingError);
    expect(error).toMatchObject({ message: 'capability catalog cursor cycle detected' });
    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
