import { QueryClient } from '@tanstack/react-query';

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUERY_RETRY_DELAY_MS = 3000;
const MUTATION_RETRY_DELAY_MS = 1500;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile-friendly retry strategy that avoids retrying auth/permission failures.
      retry: (failureCount, error) => {
        if (error?.message?.includes('unauthorized') || error?.message?.includes('forbidden')) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, MAX_QUERY_RETRY_DELAY_MS),
      refetchOnWindowFocus: false,
      staleTime: STALE_TIME_MS,
      networkMode: 'online',
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error?.message?.includes('unauthorized') || error?.message?.includes('forbidden')) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: MUTATION_RETRY_DELAY_MS,
      networkMode: 'online',
    },
  },
});
