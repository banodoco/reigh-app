import { build } from 'esbuild';
import { verifyElementAdmissions } from '../config/vite/astridElementAdmissions';

/** Native receiving-build preflight. Source ownership stays in the project pack. */
async function main() {
  const manifest = process.argv[2];
  if (!manifest || process.argv.length !== 3) throw new Error('Usage: verify-element-admission <candidate-selection.json>');
  const admission = verifyElementAdmissions(manifest);
  for (const element of admission.elements) {
    const result = await build({ entryPoints: [element.importPath], bundle: true, write: false, metafile: true,
      platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', logLevel: 'silent',
      external: ['react', 'react/jsx-runtime', 'remotion'],
      loader: {'.png':'dataurl','.jpg':'dataurl','.jpeg':'dataurl','.gif':'dataurl','.svg':'dataurl','.webp':'dataurl','.woff':'dataurl','.woff2':'dataurl'},
    });
    if (!Object.values(result.metafile.outputs).some(output => output.entryPoint && output.exports.includes('default'))) throw new Error(`Element component has no default export: ${element.descriptor.id}`);
  }
  // Detect files changed during compilation, including helpers/assets/schema resources.
  const confirmed = verifyElementAdmissions(manifest);
  if (confirmed.digest !== admission.digest) throw new Error('Element admission selection changed during build');
  process.stdout.write(JSON.stringify({schema:'astrid.element-build/v1',selectionDigest:'sha256:' + admission.digest,
    elements:admission.elements.map(({projectId,descriptor})=>({projectId,packId:descriptor.packId,kind:descriptor.kind,id:descriptor.id,revision:descriptor.revision}))}) + '\n');
}
main().catch(error => {process.stderr.write((error instanceof Error ? error.message : String(error))+'\n');process.exitCode=1;});
