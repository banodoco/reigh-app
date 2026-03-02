import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageContract } from './storageContract';
import {
  clearStorageContract,
  createTextStorageContract,
  readStorageContract,
  writeStorageContract,
} from './storageContract';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
  readLocalStorageItem: vi.fn(),
  writeLocalStorageItem: vi.fn(),
  removeLocalStorageItem: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('@/shared/lib/storage/localStorageSafe', () => ({
  readLocalStorageItem: mocks.readLocalStorageItem,
  writeLocalStorageItem: mocks.writeLocalStorageItem,
  removeLocalStorageItem: mocks.removeLocalStorageItem,
}));

describe('storageContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when storage does not contain a value', () => {
    mocks.readLocalStorageItem.mockReturnValue(null);
    const contract: StorageContract<string> = {
      key: 'missing',
      decode: (value) => (typeof value === 'string' ? value : null),
    };

    const result = readStorageContract(contract, { context: 'storage.read' });

    expect(result).toBeNull();
    expect(mocks.readLocalStorageItem).toHaveBeenCalledWith('missing', {
      context: 'storage.read',
      fallback: null,
    });
    expect(mocks.removeLocalStorageItem).not.toHaveBeenCalled();
  });

  it('decodes json payloads', () => {
    mocks.readLocalStorageItem.mockReturnValue('{"value":"ok"}');
    const contract: StorageContract<string> = {
      key: 'json-key',
      decode: (value) => (
        typeof value === 'object' &&
        value !== null &&
        'value' in value &&
        typeof (value as { value?: unknown }).value === 'string'
          ? String((value as { value: unknown }).value)
          : null
      ),
    };

    const result = readStorageContract(contract, { context: 'storage.json' });

    expect(result).toBe('ok');
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('falls back to migrate when decode cannot handle parsed value', () => {
    mocks.readLocalStorageItem.mockReturnValue('{"legacy":"old"}');
    const contract: StorageContract<string> = {
      key: 'legacy-key',
      decode: () => null,
      migrate: (value) => (
        typeof value === 'object' &&
        value !== null &&
        'legacy' in value &&
        typeof (value as { legacy?: unknown }).legacy === 'string'
          ? String((value as { legacy: unknown }).legacy)
          : null
      ),
    };

    const result = readStorageContract(contract, { context: 'storage.migrate' });

    expect(result).toBe('old');
    expect(mocks.removeLocalStorageItem).not.toHaveBeenCalled();
  });

  it('clears invalid json payloads when clearOnInvalid is enabled', () => {
    mocks.readLocalStorageItem.mockReturnValue('{invalid-json');
    const contract: StorageContract<string> = {
      key: 'bad-json',
      decode: () => null,
    };

    const result = readStorageContract(contract, {
      context: 'storage.invalid-json',
      clearOnInvalid: true,
    });

    expect(result).toBeNull();
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'storage.invalid-json',
        showToast: false,
        logData: expect.objectContaining({
          key: 'bad-json',
        }),
      }),
    );
    expect(mocks.removeLocalStorageItem).toHaveBeenCalledWith('bad-json', {
      context: 'storage.invalid-json.clearInvalidJson',
      fallback: undefined,
    });
  });

  it('clears undecodable payloads when clearOnInvalid is enabled', () => {
    mocks.readLocalStorageItem.mockReturnValue('{"shape":"unknown"}');
    const contract: StorageContract<string> = {
      key: 'invalid-payload',
      decode: () => null,
      migrate: () => null,
    };

    const result = readStorageContract(contract, {
      context: 'storage.invalid-payload',
      clearOnInvalid: true,
    });

    expect(result).toBeNull();
    expect(mocks.removeLocalStorageItem).toHaveBeenCalledWith('invalid-payload', {
      context: 'storage.invalid-payload.clearInvalidPayload',
      fallback: undefined,
    });
  });

  it('writes and clears contracts using storage-safe wrappers', () => {
    const jsonContract: StorageContract<{ value: number }> = {
      key: 'json-write',
      decode: () => null,
    };

    writeStorageContract(jsonContract, { value: 42 }, { context: 'storage.write.json' });
    expect(mocks.writeLocalStorageItem).toHaveBeenCalledWith(
      'json-write',
      '{"value":42}',
      {
        context: 'storage.write.json',
        fallback: undefined,
      },
    );

    writeStorageContract(createTextStorageContract('text-write'), 'hello', {
      context: 'storage.write.text',
    });
    expect(mocks.writeLocalStorageItem).toHaveBeenCalledWith('text-write', 'hello', {
      context: 'storage.write.text',
      fallback: undefined,
    });

    clearStorageContract({ key: 'text-write' }, 'storage.clear');
    expect(mocks.removeLocalStorageItem).toHaveBeenCalledWith('text-write', {
      context: 'storage.clear',
      fallback: undefined,
    });
  });

  it('creates text contracts with string-only decode behavior', () => {
    const contract = createTextStorageContract('plain-text');

    expect(contract.key).toBe('plain-text');
    expect(contract.parser).toBe('text');
    expect(contract.decode('value')).toBe('value');
    expect(contract.decode(123)).toBeNull();
  });
});
