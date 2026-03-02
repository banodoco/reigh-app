import { describe, expect, it } from 'vitest';
import {
  SUPABASE_JS_KNOWN_ERROR_LINE,
  isKnownSupabaseSourceLine,
  isSupabaseRealtimeRelated,
  parsePhoenixMessage,
} from './eventCollectors';

describe('window event collectors', () => {
  it('detects known supabase source-line signatures', () => {
    expect(isKnownSupabaseSourceLine(
      'https://cdn.example.com/supabase-js.js',
      SUPABASE_JS_KNOWN_ERROR_LINE,
    )).toBe(true);
    expect(isKnownSupabaseSourceLine('https://cdn.example.com/other.js', 1)).toBe(false);
  });

  it('detects supabase/realtime related messages', () => {
    expect(isSupabaseRealtimeRelated('Realtime socket failed')).toBe(true);
    expect(isSupabaseRealtimeRelated('Totally unrelated')).toBe(false);
  });

  it('parses phoenix websocket payloads into lightweight event summaries', () => {
    const parsed = parsePhoenixMessage(JSON.stringify({
      event: 'phx_reply',
      topic: 'realtime:public:messages',
      ref: '42',
      payload: { status: 'ok' },
    }));

    expect(parsed).toEqual({
      event: 'phx_reply',
      topic: 'realtime:public:messages',
      ref: '42',
      payload: ['status'],
    });
    expect(parsePhoenixMessage('{invalid')).toBeNull();
  });
});
