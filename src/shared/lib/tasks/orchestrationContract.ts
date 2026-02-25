export const ORCHESTRATION_CONTRACT_VERSION = 3 as const;

export type GenerationRouting =
  | 'orchestrator'
  | 'variant_source'
  | 'variant_child'
  | 'variant_parent'
  | 'child_generation'
  | 'standalone';

export type SiblingLookupMode = 'run_id' | 'orchestrator_task_id';

export type SegmentRegenerationMode = 'segment_regen_from_pair' | 'segment_regen_from_order';

interface OrchestrationContractInput {
  taskFamily: string;
  orchestratorTaskId?: string;
  runId?: string;
  parentGenerationId?: string;
  childGenerationId?: string;
  childOrder?: number;
  shotId?: string;
  basedOn?: string;
  createAsGeneration?: boolean;
  generationRouting?: GenerationRouting;
  siblingLookup?: SiblingLookupMode;
  segmentRegenerationMode?: SegmentRegenerationMode;
}

export interface OrchestrationContract {
  contract_version: typeof ORCHESTRATION_CONTRACT_VERSION;
  task_family: string;
  orchestrator_task_id?: string;
  run_id?: string;
  parent_generation_id?: string;
  child_generation_id?: string;
  child_order?: number;
  shot_id?: string;
  based_on?: string;
  create_as_generation?: boolean;
  generation_routing?: GenerationRouting;
  sibling_lookup?: SiblingLookupMode;
  segment_regen_mode?: SegmentRegenerationMode;
}

export function buildOrchestrationContract(
  input: OrchestrationContractInput,
): OrchestrationContract {
  const contract: OrchestrationContract = {
    contract_version: ORCHESTRATION_CONTRACT_VERSION,
    task_family: input.taskFamily,
  };

  if (input.orchestratorTaskId) contract.orchestrator_task_id = input.orchestratorTaskId;
  if (input.runId) contract.run_id = input.runId;
  if (input.parentGenerationId) contract.parent_generation_id = input.parentGenerationId;
  if (input.childGenerationId) contract.child_generation_id = input.childGenerationId;
  if (typeof input.childOrder === 'number') contract.child_order = input.childOrder;
  if (input.shotId) contract.shot_id = input.shotId;
  if (input.basedOn) contract.based_on = input.basedOn;
  if (typeof input.createAsGeneration === 'boolean') contract.create_as_generation = input.createAsGeneration;
  if (input.generationRouting) contract.generation_routing = input.generationRouting;
  if (input.siblingLookup) contract.sibling_lookup = input.siblingLookup;
  if (input.segmentRegenerationMode) contract.segment_regen_mode = input.segmentRegenerationMode;

  return contract;
}
