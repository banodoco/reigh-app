import { validateNumericRange } from "./validation.ts";

interface ResolveSeed32BitOptions {
  seed?: number;
  randomize?: boolean;
  fallbackSeed?: number;
  field?: string;
}

const MAX_SEED_32_BIT = 0x7fffffff;

function generateSeed32Bit(): number {
  return Math.floor(Math.random() * MAX_SEED_32_BIT);
}

export function validateSeed32Bit(seed: number | undefined, field = "seed"): void {
  validateNumericRange(seed, {
    field,
    label: "Seed",
    min: 0,
    max: MAX_SEED_32_BIT,
  });
}

export function resolveSeed32Bit({
  seed,
  randomize = false,
  fallbackSeed,
  field = "seed",
}: ResolveSeed32BitOptions): number {
  if (randomize) {
    return generateSeed32Bit();
  }

  const resolvedSeed = seed ?? fallbackSeed;
  if (resolvedSeed !== undefined) {
    validateSeed32Bit(resolvedSeed, field);
    return resolvedSeed;
  }

  return generateSeed32Bit();
}
