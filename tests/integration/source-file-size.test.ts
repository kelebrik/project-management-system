import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const sourceRoots = ['apps', 'packages', 'tests'];
const codeExtensions = new Set(['.css', '.js', '.jsx', '.scss', '.ts', '.tsx']);
const ignoredDirectories = new Set(['build', 'dist', 'node_modules']);

async function codeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : codeFiles(entryPath);
    }
    return entry.isFile() && codeExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  }));
  return nested.flat();
}

test('source files stay within the 1000-line decomposition limit', async () => {
  const files = (await Promise.all(sourceRoots.map(codeFiles))).flat();
  const oversized: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const lines = source === '' ? 0 : source.split(/\r?\n/).length;
    if (lines > 1000) oversized.push(`${file}: ${lines}`);
  }
  assert.deepEqual(oversized, [], `Oversized source files:\n${oversized.join('\n')}`);
});
