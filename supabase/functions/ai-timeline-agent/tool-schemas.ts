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
      description: "Execute a timeline editing command. Commands: view, move <clipId> <seconds>, trim <clipId> [--from N] [--to N] [--duration N], delete <clipId>, set <clipId> <property> <value>, add-text <track> <at> <duration> <text>, find-issues",
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
              "Generation instruction. Required for text-to-image, style-transfer, subject-transfer, scene-transfer, image-to-video, image-to-image, and magic-edit. Optional for image-upscale, video-enhance, and character-animate.",
          },
          model: {
            type: "string",
            enum: ["wan-2.2", "qwen-image", "z-image", "ltx-2.3", "ltx-2.3-fast"],
            description:
              "Optional model choice. Use wan-2.2, qwen-image, or z-image for text-to-image; use wan-2.2, ltx-2.3, or ltx-2.3-fast for image-to-video.",
          },
          reference_image_urls: {
            type: "array",
            items: { type: "string" },
            description:
              "Reference image URLs chosen from the selected media context. Use for style-transfer, subject-transfer, scene-transfer, image-to-video, image-to-image, magic-edit, image-upscale, and character-animate's character image.",
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
              "Number of outputs to request for text-to-image, style-transfer, subject-transfer, scene-transfer, image-to-image, or magic-edit tasks.",
          },
          shot_name: { type: "string", description: "Optional shot name to use if a new shot must be created." },
        },
        required: ["task_type"],
        additionalProperties: false,
      },
    },
  },
];
