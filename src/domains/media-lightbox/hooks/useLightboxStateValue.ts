import { useMemo } from 'react';
import type { LightboxStateValue } from '../contexts/LightboxStateContext';

interface UseLightboxStateValueInput {
  core: LightboxStateValue['core'];
  media: LightboxStateValue['media'];
  variants: LightboxStateValue['variants'];
  navigation: LightboxStateValue['navigation'];
}

export function useLightboxStateValue(
  input: UseLightboxStateValueInput
): LightboxStateValue {
  const { core, media, variants, navigation } = input;
  return useMemo(() => ({
    core,
    media,
    variants,
    navigation,
  }), [core, media, variants, navigation]);
}
