import * as initial from 'virtual:astrid-element-admissions';
import type { ComponentType } from 'react';
import type { AstridElementDescriptor } from './astrid-element-host';
import { ASTRID_BRIDGE_REQUEST_TIMEOUT_MS } from '../data/astridBridgeWire';
type AdmittedDescriptor = AstridElementDescriptor & {label:string; description:string; parameters:import('../types/index').ParameterSchema; defaults:Record<string,unknown>; renderability:{preview:'supported'|'blocked'|'unknown';browserExport:'supported'|'blocked'|'unknown';workerExport:'supported'|'blocked'|'unknown'}};
import type { AstridElementComponentProps } from './astrid-element-host';

export type ProjectElementAuthoring = {
  projectId: string; packId: string; packRoot: string; status: string;
  initCommand: string; admitCommand: string; inspectCommand: string;
};
export type AdmittedElement = {
  projectId: string; descriptor: AdmittedDescriptor;
  authoring: {packRoot: string; descriptorPath: string; componentPath: string; status: string};
};
export type AdmittedElementSelection = {
  projectId: string | null; configured: boolean; selectionDigest: string; realmId: string | null;
  projects: readonly ProjectElementAuthoring[]; elements: readonly AdmittedElement[];
  components: Readonly<Record<string, ComponentType<AstridElementComponentProps>>>;
};
const refKey = (ref: {packId?: string; kind: string; id: string; revision: string}) => JSON.stringify([ref.packId, ref.kind, ref.id, ref.revision]);
const listeners = new Set<() => void>();
// Pack selection talks to the same local Runtime as editor data requests.
// Reuse its request budget for verification plus browser module admission.
export const ADMITTED_ELEMENT_LOAD_TIMEOUT_MS = ASTRID_BRIDGE_REQUEST_TIMEOUT_MS;
type AdmissionReadiness = {projectId: string | null; refKeys: readonly string[]; phase: 'idle' | 'loading' | 'ready' | 'error'; error: string | null};
const readinessListeners = new Set<() => void>();
let readiness: AdmissionReadiness = {projectId: null, refKeys: [], phase: 'idle', error: null};
const publishReadiness = (next: AdmissionReadiness) => {
  readiness = next;
  readinessListeners.forEach(listener => listener());
};
export const getAdmittedElementReadiness = () => readiness;
export const subscribeAdmittedElementReadiness = (listener: () => void) => {
  readinessListeners.add(listener);
  return () => { readinessListeners.delete(listener); };
};
export const usesScopedElementAdmissions = () => import.meta.env.DEV && initial.configured;
let current: AdmittedElementSelection = initial;
let generation = 0;
let scope: {projectId:string;refs:Array<{packId:string;kind:'effect'|'animation'|'transition';id:string;revision:string}>}|null=null;
export function setAdmittedElementScope(projectId:string,refs:NonNullable<typeof scope>['refs']) {
  const next={projectId,refs:[...new Map(refs.map(ref=>[refKey(ref),ref])).values()].sort((a,b)=>refKey(a).localeCompare(refKey(b)))};
  if(JSON.stringify(scope)===JSON.stringify(next))return;
  const changed=scope?.projectId!==projectId;scope=next;++generation;
  publishReadiness({projectId, refKeys: next.refs.map(refKey), phase: 'loading', error: null});
  if(changed){current={...initial,projectId,elements:[],components:{},projects:[],selectionDigest:'empty'};listeners.forEach(listener=>listener());}
}

