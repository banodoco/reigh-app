export interface TimelineAgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TIMELINE_AGENT_TOOLS: TimelineAgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "run",
      description: "Execute a timeline editing command. Commands: view, move <clipId> <seconds>, split <clipId> <time>, trim <clipId> [--from N] [--to N] [--duration N], delete <clipId>, set <clipId> <property> <value>, add-text <track> <at> <duration> <text>, add-media <track> <at> <generation_id> <url> [--type image|video], swap <clipId> <generation_id> <url> [--type image|video], duplicate <clipId> [count], query, undo, find-issues",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to execute" },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a generation task from text or selected reference media.",
      parameters: {
        type: "object",
        properties: {
          task_type: {
            type: "string",
            enum: [
              "text-to-image",
              "style-transfer",
              "subject-transfer",
              "style-character-transfer",
              "scene-transfer",
              "image-to-video",
              "image-to-image",
              "magic-edit",
              "image-upscale",
              "video-enhance",
              "character-animate",
            ],
          },
          prompt: {
            type: "string",
            description:
              "Generation instruction. Required for text-to-image, style-transfer, subject-transfer, style-character-transfer, scene-transfer, image-to-video, image-to-image, and magic-edit. Optional for image-upscale, video-enhance, and character-animate.",
          },
          model: {
            type: "string",
            enum: ["qwen-image", "qwen-image-2512", "z-image", "wan-2.2", "ltx-2.3", "ltx-2.3-fast"],
            description:
              "Optional model choice. Text-to-image models: qwen-image, qwen-image-2512, z-image. Image-to-video models: wan-2.2, ltx-2.3, ltx-2.3-fast.",
          },
          reference_image_urls: {
            type: "array",
            items: { type: "string" },
            description:
              "Reference image URLs chosen from the selected media context. Use for style-transfer, subject-transfer, style-character-transfer, scene-transfer, image-to-video, image-to-image, magic-edit, image-upscale, and character-animate's character image.",
          },
          reference_mode: {
            type: "string",
            enum: ["style", "subject", "style-character", "scene"],
            description:
              "Optional override for the reference behavior used by transfer tasks when it should differ from the task_type default.",
          },
          video_url: {
            type: "string",
            description:
              "Selected video clip URL. Use for video-enhance and for character-animate's motion reference video.",
          },
          strength: {
            type: "number",
            description: "Optional image-to-image strength from 0 to 1. Higher values make larger changes.",
          },
          count: {
            type: "number",
            description:
              "Number of outputs to request for text-to-image, style-transfer, subject-transfer, style-character-transfer, scene-transfer, image-to-image, or magic-edit tasks.",
          },
          based_on: {
            type: "string",
            description: "Generation ID this task derives from. Overrides auto-detected value from selected clips.",
          },
          shot_name: { type: "string", description: "Optional shot name to use if a new shot must be created." },
        },
        required: ["task_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "duplicate_generation",
      description: "Duplicate an existing generation instantly and return the new generation ID plus asset URL.",
      parameters: {
        type: "object",
        properties: {
          generation_id: {
            type: "string",
            description: "Generation ID to duplicate as a new generation record.",
          },
        },
        required: ["generation_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_shot",
      description: "Create a named shot and group existing generation IDs into it.",
      parameters: {
        type: "object",
        properties: {
          shot_name: {
            type: "string",
            description: "Name for the shot to create.",
          },
          generation_ids: {
            type: "array",
            items: { type: "string" },
            description: "Existing generation IDs to attach to the shot.",
          },
        },
        required: ["shot_name", "generation_ids"],
        additionalProperties: false,
      },
    },
  },
];
