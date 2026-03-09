import { useCallback, useState } from 'react';
import { normalizeAndPresentError } from '../../../lib/errorHandling/runtimeError';

interface UseTaskDetailsModalStateParams {
  taskId?: string | null;
  taskParams?: unknown;
}

export function useTaskDetailsModalState({
  taskId,
  taskParams,
}: UseTaskDetailsModalStateParams) {
  const [replaceImages, setReplaceImages] = useState(true);
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const handleCopyParams = useCallback(async () => {
    if (!taskParams) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(taskParams, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      normalizeAndPresentError(err, { context: 'TaskDetailsModal', showToast: false });
    }
  }, [taskParams]);

  const handleCopyId = useCallback(() => {
    if (!taskId) return;
    navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }, [taskId]);

  return {
    replaceImages,
    setReplaceImages,
    showDetailedParams,
    setShowDetailedParams,
    showAllImages,
    setShowAllImages,
    showFullPrompt,
    setShowFullPrompt,
    showFullNegativePrompt,
    setShowFullNegativePrompt,
    paramsCopied,
    idCopied,
    handleCopyParams,
    handleCopyId,
  };
}
