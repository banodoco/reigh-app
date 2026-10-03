import type { AstridLocalAcpRoutes } from '@/integrations/astrid/acpRoutes';

type SessionConfigId = 'model' | 'thinking';
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function setSessionConfigOption(
  acp: Pick<AstridLocalAcpRoutes, 'setConfigOption'>,
  connectionId: string,
  sessionId: string,
  command: string,
): Promise<string> {
  const match = command.trim().match(/^\/(model|thinking)\s+(\S+)$/);
  if (!match) throw new Error('Use `/model <provider/model>` or `/thinking <level>` to update this session.');
  const configId = match[1] as SessionConfigId;
  const value = match[2];
  const result = asRecord(await acp.setConfigOption<unknown>(connectionId, sessionId, configId, value));
  const options = Array.isArray(result?.configOptions) ? result.configOptions : [];
  const config = options.map(asRecord).find((option) => option?.id === configId);
  const currentValue = stringValue(config?.currentValue);
  if (currentValue !== value) {
    throw new Error(`ACP did not confirm ${configId}=${value}; current value is ${currentValue ?? 'unavailable'}.`);
  }
  return `${configId === 'model' ? 'Model' : 'Thinking level'} set to ${currentValue} for this session only.`;
}
