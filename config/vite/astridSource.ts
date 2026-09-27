import fs from 'fs';
import path from 'path';

export type AstridSource = {
  checkout: string;
  sourceRoot: string;
};

/** Resolve the canonical Astrid checkout without guessing a sibling path. */
export function resolveAstridSource(
  configuredPath = process.env.ASTRID_CHECKOUT,
  environmentName = 'ASTRID_CHECKOUT',
): AstridSource | null {
  const value = configuredPath?.trim();
  if (!value) {
    return null;
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${environmentName} must be an absolute path`);
  }

  const checkout = fs.realpathSync(value);
  const sourceRoot = path.join(checkout, 'astrid');
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`${environmentName} is missing its canonical astrid source: ${sourceRoot}`);
  }

  return {checkout, sourceRoot};
}
