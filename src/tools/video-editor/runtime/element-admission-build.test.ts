// @vitest-environment node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { generateElementAdmissionModule, verifyElementAdmissions } from '../../../../config/vite/astridElementAdmissions';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'admitted-element-'))); roots.push(root);
  const snapshot = path.join(root, 'immutable'); fs.mkdirSync(snapshot);
  const source = 'import React from "react"; import {interpolate} from "remotion"; import {value} from "./helper"; export default () => React.createElement("div",null,value+interpolate(0,[0,1],[0,1]));';
  fs.writeFileSync(path.join(snapshot,'component.tsx'),source); fs.writeFileSync(path.join(snapshot,'helper.ts'),'export const value=1;');
  const project = {projectId:'project',packId:'project_pack',packRoot:path.join(root,'canonical'),status:'ready',initCommand:'init',admitCommand:'admit',inspectCommand:'inspect'};
  const entry = {projectId:'project',descriptor:{id:'blocks',packId:'project_pack',kind:'effect',revision:'sha256:old',componentPath:'external/project_pack/old/component.tsx',label:'Blocks',description:'',parameters:[],schema:{type:'object'},defaults:{},renderability:{preview:'supported',browserExport:'supported',workerExport:'unknown'}},
    authoring:{packRoot:project.packRoot,descriptorPath:path.join(project.packRoot,'element.yaml'),componentPath:path.join(project.packRoot,'component.tsx'),status:'ready'},
    snapshot:{root:snapshot,componentPath:'component.tsx',files:['component.tsx','helper.ts'].map(file=>({path:file,sha256:createHash('sha256').update(fs.readFileSync(path.join(snapshot,file))).digest('hex')}))}};
  const manifest = {schema:'astrid.element-admissions/v1',realmId:'realm',projects:[project],elements:[entry]};
  const file=path.join(root,'selection.json');
  const write=()=>fs.writeFileSync(file,JSON.stringify(manifest)); write();
  return {root,snapshot,source,project,entry,manifest,file,write};
}
describe('external admitted element build input',()=>{
  it('generates static normal-compiler imports and portable exact-ref metadata without snapshot path leakage',()=>{
    const f=fixture();const selected=verifyElementAdmissions(f.file);const generated=generateElementAdmissionModule(selected,true);
    expect(selected.files).toHaveLength(2);expect(generated).toContain(`import Component0 from ${JSON.stringify(path.join(f.snapshot,'component.tsx'))}`);
    expect(generated).toContain('sha256:old');expect(generated).toContain('export const configured=true');
    const metadata=generated.split('export const elements=')[1].split(';')[0];expect(metadata).not.toContain(f.snapshot);expect(metadata).toContain(f.project.packRoot);
  });
  it('fails closed for changed snapshot bytes, path escapes, symlinks and undeclared imports',()=>{
    const f=fixture();fs.writeFileSync(path.join(f.snapshot,'helper.ts'),'export const value=2;');expect(()=>verifyElementAdmissions(f.file)).toThrow('Stale');
    f.entry.snapshot.files[1].path='../escape';f.write();expect(()=>verifyElementAdmissions(f.file)).toThrow('Unsafe');
    f.entry.snapshot.files[1].path='helper.ts';fs.unlinkSync(path.join(f.snapshot,'helper.ts'));fs.symlinkSync(path.join(f.snapshot,'component.tsx'),path.join(f.snapshot,'helper.ts'));f.write();expect(()=>verifyElementAdmissions(f.file)).toThrow('symlinks');
  });
  it.each(['import x from "/@react-refresh";','import x from "react/jsx-dev-runtime";','import x from "missing-dependency";','import x from "../undeclared.ts";','const x=import("./helper.ts");','const x=require("./helper.ts");'])('rejects unsupported source dependency %s',source=>{
    const f=fixture();fs.writeFileSync(path.join(f.snapshot,'component.tsx'),source);f.entry.snapshot.files[0].sha256=createHash('sha256').update(source).digest('hex');f.write();expect(()=>verifyElementAdmissions(f.file)).toThrow(/dependency|Undeclared|Dynamic/);
  });
  it('rejects duplicate/conflicting owner identities while retaining explicit old revisions',()=>{
    const f=fixture();f.manifest.elements.push({...f.entry});f.write();expect(()=>verifyElementAdmissions(f.file)).toThrow('Duplicate');
    f.manifest.elements[1]={...f.entry,descriptor:{...f.entry.descriptor,revision:'sha256:new'}};f.write();expect(verifyElementAdmissions(f.file).elements).toHaveLength(2);
  });
  it('runs the normal receiving compiler on pre-CAS candidate and empty init, rejecting invalid TSX before any publication',()=>{
    const f=fixture();const args=[path.resolve('node_modules/tsx/dist/cli.mjs'),path.resolve('scripts/verify-element-admission.ts'),f.file];
    const receipt=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
    expect(receipt).toMatchObject({schema:'astrid.element-build/v1',selectionDigest:'sha256:'+createHash('sha256').update(fs.readFileSync(f.file)).digest('hex'),elements:[{packId:'project_pack',id:'blocks',revision:'sha256:old'}]});
    const validBytes=fs.readFileSync(f.file,'utf8');
    const bad='export default function Broken( {';fs.writeFileSync(path.join(f.snapshot,'component.tsx'),bad);f.entry.snapshot.files[0].sha256=createHash('sha256').update(bad).digest('hex');f.write();
    expect(()=>execFileSync(process.execPath,args,{encoding:'utf8',stdio:'pipe'})).toThrow();
    // The verifier never publishes/writes a selection; the caller's candidate remains unchanged.
    expect(fs.readFileSync(f.file,'utf8')).not.toBe(validBytes);
    f.manifest.elements=[];f.write();expect(JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'})).elements).toEqual([]);
  });
  it('keeps snapshot playback valid if canonical source is missing, and lazy discovery creates nothing',()=>{
    const f=fixture();expect(fs.existsSync(f.project.packRoot)).toBe(false);expect(verifyElementAdmissions(f.file).elements).toHaveLength(1);
    const absent=path.join(f.root,'absent','selection.json');expect(verifyElementAdmissions(absent).elements).toEqual([]);expect(fs.existsSync(path.dirname(absent))).toBe(false);
  });
});
