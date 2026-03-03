type GroqCompletionResponse = {
  choices: Array<{ message?: { content?: string | null } }>;
  usage?: unknown;
};

class Groq {
  chat = {
    completions: {
      create: async (): Promise<GroqCompletionResponse> => ({
        choices: [{ message: { content: '' } }],
        usage: null,
      }),
    },
  };

  audio = {
    transcriptions: {
      create: async (): Promise<{ text: string }> => ({ text: '' }),
    },
  };

  constructor(_options?: unknown) {}
}

export default Groq;
