import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  appendAcpAssistantDraft,
  appendAcpTextTurn,
  extractReighElementOperations,
  isTimelineAgentSessionsAvailable,
  stripReighEditorContext,
  useCancelSession,
  useCreateSession,
  useSendMessage,
} from './useAgentSession.ts';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('timeline agent ACP chat', () => {
  it('advertises the local Astrid ACP implementation', () => {
    expect(isTimelineAgentSessionsAvailable()).toBe(true);
  });

  it('keeps missing identifiers as input errors before contacting ACP', async () => {
    const create = renderHook(() => useCreateSession(null), { wrapper });
    await expect(act(async () => create.result.current.mutateAsync())).rejects.toThrow('timelineId is required');
    create.unmount();

    const send = renderHook(() => useSendMessage(null, 'timeline-1'), { wrapper });
    await expect(act(async () => send.result.current.mutateAsync({ message: 'hello' }))).rejects.toThrow('sessionId is required');
    send.unmount();

    const cancel = renderHook(() => useCancelSession(null), { wrapper });
    await expect(act(async () => cancel.result.current.mutateAsync())).rejects.toThrow('sessionId is required');
  });

  it('preserves ACP message boundaries when adjacent replies arrive', () => {
    const turns = [] as Parameters<typeof appendAcpTextTurn>[0];
    appendAcpTextTurn(turns, 'user', 'first', '2026-09-18T15:00:00.000Z', 'user-1');
    appendAcpTextTurn(turns, 'assistant', 'one', '2026-09-18T15:00:01.000Z', 'assistant-1');
    appendAcpTextTurn(turns, 'assistant', ' plus', '2026-09-18T15:00:01.100Z', 'assistant-1');
    appendAcpTextTurn(turns, 'user', 'second', '2026-09-18T15:00:02.000Z', 'user-2');
    appendAcpTextTurn(turns, 'assistant', 'two', '2026-09-18T15:00:03.000Z', 'assistant-2');

    expect(turns.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'one plus' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('keeps streamed assistant narration transient and starts a new final candidate at a new message boundary', () => {
    const preamble = appendAcpAssistantDraft(undefined, 'Checking the timeline…', 'assistant-1');
    expect(appendAcpAssistantDraft(preamble, ' reading the compact summary', 'assistant-1')).toEqual({
      content: 'Checking the timeline… reading the compact summary',
      messageId: 'assistant-1',
    });

    expect(appendAcpAssistantDraft(preamble, 'Done — moved the clip.', 'assistant-2')).toEqual({
      content: 'Done — moved the clip.',
      messageId: 'assistant-2',
    });
  });

  it('hides the model-only editor context from the rendered transcript', () => {
    expect(stripReighEditorContext('make the first clip start later\n\n<reigh_editor_context>\n{}\n</reigh_editor_context>'))
      .toBe('make the first clip start later');
    expect(stripReighEditorContext('<reigh_editor_context>\n{}\n</reigh_editor_context>')).toBe('');
    expect(stripReighEditorContext('make the first clip start later\n\nReigh editor context:\nTimeline ID: timeline-1'))
      .toBe('make the first clip start later');
  });

  it('extracts host-executable element operations without leaking markers into chat', () => {
    const result = extractReighElementOperations([
      'I will apply the effect.',
      '<reigh_element_operation>{"name":"elements.list"}</reigh_element_operation>',
      '<reigh_element_operation>{"name":"elements.validate","draft_id":"draft-glow"}</reigh_element_operation>',
    ].join('\n'));
    expect(result.visibleContent).toBe('I will apply the effect.');
    expect(result.operations).toEqual([
      { name: 'elements.list' },
      { name: 'elements.validate', draft_id: 'draft-glow' },
    ]);
    expect(result.parseErrors).toEqual([]);
  });

  it('reports malformed operation markers while preserving surrounding narration', () => {
    const result = extractReighElementOperations(
      'Done. <reigh_element_operation>{not json}</reigh_element_operation>',
    );
    expect(result.visibleContent).toBe('Done.');
    expect(result.operations).toEqual([]);
    expect(result.parseErrors).toHaveLength(1);
  });
});
