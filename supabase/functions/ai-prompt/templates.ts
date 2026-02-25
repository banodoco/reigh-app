const OUTPUT_ONLY_PROMPT_POLICY = `CRITICAL FORMATTING REQUIREMENTS:
- Output ONLY the revised prompt text
- NO additional commentary, explanations, or formatting
- NO quotation marks around the output`;

const SIMPLE_SUBJECT_REMINDER = `CRITICAL REMINDER: If the user asks for simple subjects (like "a man", "a woman", "a train"), styles, or scenes without asking for details or variety, keep them simple in the prompt. Only add descriptive details when specifically requested.`;

export function buildGeneratePromptsMessages(input: {
  overallPromptText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  existingPrompts: unknown[];
}): { systemMsg: string; userMsg: string } {
  const {
    overallPromptText,
    rulesToRememberText,
    numberToGenerate,
    existingPrompts,
  } = input;

  const resolvedRequest = overallPromptText || "Please generate general image prompts based on the overall goal and rules.";

  const systemMsg = `You are a helpful assistant that generates detailed image prompts optimized for AI image generation. Focus on visual elements like composition, lighting, colors, and atmosphere while following the user's specific instructions and formatting requirements.`;

  let instructions = `Generate exactly ${numberToGenerate} distinct image generation prompts based on the following:

USER REQUEST: ${resolvedRequest}

ADDITIONAL RULES TO REMEMBER: ${rulesToRememberText}

IMPORTANT GUIDELINES:
- Each prompt should be specifically designed for AI image generation
- Keep the user's descriptions as stated - only add detail when they specifically request it
- Focus on visual elements like composition, lighting, colors, and atmosphere
- SUBJECT GUIDANCE: If the user asks for simple subjects like "a man", "a woman", or "a train" without requesting additional details or variety, mention them simply without embellishment. Only add descriptive details when specifically requested.
- CHARACTER GUIDANCE: Only mention specific character details if requested - if the user asks for them. If they provide a character description use it consistently across prompts. If they ask you to generate characters, give them unique character names and descriptions for each prompt.
- STYLE GUIDANCE: Only mention specific artistic styles (photography, anime, oil painting, digital art) if specifically requested. Keep styles simple unless the user asks for detailed styling.
- SCENE GUIDANCE: Only provide detailed scene and environment descriptions when specifically requested. If the user mentions a simple scene, keep it simple.

CRITICAL FORMATTING REQUIREMENTS:
- Output EXACTLY ${numberToGenerate} prompts
- Each prompt must be on its own line
- NO numbering, bullet points, quotation marks, empty lines, formatting, markdown or special characters`;

  if (existingPrompts.length) {
    const ctx = existingPrompts
      .map((prompt) => `- ${typeof prompt === "string" ? prompt : (prompt as Record<string, unknown>)?.text ?? ""}`)
      .join("\n");
    instructions += `\n\nExisting Prompts for Context (do NOT repeat or return these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
  } else {
    instructions += `

FORMAT EXAMPLE (${numberToGenerate} prompts):
[if the user tells you to refer to a dragon] The dragon is soaring through storm clouds with lightning illuminating its scales, below massive skyscrapers are visible through the clouds
[if the user asks you to come up with a female German character] A woman named Gracie Marr, she's tall, blonde, and has delicate mousey features. She's standing on sand dunes under a starry night sky, the nights sky is clear and the moon is visible behind them.
[if the user asks you to come up with a playful style] A picture of a dog in a mix of crayons and marker, reminiscent of a modern childlike version of a work of Klimt.
[if the user asks you to refer to an old man doing chores] The old man is doing chores in his garden, he's wearing a red shirt and blue pants. He's watering the plants with a watering can. He's wearing a red hat and a red jacket.
[if the user asks you to come up with a futuristic style] An angular modernist painting in the style of Akira Kurosawa's The Hidden Fortress.`;
  }

  instructions += `

YOUR OUTPUT (${numberToGenerate} prompts):

Reminder: here's the user request: "${resolvedRequest}" - make sure to respect that precisely.

${SIMPLE_SUBJECT_REMINDER}

IMPORTANT: Only respond with the ${numberToGenerate} prompts, nothing else. Do not include any commentary, explanations, or additional text.`;

  return {
    systemMsg,
    userMsg: instructions,
  };
}

