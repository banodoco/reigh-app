import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';
import { apiQueryKeys } from '@/shared/lib/queryKeys/api';
import { handleError } from '@/shared/lib/errorHandling/handleError';

interface ApiToken {
  id: string;
  user_id: string;
  token: string;
  label: string | null;
  created_at: string;
}

interface GenerateTokenResponse {
  token: string;
}

// Fetch user's API tokens
const fetchApiTokens = async (): Promise<ApiToken[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('user_api_tokens')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return data || [];
};

// Generate a new API token
const generateApiToken = async (params: { label: string }): Promise<GenerateTokenResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  
  return await invokeWithTimeout<GenerateTokenResponse>('generate-pat', {
    body: params,
    timeoutMs: 20000,
  });
};

// Revoke an API token
const revokeApiToken = async (tokenId: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  
  await invokeWithTimeout('revoke-pat', {
    body: { tokenId },
    timeoutMs: 20000,
  });
};

export const useApiTokens = () => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  
  // Query to fetch API tokens
  const {
    data: tokens,
    isLoading,
    error
  } = useQuery({
    queryKey: apiQueryKeys.tokens,
    queryFn: fetchApiTokens,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to generate a new API token
  const generateMutation = useMutation({
    mutationFn: generateApiToken,
    onMutate: () => {
      setIsGenerating(true);
    },
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.tokens });      
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useApiTokens', toastTitle: 'Failed to generate API token' });
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Mutation to revoke an API token
  const revokeMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.tokens });
      
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useApiTokens', toastTitle: 'Failed to revoke API token' });
    },
  });

  const refreshTokenMutation = useMutation({
    mutationFn: async (tokenToRefresh: ApiToken) => {
      await revokeApiToken(tokenToRefresh.id);
      return generateApiToken({
        label: tokenToRefresh.label || "Local Generator",
      });
    },
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.tokens });
      
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useApiTokens', toastTitle: 'Failed to refresh token' });
    },
  });

  const generateToken = (label: string) => {
    generateMutation.mutate({ label });
  };

  const revokeToken = (tokenId: string) => {
    revokeMutation.mutate(tokenId);
  };

  const refreshToken = (token: ApiToken) => {
    refreshTokenMutation.mutate(token);
  };

  const clearGeneratedToken = () => {
    setGeneratedToken(null);
  };

  return {
    tokens: tokens || [],
    isLoading,
    error,
    generateToken,
    revokeToken,
    refreshToken,
    isGenerating,
    generatedToken,
    clearGeneratedToken,
    isRevoking: revokeMutation.isPending,
    isRefreshing: refreshTokenMutation.isPending,
  };
}; 
