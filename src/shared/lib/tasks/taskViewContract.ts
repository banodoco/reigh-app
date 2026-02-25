export const TASK_VIEW_CONTRACT_VERSION = 1 as const;

export interface TaskViewContract {
  contract_version: typeof TASK_VIEW_CONTRACT_VERSION;
  input_images: string[];
  prompt?: string;
  enhanced_prompt?: string;
  negative_prompt?: string;
  model_name?: string;
  resolution?: string;
}

interface BuildTaskViewContractInput {
  inputImages: string[];
  prompt?: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
  modelName?: string;
  resolution?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildTaskViewContract(input: BuildTaskViewContractInput): TaskViewContract {
  const contract: TaskViewContract = {
    contract_version: TASK_VIEW_CONTRACT_VERSION,
    input_images: input.inputImages.filter(isNonEmptyString),
  };

  if (isNonEmptyString(input.prompt)) {
    contract.prompt = input.prompt;
  }
  if (isNonEmptyString(input.enhancedPrompt)) {
    contract.enhanced_prompt = input.enhancedPrompt;
  }
  if (isNonEmptyString(input.negativePrompt)) {
    contract.negative_prompt = input.negativePrompt;
  }
  if (isNonEmptyString(input.modelName)) {
    contract.model_name = input.modelName;
  }
  if (isNonEmptyString(input.resolution)) {
    contract.resolution = input.resolution;
  }

  return contract;
}
