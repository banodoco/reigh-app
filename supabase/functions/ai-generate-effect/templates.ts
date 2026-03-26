export type EffectCategory = 'entrance' | 'exit' | 'continuous';

export interface BuildGenerateEffectMessagesInput {
  prompt: string;
  category: EffectCategory;
  existingCode?: string;
}

const EFFECT_COMPONENT_CONTRACT = `EffectComponentProps interface:
type EffectComponentProps = {
  children: React.ReactNode;
  durationInFrames: number;
  effectFrames?: number;
  intensity?: number;
};`;

const AVAILABLE_GLOBALS = `Available globals at runtime:
- React
- useCurrentFrame()
- useVideoConfig()
- interpolate(value, inputRange, outputRange, options?)
- spring({ frame, fps, durationInFrames?, config? })
- AbsoluteFill`;

const OUTPUT_RULES = `Output requirements:
- Return only executable JavaScript/TypeScript component code
- Do not wrap the answer in markdown fences
- Do not include import statements
- Do not include export statements
- Use React.createElement(...) instead of JSX
- Set the component using exports.default = ComponentName
- The default export must be a function component compatible with EffectComponentProps
- Preserve the passed children and wrap or transform them visually`;

const CATEGORY_GUIDANCE: Record<EffectCategory, string> = {
  entrance: `Category guidance: entrance
- Animate the content into view during the opening effectFrames
- Treat effectFrames as the primary animation window
- After the entrance completes, keep the content stable for the rest of durationInFrames
- Clamp progress so the entrance does not continue past effectFrames`,
  exit: `Category guidance: exit
- Animate the content out during the final effectFrames of the clip
- Keep the content stable before the exit window begins
- Compute the exit window from the tail of durationInFrames
- A common pattern is deriving exitStart = Math.max(0, durationInFrames - (effectFrames ?? fallback))`,
  continuous: `Category guidance: continuous
- Animate across the full durationInFrames instead of only the start or end
- Use durationInFrames as the primary timeline span
- effectFrames is optional for accents, but the main motion should read across the whole clip
- The content should remain visible and animated throughout the clip`,
};

const VALIDATION_RULES = `Validation rules:
- The code must contain exports.default =
- The code must not contain import or export statements
- The code must use React.createElement or React.Fragment instead of JSX syntax`;

export function buildGenerateEffectMessages(input: BuildGenerateEffectMessagesInput): {
  systemMsg: string;
  userMsg: string;
} {
  const { prompt, category, existingCode } = input;
  const modeInstructions = existingCode?.trim()
    ? `Edit mode:
- You are revising an existing effect
- Apply the user's requested changes without rewriting unrelated parts unless necessary
- Keep the result valid under the same runtime contract

Existing code to modify:
\`\`\`ts
${existingCode.trim()}
\`\`\``
    : `Creation mode:
- Generate a new custom effect from scratch
- Pick a clear component name that matches the effect`;

  const systemMsg = `You are a Remotion custom effect generator.

${EFFECT_COMPONENT_CONTRACT}

${AVAILABLE_GLOBALS}

${OUTPUT_RULES}

${VALIDATION_RULES}`;

  const userMsg = `Build a ${category} Remotion effect for this request:
"${prompt}"

${CATEGORY_GUIDANCE[category]}

${modeInstructions}

Implementation guidance:
- The effect should be production-ready and visually clear on a generic clip
- Keep the logic self-contained in one component
- Prefer readable math and interpolation ranges
- Use effectFrames fallback values when needed so the effect works if the prop is undefined
- Avoid browser APIs or unsupported globals

Return only the final code.`;

  return { systemMsg, userMsg };
}

export function extractEffectCode(responseText: string): string {
  const trimmed = responseText.trim();
  const fencedMatch = trimmed.match(/^```(?:tsx?|jsx?|javascript|typescript)?\s*([\s\S]*?)\s*```$/i);
  const code = fencedMatch ? fencedMatch[1].trim() : trimmed;

  validateExtractedEffectCode(code);

  return code;
}

export function validateExtractedEffectCode(code: string): void {
  if (!code.trim()) {
    throw new Error('Effect generation returned empty code');
  }

  if (!code.includes('exports.default')) {
    throw new Error('Generated effect code must assign the component with exports.default = ComponentName');
  }

  if (/\bimport\s.+from\s/m.test(code) || /^\s*import\s/m.test(code)) {
    throw new Error('Generated effect code must not include import statements');
  }

  if (/^\s*export\s/m.test(code)) {
    throw new Error('Generated effect code must not include export statements');
  }

  if (!code.includes('React.createElement')) {
    throw new Error('Generated effect code must use React.createElement instead of JSX');
  }
}
