/**
 * Request parsing and validation for complete_task
 */

import { getContentType } from './params.ts';

// ===== TYPES =====

/**
 * Upload mode for complete-task requests
 */
type UploadMode = 'base64' | 'presigned' | 'reference';

/**
 * Parsed request data from complete-task endpoint
 */
interface ParsedRequest {
  taskId: string;
  mode: UploadMode;
  filename: string;
  // MODE 1 (base64) specific
  fileData?: Uint8Array;
  fileContentType?: string;
  thumbnailData?: Uint8Array;
  thumbnailFilename?: string;
  thumbnailContentType?: string;
  // MODE 3/4 (storage path) specific
  storagePath?: string;
  thumbnailStoragePath?: string;
  // For MODE 3 validation (set during parsing)
  storagePathTaskId?: string; // The task_id extracted from storage_path
  requiresOrchestratorCheck?: boolean; // True if path task_id != request task_id
}

/**
 * Result of request parsing - either success with data or error with response
 */
type ParseResult =
  | { success: true; data: ParsedRequest }
  | { success: false; response: Response };

interface CompleteTaskRequestBody {
  task_id?: unknown;
  file_data?: unknown;
  filename?: unknown;
  first_frame_data?: unknown;
  first_frame_filename?: unknown;
  storage_path?: unknown;
  thumbnail_storage_path?: unknown;
}

// ===== REQUEST PARSING =====

const badRequest = (message: string): ParseResult => ({
  success: false,
  response: new Response(message, { status: 400 }),
});

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

async function parseJsonBody(req: Request): Promise<
  { success: true; body: CompleteTaskRequestBody }
  | { success: false; response: Response }
> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { success: false, response: new Response("Invalid JSON body", { status: 400 }) };
  }

  if (!body || typeof body !== "object") {
    return { success: false, response: new Response("Invalid JSON body", { status: 400 }) };
  }

  return { success: true, body: body as CompleteTaskRequestBody };
}

function parseStoragePathRequest(body: CompleteTaskRequestBody): ParseResult {
  const taskId = asString(body.task_id);
  const storagePath = asString(body.storage_path);
  const thumbnailStoragePath = asString(body.thumbnail_storage_path);

  if (!taskId) {
    return badRequest("task_id required");
  }
  if (!storagePath) {
    return badRequest("storage_path required");
  }

  const pathParts = storagePath.split('/');
  const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';
  const mode: UploadMode = isMode3Format ? 'presigned' : 'reference';

  if (mode === 'reference' && pathParts.length < 2) {
    return badRequest("Invalid storage_path format. Must be at least userId/filename");
  }

  let requiresOrchestratorCheck = false;
  let storagePathTaskId: string | undefined;

  if (mode === 'presigned') {
    storagePathTaskId = pathParts[2];
    if (storagePathTaskId !== taskId) {
      requiresOrchestratorCheck = true;
    }

    if (thumbnailStoragePath) {
      const thumbParts = thumbnailStoragePath.split('/');
      if (thumbParts.length < 4 || thumbParts[1] !== 'tasks') {
        return badRequest("Invalid thumbnail_storage_path format.");
      }
      if (thumbParts[2] !== taskId) {
        requiresOrchestratorCheck = true;
      }
    }
  }

  return {
    success: true,
    data: {
      taskId,
      mode,
      filename: pathParts[pathParts.length - 1],
      storagePath,
      thumbnailStoragePath,
      storagePathTaskId,
      requiresOrchestratorCheck,
    },
  };
}

function parseBase64Request(body: CompleteTaskRequestBody): ParseResult {
  const taskId = asString(body.task_id);
  const fileData = asString(body.file_data);
  const filename = asString(body.filename);
  const firstFrameData = asString(body.first_frame_data);
  const firstFrameFilename = asString(body.first_frame_filename);

  if (!taskId || !fileData || !filename) {
    return badRequest(
      "task_id, file_data (base64), and filename required (or use storage_path for pre-uploaded files)",
    );
  }

  if (firstFrameData && !firstFrameFilename) {
    return badRequest("first_frame_filename required when first_frame_data is provided");
  }
  if (firstFrameFilename && !firstFrameData) {
    return badRequest("first_frame_data required when first_frame_filename is provided");
  }

  let fileBuffer: Uint8Array;
  try {
    fileBuffer = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
  } catch (error) {
    console.error("[RequestParser] Base64 decode error:", error);
    return badRequest("Invalid base64 file_data");
  }

  let thumbnailBuffer: Uint8Array | undefined;
  let thumbnailFilename: string | undefined;
  if (firstFrameData && firstFrameFilename) {
    try {
      thumbnailBuffer = Uint8Array.from(atob(firstFrameData), (c) => c.charCodeAt(0));
      thumbnailFilename = firstFrameFilename;
    } catch (error) {
      console.error("[RequestParser] Thumbnail base64 decode error:", error);
      // Continue without thumbnail - non-fatal
    }
  }

  return {
    success: true,
    data: {
      taskId,
      mode: 'base64',
      filename,
      fileData: fileBuffer,
      fileContentType: getContentType(filename),
      thumbnailData: thumbnailBuffer,
      thumbnailFilename,
      thumbnailContentType: thumbnailFilename ? getContentType(thumbnailFilename) : undefined,
    },
  };
}

/**
 * Parse and validate the incoming request
 * Does structural validation only - security checks (orchestrator validation) happen later
 */
export async function parseCompleteTaskRequest(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get("content-type") || "";

  // Multipart not supported
  if (contentType.includes("multipart/form-data")) {
    return badRequest(
      "Multipart upload (MODE 2) is not supported. Use MODE 1 (base64 JSON) or MODE 3 (pre-signed URL).",
    );
  }

  const parsedBody = await parseJsonBody(req);
  if (!parsedBody.success) {
    return { success: false, response: parsedBody.response };
  }

  if (asString(parsedBody.body.storage_path)) {
    return parseStoragePathRequest(parsedBody.body);
  }

  return parseBase64Request(parsedBody.body);
}

// ===== SECURITY VALIDATION =====

/**
 * Validate that a storage path is allowed for the given task
 * Called after Supabase client is available for orchestrator check
 */
export async function validateStoragePathSecurity(
  supabase: unknown,
  taskId: string,
  storagePath: string,
  storagePathTaskId: string | undefined
): Promise<{ allowed: boolean; error?: string }> {
  // If path task_id matches request task_id, it's allowed
  if (!storagePathTaskId || storagePathTaskId === taskId) {
    return { allowed: true };
  }

  // Check if this is an orchestrator task (allowed to reference other task outputs)
  const { data: task, error } = await supabase
    .from('tasks')
    .select('task_type')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error(`[SecurityCheck] Error fetching task for validation: ${error.message}`);
    return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
  }

  const isOrchestrator = task?.task_type?.includes('orchestrator');
  if (isOrchestrator) {
    return { allowed: true };
  }

  console.error(`[SecurityCheck] ❌ Non-orchestrator task attempting to reference different task's output`);
  return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
}
