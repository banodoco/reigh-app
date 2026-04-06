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
          amount_of_motion: {
            type: "number",
            description: "Motion intensity 0-100 for image-to-video. Higher = more motion.",
          },
          steps: {
            type: "number",
            description: "Inference steps for image-to-video. Model-dependent (wan-2.2: 6, ltx-2.3: 30, ltx-2.3-fast: 8).",
          },
          guidance_scale: {
            type: "number",
            description: "Guidance scale for image-to-video (LTX models only).",
          },
          enhance_prompt: {
            type: "boolean",
            description: "Auto-enhance prompts for image-to-video.",
          },
          turbo_mode: {
            type: "boolean",
            description: "Turbo mode for wan-2.2 image-to-video (faster, lower quality).",
          },
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
      name: "search_loras",
      description: "Search the LoRA catalog by name, tag, or description. Returns matching LoRAs with paths and metadata.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search text matched against LoRA name, tags, description, and related metadata.",
          },
          base_model: {
            type: "string",
            enum: ["wan", "qwen", "ltx", "z-image"],
            description: "Optional base model filter for narrowing LoRA results.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_lora",
      description: "Add, remove, or update a LoRA in active settings. For video travel: modifies shot LoRAs. For image generation: modifies project LoRAs.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove", "update_strength"],
            description: "Whether to add a LoRA, remove it, or change its strength.",
          },
          lora_path: {
            type: "string",
            description: "Canonical LoRA file path to add, remove, or update.",
          },
          lora_name: {
            type: "string",
            description: "Optional LoRA display name, mainly used when adding a new LoRA.",
          },
          strength: {
            type: "number",
            description: "Optional LoRA strength from 0 to 2.",
          },
          target: {
            type: "string",
            enum: ["video-travel", "image-generation"],
            description: "Which settings scope to modify.",
          },
          trigger_word: {
            type: "string",
            description: "Optional trigger word associated with the LoRA.",
          },
          low_noise_path: {
            type: "string",
            description: "Optional low-noise LoRA path for multi-stage LoRAs.",
          },
        },
        required: ["action", "lora_path", "target"],
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
  {
    type: "function",
    function: {
      name: "get_tasks",
      description:
        "Fetch recent tasks for this project. Use to check task status, see errors, or find completed generation outputs.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Queued", "In Progress", "Complete", "Failed", "Cancelled"],
            description: "Filter by task status. Omit to see all recent tasks.",
          },
          task_id: {
            type: "string",
            description: "Fetch a specific task by ID. When provided, other filters are ignored.",
          },
          limit: {
            type: "number",
            description: "Max tasks to return (default 10, max 50).",
          },
        },
        additionalProperties: false,
      },
    },
  },
];
