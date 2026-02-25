export interface PayloadFieldMapping<TSource> {
  from: keyof TSource;
  to?: string;
  transform?: (value: TSource[keyof TSource]) => unknown;
  include?: (value: TSource[keyof TSource]) => boolean;
}

export function mapDefinedPayloadFields<TSource extends object>(
  source: TSource,
  mappings: readonly PayloadFieldMapping<TSource>[],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  mappings.forEach((mapping) => {
    const sourceValue = source[mapping.from];
    if (sourceValue === undefined) {
      return;
    }

    if (mapping.include && !mapping.include(sourceValue)) {
      return;
    }

    const outputKey = mapping.to ?? String(mapping.from);
    mapped[outputKey] = mapping.transform
      ? mapping.transform(sourceValue)
      : sourceValue;
  });

  return mapped;
}

export function assignMappedPayloadFields<TSource extends object>(
  target: Record<string, unknown>,
  source: TSource,
  mappings: readonly PayloadFieldMapping<TSource>[],
): void {
  Object.assign(target, mapDefinedPayloadFields(source, mappings));
}