export const getAdmittedElementSelection = () => current;
export const subscribeAdmittedElements = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Native receiving-build refresh, independent of mounted editor/ACP authority. */
export async function refreshAdmittedElements(
  read?: () => Promise<{digest: string; moduleUrl: string; projectId?: string} | null>,
  load = (url: string): Promise<AdmittedElementSelection> => import(/* @vite-ignore */ url),
): Promise<AdmittedElementSelection> {
  const controller = new AbortController();
  const readSelection = read ?? (async () => {
    if (!import.meta.env.DEV || !initial.configured || !scope) return null;
    const response = await fetch('/api/astrid-element-admissions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(scope),cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error('Pack admission is unavailable or invalid; inspect/admit the project pack before applying a ref.');
    return response.json() as Promise<{digest: string; moduleUrl: string;projectId?:string}>;
  });
  const request = ++generation;
  const requestedProject=scope?.projectId;
  const requestedReadiness = {...readiness, phase: 'loading' as const, error: null};
  publishReadiness(requestedReadiness);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Preview pack loading timed out. Check the local connection and inspect/admit the project pack, then reload the editor.'));
      controller.abort();
    }, ADMITTED_ELEMENT_LOAD_TIMEOUT_MS);
  });
  try {
    const info = await Promise.race([readSelection(), deadline]);
    if (request !== generation) return current;
    if (!info || info.digest === current.selectionDigest) {
      publishReadiness({...requestedReadiness, phase:'ready'});
      return current;
    }
    if (!/^[a-f0-9]{64}$/.test(info.digest) || info.moduleUrl !== '/@id/__x00__virtual:astrid-element-admissions?v=' + info.digest) throw new Error('Invalid host-selected element build URL');
    const next = await Promise.race([load(info.moduleUrl), deadline]);
    if (request !== generation) return current;
    if (requestedProject && next.projectId!==requestedProject) throw new Error('Element selection belongs to another project');
    if (next.selectionDigest !== info.digest || !Array.isArray(next.elements) || !Array.isArray(next.projects) || !next.components
      || (current.realmId !== null && next.realmId !== current.realmId)) throw new Error('Element build selection does not match its verified host receipt');
    for (const entry of next.elements) if (typeof next.components[refKey(entry.descriptor)] !== 'function') throw new Error('Element build is incomplete');
    // Only the active exact requested pins are loaded. Missing pins stay unavailable; never substitute newest code.
    // import() returns an exotic module namespace: freezing it throws even when
    // each export is valid. Own a plain snapshot rather than mutating that namespace.
    current = Object.freeze({projectId:next.projectId,configured:next.configured,selectionDigest:next.selectionDigest,
      realmId:next.realmId,projects:next.projects,elements:next.elements,components:next.components});
    listeners.forEach(listener => listener());
    publishReadiness({...requestedReadiness, phase:'ready'});
    return current;
  } catch (error) {
    if (request === generation) publishReadiness({...requestedReadiness, phase:'error', error:error instanceof Error ? error.message : String(error)});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function admittedComponent(ref: {packId?: string; kind: string; id: string; revision: string}) {
  return current.components[refKey(ref)];
}
export function isAdmittedElementPreviewPreparing(
  projectId: string,
  refs: readonly {packId?: string; kind: string; id: string; revision: string}[],
) {
  if (!refs.length) return false;
  if (readiness.projectId !== projectId || readiness.phase === 'idle') return true;
  const missing = refs.filter(ref => !admittedComponent(ref));
  // A new config may render once before the provider's scope effect runs.
  // A completed request only settles the exact pins that it checked.
  if (missing.some(ref => !readiness.refKeys.includes(refKey(ref)))) return true;
  return missing.length > 0 && readiness.phase === 'loading';
}
export function projectElementAuthoring(projectId: string) {
  return current.projects.find(project => project.projectId === projectId) ?? null;
}
if (import.meta.hot) import.meta.hot.on('astrid:elements-admitted', () => { void refreshAdmittedElements().catch(error => { console.error('Project pack activation failed; the previous verified build is retained.',error); }); });

export function admittedCatalogEntries(projectId?: string): import('./element-contract').AstridElementCatalogEntry[] {
  return current.elements.filter(entry => !projectId || entry.projectId === projectId).map(({descriptor: d, authoring}) => ({
    admitted:true,id: d.id, packId: d.packId, kind: d.kind, revision: d.revision, label: d.label,
    description: d.description, placement: d.kind === 'transition' ? 'between-clips' : 'overlay', publication: 'published',
    schema: d.parameters as import('../types/index').ParameterSchema, defaults: d.defaults,
    capabilities: {browserPreview: d.renderability.preview, astridExport: d.renderability.browserExport, workerExport: d.renderability.workerExport},
    authoring,
  }));
}
export function projectPackContext(projectId: string) {
  const existing = projectElementAuthoring(projectId);
  const command = `python3 -m astrid.core.element.cli project-pack`;
  const selector = `--realm ${current.realmId ?? '<configured-realm-id>'} --project ${projectId}`;
  return { status: existing?.status ?? 'not-created', ...(existing ?? {}),
    realmId: current.realmId, projectId,
    initCommand: existing?.initCommand ?? `${command} init ${selector}`,
    inspectCommand: existing?.inspectCommand ?? `${command} inspect ${selector}`,
    admitCommand: existing?.admitCommand ?? `${command} admit ${selector}`,
    elements: current.elements.filter(entry => entry.projectId === projectId).slice(0,32).map(({descriptor,authoring})=>({
      ref:{packId:descriptor.packId,kind:descriptor.kind,id:descriptor.id,revision:descriptor.revision},...authoring,
    })),
  };
}

export async function refreshProjectElementContext(projectId:string) {
  if(scope?.projectId!==projectId)setAdmittedElementScope(projectId,[]);
  return refreshAdmittedElements();
}
export async function refreshAdmittedElementRef(ref:{packId?:string;kind:'effect'|'animation'|'transition';id:string;revision:string}) {
  if(scope && ref.packId)setAdmittedElementScope(scope.projectId,[...scope.refs,{...ref,packId:ref.packId}]);
  return refreshAdmittedElements();
}
