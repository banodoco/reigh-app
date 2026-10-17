import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHiddenShots } from '../useHiddenShots';

describe('useHiddenShots', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hides a shot, persists it, and keeps the returned API stable across noop rerenders', async () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | undefined }) => useHiddenShots(projectId),
      {
        initialProps: { projectId: 'project-a' },
      },
    );

    const initialApi = result.current;

    act(() => {
      result.current.hide('shot-1');
    });

    await waitFor(() => {
      expect(result.current.hiddenIds.has('shot-1')).toBe(true);
      expect(window.localStorage.getItem('astrid-hidden-shots:project-a')).toBe('["shot-1"]');
    });

    rerender({ projectId: 'project-a' });
    expect(result.current.isHidden('shot-1')).toBe(true);
    expect(result.current.hide).toBe(initialApi.hide);
    expect(result.current.unhide).toBe(initialApi.unhide);
    expect(result.current.toggle).toBe(initialApi.toggle);
  });

  it('unhides a shot and removes the stored project entry when the set becomes empty', async () => {
    window.localStorage.setItem('astrid-hidden-shots:project-a', '["shot-1"]');
    const { result } = renderHook(() => useHiddenShots('project-a'));

    await waitFor(() => {
      expect(result.current.isHidden('shot-1')).toBe(true);
    });

    act(() => {
      result.current.unhide('shot-1');
    });

    await waitFor(() => {
      expect(result.current.isHidden('shot-1')).toBe(false);
      expect(result.current.hiddenIds.size).toBe(0);
      expect(window.localStorage.getItem('astrid-hidden-shots:project-a')).toBeNull();
    });
  });

  it('keeps hidden ids isolated per project id', async () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | undefined }) => useHiddenShots(projectId),
      {
        initialProps: { projectId: 'project-a' },
      },
    );

    act(() => {
      result.current.hide('shot-a');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('astrid-hidden-shots:project-a')).toBe('["shot-a"]');
    });

    rerender({ projectId: 'project-b' });

    await waitFor(() => {
      expect(result.current.hiddenIds.size).toBe(0);
      expect(result.current.isHidden('shot-a')).toBe(false);
    });

    act(() => {
      result.current.hide('shot-b');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('astrid-hidden-shots:project-b')).toBe('["shot-b"]');
    });

    rerender({ projectId: 'project-a' });

    await waitFor(() => {
      expect(result.current.isHidden('shot-a')).toBe(true);
      expect(result.current.isHidden('shot-b')).toBe(false);
    });
  });

  it('returns an empty set for absent or malformed storage values and no-ops without a project id', async () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | undefined }) => useHiddenShots(projectId),
      {
        initialProps: { projectId: 'missing-project' },
      },
    );

    await waitFor(() => {
      expect(result.current.hiddenIds.size).toBe(0);
    });

    window.localStorage.setItem('astrid-hidden-shots:broken-project', '{not-json');
    rerender({ projectId: 'broken-project' });

    await waitFor(() => {
      expect(result.current.hiddenIds.size).toBe(0);
      expect(result.current.isHidden('shot-1')).toBe(false);
    });

    rerender({ projectId: undefined });

    act(() => {
      result.current.hide('shot-2');
      result.current.unhide('shot-2');
      result.current.toggle('shot-2');
    });

    expect(result.current.hiddenIds.size).toBe(0);
    expect(window.localStorage.getItem('astrid-hidden-shots:undefined')).toBeNull();
  });
});
