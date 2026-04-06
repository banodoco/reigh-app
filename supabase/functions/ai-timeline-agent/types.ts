import type {
  AgentSession,
  AgentSessionStatus,
  AgentTurn,
} from "../../../src/tools/video-editor/types/agent-session.ts";
import type { AssetRegistry, TimelineConfig } from "../../../src/tools/video-editor/types/index.ts";

export type { AgentSession, AgentSessionStatus, AgentTurn };

export type ToolResult = {
  result: string;
  config?: TimelineConfig;
  stopLoop?: boolean;
  nextStatus?: AgentSessionStatus;
};

export type ToolContext = {
  config: TimelineConfig;
  registry: AssetRegistry;
  projectId: string;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => ToolResult | Promise<ToolResult>;

type SupabaseError = { message: string };
type SupabaseListResult = Promise<{ data: unknown; error: SupabaseError | null }>;
type SupabaseMaybeSingleResult = Promise<{ data: unknown; error: SupabaseError | null }>;
type SupabaseUpdateResult = Promise<{ error: SupabaseError | null }>;
type SupabaseInsertResult = Promise<{ data?: unknown; error: SupabaseError | null }>;

type SupabaseSelectQuery = {
  eq: (column: string, value: string) => SupabaseSelectQuery;
  in: (column: string, values: string[]) => SupabaseListResult;
  maybeSingle: () => SupabaseMaybeSingleResult;
};

type SupabaseUpdateQuery = {
  eq: (column: string, value: string) => SupabaseUpdateResult;
};

export type SupabaseAdmin = {
  from: (table: string) => {
    select: (query: string) => SupabaseSelectQuery;
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => SupabaseInsertResult;
    update: (payload: Record<string, unknown>) => SupabaseUpdateQuery;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => {
    maybeSingle: () => SupabaseMaybeSingleResult;
  };
};

export type TimelineState = {
  config: TimelineConfig;
  previousConfig?: TimelineConfig;
  configVersion: number;
  registry: AssetRegistry;
  projectId: string;
};

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

export type SelectedClipPayload = {
  clip_id: string;
  url: string;
  media_type: "image" | "video";
  generation_id?: string;
  prompt?: string;
};

export type AgentTextToImageModel = "qwen-image" | "qwen-image-2512" | "z-image";

export type AgentReferenceMode = "style" | "subject" | "style-character" | "scene" | "custom";

export interface AgentProjectImageSettingsReference {
  id: string;
  resourceId: string;
  referenceMode?: AgentReferenceMode;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
  inThisSceneStrength?: number;
}

export interface AgentProjectImageSettings {
  selectedTextModel?: AgentTextToImageModel;
  references?: AgentProjectImageSettingsReference[];
  selectedReferenceIdByShot?: Record<string, string | null>;
}

export interface ResolvedReference {
  url: string;
  referenceMode: AgentReferenceMode;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
  inThisSceneStrength?: number;
}

export interface AgentInvocationBody {
  session_id?: unknown;
  user_message?: unknown;
  selected_clips?: unknown;
}

export interface TimelineRow {
  config: TimelineConfig;
  config_version: number;
  asset_registry: AssetRegistry;
  project_id: string;
}

export type Difficulty = "easy" | "okay" | "hard";

export interface OpenRouterParams {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
