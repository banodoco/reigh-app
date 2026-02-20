import type { GenerationSource, ReferenceApiParams } from '../../types';
import type { FormStateSnapshot } from './types';

type ReferenceStateSnapshot = Pick<
  FormStateSnapshot,
  | 'styleReferenceImageGeneration'
  | 'styleReferenceStrength'
  | 'subjectStrength'
  | 'effectiveSubjectDescription'
  | 'inThisScene'
  | 'inThisSceneStrength'
  | 'referenceMode'
>;

export function buildReferenceParams(
  generationSource: GenerationSource,
  state: ReferenceStateSnapshot
): Partial<ReferenceApiParams> {
  if (generationSource !== 'by-reference') return {};

  return {
    style_reference_image: state.styleReferenceImageGeneration ?? undefined,
    style_reference_strength: state.styleReferenceStrength,
    subject_strength: state.subjectStrength,
    subject_description: state.effectiveSubjectDescription,
    in_this_scene: state.inThisScene,
    in_this_scene_strength: state.inThisSceneStrength,
    reference_mode: state.referenceMode,
  };
}
