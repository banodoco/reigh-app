import type { OutputBundle, OutputChunk } from 'rollup';
import { rollup } from 'rollup';
import { describe, expect, it } from 'vitest';
import {
  createBundleBudgetPlugin,
  findJavaScriptBudgetFailures,
  measureJavaScriptBudget,
  type JavaScriptBudget,
} from '../../config/vite/bundleBudget';

function chunk(
  fileName: string,
  code: string,
  options: { entry?: boolean; imports?: string[]; dynamicImports?: string[] } = {},
): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    name: fileName,
    code,
    dynamicImports: options.dynamicImports ?? [],
    implicitlyLoadedBefore: [],
    importedBindings: {},
    imports: options.imports ?? [],
    isDynamicEntry: false,
    isEntry: options.entry ?? false,
    isImplicitEntry: false,
    map: null,
    modules: {},
    exports: [],
    facadeModuleId: null,
    moduleIds: [],
    preliminaryFileName: fileName,
    referencedFiles: [],
  };
}

describe('production bundle budget', () => {
  async function generateEntry(plugins: Parameters<typeof rollup>[0]['plugins']): Promise<string> {
    const build = await rollup({
      input: 'virtual:entry',
      plugins: [
        {
          name: 'virtual-entry',
          resolveId(id) {
            return id === 'virtual:entry' ? id : null;
          },
          load(id) {
            return id === 'virtual:entry' ? 'export const answer = 42;' : null;
          },
        },
        ...plugins,
      ],
    });

    try {
      const generated = await build.generate({
        format: 'es',
        entryFileNames: 'entry.js',
      });
      const entry = generated.output.find(
        (output): output is OutputChunk => output.type === 'chunk' && output.isEntry,
      );
      if (!entry) throw new Error('test bundle did not contain an entry chunk');
      return entry.code;
    } finally {
      await build.close();
    }
  }

  it('measures the entry and recursively imported startup graph, excluding lazy chunks', () => {
    const entry = chunk('entry.js', 'entry', {
      entry: true,
      imports: ['vendor.js'],
      dynamicImports: ['lazy.js'],
    });
    const bundle = {
      'entry.js': entry,
      'vendor.js': chunk('vendor.js', 'vendor', { imports: ['shared.js'] }),
      'shared.js': chunk('shared.js', 'shared'),
      'lazy.js': chunk('lazy.js', 'lazy payload that is not fetched at startup'),
    } as OutputBundle;

    const result = measureJavaScriptBudget(bundle, entry);

    expect(result.entryRawBytes).toBe(5);
    expect(result.initialGraphRawBytes).toBe(17);
    expect(result.initialGraphFiles).toEqual(['entry.js', 'shared.js', 'vendor.js']);
  });

  it('reports every exceeded raw and compressed boundary', () => {
    const measurement = {
      entryFileName: 'entry.js',
      entryRawBytes: 101,
      entryGzipBytes: 51,
      initialGraphFiles: ['entry.js'],
      initialGraphRawBytes: 201,
      initialGraphGzipBytes: 91,
    };
    const budget: JavaScriptBudget = {
      entryRawBytes: 100,
      entryGzipBytes: 50,
      initialGraphRawBytes: 200,
      initialGraphGzipBytes: 90,
    };

    expect(findJavaScriptBudgetFailures(measurement, budget)).toEqual([
      'entry raw: 0.00 MB exceeds 0.00 MB',
      'entry gzip: 0.00 MB exceeds 0.00 MB',
      'initial static graph raw: 0.00 MB exceeds 0.00 MB',
      'initial static graph gzip: 0.00 MB exceeds 0.00 MB',
    ]);
  });

  it('accepts measurements at the exact boundary', () => {
    const measurement = {
      entryFileName: 'entry.js',
      entryRawBytes: 100,
      entryGzipBytes: 50,
      initialGraphFiles: ['entry.js'],
      initialGraphRawBytes: 200,
      initialGraphGzipBytes: 90,
    };

    expect(findJavaScriptBudgetFailures(measurement, {
      entryRawBytes: 100,
      entryGzipBytes: 50,
      initialGraphRawBytes: 200,
      initialGraphGzipBytes: 90,
    })).toEqual([]);
  });

  it('measures bytes added by a later ordinary generateBundle hook', async () => {
    const baseline = await generateEntry([]);
    const budget = createBundleBudgetPlugin({
      entryRawBytes: Buffer.byteLength(baseline, 'utf8'),
      entryGzipBytes: Number.MAX_SAFE_INTEGER,
      initialGraphRawBytes: Number.MAX_SAFE_INTEGER,
      initialGraphGzipBytes: Number.MAX_SAFE_INTEGER,
    });
    const lateBytes = 'x'.repeat(128);
    const laterOrdinaryHook = {
      name: 'later-ordinary-hook',
      generateBundle(_options: unknown, bundle: OutputBundle) {
        const entry = Object.values(bundle).find(
          (output): output is OutputChunk => output.type === 'chunk' && output.isEntry,
        );
        if (!entry) throw new Error('test bundle did not contain an entry chunk');
        entry.code += lateBytes;
      },
    };

    await expect(generateEntry([budget, laterOrdinaryHook])).rejects.toThrow(/entry raw/);
  });
});
