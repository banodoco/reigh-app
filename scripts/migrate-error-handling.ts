/**
 * Error handling migration script
 *
 * Transforms catch blocks to use handleError() consistently.
 *
 * Usage:
 *   DRY RUN (preview changes):
 *     npx tsx scripts/migrate-error-handling.ts --dry-run
 *
 *   APPLY to specific file:
 *     npx tsx scripts/migrate-error-handling.ts --file src/shared/hooks/useCredits.ts
 *
 *   APPLY to all files:
 *     npx tsx scripts/migrate-error-handling.ts --apply
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Transformation {
  file: string;
  startLine: number;
  endLine: number;
  original: string;
  transformed: string;
  type: 'simple' | 'complex' | 'skipped';
  reason?: string;
}

const transformations: Transformation[] = [];
const srcDir = path.join(__dirname, '..', 'src');

function getContextFromPath(filePath: string): string {
  const relativePath = path.relative(srcDir, filePath);
  const parts = relativePath.replace(/\.(ts|tsx)$/, '').split(path.sep);
  const fileName = parts[parts.length - 1];
  if (fileName === 'index') {
    return parts[parts.length - 2] || 'Unknown';
  }
  return fileName;
}

function extractToastMessage(code: string): string | null {
  // Match toast.error('message') or toast.error("message")
  const simpleMatch = code.match(/toast\.error\(['"]([^'"]+)['"]\)/);
  if (simpleMatch) return simpleMatch[1];

  // Match toast({ title: "Error", description: "message", variant: "destructive" })
  const objectMatch = code.match(/toast\(\s*\{[^}]*description:\s*['"]([^'"]+)['"]/);
  if (objectMatch) return objectMatch[1];

  // Match toast.error with template literal or variable
  const dynamicMatch = code.match(/toast\.error\(`([^`]+)`\)/);
  if (dynamicMatch) return dynamicMatch[1].replace(/\$\{[^}]+\}/g, '...');

  return null;
}

function extractErrorVariable(catchLine: string): string {
  const match = catchLine.match(/catch\s*\(\s*(\w+)\s*\)/);
  return match ? match[1] : 'error';
}

function transformCatchBlock(
  lines: string[],
  catchLineIndex: number,
  context: string
): { transformed: string; endLine: number; type: 'simple' | 'complex' | 'skipped'; reason?: string } | null {
  const catchLine = lines[catchLineIndex];
  const errorVar = extractErrorVariable(catchLine);

  // Find the catch block's opening brace position in the line
  const catchBraceMatch = catchLine.match(/catch\s*\([^)]*\)\s*\{/);
  if (!catchBraceMatch) return null;

  const catchBraceIndex = catchLine.indexOf(catchBraceMatch[0]) + catchBraceMatch[0].length - 1;

  // Count braces starting from AFTER the catch opening brace
  let braceCount = 1; // Start at 1 because we found the opening brace
  let endIndex = catchLineIndex;

  // Check rest of first line after the opening brace
  for (let j = catchBraceIndex + 1; j < catchLine.length; j++) {
    if (catchLine[j] === '{') braceCount++;
    else if (catchLine[j] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = catchLineIndex;
        break;
      }
    }
  }

  // Continue to subsequent lines if block not closed
  if (braceCount > 0) {
    for (let i = catchLineIndex + 1; i < lines.length && i < catchLineIndex + 50; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') braceCount++;
        else if (line[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }
      if (braceCount === 0) break;
    }
  }

  // Extract block content
  const blockLines = lines.slice(catchLineIndex, endIndex + 1);
  const blockContent = blockLines.join('\n');

  // Skip if already uses handleError
  if (/handleError\(/.test(blockContent)) {
    return { transformed: blockContent, endLine: endIndex, type: 'skipped', reason: 'Already uses handleError' };
  }

  // Analyze block content
  const hasConsoleError = /console\.error/.test(blockContent);
  const hasToastError = /toast\.error|toast\(\s*\{[^}]*variant:\s*['"]destructive['"]/.test(blockContent);
  const toastMessage = extractToastMessage(blockContent);

  // Check for complex patterns that need manual review
  const hasReturn = /\breturn\b/.test(blockContent);
  const hasStateUpdate = /\bset[A-Z]\w*\(/.test(blockContent);
  const hasMultipleStatements = (blockContent.match(/;/g) || []).length > 3;
  const hasConditional = /\bif\s*\(|\bswitch\s*\(/.test(blockContent);
  const hasAwait = /\bawait\b/.test(blockContent);

  // Get indentation from catch line
  const indentMatch = catchLine.match(/^(\s*)/);
  const baseIndent = indentMatch ? indentMatch[1] : '';
  const innerIndent = baseIndent + '  ';

  // SIMPLE PATTERN: Just console.error + optional toast.error
  if (!hasReturn && !hasStateUpdate && !hasConditional && !hasAwait && !hasMultipleStatements) {
    let handleErrorCall: string;

    if (hasConsoleError && hasToastError && toastMessage) {
      handleErrorCall = `handleError(${errorVar}, { context: '${context}', toastTitle: '${toastMessage.replace(/'/g, "\\'")}' });`;
    } else if (hasConsoleError && hasToastError) {
      handleErrorCall = `handleError(${errorVar}, { context: '${context}' });`;
    } else if (hasConsoleError) {
      handleErrorCall = `handleError(${errorVar}, { context: '${context}', showToast: false });`;
    } else if (hasToastError && toastMessage) {
      handleErrorCall = `handleError(${errorVar}, { context: '${context}', toastTitle: '${toastMessage.replace(/'/g, "\\'")}' });`;
    } else {
      return null;
    }

    const transformed = `${catchLine}\n${innerIndent}${handleErrorCall}\n${baseIndent}}`;
    return { transformed, endLine: endIndex, type: 'simple' };
  }

  // COMPLEX PATTERN: Has additional logic - we'll add handleError but keep the rest
  if (hasConsoleError || hasToastError) {
    // For complex blocks, we add handleError and remove just the console.error/toast.error
    let newBlockContent = blockContent;

    // Remove console.error line(s) - be careful to preserve surrounding whitespace properly
    newBlockContent = newBlockContent.replace(/^(\s*)console\.error\([^;]*\);?\s*\n?/gm, '');

    // Remove simple toast.error line(s)
    newBlockContent = newBlockContent.replace(/^(\s*)toast\.error\([^;]*\);?\s*\n?/gm, '');

    // Remove toast({ ... variant: 'destructive' }) blocks - match multiline
    newBlockContent = newBlockContent.replace(/^(\s*)toast\(\s*\{[\s\S]*?variant:\s*['"]destructive['"][\s\S]*?\}\s*\);?\s*\n?/gm, '');

    // Clean up any double blank lines left behind
    newBlockContent = newBlockContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Determine handleError options
    let options = `context: '${context}'`;
    if (toastMessage) {
      options += `, toastTitle: '${toastMessage.replace(/'/g, "\\'")}'`;
    } else if (!hasToastError) {
      options += `, showToast: false`;
    }

    // Insert handleError at the start of the block (right after the opening brace)
    const openBraceIndex = newBlockContent.indexOf('{');
    if (openBraceIndex !== -1) {
      const beforeBrace = newBlockContent.substring(0, openBraceIndex + 1);
      const afterBrace = newBlockContent.substring(openBraceIndex + 1);
      const handleErrorLine = `\n${innerIndent}handleError(${errorVar}, { ${options} });`;
      newBlockContent = beforeBrace + handleErrorLine + afterBrace;
    }

    return {
      transformed: newBlockContent,
      endLine: endIndex,
      type: 'complex',
      reason: `Has ${[hasReturn && 'return', hasStateUpdate && 'state update', hasConditional && 'conditional', hasAwait && 'await'].filter(Boolean).join(', ')}`
    };
  }

  return null;
}

function processFile(filePath: string, dryRun: boolean): { changes: number; errors: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(srcDir, filePath);
  const context = getContextFromPath(filePath);
  const errors: string[] = [];

  // Skip certain files
  if (filePath.includes('errorHandler.ts') || filePath.includes('errors.ts') || filePath.includes('.test.')) {
    return { changes: 0, errors: [] };
  }

  // Find all catch blocks - match "} catch (error) {" pattern
  const catchIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    // More flexible regex: matches "} catch (error) {" with various spacing
    if (/}\s*catch\s*\([^)]*\)\s*\{/.test(lines[i]) ||
        (/catch\s*\([^)]*\)\s*\{/.test(lines[i]) && i > 0 && /}\s*$/.test(lines[i-1]))) {
      catchIndices.push(i);
    }
  }

  if (catchIndices.length === 0) {
    return { changes: 0, errors: [] };
  }

  // Process each catch block (from bottom to top to preserve line numbers)
  let changes = 0;
  const modifiedLines = [...lines];
  let needsImport = false;

  for (let i = catchIndices.length - 1; i >= 0; i--) {
    const catchIndex = catchIndices[i];
    const result = transformCatchBlock(modifiedLines, catchIndex, context);

    if (result && result.type !== 'skipped') {
      const original = modifiedLines.slice(catchIndex, result.endLine + 1).join('\n');

      transformations.push({
        file: relativePath,
        startLine: catchIndex + 1,
        endLine: result.endLine + 1,
        original,
        transformed: result.transformed,
        type: result.type,
        reason: result.reason,
      });

      if (!dryRun) {
        // Replace the lines
        const transformedLines = result.transformed.split('\n');
        modifiedLines.splice(catchIndex, result.endLine - catchIndex + 1, ...transformedLines);
        needsImport = true;
      }

      changes++;
    }
  }

  // Add import if needed
  if (!dryRun && needsImport && changes > 0) {
    const hasImport = /import\s*{[^}]*handleError[^}]*}\s*from\s*['"]@\/shared\/lib\/errorHandler['"]/.test(modifiedLines.join('\n'));

    if (!hasImport) {
      // Find the right place to add the import
      let importIndex = 0;
      for (let i = 0; i < modifiedLines.length; i++) {
        if (/^import\s/.test(modifiedLines[i])) {
          importIndex = i + 1;
        }
        if (!modifiedLines[i].startsWith('import') && importIndex > 0) {
          break;
        }
      }

      modifiedLines.splice(importIndex, 0, "import { handleError } from '@/shared/lib/errorHandler';");
    }

    // Write the file
    fs.writeFileSync(filePath, modifiedLines.join('\n'));
  }

  return { changes, errors };
}

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        walkDir(fullPath, files);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const applyAll = args.includes('--apply');
const fileArg = args.find(a => a.startsWith('--file='));
const specificFile = fileArg ? fileArg.replace('--file=', '') : null;

console.log('='.repeat(80));
console.log('ERROR HANDLING MIGRATION');
console.log('='.repeat(80));
console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : applyAll ? 'APPLY ALL' : specificFile ? `SINGLE FILE: ${specificFile}` : 'DRY RUN (no flags)'}`);
console.log();

let totalChanges = 0;
let filesChanged = 0;

if (specificFile) {
  const fullPath = path.join(srcDir, specificFile);
  if (fs.existsSync(fullPath)) {
    const result = processFile(fullPath, dryRun);
    totalChanges = result.changes;
    filesChanged = result.changes > 0 ? 1 : 0;
  } else {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }
} else {
  const files = walkDir(srcDir);
  for (const file of files) {
    const result = processFile(file, dryRun || !applyAll);
    if (result.changes > 0) {
      totalChanges += result.changes;
      filesChanged++;
    }
  }
}

// Output results
console.log('='.repeat(80));
console.log('TRANSFORMATION PREVIEW');
console.log('='.repeat(80));
console.log();

const simpleTransforms = transformations.filter(t => t.type === 'simple');
const complexTransforms = transformations.filter(t => t.type === 'complex');

console.log(`SIMPLE TRANSFORMATIONS (${simpleTransforms.length}):`);
console.log('-'.repeat(40));
for (const t of simpleTransforms.slice(0, 20)) {
  console.log(`\nFile: ${t.file}:${t.startLine}`);
  console.log('BEFORE:');
  console.log(t.original.split('\n').map(l => '  ' + l).join('\n'));
  console.log('AFTER:');
  console.log(t.transformed.split('\n').map(l => '  ' + l).join('\n'));
}
if (simpleTransforms.length > 20) {
  console.log(`\n... and ${simpleTransforms.length - 20} more simple transformations`);
}

console.log();
console.log(`COMPLEX TRANSFORMATIONS (${complexTransforms.length}) - NEED REVIEW:`);
console.log('-'.repeat(40));
for (const t of complexTransforms.slice(0, 10)) {
  console.log(`\nFile: ${t.file}:${t.startLine}`);
  console.log(`Reason: ${t.reason}`);
  console.log('BEFORE:');
  console.log(t.original.split('\n').map(l => '  ' + l).join('\n'));
  console.log('AFTER:');
  console.log(t.transformed.split('\n').map(l => '  ' + l).join('\n'));
}
if (complexTransforms.length > 10) {
  console.log(`\n... and ${complexTransforms.length - 10} more complex transformations`);
}

console.log();
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total transformations: ${totalChanges}`);
console.log(`  Simple: ${simpleTransforms.length}`);
console.log(`  Complex: ${complexTransforms.length}`);
console.log(`Files affected: ${filesChanged}`);
console.log();

if (dryRun || !applyAll) {
  console.log('This was a DRY RUN. To apply changes:');
  console.log('  Apply all:    npx tsx scripts/migrate-error-handling.ts --apply');
  console.log('  Single file:  npx tsx scripts/migrate-error-handling.ts --file=path/to/file.ts');
}

// Save transformations to file for review
const outputPath = path.join(__dirname, 'error-handling-transformations.json');
fs.writeFileSync(outputPath, JSON.stringify({
  summary: {
    total: totalChanges,
    simple: simpleTransforms.length,
    complex: complexTransforms.length,
    filesAffected: filesChanged,
  },
  simpleTransformations: simpleTransforms,
  complexTransformations: complexTransforms,
}, null, 2));
console.log(`\nDetailed transformations saved to: ${outputPath}`);
