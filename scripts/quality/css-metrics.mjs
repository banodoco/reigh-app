import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

const getArgNumber = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const maxImportant = getArgNumber('--max-important', 8);
const maxWildcardSelectors = getArgNumber('--max-wildcard-selectors', 0);
const maxLinesPerFile = getArgNumber('--max-lines', 300);

const root = process.cwd();
const srcDir = path.join(root, 'src');

async function walkCssFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkCssFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.css')) {
      files.push(fullPath);
    }
  }

  return files;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function toRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

async function main() {
  const cssFiles = await walkCssFiles(srcDir);

  let totalImportant = 0;
  let totalWildcardAttributeSelectors = 0;
  const perFile = [];

  for (const file of cssFiles) {
    const content = await readFile(file, 'utf8');
    const lineCount = content.split(/\r?\n/).length;
    const importantCount = countMatches(content, /\b[a-z-]+\s*:[^;{}]*!important\b/gi);
    const wildcardAttributeSelectorCount = countMatches(content, /\[[^\]]*(\*=|\^=)[^\]]*\]/g);

    totalImportant += importantCount;
    totalWildcardAttributeSelectors += wildcardAttributeSelectorCount;

    perFile.push({
      file: toRelative(file),
      lineCount,
      importantCount,
      wildcardAttributeSelectorCount,
    });
  }

  const overLineBudget = perFile.filter((item) => item.lineCount > maxLinesPerFile);
  const topImportant = [...perFile]
    .filter((item) => item.importantCount > 0)
    .sort((a, b) => b.importantCount - a.importantCount)
    .slice(0, 10);

  console.log('CSS Metrics');
  console.log(`- Files scanned: ${perFile.length}`);
  console.log(`- Total !important: ${totalImportant}`);
  console.log(`- Attribute wildcard selectors (*= or ^=): ${totalWildcardAttributeSelectors}`);
  console.log(`- Max lines in one file: ${Math.max(...perFile.map((item) => item.lineCount), 0)}`);

  if (topImportant.length > 0) {
    console.log('- Top files by !important:');
    for (const item of topImportant) {
      console.log(`  - ${item.file}: ${item.importantCount}`);
    }
  }

  if (checkMode) {
    const failures = [];

    if (totalImportant > maxImportant) {
      failures.push(`Total !important (${totalImportant}) exceeds budget (${maxImportant}).`);
    }

    if (totalWildcardAttributeSelectors > maxWildcardSelectors) {
      failures.push(
        `Wildcard attribute selectors (${totalWildcardAttributeSelectors}) exceeds budget (${maxWildcardSelectors}).`
      );
    }

    if (overLineBudget.length > 0) {
      failures.push(
        `Files exceeding ${maxLinesPerFile} lines: ${overLineBudget
          .map((item) => `${item.file} (${item.lineCount})`)
          .join(', ')}`
      );
    }

    if (failures.length > 0) {
      console.error('\nCSS metrics check failed:');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }

    console.log('\nCSS metrics check passed.');
  }
}

main().catch((error) => {
  console.error('Failed to compute CSS metrics:', error);
  process.exit(1);
});
