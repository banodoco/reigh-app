/**
 * Request parsing and validation for complete_task
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import {
  edgeErrorResponse,
  parseJsonBodyStrict,
  parseJsonFailureResponse,
} from '../_shared/edgeRequest.ts';
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

const badRequest = (message: string, errorCode = 'invalid_request'): ParseResult => ({
  success: false,
  response: edgeErrorResponse(
    {
      errorCode,
      message,
      recoverable: false,
    },
    400,
  ),
});

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

function parseStoragePathRequest(body: CompleteTaskRequestBody): ParseResult {
  const taskId = asString(body.task_id);
  const storagePath = asString(body.storage_path);
  const thumbnailStoragePath = asString(body.thumbnail_storage_path);

  if (!taskId) {
    return badRequest("task_id required", 'task_id_required');
  }
  if (!storagePath) {
    return badRequest("storage_path required", 'storage_path_required');
  }

  const pathParts = storagePath.split('/');
  const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';
  const mode: UploadMode = isMode3Format ? 'presigned' : 'reference';

  if (mode === 'reference' && pathParts.length < 2) {
    return badRequest(
      "Invalid storage_path format. Must be at least userId/filename",
      'invalid_storage_path_format',
    );
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
        return badRequest("Invalid thumbnail_storage_path format.", 'invalid_thumbnail_storage_path_format');
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
      'missing_base64_upload_fields',
    );
  }

  if (firstFrameData && !firstFrameFilename) {
    return badRequest("first_frame_filename required when first_frame_data is provided", 'first_frame_filename_required');
  }
  if (firstFrameFilename && !firstFrameData) {
    return badRequest("first_frame_data required when first_frame_filename is provided", 'first_frame_data_required');
  }

  let fileBuffer: Uint8Array;
  try {
    fileBuffer = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
  } catch {
    return badRequest("Invalid base64 file_data", 'invalid_base64_file_data');
  }

  let thumbnailBuffer: Uint8Array | undefined;
  let thumbnailFilename: string | undefined;
  if (firstFrameData && firstFrameFilename) {
    try {
      thumbnailBuffer = Uint8Array.from(atob(firstFrameData), (c) => c.charCodeAt(0));
      thumbnailFilename = firstFrameFilename;
    } catch {
      // Continue without thumbnail - non-fatal
      thumbnailBuffer = undefined;
      thumbnailFilename = undefined;
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
      'multipart_not_supported',
    );
  }

  const parsedBody = await parseJsonBodyStrict(req, undefined, {
    message: 'Invalid JSON body',
    nonObjectMessage: 'JSON body must be an object',
  });
  if (!parsedBody.ok) {
    return {
      success: false,
      response: parseJsonFailureResponse(parsedBody, 400),
    };
  }
  const body = parsedBody.value as CompleteTaskRequestBody;

  if (asString(body.storage_path)) {
    return parseStoragePathRequest(body);
  }

  return parseBase64Request(body);
}

// ===== SECURITY VALIDATION =====

/**
 * Validate that a storage path is allowed for the given task
 * Called after Supabase client is available for orchestrator check
 */
export async function validateStoragePathSecurity(
  supabase: SupabaseClient,
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
    return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
  }

  const isOrchestrator = task?.task_type?.includes('orchestrator');
  if (isOrchestrator) {
    return { allowed: true };
  }

  return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
}
