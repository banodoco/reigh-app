import type { LiveSceneRequest, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { LiveSceneOperationPort } from './liveSceneOperationPort';

// Host-internal handoff only: issuance is used solely by the ACP wrapper after
// runtime validation. Tickets contain no properties or caller-visible snapshots.
const admissions = new WeakMap<object, { port: LiveSceneOperationPort; request: LiveSceneRequest; scope: LiveSceneScope }>();

export function issueLiveSceneAdmission(port: LiveSceneOperationPort, request: LiveSceneRequest, scope: LiveSceneScope): object {
  const ticket = Object.freeze(Object.create(null) as object);
  admissions.set(ticket, { port, request, scope });
  return ticket;
}

export function consumeLiveSceneAdmission(port: LiveSceneOperationPort, ticket: object) {
  const admission = admissions.get(ticket);
  if (!admission || admission.port !== port) throw new Error('Invalid live-scene admission ticket');
  admissions.delete(ticket);
  return admission;
}
