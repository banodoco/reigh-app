// Triage: fast Groq call to classify difficulty
export const GROQ_TRIAGE_MODEL = "moonshotai/kimi-k2-instruct-0905";
export const GROQ_TIMEOUT_MS = 15_000;

// Easy / Okay → Kimi K2.5 via Fireworks
export const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
export const FIREWORKS_MODEL = "accounts/fireworks/models/kimi-k2p5";
export const FIREWORKS_TIMEOUT_MS = 60_000;

// Hard → Claude Opus 4.6 via Anthropic API
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_MODEL = "claude-opus-4-6";
export const ANTHROPIC_TIMEOUT_MS = 90_000;
export const ANTHROPIC_API_VERSION = "2023-06-01";

export const LOOP_LIMIT = 8;
export const SOFT_TIMEOUT_MS = 50_000;
export const MAX_CONTEXT_TURNS = 30;
