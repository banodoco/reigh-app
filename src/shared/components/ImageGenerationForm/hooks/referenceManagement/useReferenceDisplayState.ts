import { useEffect, useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HydratedReferenceImage, ReferenceMode } from '../../types';

interface ReferenceDisplayStateInput {
  selectedReference: HydratedReferenceImage | null;
  selectedReferenceId: string | null;
  styleReferenceOverride: string | null | undefined;
  setStyleReferenceOverride: Dispatch<SetStateAction<string | null | undefined>>;
  setReferenceMode: Dispatch<SetStateAction<ReferenceMode>>;
  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setSubjectDescription: Dispatch<SetStateAction<string>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setStyleBoostTerms: Dispatch<SetStateAction<string>>;
}

interface ReferenceDisplayStateOutput {
  rawStyleReferenceImage: string | null;
  styleReferenceImageDisplay: string | null;
  styleReferenceImageGeneration: string | null;
  pendingReferenceModeUpdate: MutableRefObject<ReferenceMode | null>;
}

export function useReferenceDisplayState(
  input: ReferenceDisplayStateInput
): ReferenceDisplayStateOutput {
  const {
    selectedReference,
    selectedReferenceId,
    styleReferenceOverride,
    setStyleReferenceOverride,
    setReferenceMode,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
  } = input;

  const pendingReferenceModeUpdate = useRef<ReferenceMode | null>(null);
  const prevSelectedReferenceId = useRef(selectedReferenceId);
  const lastSyncedReferenceId = useRef<string | null>(null);

  const rawStyleReferenceImage = selectedReference?.styleReferenceImage || null;
  const rawStyleReferenceImageOriginal =
    selectedReference?.styleReferenceImageOriginal || null;

  const styleReferenceImageDisplay = useMemo(() => {
    if (styleReferenceOverride !== undefined) {
      return styleReferenceOverride;
    }

    const imageToDisplay = rawStyleReferenceImageOriginal || rawStyleReferenceImage;
    if (!imageToDisplay) return null;
    if (imageToDisplay.startsWith('http')) return imageToDisplay;
    if (imageToDisplay.startsWith('data:image/')) return null;

    return imageToDisplay;
  }, [styleReferenceOverride, rawStyleReferenceImageOriginal, rawStyleReferenceImage]);

  const styleReferenceImageGeneration = useMemo(() => {
    if (!rawStyleReferenceImage) {
      return null;
    }

    if (rawStyleReferenceImage.startsWith('http')) {
      return rawStyleReferenceImage;
    }

    if (rawStyleReferenceImage.startsWith('data:image/')) {
      return null;
    }

    return rawStyleReferenceImage;
  }, [rawStyleReferenceImage]);

  useEffect(() => {
    setStyleReferenceOverride(undefined);
  }, [rawStyleReferenceImage, setStyleReferenceOverride]);

  useEffect(() => {
    if (prevSelectedReferenceId.current !== selectedReferenceId) {
      pendingReferenceModeUpdate.current = null;
      prevSelectedReferenceId.current = selectedReferenceId;
    }
  }, [selectedReferenceId]);

  useEffect(() => {
    const currentReferenceMode = selectedReference?.referenceMode || 'style';
    if (
      pendingReferenceModeUpdate.current &&
      currentReferenceMode === pendingReferenceModeUpdate.current
    ) {
      pendingReferenceModeUpdate.current = null;
    }
  }, [selectedReference?.referenceMode]);

  useEffect(() => {
    if (!selectedReference || selectedReference.id === lastSyncedReferenceId.current) {
      return;
    }

    lastSyncedReferenceId.current = selectedReference.id;

    setReferenceMode(selectedReference.referenceMode || 'style');
    setStyleReferenceStrength(selectedReference.styleReferenceStrength ?? 1.0);
    setSubjectStrength(selectedReference.subjectStrength ?? 0.0);
    setSubjectDescription(selectedReference.subjectDescription ?? '');
    setInThisScene(selectedReference.inThisScene ?? false);
    setInThisSceneStrength(selectedReference.inThisSceneStrength ?? 0.5);
    setStyleBoostTerms(selectedReference.styleBoostTerms ?? '');
  }, [
    selectedReference,
    setReferenceMode,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
  ]);

  return {
    rawStyleReferenceImage,
    styleReferenceImageDisplay,
    styleReferenceImageGeneration,
    pendingReferenceModeUpdate,
  };
}
