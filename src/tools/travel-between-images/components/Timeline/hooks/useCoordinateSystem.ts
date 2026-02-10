import { useMemo } from 'react';
import { getTimelineDimensions } from '../utils/timeline-utils';

interface CoordinateSystemProps {
  positions: Map<string, number>;
  shotId: string;
  isDragInProgress?: boolean;
}

interface CoordinateSystemData {
  fullMin: number;
  fullMax: number;
  fullRange: number;
}

function useCoordinateSystem({ positions, shotId, isDragInProgress = false }: CoordinateSystemProps) {

  // Calculate dimensions from positions
  const coordinateSystem = useMemo(() => {
    const { fullMin, fullMax, fullRange } = getTimelineDimensions(positions);
    return { fullMin, fullMax, fullRange };
  }, [positions]);

  return coordinateSystem;
}

export type { CoordinateSystemData };
