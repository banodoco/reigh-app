import { describe, expect, it } from 'vitest';
import { buildReferenceParams } from './referenceParams';

describe('buildReferenceParams', () => {
  it('returns an empty object for just-text mode', () => {
    expect(
      buildReferenceParams('just-text', {
        styleReferenceImageGeneration: 'https://example.com/ref.png',
        styleReferenceStrength: 1,
        subjectStrength: 0,
        effectiveSubjectDescription: 'subject',
        inThisScene: false,
        inThisSceneStrength: 0,
        referenceMode: 'style',
      })
    ).toEqual({});
  });

  it('maps reference fields for by-reference mode', () => {
    expect(
      buildReferenceParams('by-reference', {
        styleReferenceImageGeneration: 'https://example.com/ref.png',
        styleReferenceStrength: 1.1,
        subjectStrength: 0.3,
        effectiveSubjectDescription: 'subject',
        inThisScene: true,
        inThisSceneStrength: 0.7,
        referenceMode: 'custom',
      })
    ).toEqual({
      style_reference_image: 'https://example.com/ref.png',
      subject_reference_image: 'https://example.com/ref.png',
      style_reference_strength: 1.1,
      subject_strength: 0.3,
      subject_description: 'subject',
      in_this_scene: true,
      in_this_scene_strength: 0.7,
      reference_mode: 'custom',
    });
  });
});
