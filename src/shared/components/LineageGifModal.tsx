/**
 * LineageGifModal
 *
 * Modal component that displays the lineage chain as a grid of images
 * (4 across, scrollable) with a Download GIF button at the bottom.
 */

import React, { useState } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Progress } from '@/shared/components/ui/progress';
import { useLineageChain } from '@/shared/hooks/useLineageChain';
import {
  createLineageGif,
  downloadBlob,
  type CreateGifProgress,
} from '@/shared/utils/createLineageGif';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { ModalContainer } from '@/shared/components/ModalContainer';

interface LineageGifModalProps {
  open: boolean;
  onClose: () => void;
  variantId: string | null;
}

type DownloadState =
  | { status: 'idle' }
  | { status: 'generating'; progress: CreateGifProgress }
  | { status: 'error'; message: string };

export const LineageGifModal: React.FC<LineageGifModalProps> = ({
  open,
  onClose,
  variantId,
}) => {
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: 'idle' });

  // Fetch the lineage chain
  const { chain, isLoading: isChainLoading, hasLineage, error: chainError } = useLineageChain(
    open ? variantId : null
  );

  const handleDownloadGif = async () => {
    if (chain.length === 0) return;

    setDownloadState({ status: 'generating', progress: { stage: 'loading', current: 0, total: chain.length, message: 'Starting...' } });

    try {
      const imageUrls = chain.map((item) => item.imageUrl);

      const blob = await createLineageGif(imageUrls, { frameDelay: 800 }, (progress) => {
        setDownloadState({ status: 'generating', progress });
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `lineage-${timestamp}.gif`);
      setDownloadState({ status: 'idle' });
    } catch (err) {
      handleError(err, { context: 'LineageGifModal', showToast: false });
      setDownloadState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to generate GIF',
      });
    }
  };

  const renderContent = () => {
    if (isChainLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading lineage...</p>
        </div>
      );
    }

    if (chainError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">{chainError.message}</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      );
    }

    if (!hasLineage || chain.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">No lineage found for this image</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      );
    }

    const isGenerating = downloadState.status === 'generating';
    const progress = isGenerating ? downloadState.progress : null;
    const percentage = progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    return (
      <div className="flex flex-col gap-4">
        {/* Image grid - 4 across, scrollable */}
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {chain.map((item, index) => (
              <div
                key={item.id}
                className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border"
              >
                <img
                  src={item.thumbnailUrl || item.imageUrl}
                  alt={`Lineage ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Generation number badge */}
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 text-xs font-medium bg-background/80 rounded">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground text-center">
          {chain.length} images · Oldest to newest (left to right, top to bottom)
        </p>

        {/* Download button with progress */}
        {isGenerating ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-full max-w-xs space-y-2">
              <Progress value={percentage} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{progress?.message}</p>
            </div>
          </div>
        ) : (
          <Button onClick={handleDownloadGif} className="gap-2 self-center">
            <Download className="w-4 h-4" />
            Download GIF
          </Button>
        )}

        {/* Error message */}
        {downloadState.status === 'error' && (
          <p className="text-sm text-destructive text-center">{downloadState.message}</p>
        )}
      </div>
    );
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      size="large"
      title="Evolution"
    >
      {renderContent()}
    </ModalContainer>
  );
};
