import type { ReferenceMode } from '@/shared/lib/tasks/imageGeneration';

export interface ReferenceImage {
  id: string;
  resourceId: string;
  referenceMode?: ReferenceMode;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
  inThisSceneStrength?: number;
  styleBoostTerms?: string;
}
