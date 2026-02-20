export const creditQueryKeys = {
  balance: ['credits', 'balance'] as const,
  ledger: ['credits', 'ledger'] as const,
  all: ['credits'] as const,
  autoTopup: ['autoTopup'] as const,
  autoTopupPreferences: ['autoTopup', 'preferences'] as const,
} as const;
