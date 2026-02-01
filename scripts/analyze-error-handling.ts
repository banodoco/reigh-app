/**
 * Dry-run analysis script for error handling migration
 *
 * This script analyzes the codebase to find:
 * 1. catch blocks with console.error + toast.error (should use handleError)
 * 2. catch blocks with only console.error (should use handleError with showToast: false)
 * 3. catch blocks with only toast.error (should use handleError)
 * 4. Validation toast.error calls (NOT in catch - should KEEP as-is)
 *
 * Run with: npx ts-node scripts/analyze-error-handling.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Finding {
  file: string;
  line: number;
  type: 'catch-console-toast' | 'catch-console-only' | 'catch-toast-only' | 'validation-toast' | 'empty-catch' | 'already-uses-handleError';
  code: string;
  suggestedContext: string;
  toastMessage?: string;
}

const findings: Finding[] = [];
const srcDir = path.join(__dirname, '..', 'src');

function getContextFromPath(filePath: string): string {
  // Extract a reasonable context name from the file path
  const relativePath = path.relative(srcDir, filePath);
  const parts = relativePath.replace(/\.(ts|tsx)$/, '').split(path.sep);

  // Try to get component/hook name from filename
  const fileName = parts[parts.length - 1];
  if (fileName === 'index') {
    // Use parent directory name
    return parts[parts.length - 2] || 'Unknown';
  }
  return fileName;
}

function analyzeFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(srcDir, filePath);

  // Skip test files and the error handler itself
  if (filePath.includes('.test.') || filePath.includes('errorHandler.ts') || filePath.includes('errors.ts')) {
    return;
  }

  const context = getContextFromPath(filePath);

  // Find catch blocks and analyze their contents
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for catch block starts
    const catchMatch = line.match(/}\s*catch\s*\([^)]*\)\s*{/);
    if (catchMatch) {
      // Collect the catch block content (up to 15 lines or closing brace)
      let blockContent = '';
      let braceCount = 1;
      let j = i;
      const startLine = i + 1;

      // Find the content after the opening brace
      const afterBrace = line.substring(line.indexOf('{') + 1);
      blockContent += afterBrace;

      // Count braces in the first line
      for (const char of afterBrace) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // Continue reading lines until we close the catch block
      while (braceCount > 0 && j < i + 20 && j < lines.length - 1) {
        j++;
        const nextLine = lines[j];
        blockContent += '\n' + nextLine;
        for (const char of nextLine) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
      }

      // Analyze the block content
      const hasConsoleError = /console\.error/.test(blockContent);
      const hasToastError = /toast\.error|toast\(\s*{[^}]*variant:\s*['"]destructive['"]/.test(blockContent);
      const hasHandleError = /handleError\(/.test(blockContent);
      const isEmpty = blockContent.trim() === '' || blockContent.trim() === '}';
      const isCommented = /\/\/.*Silent|\/\/.*intentional|\/\/.*ignore/i.test(blockContent);

      // Extract toast message if present
      let toastMessage: string | undefined;
      const toastMatch = blockContent.match(/toast\.error\(['"]([^'"]+)['"]\)/);
      if (toastMatch) {
        toastMessage = toastMatch[1];
      }

      if (hasHandleError) {
        findings.push({
          file: relativePath,
          line: startLine,
          type: 'already-uses-handleError',
          code: blockContent.trim().substring(0, 200),
          suggestedContext: context,
        });
      } else if (isEmpty && !isCommented) {
        findings.push({
          file: relativePath,
          line: startLine,
          type: 'empty-catch',
          code: blockContent.trim().substring(0, 200),
          suggestedContext: context,
        });
      } else if (hasConsoleError && hasToastError) {
        findings.push({
          file: relativePath,
          line: startLine,
          type: 'catch-console-toast',
          code: blockContent.trim().substring(0, 200),
          suggestedContext: context,
          toastMessage,
        });
      } else if (hasConsoleError && !hasToastError) {
        findings.push({
          file: relativePath,
          line: startLine,
          type: 'catch-console-only',
          code: blockContent.trim().substring(0, 200),
          suggestedContext: context,
        });
      } else if (hasToastError && !hasConsoleError) {
        findings.push({
          file: relativePath,
          line: startLine,
          type: 'catch-toast-only',
          code: blockContent.trim().substring(0, 200),
          suggestedContext: context,
          toastMessage,
        });
      }
    }

    // Also find validation toast.error calls (not in catch blocks)
    // These are typically: if (condition) { toast.error(...); return; }
    if (/toast\.error\(/.test(line) && !/catch/.test(lines.slice(Math.max(0, i - 5), i).join('\n'))) {
      // Check if this looks like validation (has return nearby)
      const nearbyLines = lines.slice(i, Math.min(lines.length, i + 3)).join('\n');
      if (/return/.test(nearbyLines)) {
        const toastMatch = line.match(/toast\.error\(['"]([^'"]+)['"]\)/);
        findings.push({
          file: relativePath,
          line: i + 1,
          type: 'validation-toast',
          code: line.trim(),
          suggestedContext: context,
          toastMessage: toastMatch?.[1],
        });
      }
    }
  }
}

function walkDir(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and other non-source directories
      if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      analyzeFile(fullPath);
    }
  }
}

// Run analysis
console.log('Analyzing error handling patterns in src/...\n');
walkDir(srcDir);

// Group findings by type
const byType: Record<string, Finding[]> = {};
for (const finding of findings) {
  if (!byType[finding.type]) {
    byType[finding.type] = [];
  }
  byType[finding.type].push(finding);
}

// Output report
console.log('=' .repeat(80));
console.log('ERROR HANDLING ANALYSIS REPORT');
console.log('=' .repeat(80));
console.log();

console.log('SUMMARY:');
console.log('-'.repeat(40));
for (const [type, items] of Object.entries(byType)) {
  console.log(`  ${type}: ${items.length}`);
}
console.log();

// Detailed findings for each category
const categories = [
  { type: 'catch-console-toast', title: 'CATCH BLOCKS WITH console.error + toast.error (MIGRATE)', action: 'Replace with handleError()' },
  { type: 'catch-toast-only', title: 'CATCH BLOCKS WITH toast.error ONLY (MIGRATE)', action: 'Replace with handleError()' },
  { type: 'catch-console-only', title: 'CATCH BLOCKS WITH console.error ONLY (MIGRATE)', action: 'Replace with handleError() + showToast: false' },
  { type: 'empty-catch', title: 'EMPTY CATCH BLOCKS (REVIEW)', action: 'Add comment or handleError with SilentError' },
  { type: 'validation-toast', title: 'VALIDATION toast.error (KEEP AS-IS)', action: 'No change needed - input validation' },
  { type: 'already-uses-handleError', title: 'ALREADY USES handleError (NO CHANGE)', action: 'Already correct' },
];

for (const { type, title, action } of categories) {
  const items = byType[type] || [];
  if (items.length === 0) continue;

  console.log('='.repeat(80));
  console.log(`${title} (${items.length} occurrences)`);
  console.log(`Action: ${action}`);
  console.log('='.repeat(80));
  console.log();

  for (const item of items) {
    console.log(`File: ${item.file}:${item.line}`);
    console.log(`Context: ${item.suggestedContext}`);
    if (item.toastMessage) {
      console.log(`Toast: "${item.toastMessage}"`);
    }
    console.log(`Code:`);
    console.log(item.code.split('\n').map(l => '  ' + l).join('\n'));
    console.log();
  }
}

// Output files that need changes
const filesToChange = new Set<string>();
for (const finding of findings) {
  if (['catch-console-toast', 'catch-toast-only', 'catch-console-only', 'empty-catch'].includes(finding.type)) {
    filesToChange.add(finding.file);
  }
}

console.log('='.repeat(80));
console.log(`FILES THAT NEED CHANGES (${filesToChange.size} files):`);
console.log('='.repeat(80));
for (const file of Array.from(filesToChange).sort()) {
  console.log(`  ${file}`);
}

// Save detailed report to file
const reportPath = path.join(__dirname, 'error-handling-analysis.json');
fs.writeFileSync(reportPath, JSON.stringify({
  summary: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
  findings,
  filesToChange: Array.from(filesToChange).sort(),
}, null, 2));
console.log(`\nDetailed report saved to: ${reportPath}`);
