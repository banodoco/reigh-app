import { beforeEach, describe, expect, it } from 'vitest';
import {
  getStorageItem,
  removeStorageItem,
  removeStorageItems,
  setStorageItem,
} from './storage';

describe('auth storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null for missing values', () => {
    expect(getStorageItem('missing-key', 'auth.storage.read')).toBeNull();
  });

  it('stores and retrieves string values', () => {
    setStorageItem('session-key', 'session-value', 'auth.storage.write');

    expect(getStorageItem('session-key', 'auth.storage.read')).toBe('session-value');
  });

  it('removes a single key', () => {
    setStorageItem('single-remove', 'x', 'auth.storage.write');

    removeStorageItem('single-remove', 'auth.storage.remove');

    expect(getStorageItem('single-remove', 'auth.storage.read')).toBeNull();
  });

  it('removes multiple keys and leaves unrelated keys untouched', () => {
    setStorageItem('k1', 'v1', 'auth.storage.write');
    setStorageItem('k2', 'v2', 'auth.storage.write');
    setStorageItem('k3', 'v3', 'auth.storage.write');

    removeStorageItems(['k1', 'k2'], 'auth.storage.removeMany');

    expect(getStorageItem('k1', 'auth.storage.read')).toBeNull();
    expect(getStorageItem('k2', 'auth.storage.read')).toBeNull();
    expect(getStorageItem('k3', 'auth.storage.read')).toBe('v3');
  });
});
