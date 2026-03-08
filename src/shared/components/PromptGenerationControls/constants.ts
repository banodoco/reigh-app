export interface GenerationControlValues {
  overallPromptText: string;
  remixPromptText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  includeExistingContext: boolean;
  addSummary: boolean;
  replaceCurrentPrompts: boolean;
  temperature: number;
  showAdvanced: boolean;
}

interface TemperatureOption {
  value: number;
  label: string;
  description: string;
}

export const temperatureOptions: TemperatureOption[] = [
  { value: 0.4, label: 'Predictable', description: 'Very consistent' },
  { value: 0.6, label: 'Interesting', description: 'Some variation' },
  { value: 0.8, label: 'Balanced', description: 'Balanced creativity' },
  { value: 1.0, label: 'Chaotic', description: 'Wild & unexpected' },
  { value: 1.2, label: 'Insane', description: 'Maximum randomness' },
];
