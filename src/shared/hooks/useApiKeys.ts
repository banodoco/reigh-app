import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';
import { isNotFoundError } from '@/shared/constants/supabaseErrors';
import { queryKeys } from '@/shared/lib/queryKeys';

interface ApiKeys {
  fal_api_key?: string;
  openai_api_key?: string;
  replicate_api_key?: string;
}

// Fetch API keys from the database
const fetchApiKeys = async (): Promise<ApiKeys> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('users')
    .select('api_keys')
    .eq('id', user.id)
    .single();
  
  if (error) {
    // User might not exist yet, return empty keys
    if (isNotFoundError(error)) {
      return {};
    }
    throw error;
  }
  
  return (data?.api_keys as ApiKeys) || {};
};

// Update API keys in the database
const updateApiKeys = async (apiKeys: ApiKeys): Promise<ApiKeys> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();
  
  if (!existingUser) {
    // Create user with API keys
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        api_keys: apiKeys
      })
      .select('api_keys')
      .single();
    
    if (error) throw error;
    return (data?.api_keys as ApiKeys) || {};
  } else {
    // Update existing user's API keys
    const { data, error } = await supabase
      .from('users')
      .update({ api_keys: apiKeys })
      .eq('id', user.id)
      .select('api_keys')
      .single();
    
    if (error) throw error;
    return (data?.api_keys as ApiKeys) || {};
  }
};

export const useApiKeys = () => {
  const queryClient = useQueryClient();
  
  // Query to fetch API keys
  const {
    data: apiKeys,
    isLoading,
    error
  } = useQuery({
    queryKey: queryKeys.api.keys,
    queryFn: fetchApiKeys,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to update API keys
  const updateMutation = useMutation({
    mutationFn: updateApiKeys,
    onSuccess: (updatedKeys) => {
      queryClient.setQueryData(queryKeys.api.keys, updatedKeys);

    },
    onError: (error: Error) => {
      handleError(error, { context: 'useApiKeys', toastTitle: 'Failed to update API keys' });
    },
  });

  const saveApiKeys = (newApiKeys: ApiKeys) => {
    updateMutation.mutate(newApiKeys);
  };

  // Helper function to get a specific API key
  const getApiKey = (keyName: keyof ApiKeys): string => {
    return apiKeys?.[keyName] || '';
  };

  return {
    apiKeys: apiKeys || {},
    isLoading,
    error,
    saveApiKeys,
    getApiKey,
    isUpdating: updateMutation.isPending,
  };
}; 