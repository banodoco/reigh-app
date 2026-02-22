export const creditQueryKeys = {
  balance: ['credits', 'balance'] as const,
  ledger: ['credits', 'ledger'] as const,
  ledgerPaginated: (limit: number, offset: number) => ['credits', 'ledger', limit, offset] as const,
  all: ['credits'] as const,
  autoTopup: ['autoTopup'] as const,
  autoTopupPreferences: ['autoTopup', 'preferences'] as const,
} as const;
