// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import { ensureOwnedStoragePath, ensureUserAuth } from "../_shared/requestGuards.ts";
import type { SupabaseClient } from "../_shared/supabaseClient.ts";
import type { SystemLogger } from "../_shared/systemLogger.ts";

interface HuggingFaceCredentials {
  accessToken: string;
}

interface HuggingFaceHubClient {
  whoAmI(args: { credentials: HuggingFaceCredentials }): Promise<{ name?: string }>;
  createRepo(args: {
    repo: string;
    private?: boolean;
    credentials: HuggingFaceCredentials;
  }): Promise<void>;
  uploadFile(args: {
    repo: string;
    file: File | { path: string; content: File };
    credentials: HuggingFaceCredentials;
  }): Promise<void>;
}

interface NormalizedSampleVideo {
  storagePath: string;
  originalFileName: string;
}

interface LoraStoragePaths {
  single?: string;
  highNoise?: string;
  lowNoise?: string;
}

interface LoraDetails {
  name: string;
  description?: string;
  baseModel: string;
  triggerWord?: string;
  creatorName?: string;
}

interface ParsedUploadRequest {
  storagePaths: LoraStoragePaths;
  loraDetails: LoraDetails;
  sampleVideos: NormalizedSampleVideo[];
  repoNameOverride: string | null;
  isPrivate: boolean;
}

interface NormalizedUploadRequest extends ParsedUploadRequest {
  storagePaths: LoraStoragePaths;
  sampleVideos: NormalizedSampleVideo[];
}

interface HuggingFaceRepoContext {
  hfToken: string;
  repoId: string;
}

interface UploadedLoraFiles {
  single?: string;
  highNoise?: string;
  lowNoise?: string;
}

interface UploadedLoraUrls {
  loraUrl?: string;
  highNoiseUrl?: string;
  lowNoiseUrl?: string;
}

interface UploadWorkflowContext {
  supabaseAdmin: SupabaseClient;
  logger: SystemLogger;
  uploadFile: HuggingFaceHubClient["uploadFile"];
  repoId: string;
  hfToken: string;
  pathsToClean: string[];
}

type ResponseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

const huggingFaceHubPromise: Promise<HuggingFaceHubClient> = import(
  "https://esm.sh/@huggingface/hub@0.18.2"
).then((module) => ({
  whoAmI: module.whoAmI as HuggingFaceHubClient["whoAmI"],
  createRepo: module.createRepo as HuggingFaceHubClient["createRepo"],
  uploadFile: module.uploadFile as HuggingFaceHubClient["uploadFile"],
}));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function createResponse(body: object, status: number = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function invalidUploadRequest(message: string): ResponseResult<never> {
  return { ok: false, response: createResponse({ error: message }, 400) };
}

function parseJsonField<T>(
  raw: string,
  fieldName: string,
): ResponseResult<T> {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return invalidUploadRequest(`${fieldName} must be valid JSON`);
  }
}

function parseSampleVideos(raw: string | null): NormalizedSampleVideo[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as NormalizedSampleVideo[] : [];
  } catch {
    return [];
  }
}

function parseStoragePaths(
  loraStoragePathsRaw: string | null,
  legacyLoraStoragePath: string | null,
): ResponseResult<LoraStoragePaths> {
  if (loraStoragePathsRaw) {
    const parsed = parseJsonField<LoraStoragePaths>(loraStoragePathsRaw, "loraStoragePaths");
    if (!parsed.ok) {
      return parsed;
    }
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      return invalidUploadRequest("loraStoragePaths must be a JSON object");
    }
    return parsed;
  }

  if (legacyLoraStoragePath) {
    return { ok: true, value: { single: legacyLoraStoragePath } };
  }

  return invalidUploadRequest("loraStoragePaths or loraStoragePath is required");
}

async function parseUploadRequest(req: Request): Promise<ResponseResult<ParsedUploadRequest>> {
  const formData = await req.formData();
  const storagePathsResult = parseStoragePaths(
    formData.get("loraStoragePaths") as string | null,
    formData.get("loraStoragePath") as string | null,
  );
  if (!storagePathsResult.ok) {
    return storagePathsResult;
  }

  const storagePaths = storagePathsResult.value;
  if (!storagePaths.single && !storagePaths.highNoise && !storagePaths.lowNoise) {
    return invalidUploadRequest("At least one LoRA file path is required");
  }

  const loraDetailsRaw = formData.get("loraDetails") as string | null;
  if (!loraDetailsRaw) {
    return invalidUploadRequest("loraDetails is required");
  }

  const loraDetailsResult = parseJsonField<LoraDetails>(loraDetailsRaw, "loraDetails");
  if (!loraDetailsResult.ok) {
    return loraDetailsResult;
  }

  return {
    ok: true,
    value: {
      storagePaths,
      loraDetails: loraDetailsResult.value,
      sampleVideos: parseSampleVideos(formData.get("sampleVideos") as string | null),
      repoNameOverride: formData.get("repoName") as string | null,
      isPrivate: formData.get("isPrivate") === "true",
    },
  };
}

