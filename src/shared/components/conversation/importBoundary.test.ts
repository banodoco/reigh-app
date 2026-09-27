import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd(), 'src/shared/components/conversation');
const sourceFiles = readdirSync(root)
  .filter((name) => !name.endsWith('.test.ts') && !name.endsWith('.test.tsx'))
  .map((name) => path.join(root, name))
  .filter((file) => statSync(file).isFile());

describe('shared conversation import boundary', () => {
  it('does not import app-only session, transport, voice, auth, pane or submission modules', () => {
    const source = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/tools\/video-editor|useAgentSession|useAgentVoice|AgentChatContext/);
    expect(source).not.toMatch(/AuthContext|supabase|bridgeSession|panesStore|selectionStore/);
    expect(source).not.toMatch(/fetch\s*\(|WebSocket|EventSource|useMutation|useQuery/);
  });

  it('keeps view data and callbacks explicit at the shared component boundary', () => {
    const source = readFileSync(path.join(root, 'ConversationPresentation.tsx'), 'utf8');
    expect(source).toContain('items: readonly ConversationItem[]');
    expect(source).toContain('headerActions?: ReactNode');
    expect(source).toContain('footer?: ReactNode');
    expect(source).toContain('onAttachmentClick?:');
  });
});
