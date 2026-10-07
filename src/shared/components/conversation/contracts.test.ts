import { describe, expect, it } from 'vitest';
import { buildConversationItems, type ConversationTurn } from './contracts.ts';

describe('buildConversationItems', () => {
  it('groups tool calls with their results and preserves message identity', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Make it quieter.', timestamp: '2026-09-27T10:00:00Z' },
      { role: 'tool_call', content: 'inspect', tool_name: 'inspect', timestamp: '2026-09-27T10:00:01Z' },
      { role: 'tool_result', content: 'ok', timestamp: '2026-09-27T10:00:02Z' },
      { role: 'assistant', content: 'Done.', timestamp: '2026-09-27T10:00:03Z' },
    ];

    expect(buildConversationItems(turns)).toEqual([
      { kind: 'message', key: '2026-09-27T10:00:00Z:user:0', turn: turns[0] },
      { kind: 'tool_group', key: 'tool-group:1', pairs: [{ call: turns[1], result: turns[2] }] },
      { kind: 'message', key: '2026-09-27T10:00:03Z:assistant:3', turn: turns[3] },
    ]);
  });

  it('does not mutate host-owned turns and suppresses duplicated assistant echoes', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Same text', timestamp: '2026-09-27T10:00:00Z' },
      { role: 'assistant', content: 'Same text', timestamp: '2026-09-27T10:00:01Z' },
    ];
    const snapshot = JSON.stringify(turns);

    expect(buildConversationItems(turns)).toHaveLength(1);
    expect(JSON.stringify(turns)).toBe(snapshot);
  });
});