async function normalizeOwnedInputs(
  parsedRequest: ParsedUploadRequest,
  userId: string,
  logger: SystemLogger,
): Promise<ResponseResult<NormalizedUploadRequest>> {
  const normalizedStoragePaths: LoraStoragePaths = {};
  for (const [fileType, path] of Object.entries(parsedRequest.storagePaths)) {
    if (!path) {
      continue;
    }
    const ownedPath = ensureOwnedStoragePath(path, userId, logger);
    if (!ownedPath.ok) {
      await logger.flush();
      return ownedPath;
    }
    normalizedStoragePaths[fileType as keyof LoraStoragePaths] = ownedPath.storagePath;
  }

  const normalizedSampleVideos: NormalizedSampleVideo[] = [];
  for (const video of parsedRequest.sampleVideos) {
    if (!video || typeof video.originalFileName !== "string") {
      logger.error("Invalid sample video payload", { sampleVideo: video });
      await logger.flush();
      return invalidUploadRequest("Invalid sample video payload");
    }

    const ownedPath = ensureOwnedStoragePath(video.storagePath, userId, logger);
    if (!ownedPath.ok) {
      await logger.flush();
      return ownedPath;
    }

    normalizedSampleVideos.push({
      originalFileName: video.originalFileName,
      storagePath: ownedPath.storagePath,
    });
  }

  return {
    ok: true,
    value: {
      ...parsedRequest,
      storagePaths: normalizedStoragePaths,
      sampleVideos: normalizedSampleVideos,
    },
  };
}

function logNormalizedUploadRequest(
  logger: SystemLogger,
  request: NormalizedUploadRequest,
): void {
  logger.info("Processing LoRA", {
    name: request.loraDetails.name,
    single: request.storagePaths.single || "none",
    highNoise: request.storagePaths.highNoise || "none",
    lowNoise: request.storagePaths.lowNoise || "none",
    sampleVideos: request.sampleVideos.length,
  });
}

async function fetchHuggingFaceToken(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<ResponseResult<string>> {
  const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.rpc(
    "get_external_api_key_decrypted",
    { p_user_id: userId, p_service: "huggingface" },
  );

  if (apiKeyError || !apiKeyData || apiKeyData.length === 0) {
    return {
      ok: false,
      response: createResponse({
        error: "HuggingFace API key not found. Please set up your HuggingFace token first.",
        code: "HF_TOKEN_NOT_FOUND",
      }, 400),
    };
  }

  const hfToken = apiKeyData[0]?.key_value;
  if (!hfToken) {
    return {
      ok: false,
      response: createResponse({
        error: "HuggingFace API key is empty. Please re-enter your token.",
        code: "HF_TOKEN_EMPTY",
      }, 400),
    };
  }

  return { ok: true, value: hfToken };
}

async function ensureHfRepo(
  huggingFaceHub: HuggingFaceHubClient,
  request: NormalizedUploadRequest,
  hfToken: string,
  logger: SystemLogger,
): Promise<ResponseResult<{ repoId: string }>> {
  const hfUser = await huggingFaceHub.whoAmI({ credentials: { accessToken: hfToken } });
  if (!hfUser.name) {
    return invalidUploadRequest("Could not determine HuggingFace username");
  }

  const repoName = request.repoNameOverride || sanitizeRepoName(request.loraDetails.name);
  const repoId = `${hfUser.name}/${repoName}`;

  logger.info("Creating repo", { repoId, isPrivate: request.isPrivate });
  try {
    await huggingFaceHub.createRepo({
      repo: repoId,
      private: request.isPrivate,
      credentials: { accessToken: hfToken },
    });
    logger.info("Repository created", { repoId });
  } catch (repoError: unknown) {
    const repoErrorMessage = toErrorMessage(repoError);
    if (!repoErrorMessage.toLowerCase().includes("already exists")) {
      logger.error("Repo creation error", { error: repoErrorMessage });
      throw repoError;
    }
    logger.info("Repository already exists", { repoId });
  }

  return { ok: true, value: { repoId } };
}

/**
 * Sanitize a string to be a valid HuggingFace repository name
 */
function sanitizeRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-._]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 96); // HF has a 96 char limit for repo names
}

