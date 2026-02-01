/**
 * Debug logging utility for shot operations.
 * Provides consistent prefixes and auto-truncates IDs for readability.
 * Only logs in development mode.
 */

const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

export type ShotOperation =
  | 'add'
  | 'delete'
  | 'duplicate'
  | 'reorder'
  | 'create'
  | 'update'
  | 'remove'
  | 'position';

const PREFIXES: Record<ShotOperation, string> = {
  add: '[AddDebug]',
  delete: '[DeleteDebug]',
  duplicate: '[DuplicateDebug]',
  reorder: '[ReorderDebug]',
  create: '[CreateDebug]',
  update: '[UpdateDebug]',
  remove: '[RemoveDebug]',
  position: '[PositionDebug]',
};

interface DebugData {
  shotId?: string;
  projectId?: string;
  generationId?: string;
  shotGenerationId?: string;
  [key: string]: any;
}

/**
 * Truncate a UUID to first 8 characters for readability.
 */
function truncateId(id: string | undefined): string | undefined {
  return id?.substring(0, 8);
}

/**
 * Log a debug message for a shot operation.
 * Automatically truncates IDs and adds timestamp.
 *
 * @example
 * shotDebug('delete', 'onMutate START', { shotId, projectId });
 * // Output: [DeleteDebug] onMutate START { shotId: 'abc12345', projectId: 'xyz98765', timestamp: 1234567890 }
 */
export function shotDebug(
  operation: ShotOperation,
  step: string,
  data?: DebugData
): void {
  if (!DEBUG_ENABLED) return;

  const prefix = PREFIXES[operation];

  if (!data) {
    console.log(`${prefix} ${step}`);
    return;
  }

  // Auto-truncate known ID fields
  const processedData: Record<string, any> = {
    ...data,
    timestamp: Date.now(),
  };

  if (data.shotId) processedData.shotId = truncateId(data.shotId);
  if (data.projectId) processedData.projectId = truncateId(data.projectId);
  if (data.generationId) processedData.generationId = truncateId(data.generationId);
  if (data.shotGenerationId) processedData.shotGenerationId = truncateId(data.shotGenerationId);

  console.log(`${prefix} ${step}`, processedData);
}

/**
 * Log an error for a shot operation.
 */
export function shotError(
  operation: ShotOperation,
  step: string,
  error: Error,
  data?: DebugData
): void {
  const prefix = PREFIXES[operation];

  const processedData: Record<string, any> = {
    ...data,
    error: error.message,
    timestamp: Date.now(),
  };

  if (data?.shotId) processedData.shotId = truncateId(data.shotId);
  if (data?.projectId) processedData.projectId = truncateId(data.projectId);

  console.error(`${prefix} ${step}`, processedData);
}
