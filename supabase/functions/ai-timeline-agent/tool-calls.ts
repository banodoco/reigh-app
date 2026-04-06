import {
  extractAssistantText,
  isRecord,
  parseToolArgsSafely,
} from "./llm/messages.ts";

export type ExtractedToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  parseError: string | null;
};

const COMMAND_VERBS = /^(?:view|move|split|trim|delete|rm|set|set-text|settext|add-text|addtext|text|swap|duplicate|dup|clone|query|undo|find-issues|findissues|issues|generate|gen)\b/;

function cleanCommand(raw: string): string {
  return raw
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

export function extractToolCalls(responseMessage: Record<string, unknown>): ExtractedToolCall[] {
  const rawToolCalls = Array.isArray((responseMessage as { tool_calls?: unknown[] }).tool_calls)
    ? (responseMessage as { tool_calls: unknown[] }).tool_calls
    : [];
  const structuredToolCalls = rawToolCalls.flatMap((toolCall) => {
    if (!isRecord(toolCall)) return [];
    const fn = isRecord(toolCall.function) ? toolCall.function : undefined;
    if (!fn || typeof fn.name !== "string" || !fn.name.trim()) return [];
    const { args, error } = parseToolArgsSafely(typeof fn.arguments === "string" ? fn.arguments : "{}");
    return [{
      id: typeof toolCall.id === "string" && toolCall.id.trim() ? toolCall.id : crypto.randomUUID(),
      name: fn.name,
      args,
      parseError: error,
    }];
  });
  if (structuredToolCalls.length > 0) return structuredToolCalls;

  const text = extractAssistantText(responseMessage);
  if (!text) return [];

  const toolCalls: ExtractedToolCall[] = [];
  const runRe = /run\s*\(\s*(?:command\s*=\s*)?["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = runRe.exec(text)) !== null) {
    toolCalls.push({
      id: crypto.randomUUID(),
      name: "run",
      args: { command: cleanCommand(match[1]) },
      parseError: null,
    });
  }
  if (toolCalls.length > 0) return toolCalls;

  for (const line of text.split("\n")) {
    const stripped = line.replace(/^\s*\d+[.):-]\s*/, "").trim();
    if (!stripped || !COMMAND_VERBS.test(stripped)) continue;
    toolCalls.push({
      id: crypto.randomUUID(),
      name: "run",
      args: { command: cleanCommand(stripped) },
      parseError: null,
    });
  }
  if (toolCalls.length > 0) return toolCalls;

  const patterns = [
    /Tool call run:\s*\n?\{?\s*"?command"?\s*[:=]\s*"([^"]+)"/,
    /<parameter\s+name="command">([^<]+)<\/parameter>/,
    /\[TOOL_CALL\][\s\S]*?--command\s+"([^"]+)"[\s\S]*?\[\/TOOL_CALL\]/,
    /command["\s:=]+["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const inlineMatch = text.match(pattern);
    if (!inlineMatch) continue;
    return [{
      id: crypto.randomUUID(),
      name: "run",
      args: { command: cleanCommand(inlineMatch[1]) },
      parseError: null,
    }];
  }

  return [];
}

export function isToolError(result: string): boolean {
  return result.includes("not found")
    || result.includes("does not exist")
    || result.includes("requires")
    || result.includes("must be")
    || result.includes("Failed")
    || result.includes("Unknown command")
    || result.includes("Unknown tool")
    || result.includes("error");
}