/**
 * Extract original filename from storage path
 * Format: {user_id}/{uuid}-{original_filename}
 */
function extractOriginalFilename(storagePath: string): string {
  const pathParts = storagePath.split("/");
  const fileNameWithUuid = pathParts[pathParts.length - 1];
  return fileNameWithUuid.includes("-")
    ? fileNameWithUuid.substring(fileNameWithUuid.indexOf("-") + 1)
    : fileNameWithUuid;
}

function buildWorkflowContext(
  supabaseAdmin: SupabaseClient,
  logger: SystemLogger,
  uploadFile: HuggingFaceHubClient["uploadFile"],
  repo: HuggingFaceRepoContext,
): UploadWorkflowContext {
  return {
    supabaseAdmin,
    logger,
    uploadFile,
    repoId: repo.repoId,
    hfToken: repo.hfToken,
    pathsToClean: [],
  };
}

function buildHuggingFaceAssetUrl(repoId: string, path: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(path)}`;
}

async function uploadLoraFile(
  workflow: UploadWorkflowContext,
  storagePath: string,
  fileType: keyof UploadedLoraFiles,
): Promise<string> {
  workflow.logger.info(`Downloading ${fileType} LoRA`, { storagePath });
  const { data: loraBlob, error: loraDownloadError } = await workflow.supabaseAdmin.storage
    .from("temporary")
    .download(storagePath);

  if (loraDownloadError || !loraBlob) {
    workflow.logger.error(`${fileType} LoRA download error`, { error: loraDownloadError?.message });
    throw new Error(`Failed to download ${fileType} LoRA from temporary storage`);
  }

  workflow.pathsToClean.push(storagePath);

  const originalName = extractOriginalFilename(storagePath);
  const loraFile = new File([loraBlob], originalName, { type: "application/octet-stream" });
  workflow.logger.info(`${fileType} LoRA file prepared`, { name: loraFile.name, size: loraFile.size });

  await workflow.uploadFile({
    repo: workflow.repoId,
    file: loraFile,
    credentials: { accessToken: workflow.hfToken },
  });
  workflow.logger.info(`${fileType} LoRA file uploaded successfully`);

  return originalName;
}

async function uploadLoraAssets(
  workflow: UploadWorkflowContext,
  storagePaths: LoraStoragePaths,
): Promise<{ files: UploadedLoraFiles; urls: UploadedLoraUrls }> {
  const files: UploadedLoraFiles = {};
  const urls: UploadedLoraUrls = {};

  if (storagePaths.single) {
    const filename = await uploadLoraFile(workflow, storagePaths.single, "single");
    files.single = filename;
    urls.loraUrl = buildHuggingFaceAssetUrl(workflow.repoId, filename);
  }

  if (storagePaths.highNoise) {
    const filename = await uploadLoraFile(workflow, storagePaths.highNoise, "highNoise");
    files.highNoise = filename;
    urls.highNoiseUrl = buildHuggingFaceAssetUrl(workflow.repoId, filename);
  }

  if (storagePaths.lowNoise) {
    const filename = await uploadLoraFile(workflow, storagePaths.lowNoise, "lowNoise");
    files.lowNoise = filename;
    urls.lowNoiseUrl = buildHuggingFaceAssetUrl(workflow.repoId, filename);
  }

  return { files, urls };
}

async function uploadSampleVideos(
  workflow: UploadWorkflowContext,
  sampleVideos: NormalizedSampleVideo[],
): Promise<string[]> {
  const uploadedVideoPaths: string[] = [];

  for (const video of sampleVideos) {
    try {
      workflow.logger.info("Downloading video", { storagePath: video.storagePath });
      const { data: videoBlob, error: videoError } = await workflow.supabaseAdmin.storage
        .from("temporary")
        .download(video.storagePath);

      if (videoError || !videoBlob) {
        workflow.logger.error("Video download error", { error: videoError?.message });
        continue;
      }

      workflow.pathsToClean.push(video.storagePath);

      const videoFile = new File([videoBlob], video.originalFileName, { type: videoBlob.type });
      const targetPath = `media/${sanitizeRepoName(video.originalFileName)}`;

      workflow.logger.info("Uploading video", { targetPath });
      await workflow.uploadFile({
        repo: workflow.repoId,
        file: { path: targetPath, content: videoFile },
        credentials: { accessToken: workflow.hfToken },
      });

      uploadedVideoPaths.push(targetPath);
      workflow.logger.info("Video uploaded", { targetPath });
    } catch (videoUploadError: unknown) {
      workflow.logger.error("Video upload error", { error: toErrorMessage(videoUploadError) });
    }
  }

  return uploadedVideoPaths;
}

async function uploadReadme(
  workflow: UploadWorkflowContext,
  loraDetails: LoraDetails,
  loraFiles: UploadedLoraFiles,
  sampleVideoPaths: string[],
): Promise<void> {
  workflow.logger.info("Generating README...");
  const readmeContent = generateReadmeContent(
    loraDetails,
    loraFiles,
    workflow.repoId,
    sampleVideoPaths,
  );
  const readmeBlob = new Blob([readmeContent], { type: "text/markdown" });
  const readmeFile = new File([readmeBlob], "README.md", { type: "text/markdown" });

  await workflow.uploadFile({
    repo: workflow.repoId,
    file: readmeFile,
    credentials: { accessToken: workflow.hfToken },
  });
  workflow.logger.info("README uploaded");
}

async function cleanupTemporaryAssets(workflow: UploadWorkflowContext): Promise<void> {
  workflow.logger.info("Cleaning up temporary files", { count: workflow.pathsToClean.length });
  if (workflow.pathsToClean.length === 0) {
    return;
  }

  const { error: cleanupError } = await workflow.supabaseAdmin.storage
    .from("temporary")
    .remove(workflow.pathsToClean);

  if (cleanupError) {
    workflow.logger.error("Cleanup error", { error: cleanupError.message });
    return;
  }

  workflow.logger.info("Cleanup successful");
}

function buildUploadResponse(
  repoId: string,
  uploadedLoraUrls: UploadedLoraUrls,
  uploadedVideoPaths: string[],
) {
  return {
    success: true,
    repoId,
    repoUrl: `https://huggingface.co/${repoId}`,
    ...uploadedLoraUrls,
    videoUrls: uploadedVideoPaths.map((path) => buildHuggingFaceAssetUrl(repoId, path)),
  };
}

