import { useMemo } from 'react';
import { getTimelineDimensions } from '../utils/timeline-utils';

interface CoordinateSystemProps {
  positions: Map<string, number>;
}

interface CoordinateSystemData {
  fullMin: number;
  fullMax: number;
  fullRange: number;
}

export type { CoordinateSystemData };
