import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const registryPath = path.join(process.cwd(), 'config/contracts/registry.json');

if (!existsSync(registryPath)) {
  console.error(`[contracts] Missing registry file: ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const contracts = Array.isArray(registry.contracts) ? registry.contracts : [];
const errors = [];
const nowIsoDate = new Date().toISOString().slice(0, 10);

function parseNamedExportSpecifiers(specifierList) {
  return specifierList
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\btype\b/g, '').trim())
    .filter(Boolean)
    .map((entry) => {
      const aliasMatch = entry.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      return aliasMatch ? aliasMatch[2] : entry;
    })
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function extractExportedSymbols(content) {
  const symbols = new Set();

  const declarationPattern = /export\s+(?:declare\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationPattern)) {
    symbols.add(match[1]);
  }

  const namedExportPattern = /export\s+(?:type\s+)?\{([^}]+)\}\s*(?:from\s+['"][^'"]+['"])?/g;
  for (const match of content.matchAll(namedExportPattern)) {
    const exportBlock = match[1];
    for (const symbol of parseNamedExportSpecifiers(exportBlock)) {
      symbols.add(symbol);
    }
  }

  return Array.from(symbols).sort();
}

for (const contract of contracts) {
  const contractPath = contract?.path;
  if (typeof contractPath !== 'string' || contractPath.length === 0) {
    errors.push(`Registry entry ${contract?.id ?? '<unknown>'} has an invalid path.`);
    continue;
  }

  const absolutePath = path.join(process.cwd(), contractPath);
  if (!existsSync(absolutePath)) {
    errors.push(`Contract file not found: ${contractPath}`);
    continue;
  }

  const content = readFileSync(absolutePath, 'utf8');
  const exportedSymbols = extractExportedSymbols(content);
  const requiredTags = Array.isArray(contract.requiredTags) ? contract.requiredTags : [];
  for (const tag of requiredTags) {
    if (typeof tag === 'string' && !content.includes(tag)) {
      errors.push(`Missing required tag "${tag}" in ${contractPath}`);
    }
  }

  const expectedExports = Array.isArray(contract.expectedExports)
    ? contract.expectedExports.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : [];
  if (expectedExports.length > 0) {
    for (const symbol of expectedExports) {
      if (!exportedSymbols.includes(symbol)) {
        errors.push(`Missing expected export "${symbol}" in ${contractPath}`);
      }
    }

    for (const symbol of exportedSymbols) {
      if (!expectedExports.includes(symbol)) {
        errors.push(
          `Unclassified export "${symbol}" in ${contractPath}. Add it to expectedExports or remove it from the public contract.`,
        );
      }
    }
  }

  if (content.includes('@deprecated')) {
    if (!content.includes('@deprecationOwner')) {
      errors.push(`Missing "@deprecationOwner" metadata for deprecated export(s) in ${contractPath}`);
    }
    if (!content.includes('@removalTarget')) {
      errors.push(`Missing "@removalTarget" metadata for deprecated export(s) in ${contractPath}`);
    } else {
      const removalTargets = [...content.matchAll(/@removalTarget\s+(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]);
      if (removalTargets.length === 0) {
        errors.push(`Invalid "@removalTarget" format in ${contractPath}. Expected YYYY-MM-DD.`);
      }
      for (const target of removalTargets) {
        if (target < nowIsoDate) {
          errors.push(
            `Deprecated contract in ${contractPath} is past removal target (${target}). Remove or migrate before updating governance baseline.`,
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('[contracts] Governance check failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(`[contracts] Governance check passed for ${contracts.length} contract(s).`);
