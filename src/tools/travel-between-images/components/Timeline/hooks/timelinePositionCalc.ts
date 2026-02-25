import type { GenerationRow } from '@/domains/generation/types';
import { TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';

export interface PendingUpdate {
  id: string;
  oldPosition: number | null; // null = new item being added
  newPosition: number;
  operation: 'add' | 'move' | 'remove';
  timestamp: number;
}

export interface PositionDelta {
  id: string;
  oldPos: number | null;
  newPos: number;
}

/**
 * Builds timeline positions from shot generations, including trailing endpoint.
 */
export function buildServerPositions(shotGenerations: GenerationRow[]): Map<string, number> {
  const newPositions = new Map<string, number>();

  shotGenerations.forEach((shotGen) => {
    if (shotGen.timeline_frame !== null && shotGen.timeline_frame !== undefined && shotGen.timeline_frame >= 0) {
      newPositions.set(shotGen.id, shotGen.timeline_frame);
    }
  });

  const sortedShotGens = [...shotGenerations]
    .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame >= 0)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  if (sortedShotGens.length > 0) {
    const lastShotGen = sortedShotGens[sortedShotGens.length - 1];
    const metadata = lastShotGen.metadata as Record<string, unknown> | null;
    const endFrame = metadata?.end_frame;
    if (typeof endFrame === 'number' && endFrame > (lastShotGen.timeline_frame ?? 0)) {
      newPositions.set(TRAILING_ENDPOINT_KEY, endFrame);
    }
  }

  return newPositions;
}

/**
 * Merge pending optimistic updates onto server positions.
 * Returns merged positions and pending IDs that should be cleared.
 */
export function mergePendingUpdates(
  serverPositions: Map<string, number>,
  pendingUpdates: Map<string, PendingUpdate>,
  now: number = Date.now(),
): { merged: Map<string, number>; idsToClear: string[] } {
  if (pendingUpdates.size === 0) {
    return { merged: serverPositions, idsToClear: [] };
  }

  const merged = new Map(serverPositions);
  const idsToClear: string[] = [];

  for (const [id, pending] of pendingUpdates.entries()) {
    const serverPos = merged.get(id);

    // Success case: server now matches pending value.
    if (serverPos !== undefined && Math.abs(serverPos - pending.newPosition) < 0.01) {
      idsToClear.push(id);
      continue;
    }

    // Timeout case: pending is stale, accept server value.
    if (now - pending.timestamp > 35000) {
      idsToClear.push(id);
      continue;
    }

    // Stale server case: preserve optimistic local state.
    if (pending.operation === 'remove') {
      merged.delete(id);
    } else {
      merged.set(id, pending.newPosition);
    }
  }

  return { merged, idsToClear };
}

export function createPositionsSyncKey(positions: Map<string, number>): string {
  return JSON.stringify([...positions.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function detectPositionChanges(
  basePositions: Map<string, number>,
  nextPositions: Map<string, number>,
): PositionDelta[] {
  const changes: PositionDelta[] = [];
  for (const [id, newPos] of nextPositions) {
    const oldPos = basePositions.get(id);
    if (oldPos !== newPos) {
      changes.push({ id, oldPos: oldPos ?? null, newPos });
    }
  }
  return changes;
}

export function hasDuplicatePositionValues(positions: Map<string, number>): boolean {
  const values = [...positions.values()];
  return new Set(values).size !== values.length;
}
