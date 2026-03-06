import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShotImages } from '@/shared/hooks/shots/useShotImages';
import type { Shot, GenerationRow, ShotOption } from '@/domains/generation/types';

interface UseShotSelectionInput {
  shots: Shot[] | undefined;
  currentShotId: string | null;
  setCurrentShotId: (shotId: string | null) => void;
}

interface UseShotSelectionResult {
  selectedShot: Shot | null;
  managedImages: GenerationRow[];
  setManagedImages: Dispatch<SetStateAction<GenerationRow[]>>;
  simplifiedShotOptions: ShotOption[];
  handleSelectShot: (shot: Shot) => void;
  handleBackToList: () => void;
  handleShotChange: (shotId: string) => void;
}

export function useShotSelection(input: UseShotSelectionInput): UseShotSelectionResult {
  const { shots, currentShotId, setCurrentShotId } = input;
  const location = useLocation();
  const navigate = useNavigate();

  const selectedShot = useMemo(() => {
    if (!currentShotId || !shots) {
      return null;
    }

    return shots.find(shot => shot.id === currentShotId) || null;
  }, [currentShotId, shots]);

  const { data: fullSelectedShotImages = [] } = useShotImages(selectedShot?.id ?? null);
  const [managedImages, setManagedImages] = useState<GenerationRow[]>([]);

  useEffect(() => {
    if (fullSelectedShotImages.length > 0) {
      setManagedImages(fullSelectedShotImages);
      return;
    }

    if (selectedShot?.images) {
      setManagedImages(selectedShot.images);
      return;
    }

    setManagedImages([]);
  }, [selectedShot, fullSelectedShotImages]);

  useEffect(() => {
    const shotIdFromLocation = (location.state as { selectedShotId?: string } | null)?.selectedShotId;
    if (!shotIdFromLocation || !shots || shots.length === 0) {
      return;
    }

    const shotToSelect = shots.find(shot => shot.id === shotIdFromLocation);
    if (!shotToSelect) {
      return;
    }

    setCurrentShotId(shotIdFromLocation);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate, setCurrentShotId, shots]);

  const handleSelectShot = useCallback((shot: Shot) => {
    setCurrentShotId(shot.id);
  }, [setCurrentShotId]);

  const handleBackToList = useCallback(() => {
    setCurrentShotId(null);
  }, [setCurrentShotId]);

  const handleShotChange = useCallback((shotId: string) => {
    setCurrentShotId(shotId);
  }, [setCurrentShotId]);

  const simplifiedShotOptions = useMemo(() => (
    shots ? shots.map(shot => ({ id: shot.id, name: shot.name })) : []
  ), [shots]);

  return {
    selectedShot,
    managedImages,
    setManagedImages,
    simplifiedShotOptions,
    handleSelectShot,
    handleBackToList,
    handleShotChange,
  };
}
