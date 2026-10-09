import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useOwnedResourceDisposal } from './useOwnedResourceDisposal';

it('cancels replay finalization and disposes real unmount exactly once', async () => {
  const resource = { dispose: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const view = renderHook(() => useOwnedResourceDisposal(resource, owned => owned.dispose()), { wrapper });
  await act(async () => {});
  expect(resource.dispose).not.toHaveBeenCalled();
  view.unmount();
  await act(async () => {});
  expect(resource.dispose).toHaveBeenCalledTimes(1);
});

it('finalizes replaced resources independently and cancels a pending finalizer if the same resource is reacquired', async () => {
  const first = { dispose: vi.fn() };
  const second = { dispose: vi.fn() };
  const view = renderHook(({ resource }) => useOwnedResourceDisposal(resource, owned => owned.dispose()), { initialProps: { resource: first } });
  view.rerender({ resource: second });
  view.rerender({ resource: first });
  await act(async () => {});
  expect(first.dispose).not.toHaveBeenCalled();
  expect(second.dispose).toHaveBeenCalledTimes(1);
  view.unmount();
  // A distinct mounted owner must survive the old owner's pending finalizer.
  const replacement = { dispose: vi.fn() };
  const next = renderHook(() => useOwnedResourceDisposal(replacement, owned => owned.dispose()));
  await act(async () => {});
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(replacement.dispose).not.toHaveBeenCalled();
  next.unmount();
  await act(async () => {});
  expect(replacement.dispose).toHaveBeenCalledTimes(1);
});
