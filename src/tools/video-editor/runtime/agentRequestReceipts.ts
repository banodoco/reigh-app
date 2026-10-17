/** Only authenticated, completed session replay may supply these raw user messages.
 * Chunk assembly is by ACP messageId before this parser runs. Text is never an acknowledgement.
 */
export function acceptedReplayRequestIds(messages: Iterable<string>, projectId: string): string[] {
  const accepted = new Set<string>();
  for (const message of messages) {
    if (message.length > 2_000_000) continue;
    const opens = message.match(/<astrid_editor_context>/g) ?? [];
    const closes = message.match(/<\/astrid_editor_context>/g) ?? [];
    if (opens.length !== 1 || closes.length !== 1) continue;
    const match = /<astrid_editor_context>\s*([\s\S]*?)\s*<\/astrid_editor_context>/.exec(message);
    if (!match) continue;
    try {
      const context = JSON.parse(match[1]);
      if (context?.schema !== 'astrid.editor-context/v1' || context.project?.id !== projectId
        || context.editor?.tool !== 'video-editor' || typeof context.context_revision !== 'string'
        || typeof context.captured_at !== 'string' || typeof context.request_id !== 'string'
        || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(context.request_id)) continue;
      accepted.add(context.request_id);
    } catch { /* An incomplete or malformed context cannot acknowledge delivery. */ }
  }
  return [...accepted];
}
