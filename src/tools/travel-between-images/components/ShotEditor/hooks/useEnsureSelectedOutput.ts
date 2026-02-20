import { useEffect } from 'react';

interface ParentGeneration {
  id: string;
}

interface UseEnsureSelectedOutputArgs {
  outputSelectionReady: boolean;
  parentGenerations: ParentGeneration[];
  selectedOutputId: string | null;
  setSelectedOutputId: (id: string) => void;
}

export function useEnsureSelectedOutput({
  outputSelectionReady,
  parentGenerations,
  selectedOutputId,
  setSelectedOutputId,
}: UseEnsureSelectedOutputArgs): void {
  useEffect(() => {
    if (!outputSelectionReady || parentGenerations.length === 0) {
      return;
    }

    const selectionExists = !!selectedOutputId && parentGenerations.some((parent) => parent.id === selectedOutputId);
    if (!selectionExists) {
      setSelectedOutputId(parentGenerations[0].id);
    }
  }, [outputSelectionReady, parentGenerations, selectedOutputId, setSelectedOutputId]);
}