/**
 * Generate README.md content for the HuggingFace model card
 * Supports both single-stage and multi-stage LoRAs
 */
function generateReadmeContent(
  loraDetails: {
    name: string;
    description?: string;
    baseModel: string;
    triggerWord?: string;
    creatorName?: string;
  },
  loraFiles: {
    single?: string;      // filename for single-stage
    highNoise?: string;   // filename for multi-stage high noise
    lowNoise?: string;    // filename for multi-stage low noise
  },
  repoId: string,
  sampleVideoPaths: string[]
): string {
  let readme = "";

  // YAML frontmatter for HuggingFace model card
  readme += "---\n";
  readme += "tags:\n";
  readme += "- lora\n";
  readme += "- video-generation\n";

  // Add base model tag
  const baseModelLower = loraDetails.baseModel.toLowerCase();
  if (baseModelLower.includes("wan")) {
    readme += "- wan\n";
    if (baseModelLower.includes("i2v")) readme += "- image-to-video\n";
    if (baseModelLower.includes("t2v")) readme += "- text-to-video\n";
    if (baseModelLower.includes("2.2")) readme += "- multi-stage\n";
  } else if (baseModelLower.includes("qwen")) {
    readme += "- qwen\n";
    readme += "- image-generation\n";
  }

  // Widget for video previews
  if (sampleVideoPaths.length > 0) {
    readme += "widget:\n";
    sampleVideoPaths.forEach((videoPath) => {
      readme += `- output:\n`;
      readme += `    url: ${videoPath}\n`;
    });
  }
  readme += "---\n\n";

  // Main content
  readme += `# ${loraDetails.name}\n\n`;
  readme += `This LoRA was uploaded via [Reigh](https://reigh.ai/).\n\n`;

  readme += `## Model Details\n\n`;

  // Show files based on single vs multi-stage
  if (loraFiles.highNoise || loraFiles.lowNoise) {
    // Multi-stage LoRA
    if (loraFiles.highNoise) {
      readme += `**High Noise File:** \`${loraFiles.highNoise}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.highNoise)}))\n\n`;
    }
    if (loraFiles.lowNoise) {
      readme += `**Low Noise File:** \`${loraFiles.lowNoise}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.lowNoise)}))\n\n`;
    }
  } else if (loraFiles.single) {
    // Single-stage LoRA
    readme += `**File:** \`${loraFiles.single}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.single)}))\n\n`;
  }

  readme += `**Base Model:** ${loraDetails.baseModel}\n\n`;

  if (loraDetails.triggerWord) {
    readme += `**Trigger Word:** \`${loraDetails.triggerWord}\`\n\n`;
  }

  if (loraDetails.description) {
    readme += `## Description\n\n`;
    readme += `${loraDetails.description}\n\n`;
  }

  if (loraDetails.creatorName) {
    readme += `## Creator\n\n`;
    readme += `Created by: **${loraDetails.creatorName}**\n\n`;
  }

  if (sampleVideoPaths.length > 0) {
    readme += `## Examples\n\n`;
    sampleVideoPaths.forEach((videoPath, index) => {
      const fileName = videoPath.split("/").pop() || `Example ${index + 1}`;
      readme += `- [${fileName}](./${videoPath})\n`;
    });
    readme += "\n";
  }

  return readme;
}

