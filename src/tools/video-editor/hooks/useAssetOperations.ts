import type { QueryClient } from '@tanstack/react-query';
import { useCallback, type MutableRefObject } from 'react';
import { assetRegistryQueryKey, timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';
import type { AssetRegistryEntry } from '@/tools/video-editor/types';

export function useAssetOperations(
  provider: DataProvider,
  timelineId: string,
  userId: string | null,
  queryClient: QueryClient,
  pendingOpsRef: MutableRefObject<number>,
) {
  const uploadAsset = useCallback(async (file: File) => {
    if (!provider.uploadAsset) {
      throw new Error('This editor backend does not support asset uploads');
    }

    pendingOpsRef.current += 1;
    try {
      return await provider.uploadAsset(file, { timelineId, userId: userId! });
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [pendingOpsRef, provider, timelineId, userId]);

  const registerAsset = useCallback(async (assetId: string, entry: AssetRegistryEntry) => {
    if (!provider.registerAsset) {
      throw new Error('This editor backend does not support asset registration');
    }

    pendingOpsRef.current += 1;
    try {
      await provider.registerAsset(timelineId, assetId, entry);
      await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [pendingOpsRef, provider, queryClient, timelineId]);

  const uploadFiles = useCallback(async (files: File[]) => {
    await Promise.all(files.map(uploadAsset));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: timelineQueryKey(timelineId) }),
      queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) }),
    ]);
  }, [queryClient, timelineId, uploadAsset]);

  const invalidateAssetRegistry = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
  }, [queryClient, timelineId]);

  return {
    uploadAsset,
    registerAsset,
    uploadFiles,
    invalidateAssetRegistry,
  };
}
