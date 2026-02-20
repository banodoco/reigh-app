import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Database, Json } from './types';
import * as supabaseTypesModule from './types';

describe('supabase generated types', () => {
  it('loads as a module', () => {
    expect(supabaseTypesModule).toBeDefined();
    expect(typeof supabaseTypesModule).toBe('object');
    expect(Object.keys(supabaseTypesModule).length).toBe(0);
  });

  it('keeps key table fields strongly typed', () => {
    type CreditsLedgerRow = Database['public']['Tables']['credits_ledger']['Row'];
    type CreditsLedgerInsert = Database['public']['Tables']['credits_ledger']['Insert'];

    expectTypeOf<CreditsLedgerRow['id']>().toEqualTypeOf<string>();
    expectTypeOf<CreditsLedgerRow['metadata']>().toEqualTypeOf<Json | null>();
    expectTypeOf<CreditsLedgerInsert['amount']>().toEqualTypeOf<number>();
    expectTypeOf<CreditsLedgerInsert['user_id']>().toEqualTypeOf<string>();
  });
});
