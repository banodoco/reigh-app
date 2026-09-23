import type { QueryClient } from '@tanstack/react-query';
import { useCallback, type MutableRefObject } from 'react';
import { assetRegistryQueryKey, timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import {
  prepareAssetWithResolver,
  transcodeAssetWithResolver,
  type AssetResolver,
} from '@/tools/video-editor/data/AssetResolver.ts';
import type { AssetRegistryEntry } from '@/tools/video-editor/types/index.ts';
import type { TimelinePatchRegistry } from '@/tools/video-editor/hooks/timeline-state-types.ts';
import { getAssetImmediateSource } from '@/tools/video-editor/lib/asset-registry.ts';
import type { RegisteredParser } from '../lib/assetParserRuntime';
import { enrichRegistryEntryWithParsers } from '../lib/mediaMetadata';

export function useAssetOperations(
  provider: AssetResolver,
  timelineId: string,
  userId: string | null,
  queryClient: QueryClient,
  pendingOpsRef: MutableRefObject<number>,
  registeredParsers?: readonly RegisteredParser[],
  patchRegistry?: TimelinePatchRegistry,
  resolveAssetUrl?: (file: string) => Promise<string>,
) {
  const prepareUpload = useCallback(async (file: File) => {
    pendingOpsRef.current += 1;
    try {
      const preparedFile = await transcodeAssetWithResolver(provider, {
        file,
        timelineId,
        userId: userId!,
        intent: 'asset-upload',
      });

      const result = await prepareAssetWithResolver(provider, {
        file: preparedFile,
        options: { timelineId, userId: userId! },
      });

      // If parsers are registered, enrich the entry after upload
      if (registeredParsers && registeredParsers.length > 0) {
        const enriched = await enrichRegistryEntryWithParsers(
          preparedFile,
          result.entry,
          result.assetId,
          registeredParsers,
        );
        return { assetId: result.assetId, entry: enriched.entry };
      }

      return result;
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [pendingOpsRef, provider, timelineId, userId, registeredParsers]);

  const commitRegistryEntry = useCallback(async (assetId: string, entry: AssetRegistryEntry) => {
    if (!patchRegistry) {
      throw new Error('The mounted timeline save owner is unavailable for asset registration');
    }

    const sourceReference = getAssetImmediateSource(entry);
    const source = sourceReference && resolveAssetUrl
      ? await resolveAssetUrl(sourceReference)
      : sourceReference;
    patchRegistry(assetId, entry, source);
  }, [patchRegistry, resolveAssetUrl]);

  const uploadAsset = useCallback(async (file: File) => {
    pendingOpsRef.current += 1;
    try {
      const result = await prepareUpload(file);
      await commitRegistryEntry(result.assetId, result.entry);
      return result;
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [commitRegistryEntry, prepareUpload]);

  const prepareAssetUpload = prepareUpload;

  const registerAsset = useCallback(async (assetId: string, entry: AssetRegistryEntry) => {
    pendingOpsRef.current += 1;
    try {
      await commitRegistryEntry(assetId, entry);
      await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [commitRegistryEntry, pendingOpsRef, queryClient, timelineId]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!patchRegistry) {
      throw new Error('The mounted timeline save owner is unavailable for asset registration');
    }

    pendingOpsRef.current += 1;
    try {
      // Complete all byte/metadata preparation before handing registry changes
      // to the save owner, so one asset-panel batch remains one ordered queue.
      const preparedResults = await Promise.allSettled(files.map(prepareAssetUpload));
      let firstPreparationError: unknown;
      preparedResults.forEach((result) => {
        if (result.status !== 'fulfilled' && firstPreparationError === undefined) {
          firstPreparationError = result.reason;
        }
      });
      for (const result of preparedResults) {
        if (result.status !== 'fulfilled') {
          continue;
        }
        try {
          await commitRegistryEntry(result.value.assetId, result.value.entry);
        } catch (error) {
          if (firstPreparationError === undefined) {
            firstPreparationError = error;
          }
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: timelineQueryKey(timelineId) }),
        queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) }),
      ]);
      if (firstPreparationError !== undefined) {
        throw firstPreparationError;
      }
    } finally {
      pendingOpsRef.current -= 1;
    }
  }, [commitRegistryEntry, patchRegistry, pendingOpsRef, prepareAssetUpload, queryClient, timelineId]);

  const invalidateAssetRegistry = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
  }, [queryClient, timelineId]);

  return {
    uploadAsset,
    prepareAssetUpload,
    registerAsset,
    uploadFiles,
    invalidateAssetRegistry,
  };
}
