import { createElement, type ComponentType } from 'react';

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

/** Build the browser adapter that mirrors worker-owned `__astridAssets` staging. */
export function createAstridPreviewAssetWrapper<Props extends {params?: unknown}>(
  Component: ComponentType<Props>,
  defaults: Readonly<Record<string, string>>,
): ComponentType<Props> {
  return function AstridPreviewAssetWrapper(props: Props) {
    const params = asRecord(props.params);
    const callerAssets = asRecord(params.__astridAssets);
    return createElement(Component, {
      ...props,
      params: {
        ...params,
        __astridAssets: {
          ...defaults,
          ...callerAssets,
        },
      },
    });
  };
}
