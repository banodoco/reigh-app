export function whoAmI(): Promise<{ name: string }> {
  return Promise.resolve({ name: 'test-user' });
}

export function createRepo(): Promise<void> {
  return Promise.resolve();
}

export function uploadFile(): Promise<{ commit?: { oid: string } }> {
  return Promise.resolve({ commit: { oid: 'mock-commit' } });
}
