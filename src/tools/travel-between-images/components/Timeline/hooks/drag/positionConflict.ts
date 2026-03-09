interface PositionConflictResolution {
  positions: Map<string, number>;
  hadConflict: boolean;
}

export function resolveSinglePositionConflict(
  framePositions: Map<string, number>,
  movingId: string,
  targetFrame: number,
): PositionConflictResolution {
  const next = new Map(framePositions);
  const conflict = [...framePositions.entries()].find(
    ([id, pos]) => id !== movingId && pos === targetFrame,
  );

  if (!conflict) {
    next.set(movingId, targetFrame);
    return { positions: next, hadConflict: false };
  }

  if (targetFrame === 0) {
    const sortedItems = [...framePositions.entries()]
      .filter(([id]) => id !== movingId && id !== conflict[0])
      .sort((a, b) => a[1] - b[1]);
    const nextItem = sortedItems.find(([_, pos]) => pos > 0);
    const nextItemPos = nextItem ? nextItem[1] : 50;
    const midpoint = Math.floor(nextItemPos / 2);
    next.set(conflict[0], midpoint);
    next.set(movingId, 0);
    return { positions: next, hadConflict: true };
  }

  next.set(movingId, targetFrame + 1);
  return { positions: next, hadConflict: true };
}
