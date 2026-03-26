import { useMemo } from 'react';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import {
  useCreateResource,
  useDeleteResource,
  useListPublicResources,
  useListResources,
  useUpdateResource,
  type EffectMetadata,
  type Resource,
} from '@/features/resources/hooks/useResources';

export type EffectCategory = EffectMetadata['category'];

export type EffectResource = EffectMetadata & {
  id: string;
  type: 'effect';
  userId?: string;
  user_id?: string;
  isPublic?: boolean;
  is_public?: boolean;
  createdAt?: string;
  created_at?: string;
};

export type EffectResourcesByCategory = Record<EffectCategory, EffectResource[]>;

const EMPTY_EFFECT_GROUPS: EffectResourcesByCategory = {
  entrance: [],
  exit: [],
  continuous: [],
};

function toEffectResource(resource: Resource): EffectResource {
  const metadata = resource.metadata as EffectMetadata;
  return {
    id: resource.id,
    type: 'effect',
    userId: resource.userId,
    user_id: resource.user_id,
    isPublic: resource.isPublic,
    is_public: resource.is_public,
    createdAt: resource.createdAt,
    created_at: resource.created_at,
    ...metadata,
  };
}

function dedupeEffectResources(resources: Resource[]): EffectResource[] {
  const deduped = new Map<string, EffectResource>();

  for (const resource of resources) {
    deduped.set(resource.id, toEffectResource(resource));
  }

  return [...deduped.values()];
}

function groupEffectResources(resources: EffectResource[]): EffectResourcesByCategory {
  return resources.reduce<EffectResourcesByCategory>((groups, resource) => {
    groups[resource.category].push(resource);
    return groups;
  }, {
    entrance: [],
    exit: [],
    continuous: [],
  });
}

export function useEffectResources(userId: string | null | undefined) {
  const privateEffectsQuery = useListResources('effect');
  const publicEffectsQuery = useListPublicResources('effect');

  const effects = useMemo(() => {
    const privateResources = userId ? privateEffectsQuery.data ?? [] : [];
    const publicResources = publicEffectsQuery.data ?? [];
    return dedupeEffectResources([...privateResources, ...publicResources]);
  }, [privateEffectsQuery.data, publicEffectsQuery.data, userId]);

  const byCategory = useMemo(() => {
    if (effects.length === 0) {
      return EMPTY_EFFECT_GROUPS;
    }

    return groupEffectResources(effects);
  }, [effects]);

  return {
    data: byCategory,
    effects,
    entrance: byCategory.entrance,
    exit: byCategory.exit,
    continuous: byCategory.continuous,
    isLoading: privateEffectsQuery.isLoading || publicEffectsQuery.isLoading,
    isFetching: privateEffectsQuery.isFetching || publicEffectsQuery.isFetching,
    error: privateEffectsQuery.error ?? publicEffectsQuery.error ?? null,
    refetch: async () => {
      const results = await Promise.all([privateEffectsQuery.refetch(), publicEffectsQuery.refetch()]);
      return results;
    },
    privateEffectsQuery,
    publicEffectsQuery,
  };
}

export function useCreateEffectResource(): Omit<
  UseMutationResult<Resource, Error, { metadata: EffectMetadata }, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, { metadata: EffectMetadata }, unknown>['mutate'];
  mutateAsync: (variables: { metadata: EffectMetadata }, options?: UseMutationOptions<Resource, Error, { metadata: EffectMetadata }, unknown>) => Promise<Resource>;
} {
  const mutation = useCreateResource();

  return {
    ...mutation,
    mutate: (variables, options) => mutation.mutate({ type: 'effect', metadata: variables.metadata }, options),
    mutateAsync: (variables, options) => mutation.mutateAsync({ type: 'effect', metadata: variables.metadata }, options),
  };
}

export function useUpdateEffectResource(): Omit<
  UseMutationResult<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>['mutate'];
  mutateAsync: (variables: { id: string; metadata: EffectMetadata }, options?: UseMutationOptions<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>) => Promise<Resource>;
} {
  const mutation = useUpdateResource();

  return {
    ...mutation,
    mutate: (variables, options) => mutation.mutate({ id: variables.id, type: 'effect', metadata: variables.metadata }, options),
    mutateAsync: (variables, options) => mutation.mutateAsync({ id: variables.id, type: 'effect', metadata: variables.metadata }, options),
  };
}

export function useDeleteEffectResource(): Omit<
  UseMutationResult<void, Error, { id: string }, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<void, Error, { id: string }, unknown>['mutate'];
  mutateAsync: (variables: { id: string }, options?: UseMutationOptions<void, Error, { id: string }, unknown>) => Promise<void>;
} {
  const mutation = useDeleteResource();

  return {
    ...mutation,
    mutate: (variables, options) => mutation.mutate({ id: variables.id, type: 'effect' }, options),
    mutateAsync: (variables, options) => mutation.mutateAsync({ id: variables.id, type: 'effect' }, options),
  };
}
