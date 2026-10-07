export type ConversationAttachment = {
  clipId: string;
  url: string;
  mediaType: 'image' | 'video';
  isPlaceholder?: boolean;
  generationId?: string;
  assetKey?: string;
  shotId?: string;
  shotName?: string;
  shotSelectionClipCount?: number;
};

export type ConversationTurn = {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  attachments?: readonly ConversationAttachment[];
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  timestamp: string;
};

export type ConversationToolCallPair = {
  call: ConversationTurn;
  result: ConversationTurn | null;
};

export type ConversationItem =
  | { kind: 'message'; key: string; turn: ConversationTurn }
  | { kind: 'tool_group'; key: string; pairs: ConversationToolCallPair[] };

export type ConversationOptimisticMessage = {
  text: string;
  attachments: readonly ConversationAttachment[];
};

export function buildConversationItems(turns: readonly ConversationTurn[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  let pendingToolPairs: ConversationToolCallPair[] = [];
  let toolGroupStartIndex = 0;

  const flushToolGroup = () => {
    if (pendingToolPairs.length === 0) return;
    items.push({
      kind: 'tool_group',
      key: `tool-group:${toolGroupStartIndex}`,
      pairs: pendingToolPairs,
    });
    pendingToolPairs = [];
  };

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];

    if (turn.role === 'tool_result') continue;
    if (turn.role === 'tool_call') {
      const nextTurn = turns[index + 1];
      const pairedResult = nextTurn?.role === 'tool_result' ? nextTurn : null;
      if (pendingToolPairs.length === 0) toolGroupStartIndex = index;
      pendingToolPairs.push({ call: turn, result: pairedResult });
      if (pairedResult) index += 1;
      continue;
    }

    flushToolGroup();
    if (turn.role === 'assistant' && items.length > 0) {
      const previous = items[items.length - 1];
      if (previous.kind === 'message' && previous.turn.content === turn.content) continue;
    }
    items.push({ kind: 'message', key: `${turn.timestamp}:${turn.role}:${index}`, turn });
  }

  flushToolGroup();
  return items;
}
