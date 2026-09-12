import {
  AcpProcessHost,
  AcpProcessHostError,
  type AcpProcessHostCallbacks,
  type AcpProcessSpawner,
} from './acpProcessHost.ts';

/**
 * The installed, user-machine OMP runtime selected for the canonical Astrid
 * ACP launch. The raw prompt remains Astrid-owned; this consumer only passes
 * its path to OMP and never copies its contents.
 */
export const ASTRID_ACP_OMP_BIN = '/Users/hannahomalley/.bun/bin/omp';
export const ASTRID_ACP_PROFILE = 'astrid';
export const ASTRID_ACP_SYSTEM_PROMPT_FILE = '/Users/hannahomalley/.omp/agent/agents/astrid.md';
export const ASTRID_ACP_AGENT_IDENTITY = 'astrid';

type HostRuntime = {
  readonly getBuiltinModule?: (id: string) => unknown;
};

type HostFileSystem = {
  readonly statSync?: (path: string) => { isFile: () => boolean };
};

function isRegularFile(path: string): boolean {
  const runtime = (globalThis as { readonly process?: HostRuntime }).process;
  if (typeof runtime?.getBuiltinModule !== 'function') return false;
  const fs = runtime.getBuiltinModule('node:fs') as HostFileSystem | undefined;
  try {
    return fs?.statSync?.(path).isFile() === true;
  } catch {
    return false;
  }
}

function requireAbsolute(value: string, name: string): string {
  if (!value.trim() || !value.startsWith('/')) {
    throw new AcpProcessHostError(
      `Astrid ACP ${name} must be an explicit absolute path.`,
      { code: 'acp_unavailable' },
    );
  }
  return value;
}

export type AstridAcpLauncherOptions = {
  /** Caller-owned project cwd; never inferred from the browser. */
  readonly cwd: string;
  /** Caller-owned OMP profile; no ambient profile discovery is performed. */
  readonly profile: string;
  /** Caller-owned ephemeral OMP session directory. */
  readonly sessionDir: string;
  /** Defaults to Astrid's canonical raw prompt path. */
  readonly systemPromptFile?: string;
  /** Defaults to the installed OMP selected for this machine. */
  readonly command?: string;
  readonly env?: Record<string, string | undefined>;
  readonly requestTimeoutMs?: number;
  readonly callbacks?: AcpProcessHostCallbacks;
  /** Test seam for prompt custody; production uses the host filesystem. */
  readonly fileIsRegularFile?: (path: string) => boolean;
  /** Test seam; production uses AcpProcessHost's explicit Node spawner. */
  readonly spawnProcess?: AcpProcessSpawner;
};

/**
 * Build the one canonical Astrid ACP host. This is intentionally a host-only
 * factory: browser code cannot resolve the prompt or spawn OMP. The caller
 * must provide cwd/profile/sessionDir, while OMP owns session identity and
 * storage after launch.
 */
export function createAstridAcpProcessHost(options: AstridAcpLauncherOptions): AcpProcessHost {
  const cwd = requireAbsolute(options.cwd, 'cwd');
  const profile = options.profile.trim();
  if (!profile) {
    throw new AcpProcessHostError(
      'Astrid ACP profile must be explicitly declared.',
      { code: 'acp_unavailable' },
    );
  }
  const sessionDir = requireAbsolute(options.sessionDir, 'session directory');
  const systemPromptFile = requireAbsolute(
    options.systemPromptFile ?? ASTRID_ACP_SYSTEM_PROMPT_FILE,
    'system prompt file',
  );
  const promptCheck = options.fileIsRegularFile ?? isRegularFile;
  if (!promptCheck(systemPromptFile)) {
    throw new AcpProcessHostError(
      `Astrid ACP system prompt is unavailable: ${systemPromptFile}`,
      { code: 'acp_unavailable' },
    );
  }

  const command = options.command ?? options.env?.OMP_BIN ?? ASTRID_ACP_OMP_BIN;
  const env = {
    ...(options.env ?? {}),
    OMP_BIN: command,
    OMP_AGENT_IDENTITY: ASTRID_ACP_AGENT_IDENTITY,
    ASTRID_AGENT_IDENTITY: ASTRID_ACP_AGENT_IDENTITY,
  };
  return new AcpProcessHost({
    command,
    cwd,
    profile,
    sessionDir,
    systemPrompt: systemPromptFile,
    env,
    requestTimeoutMs: options.requestTimeoutMs,
    callbacks: options.callbacks,
    spawnProcess: options.spawnProcess,
  });
}
