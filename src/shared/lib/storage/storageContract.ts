import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from '@/shared/lib/storage/localStorageSafe';

type StorageParser = 'text' | 'json';

export interface StorageContract<T> {
  key: string;
  parser?: StorageParser;
  decode: (parsed: unknown) => T | null;
  migrate?: (parsed: unknown) => T | null;
}

interface ReadStorageContractOptions {
  context: string;
  clearOnInvalid?: boolean;
}

interface WriteStorageContractOptions {
  context: string;
}

function parseStoredValue(rawValue: string, parser: StorageParser, context: string, key: string): unknown | null {
  if (parser === 'text') {
    return rawValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      showToast: false,
      logData: { key, rawLength: rawValue.length },
    });
    return null;
  }
}

export function readStorageContract<T>(
  contract: StorageContract<T>,
  options: ReadStorageContractOptions,
): T | null {
  const { context, clearOnInvalid = false } = options;
  const parser = contract.parser ?? 'json';
  const rawValue = readLocalStorageItem(contract.key, { context, fallback: null });

  if (rawValue === null) {
    return null;
  }

  const parsedValue = parseStoredValue(rawValue, parser, context, contract.key);
  if (parsedValue === null) {
    if (clearOnInvalid) {
      clearStorageContract(contract, `${context}.clearInvalidJson`);
    }
    return null;
  }

  const decodedValue = contract.decode(parsedValue) ?? contract.migrate?.(parsedValue) ?? null;
  if (decodedValue !== null) {
    return decodedValue;
  }

  if (clearOnInvalid) {
    clearStorageContract(contract, `${context}.clearInvalidPayload`);
  }
  return null;
}

export function writeStorageContract<T>(
  contract: StorageContract<T>,
  value: T,
  options: WriteStorageContractOptions,
): void {
  const parser = contract.parser ?? 'json';
  const serializedValue = parser === 'text'
    ? String(value)
    : JSON.stringify(value);

  writeLocalStorageItem(contract.key, serializedValue, {
    context: options.context,
    fallback: undefined,
  });
}

export function clearStorageContract(
  contract: Pick<StorageContract<unknown>, 'key'>,
  context: string,
): void {
  removeLocalStorageItem(contract.key, { context, fallback: undefined });
}

export function createTextStorageContract(key: string): StorageContract<string> {
  return {
    key,
    parser: 'text',
    decode: (value) => (typeof value === 'string' ? value : null),
  };
}
