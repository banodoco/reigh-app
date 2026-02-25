import type { TaskPayloadSnapshot } from './taskPayloadSnapshot';
import { buildTaskPayloadSnapshot } from './taskPayloadSnapshot';
import {
  asBoolean,
  asNumber,
  asNumberArray,
  asRecord,
  asString,
  asStringArray,
  type UnknownRecord,
} from './taskParamParsers';

export type TravelPayloadSource =
  | 'taskViewContract'
  | 'individualSegmentParams'
  | 'familyContract'
  | 'orchestratorDetails'
  | 'fullOrchestratorPayload'
  | 'rawParams';

const DEFAULT_SOURCE_ORDER: TravelPayloadSource[] = [
  'taskViewContract',
  'individualSegmentParams',
  'familyContract',
  'orchestratorDetails',
  'fullOrchestratorPayload',
  'rawParams',
];

function getSourceRecord(snapshot: TaskPayloadSnapshot, source: TravelPayloadSource): UnknownRecord {
  switch (source) {
    case 'taskViewContract':
      return snapshot.taskViewContract;
    case 'individualSegmentParams':
      return snapshot.individualSegmentParams;
    case 'familyContract': {
      const readContract = asRecord(snapshot.familyContract.read_contract);
      return readContract ?? snapshot.familyContract;
    }
    case 'rawParams':
      return snapshot.rawParams;
    case 'orchestratorDetails':
      return snapshot.orchestratorDetails;
    case 'fullOrchestratorPayload':
      return snapshot.fullOrchestratorPayload;
    default:
      return {};
  }
}

function pickValue(
  snapshot: TaskPayloadSnapshot,
  key: string,
  order: TravelPayloadSource[] = DEFAULT_SOURCE_ORDER,
): unknown {
  for (const source of order) {
    const record = getSourceRecord(snapshot, source);
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}

export function createTravelPayloadReader(snapshot: TaskPayloadSnapshot) {
  const read = (key: string, order?: TravelPayloadSource[]): unknown =>
    pickValue(snapshot, key, order);

  return {
    read,
    pickString(key: string, order?: TravelPayloadSource[]): string | undefined {
      return asString(read(key, order));
    },
    pickNumber(key: string, order?: TravelPayloadSource[]): number | undefined {
      return asNumber(read(key, order));
    },
    pickBoolean(key: string, order?: TravelPayloadSource[]): boolean | undefined {
      return asBoolean(read(key, order));
    },
    pickRecord(key: string, order?: TravelPayloadSource[]): UnknownRecord | undefined {
      return asRecord(read(key, order));
    },
    pickStringArray(key: string, order?: TravelPayloadSource[]): string[] | undefined {
      return asStringArray(read(key, order));
    },
    pickNumberArray(key: string, order?: TravelPayloadSource[]): number[] | undefined {
      return asNumberArray(read(key, order));
    },
  };
}

export function resolveTravelPairShotGenerationId(
  rawParams: unknown,
  directPairShotGenerationId?: unknown,
): string | undefined {
  const direct = asString(directPairShotGenerationId);
  if (direct) {
    return direct;
  }

  const snapshot = buildTaskPayloadSnapshot(rawParams);
  const reader = createTravelPayloadReader(snapshot);
  return reader.pickString('pair_shot_generation_id', [
    'individualSegmentParams',
    'rawParams',
    'orchestratorDetails',
  ]);
}
