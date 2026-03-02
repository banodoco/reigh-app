export type PromptAssemblyPolicy = 'batch_comma' | 'legacy_batch_comma' | 'segment_space';

const POLICY_DELIMITER: Record<PromptAssemblyPolicy, string> = {
  batch_comma: ', ',
  legacy_batch_comma: ', ',
  segment_space: ' ',
};

function normalizePart(part: string | null | undefined): string {
  return (part ?? '').trim();
}

/**
 * Compose prompt fragments with an explicit normalization + delimiter policy.
 * Keeping the policy named at call sites prevents hidden drift between paths.
 */
export function joinPromptParts(
  parts: Array<string | null | undefined>,
  policy: PromptAssemblyPolicy,
): string {
  const delimiter = POLICY_DELIMITER[policy];
  return parts
    .map(normalizePart)
    .filter(Boolean)
    .join(delimiter);
}
