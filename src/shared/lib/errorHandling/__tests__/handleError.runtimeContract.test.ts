import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  emitErrorNotification,
  getErrorNotifierState,
  installErrorNotifier,
  resetErrorNotifierForTests,
} from '@/shared/lib/errorHandling/errorNotifier';

describe('error notifier runtime contract', () => {
  afterEach(() => {
    resetErrorNotifierForTests();
  });

  it('allows idempotent re-registration with the same owner', () => {
    const notifier = vi.fn();
    installErrorNotifier(notifier, 'app-bootstrap');

    expect(() => installErrorNotifier(notifier, 'app-bootstrap')).not.toThrow();
  });

  it('blocks competing owner registration once notifier owner is set', () => {
    const notifierA = vi.fn();
    const notifierB = vi.fn();

    installErrorNotifier(notifierA, 'app-bootstrap');
    installErrorNotifier(notifierB, 'feature-module');

    emitErrorNotification({
      appError: new Error('x') as never,
      title: 't',
      description: 'd',
    });
    expect(notifierA).toHaveBeenCalledTimes(1);
    expect(notifierB).not.toHaveBeenCalled();
  });

  it('allows re-registration after explicit reset', () => {
    const notifierB = vi.fn();
    installErrorNotifier(vi.fn(), 'app-bootstrap');
    resetErrorNotifierForTests();
    expect(() => installErrorNotifier(notifierB, 'feature-module')).not.toThrow();
  });

  it('exposes typed notifier readiness state', () => {
    expect(getErrorNotifierState()).toBe('unconfigured');

    installErrorNotifier(vi.fn(), 'app-bootstrap');
    expect(getErrorNotifierState()).toBe('configured');
  });
});
