export type EffectCategory = 'entrance' | 'exit' | 'continuous';

type ParameterType = 'number' | 'select' | 'boolean' | 'color';

interface ParameterOption {
  label: string;
  value: string;
}

interface ParameterDefinition {
  name: string;
  label: string;
  description: string;
  type: ParameterType;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
}

interface ExtractedEffectMeta {
  code: string;
  name: string;
  description: string;
  parameterSchema: ParameterDefinition[];
}

interface TextRange {
  start: number;
  end: number;
}

export interface BuildGenerateEffectMessagesInput {
  prompt: string;
  name?: string;
  category: EffectCategory;
  existingCode?: string;
}

const EFFECT_COMPONENT_CONTRACT = `EffectComponentProps interface:
type EffectComponentProps = {
  children: React.ReactNode;
  durationInFrames: number;
  effectFrames?: number;
  intensity?: number;
  params?: Record<string, unknown>;
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
- Begin with a single metadata line: // NAME: <fun, playful, creative effect name — be witty and memorable, like naming a cocktail or a wrestling move, 2-4 words>
- Follow with: // DESCRIPTION: <one concise effect description>
- Follow with: // PARAMS: <JSON array of parameter definitions>
- Use [] for // PARAMS when the effect does not need user-adjustable controls
- Each parameter definition must include name, label, description, type, and default
- Number params may include min, max, and step
- Select params must include options as [{ "label": string, "value": string }]
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
  const { prompt, name, category, existingCode } = input;
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

  const userMsg = `Build a ${category} Remotion effect${name ? ` called "${name}"` : ''} for this request:
"${prompt}"

${CATEGORY_GUIDANCE[category]}

${modeInstructions}

Implementation guidance:
- The effect should be production-ready and visually clear on a generic clip
- Keep the logic self-contained in one component
- Prefer readable math and interpolation ranges
- Use effectFrames fallback values when needed so the effect works if the prop is undefined
- Avoid browser APIs or unsupported globals

Return only the final code plus the required metadata lines.`;

  return { systemMsg, userMsg };
}

const NAME_PATTERN = /^\s*\/\/\s*NAME\s*:\s*(.*)$/im;
const DESCRIPTION_PATTERN = /^\s*\/\/\s*DESCRIPTION\s*:\s*(.*)$/im;
const PARAMS_PATTERN = /^\s*\/\/\s*PARAMS\s*:\s*/im;

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^\s*```(?:tsx?|jsx?|javascript|typescript)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gim, '')
    .trim();
}

function getLineEnd(text: string, start: number): number {
  const newlineIndex = text.indexOf('\n', start);
  return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

function extractName(text: string): { name: string; range: TextRange | null } {
  const match = NAME_PATTERN.exec(text);
  if (!match || match.index === undefined) {
    return { name: '', range: null };
  }

  return {
    name: match[1]?.trim() ?? '',
    range: {
      start: match.index,
      end: getLineEnd(text, match.index),
    },
  };
}

function extractDescription(text: string): { description: string; range: TextRange | null } {
  const match = DESCRIPTION_PATTERN.exec(text);
  if (!match || match.index === undefined) {
    return { description: '', range: null };
  }

  return {
    description: match[1]?.trim() ?? '',
    range: {
      start: match.index,
      end: getLineEnd(text, match.index),
    },
  };
}

function findBalancedJsonArray(text: string, startIndex: number): { raw: string; end: number } | null {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1;
  }

  if (text[index] !== '[') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return {
          raw: text.slice(index, cursor + 1),
          end: cursor + 1,
        };
      }
    }
  }

  return null;
}

function sanitizeParameterSchema(value: unknown): ParameterDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is ParameterDefinition => {
    return typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string';
  });
}

function extractParameterSchema(text: string): { parameterSchema: ParameterDefinition[]; range: TextRange | null } {
  const match = PARAMS_PATTERN.exec(text);
  if (!match || match.index === undefined) {
    return { parameterSchema: [], range: null };
  }

  const markerStart = match.index;
  const markerEnd = match.index + match[0].length;
  const jsonArray = findBalancedJsonArray(text, markerEnd);

  if (!jsonArray) {
    return {
      parameterSchema: [],
      range: {
        start: markerStart,
        end: getLineEnd(text, markerStart),
      },
    };
  }

  try {
    return {
      parameterSchema: sanitizeParameterSchema(JSON.parse(jsonArray.raw)),
      range: {
        start: markerStart,
        end: jsonArray.end,
      },
    };
  } catch {
    return {
      parameterSchema: [],
      range: {
        start: markerStart,
        end: jsonArray.end,
      },
    };
  }
}

function stripRanges(text: string, ranges: Array<TextRange | null>): string {
  return ranges
    .filter((range): range is TextRange => range !== null)
    .sort((left, right) => right.start - left.start)
    .reduce((result, range) => result.slice(0, range.start) + result.slice(range.end), text)
    .trim();
}

export function extractEffectCodeAndMeta(responseText: string): ExtractedEffectMeta {
  const normalized = stripMarkdownFences(responseText);
  const { name, range: nameRange } = extractName(normalized);
  const { description, range: descriptionRange } = extractDescription(normalized);
  const { parameterSchema, range: parameterSchemaRange } = extractParameterSchema(normalized);
  const code = stripRanges(normalized, [nameRange, descriptionRange, parameterSchemaRange]);

  validateExtractedEffectCode(code);

  return {
    code,
    name,
    description,
    parameterSchema,
  };
}

export function extractEffectCode(responseText: string): string {
  return extractEffectCodeAndMeta(responseText).code;
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
