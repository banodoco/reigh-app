import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  deleteExternalApiKey,
  fetchExternalApiKey,
  saveExternalApiKey,
} from '@/shared/services/externalApiKeys/repository';
import {
  verifyHuggingFaceToken,
  type HuggingFaceTokenVerificationResult,
} from '@/shared/services/externalApiKeys/huggingFaceTokenVerifier';
import type {
  ExternalApiKeyMetadata,
  ExternalService,
  HuggingFaceMetadata,
} from '@/shared/services/externalApiKeys/types';

/**
 * Hook to manage external API keys for third-party services
 *
 * @internal Used by useHuggingFaceToken - not directly exported.
 * If you need this for another service, add a specific hook like useHuggingFaceToken.
 */
function useExternalApiKey(service: ExternalService) {
  const queryClient = useQueryClient();
  const queryKey = ['externalApiKey', service];

  // Query to fetch the API key
  const {
    data: apiKey,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchExternalApiKey(service),
    staleTime: 5 * 60 * 1000,
  });

  // Mutation to save/update the API key
  const saveMutation = useMutation({
    mutationFn: ({ keyValue, metadata }: { keyValue: string; metadata?: ExternalApiKeyMetadata }) =>
      saveExternalApiKey(service, keyValue, metadata),
    onSuccess: (savedKey) => {
      queryClient.setQueryData(queryKey, savedKey);
    },
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useExternalApiKeys', toastTitle: 'Failed to save API key' });
    },
  });

  // Mutation to delete the API key
  const deleteMutation = useMutation({
    mutationFn: () => deleteExternalApiKey(service),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
    },
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useExternalApiKeys', toastTitle: 'Failed to delete API key' });
    },
  });

  return {
    apiKey,
    hasKey: !!apiKey,
    isLoading,
    error,
    refetch,
    save: (keyValue: string, metadata?: ExternalApiKeyMetadata) =>
      saveMutation.mutateAsync({ keyValue, metadata }),
    delete: () => deleteMutation.mutateAsync(),
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

function toVerifiedMetadata(
  verification: HuggingFaceTokenVerificationResult,
): ExternalApiKeyMetadata {
  return {
    username: verification.username,
    verified: true,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Hook specifically for HuggingFace token management
 */
export function useHuggingFaceToken() {
  const {
    apiKey,
    hasKey,
    isLoading,
    error,
    refetch,
    save,
    delete: deleteKey,
    isSaving,
    isDeleting,
  } = useExternalApiKey('huggingface');

  const metadata = apiKey?.metadata as HuggingFaceMetadata | undefined;

  const verifyToken = async (token: string): Promise<HuggingFaceTokenVerificationResult> => {
    return verifyHuggingFaceToken(token);
  };

  const saveToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    const verification = await verifyToken(token);
    if (!verification.valid) {
      return { success: false, error: verification.error };
    }

    try {
      await save(token, toVerifiedMetadata(verification));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to save token' };
    }
  };

  return {
    hasToken: hasKey,
    isLoading,
    error,
    username: metadata?.username,
    isVerified: metadata?.verified,
    verifyToken,
    saveToken,
    deleteToken: deleteKey,
    isSaving,
    isDeleting,
    refetch,
  };
}
