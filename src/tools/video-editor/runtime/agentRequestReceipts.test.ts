import { describe, expect, it } from 'vitest';
import { acceptedReplayRequestIds } from './agentRequestReceipts';
const context = { schema: 'astrid.editor-context/v1', request_id: 'queue-id', project: { id: 'p' },
  editor: { tool: 'video-editor' }, context_revision: 'rev', captured_at: 'now' };
const wrap = (value: unknown) => `<astrid_editor_context>${JSON.stringify(value)}</astrid_editor_context>`;
describe('durable replay identity', () => {
  it('accepts only one complete generated context for the owned project, never prose or malformed/multiple contexts', () => {
    const raw = wrap(context);
    expect(acceptedReplayRequestIds([raw], 'p')).toEqual(['queue-id']);
    for (const content of ['queue-id same text answered', raw.slice(0, -3), raw + raw, wrap({ ...context, schema: 'other' }),
      wrap({ ...context, project: { id: 'other' } }), wrap({ ...context, request_id: '' }), '<astrid_editor_context>{broken}</astrid_editor_context>']) {
      expect(acceptedReplayRequestIds([content], 'p')).toEqual([]);
    }
  });
});
