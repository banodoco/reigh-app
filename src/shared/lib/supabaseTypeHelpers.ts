import type { Json } from '@/integrations/supabase/types';

/**
 * Cast a value to Supabase's Json type.
 *
 * Supabase's generated `Json` type is a recursive union that doesn't align with
 * app-level interfaces (e.g., metadata objects, settings payloads). Every call site
 * was using `as unknown as Json` — this helper centralises that single unavoidable
 * boundary cast so grep can track it and the intent is explicit.
 */
export function toJson<T>(value: T): Json {
  return value as unknown as Json;
}