export function buildEditPromptMessages(input: {
  originalPromptText: string;
  editInstructions: string;
}): { systemMsg: string; userMsg: string } {
  const { originalPromptText, editInstructions } = input;

  const systemMsg = `You are an AI assistant that helps refine user prompts for image generation. Edit the provided prompt based on the user's instructions while maintaining optimization for AI image generation.`;
  const userMsg = `Original Image Prompt: ${originalPromptText}

Edit Instructions: ${editInstructions}

GUIDELINES:
- Only change what is specifically requested in the edit instructions
- Do not add specific artistic styles (like 'photography', 'anime', 'oil painting', 'digital art', etc.) unless specifically requested
- Focus on describing the subject, scene, composition, lighting, and visual details
- Keep it optimized for AI image generation with detailed visual descriptions

${OUTPUT_ONLY_PROMPT_POLICY}

Revised Prompt:`;

  return { systemMsg, userMsg };
}

export const ENHANCE_SEGMENT_SYSTEM_PROMPT = `You are an expert at creating motion-focused video generation prompts. You analyze start and end frames and create vivid descriptions of the motion and transitions between them.

CRITICAL RULES:
- If the user gives a direct prompt, PRESERVE their exact wording - do not paraphrase or embellish with synonyms
- Output ONLY your three-sentence prompt
- NO quotation marks, labels, explanations, or commentary
- Do NOT include "SENTENCE 1:", "SENTENCE 2:", etc. labels
- Just output the three sentences directly`;

export function buildEnhanceSegmentUserPrompt(prompt: string): string {
  return `You are viewing two images side by side: the LEFT image (with GREEN border) shows the STARTING frame, and the RIGHT image (with RED border) shows the ENDING frame of a video sequence.

The user's input is: '${prompt}'

CRITICAL - DETERMINE THE USER'S INTENT:
1. If the user's input already reads like a DIRECT PROMPT (describes visuals, camera movement, scene elements in complete sentences), PRESERVE THEIR EXACT WORDING as much as possible. Only expand to three sentences if needed, using their original phrasing as the foundation.
2. If the user's input is INSTRUCTIONS (e.g., "describe...", "make it more...", "add...") or a brief description that needs elaboration, then create a detailed three-sentence prompt.

EXAMPLES OF DIRECT PROMPTS (preserve these):
- "the camera flies through the sky to the distant hills as the snow storm begins" -> This IS the prompt. Keep this wording.
- "A woman walks through the garden as petals fall around her" -> This IS the prompt. Keep this wording.

EXAMPLES OF INSTRUCTIONS (elaborate these):
- "describe the camera moving through clouds" -> User wants you to write the prompt
- "something dramatic with a storm" -> User wants you to create details
- "make it cinematic" -> User wants elaboration

FOCUS ON MOTION: Describe what MOVES, what CHANGES, and HOW things transition between these frames. Everything should be described in terms of motion and transformation, not static states.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE:

SENTENCE 1 (PRIMARY MOTION): Describe the main action, camera movement, and major scene transitions. What is the dominant movement happening?

SENTENCE 2 (MOVING ELEMENTS): Describe how the characters, objects, and environment are moving or changing. Focus on what's in motion and how it moves through space.

SENTENCE 3 (MOTION DETAILS): Describe the subtle motion details - secondary movements, environmental dynamics, particles, lighting shifts, and small-scale motions.

Examples of MOTION-FOCUSED descriptions:

- "The sun rises rapidly above the jagged peaks as the camera tilts upward from the dark valley floor. The silhouette pine trees sway gently against the shifting violet and gold sky as the entire landscape brightens. Wisps of morning mist evaporate and drift upward from the river surface while distant birds circle and glide through the upper left corner."

- "A woman sprints from the kitchen into the bright exterior sunlight as the camera pans right to track her accelerating path. Her vintage floral dress flows and ripples in the wind while colorful playground equipment blurs past in the background. Her hair whips back dynamically and dust particles kick up and swirl around her sneakers as she impacts the gravel."

- "The camera zooms aggressively inward into a macro shot of an eye as the brown horse reflection grows larger and more detailed. The iris textures shift under the changing warm lighting while the biological details come into sharper focus. The pupil constricts and contracts in reaction to the light while the tiny reflected horse tosses its mane and shifts position."

Now create your THREE-SENTENCE MOTION-FOCUSED description based on: '${prompt}'

FINAL REMINDER: If the user's input already sounds like a prompt (describes camera, motion, scene), USE THEIR EXACT WORDS. Do not replace "flies" with "soars", "sky" with "turbulent sky", "snow storm begins" with "first snowflakes swirl". Keep their language intact.`;
}
