import type { AstridElementOperationResult } from './element-adapter';

const marker = /<astrid_element_operation>\s*([\s\S]*?)\s*<\/astrid_element_operation>/g;
export type ElementFeedbackScope = {sessionId: string; turnId: string; projectId: string; timelineId: string};

/** One ref-only operation batch and one receipt acknowledgement; never a source authoring loop. */
export async function runElementAcpRoundtrip(options: {
  content: string; scope: ElementFeedbackScope; signal: AbortSignal; checkCurrent(): void;
  adapter?: {execute(operation: unknown): Promise<AstridElementOperationResult>};
  followup(prompt: string): Promise<string>;
}): Promise<string> {
  const payloads: string[] = [];
  const narration = options.content.replace(marker, (_match, payload: string) => { payloads.push(payload); return ''; }).trim();
  if (!payloads.length) return narration;
  const receipts: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  let failed = false;
  for (const [index, payload] of payloads.slice(0, 8).entries()) {
    try {
      options.checkCurrent();
      if (options.signal.aborted) throw new Error('Element operation cancelled before execution');
      if (payloads.length > 8 || payload.length > 8192) throw new Error('Ref-only element operation batch exceeds limit; author code through project pack files');
      if (/<astrid_live_scene_request>/.test(options.content)) throw new Error('Do not mix live-scene and Elements operations');
      const operation = JSON.parse(payload);
      if (operation && ['source', 'code', 'schema'].some(field => field in operation)) throw new Error('Embedded element source is unsupported; edit and admit the project pack files');
      if (!options.adapter) throw new Error('This editor session has no Elements operation adapter');
      const result = await options.adapter.execute(operation);
      // Deliberately omit source/schema/full config/catalog from machine feedback.
      results.push({operationIndex: index, ok: true, operation: result.operation, config_version: result.config_version, head: result.head,
        ...(result.element ? {element: {id: result.element.id, kind: result.element.kind, packId: result.element.packId, revision: result.element.revision, authoring: result.element.authoring}} : {})});
      if (result.head) receipts.push(`Effect saved (timeline head ${result.head.headRevisionId}).`);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1024);
      results.push({operationIndex: index, ok: false, error: message});
      receipts.push(`Element operation failed: ${message}`); failed = true; break;
    }
  }
  if (options.signal.aborted) return receipts.join('\n\n');
  try {
    options.checkCurrent();
    const feedback = {schema: 'astrid.element-result/v1', scope: options.scope, results,
      instruction: 'Acknowledge only these actual receipts. Do not emit further operations. Source editing, validation and admission use ordinary project pack files and CLI commands. Only a returned saved head establishes a completed timeline edit.'};
    const acknowledgement = await options.followup(`<astrid_element_result>${JSON.stringify(feedback)}</astrid_element_result>`);
    // Acknowledgement cannot open another execution round or replace a failure with Done prose.
    const extra = /<astrid_(?:element_operation|live_scene_request)>/.test(acknowledgement);
    return [...receipts, !failed && !extra ? acknowledgement : '', extra ? 'Additional operations in the acknowledgement were not executed.' : ''].filter(Boolean).join('\n\n');
  } catch (error) {
    return [...receipts, `Element receipt acknowledgement could not be delivered: ${(error instanceof Error ? error.message : String(error)).slice(0,1024)}`].join('\n\n');
  }
}
