import {
  clearStorageContract,
  createTextStorageContract,
  readStorageContract,
  writeStorageContract,
} from '@/shared/lib/storage/storageContract';

export function getStorageItem(key: string, context: string): string | null {
  return readStorageContract(createTextStorageContract(key), { context, clearOnInvalid: true });
}

export function setStorageItem(
  key: string,
  value: string,
  context: string,
): void {
  writeStorageContract(createTextStorageContract(key), value, { context });
}

export function removeStorageItem(key: string, context: string): void {
  clearStorageContract({ key }, context);
}

export function removeStorageItems(
  keys: readonly string[],
  context: string,
): void {
  keys.forEach((key) => removeStorageItem(key, context));
}
