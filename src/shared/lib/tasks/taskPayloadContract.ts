import { buildOrchestrationContract } from './orchestrationContract';
import { buildTaskViewContract } from './taskViewContract';
import type { OrchestrationContract } from './orchestrationContract';
import type { TaskViewContract } from './taskViewContract';

export const TASK_PAYLOAD_CONTRACT_VERSION = 1 as const;

export interface TaskPayloadContract<TOrchestratorDetails extends object, TFamilyContract extends object> {
  contract_version: typeof TASK_PAYLOAD_CONTRACT_VERSION;
  task_family: string;
  orchestrator_details: TOrchestratorDetails;
  orchestration_contract: OrchestrationContract;
  task_view_contract: TaskViewContract;
  family_contract: TFamilyContract;
}

interface BuildTaskPayloadContractInput<TOrchestratorDetails extends object, TFamilyContract extends object> {
  taskFamily: string;
  orchestratorDetails: TOrchestratorDetails;
  orchestrationContract: OrchestrationContract;
  taskViewContract: TaskViewContract;
  familyContract: TFamilyContract;
}

export interface ComposeTaskFamilyPayloadInput<
  TOrchestratorDetails extends object,
  TFamilyContract extends object,
> {
  taskFamily: string;
  orchestratorDetails: TOrchestratorDetails;
  orchestrationInput: Parameters<typeof buildOrchestrationContract>[0];
  taskViewInput: Parameters<typeof buildTaskViewContract>[0];
  familyContract: TFamilyContract;
}

export function buildTaskPayloadContract<TOrchestratorDetails extends object, TFamilyContract extends object>(
  input: BuildTaskPayloadContractInput<TOrchestratorDetails, TFamilyContract>,
): TaskPayloadContract<TOrchestratorDetails, TFamilyContract> {
  return {
    contract_version: TASK_PAYLOAD_CONTRACT_VERSION,
    task_family: input.taskFamily,
    orchestrator_details: input.orchestratorDetails,
    orchestration_contract: input.orchestrationContract,
    task_view_contract: input.taskViewContract,
    family_contract: input.familyContract,
  };
}

export function composeTaskPayload<TOrchestratorDetails extends object, TFamilyContract extends object>(
  input: BuildTaskPayloadContractInput<TOrchestratorDetails, TFamilyContract>,
): TOrchestratorDetails & TaskPayloadContract<TOrchestratorDetails, TFamilyContract> {
  return {
    ...input.orchestratorDetails,
    ...buildTaskPayloadContract(input),
  };
}

export function composeTaskFamilyPayload<
  TOrchestratorDetails extends object,
  TFamilyContract extends object,
>(
  input: ComposeTaskFamilyPayloadInput<TOrchestratorDetails, TFamilyContract>,
): TOrchestratorDetails & TaskPayloadContract<TOrchestratorDetails, TFamilyContract> {
  return composeTaskPayload({
    taskFamily: input.taskFamily,
    orchestratorDetails: input.orchestratorDetails,
    orchestrationContract: buildOrchestrationContract(input.orchestrationInput),
    taskViewContract: buildTaskViewContract(input.taskViewInput),
    familyContract: input.familyContract,
  });
}
