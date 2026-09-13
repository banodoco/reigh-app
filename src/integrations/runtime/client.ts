import {
  ApiError,
  PROTOCOL,
  WorkspaceClient,
  type Handshake,
  type Health,
  type Capability,
  type ByteResponse,
  type Generation,
  type GenerationVariant,
  type ManagedOutput,
  type MutationResult,
  type Page,
  type Project,
  type Realm,
  type Task,
  type Transport,
} from './generated.ts';

// Browser requests stay same-origin so the connector/proxy can inject the
// owner credential without exposing it to the page. The endpoint env var is a
// Vite-server setting for the proxy, not a browser destination.
export const RUNTIME_BASE_URL = '/api/runtime';
export const RUNTIME_CLIENT_VERSION = 'reigh-r1-consumer-20260911';
export const RUNTIME_CLIENT_SCOPES = [
  'handshake',
  'projects:read',
  'projects:write',
  'objects:read',
  'objects:write',
  'tasks:read',
  'tasks:write',
];

export class RuntimeUnavailableError extends Error {
  readonly code = 'runtime_unavailable' as const;
  readonly recoveryAction: string;

  constructor(cause: unknown, baseUrl: string) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Workspace Runtime is unavailable at ${baseUrl}: ${detail}. `
      + 'Start the supported Runtime and configure its authenticated connector, then retry.',
    );
    this.name = 'RuntimeUnavailableError';
    this.recoveryAction = 'Start the supported Runtime and configure its authenticated connector, then retry.';
  }
}

export class RuntimeAuthenticationError extends Error {
  readonly code = 'runtime_authentication' as const;
  readonly status = 401 as const;
  readonly recoveryAction = 'Provide an authenticated connector credential and retry.';

  constructor(baseUrl: string) {
    super(
      `Workspace Runtime authentication failed at ${baseUrl}: the credential was rejected or revoked. `
      + 'Provide an authenticated connector credential and retry.',
    );
    this.name = 'RuntimeAuthenticationError';
  }
}

export function isRuntimeConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

export class ReighRuntimeClient {
  readonly baseUrl: string;
  private readonly client: WorkspaceClient;
  private session: Promise<{ health: Health; handshake: Handshake; realm: Realm }> | null = null;

  constructor(options: { baseUrl?: string; token?: string; transport?: Transport } = {}) {
    this.baseUrl = options.baseUrl ?? RUNTIME_BASE_URL;
    // Browser credentials are supplied by the authenticated connector/proxy.
    // A token is accepted for direct test/CLI clients, but is never persisted.
    this.client = new WorkspaceClient(this.baseUrl, options.token, options.transport);
  }

  async ensureSession(): Promise<{ health: Health; handshake: Handshake; realm: Realm }> {
    if (!this.session) {
      this.session = this.openSession().catch((error) => {
        this.session = null;
        throw error;
      });
    }
    return this.session;
  }

  /** Force the existing client through a fresh authenticated handshake. */
  async reconnect(): Promise<{ health: Health; handshake: Handshake; realm: Realm }> {
    this.session = null;
    return this.ensureSession();
  }

  private async openSession() {
    try {
      const health = await this.client.health();
      const handshake = await this.client.handshake(
        'reigh-browser',
        RUNTIME_CLIENT_VERSION,
        RUNTIME_CLIENT_SCOPES,
      );
      const realm = await this.client.getRealm();
      return { health, handshake, realm };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new RuntimeAuthenticationError(this.baseUrl);
      }
      throw new RuntimeUnavailableError(error, this.baseUrl);
    }
  }

  private async withSession<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureSession();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.session = null;
        throw new RuntimeAuthenticationError(this.baseUrl);
      }
      throw error;
    }
  }

  async listProjects(): Promise<Project[]> {
    return this.withSession(async () => {
      const projects: Project[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client.listProjects(cursor, 200);
        projects.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return projects;
    });
  }

  async listTimelines(projectId: string): Promise<Record<string, unknown>[]> {
    return this.withSession(async () => {
      const timelines: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client.listTimelines(projectId, cursor, 200);
        timelines.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return timelines;
    });
  }

  async getTimeline(timelineId: string): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.getTimeline(timelineId));
  }

  async updateTimelineDocument(
    projectId: string,
    timelineId: string,
    expectedVersion: number,
    config: Record<string, unknown>,
    registry: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.updateTimelineDocument(
      projectId,
      timelineId,
      expectedVersion,
      idempotencyKey(),
      config,
      registry,
    ));
  }

  async ingestProjectObject(
    projectId: string,
    data: Uint8Array,
    mediaType: string,
    filename?: string,
  ) {
    return this.withSession(() => this.client.ingestProjectObject(projectId, data, mediaType, idempotencyKey(), filename));
  }

  /** Canonical Runtime generation page; the opaque cursor is caller-owned. */
  async listGenerations(projectId: string, cursor?: string, limit = 50): Promise<Page<Generation>> {
    return this.withSession(() => this.client.listGenerations(projectId, cursor, limit));
  }

  /** Canonical Runtime variant page; the opaque cursor is caller-owned. */
  async listVariants(generationId: string, cursor?: string, limit = 50): Promise<Page<GenerationVariant>> {
    return this.withSession(() => this.client.listVariants(generationId, cursor, limit));
  }

  /** Capability discovery is read-only and supplies the digest for admission. */
  async listCapabilities(cursor?: string, limit = 50): Promise<Page<Capability>> {
    return this.withSession(() => this.client.listCapabilities(cursor, limit));
  }

  /** Browser admission only. Claim, execution, and settlement remain host-owned. */
  async admitTask(
    input: Parameters<WorkspaceClient['admitTask']>[0],
    admissionKey: string,
  ): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.admitTask(input, admissionKey));
  }

  async getTask(taskId: string): Promise<Task> {
    return this.withSession(() => this.client.getTask(taskId));
  }

  async listProjectTasks(projectId: string, cursor?: string, limit = 50): Promise<Page<Task>> {
    return this.withSession(() => this.client.listProjectTasks(projectId, cursor, limit));
  }

  async cancelTask(taskId: string, admissionKey: string, expectedVersion?: number): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.cancelTask(taskId, admissionKey, expectedVersion));
  }

  async retryTask(taskId: string, admissionKey: string, expectedVersion?: number): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.retryTask(taskId, admissionKey, expectedVersion));
  }

  /** Canonical managed-output associations for one completed task. */
  async listManagedOutputs(taskId: string, cursor?: string, limit = 50): Promise<Page<ManagedOutput>> {
    return this.withSession(() => this.client.listManagedOutputs(taskId, cursor, limit));
  }

  /** Canonical readback of one managed-output association. */
  async getManagedOutput(associationId: string): Promise<ManagedOutput> {
    return this.withSession(() => this.client.getManagedOutput(associationId));
  }

  /** Authenticated generated Runtime media read with optional byte range. */
  async getObject(objectId: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    return this.withSession(() => this.client.getObject(objectId, byteRange));
  }

  /** Authenticated generated Runtime media metadata read with optional range. */
  async headObject(objectId: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    return this.withSession(() => this.client.headObject(objectId, byteRange));
  }

  objectContentUrl(objectId: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/v1/objects/${encodeURIComponent(objectId)}`;
  }
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reigh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export { PROTOCOL };
