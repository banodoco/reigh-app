type CreateClientImpl = (...args: unknown[]) => unknown;

let createClientImpl: CreateClientImpl = () => ({});

export function createClient(...args: unknown[]): unknown {
  return createClientImpl(...args);
}

export function __setCreateClientImpl(nextImpl: CreateClientImpl): void {
  createClientImpl = nextImpl;
}

export function __resetCreateClientImpl(): void {
  createClientImpl = () => ({});
}
