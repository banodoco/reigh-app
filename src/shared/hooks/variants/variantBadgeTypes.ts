export interface DerivedCountsResult {
  derivedCounts: Record<string, number>;
  hasUnviewedVariants: Record<string, boolean>;
  unviewedVariantCounts: Record<string, number>;
  degraded?: boolean;
  errorCode?: 'query_failed';
}