/**
 * Edge function: huggingface-upload
 *
 * Uploads LoRA files and sample videos to HuggingFace on behalf of the user.
 * Supports both single-stage (one file) and multi-stage (high_noise + low_noise) LoRAs.
 *
 * Flow:
 * 1. Authenticate user via Supabase JWT
 * 2. Retrieve user's HuggingFace token from external_api_keys table
 * 3. Download files from temporary storage bucket
 * 4. Create HF repo and upload files
 * 5. Generate README.md
 * 6. Clean up temporary files
 * 7. Return HuggingFace URLs
 */
export const __internal = {
  buildUploadResponse,
  normalizeOwnedInputs,
  parseUploadRequest,
  sanitizeRepoName,
};

async function handleHuggingFaceUpload(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return createResponse({ error: "Method not allowed" }, 405);
  }

  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "huggingface-upload",
    logPrefix: "[HF-UPLOAD]",
    method: "POST",
    parseBody: "none",
    corsPreflight: false,
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, auth } = bootstrap.value;

  try {
    const huggingFaceHub = await huggingFaceHubPromise;

    // 1. Authenticate user
    const authResult = ensureUserAuth(auth, logger);
    if (!authResult.ok) {
      return createResponse({ error: "Unauthorized" }, 401);
    }

    const userId = authResult.userId;
    logger.info("Authenticated request");

    const parsedRequest = await parseUploadRequest(req);
    if (!parsedRequest.ok) {
      return parsedRequest.response;
    }

    const normalizedRequest = await normalizeOwnedInputs(parsedRequest.value, userId, logger);
    if (!normalizedRequest.ok) {
      return normalizedRequest.response;
    }

    logNormalizedUploadRequest(logger, normalizedRequest.value);

    const tokenResult = await fetchHuggingFaceToken(supabaseAdmin, userId);
    if (!tokenResult.ok) {
      return tokenResult.response;
    }

    const repoResult = await ensureHfRepo(
      huggingFaceHub,
      normalizedRequest.value,
      tokenResult.value,
      logger,
    );
    if (!repoResult.ok) {
      return repoResult.response;
    }

    const workflow = buildWorkflowContext(
      supabaseAdmin,
      logger,
      huggingFaceHub.uploadFile,
      { hfToken: tokenResult.value, repoId: repoResult.value.repoId },
    );

    const uploadedLoraAssets = await uploadLoraAssets(workflow, normalizedRequest.value.storagePaths);
    const uploadedVideoPaths = await uploadSampleVideos(workflow, normalizedRequest.value.sampleVideos);
    await uploadReadme(
      workflow,
      normalizedRequest.value.loraDetails,
      uploadedLoraAssets.files,
      uploadedVideoPaths,
    );
    await cleanupTemporaryAssets(workflow);

    logger.info("Upload complete", { repoId: workflow.repoId });
    await logger.flush();

    return createResponse(
      buildUploadResponse(workflow.repoId, uploadedLoraAssets.urls, uploadedVideoPaths),
    );

  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error("Unexpected error", { error: message });
    await logger.flush();
    return createResponse({
      error: message || "An unexpected error occurred",
    }, 500);
  }
}

serve(handleHuggingFaceUpload);
