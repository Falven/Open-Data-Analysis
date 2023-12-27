import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { BuildOptions, build } from 'esbuild';
import { Glob, glob } from 'glob';

const args = process.argv.slice(2);

const getDirname = (url: string) => dirname(new URL(url).pathname);

const monorepoRoot = resolve(getDirname(import.meta.url), '../../');

const resolveModulePath = (moduleName: string, subPath: string): string => {
  const modulePath = import.meta.resolve(moduleName, `${monorepoRoot}/`);
  return fileURLToPath(new URL(subPath, modulePath));
};

const esmOptions: Partial<BuildOptions> = {
  format: 'esm',
  outExtension: { '.js': '.js' },
};

const cjsOptions: Partial<BuildOptions> = {
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
};

const entryPoints = await glob('src/**/*.ts');
// entryPoints.push(resolveModulePath('@jupyterlab/nbformat', '../srco/index.ts'));
const libOptions: Partial<BuildOptions> = {
  entryPoints,
  outdir: args.includes('--cjs') ? 'dist/cjs/' : 'dist/esm/',
};

const devOptions: Partial<BuildOptions> = {
  sourcemap: 'inline',
  sourcesContent: true,
  logLevel: 'info',
  minify: false,
};

const prodOptions: Partial<BuildOptions> = {
  minify: true,
};

const commonOptions: BuildOptions = {
  target: 'node18',
  platform: 'node',
  keepNames: true,
  ...libOptions,
  ...(args.includes('--cjs') ? cjsOptions : esmOptions),
  ...(args.includes('--dev') ? devOptions : prodOptions),
};

const runTestFile = (path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const testProcess = spawn(
      'pnpm',
      ['node', '--no-warnings=ExperimentalWarning', '--loader', 'ts-node/esm', path],
      {
        stdio: 'inherit',
        shell: true,
      },
    );

    testProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test failed with exit code ${code}`));
      }
    });
  });
};

const runTests = async (): Promise<void> => {
  console.error('Running tests.');

  const testFilesStream = Readable.from(new Glob('src/**/*.test.ts', { nodir: true }));
  const testPromises: Promise<void>[] = [];

  for await (const path of testFilesStream) {
    testPromises.push(runTestFile(path.toString()));
  }

  const results = await Promise.allSettled(testPromises);

  const failedTests = results.filter((result) => result.status === 'rejected');
  if (failedTests.length > 0) {
    console.error('Some tests failed:');
    failedTests.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Test ${index + 1} failed with error:`, result.reason);
      }
    });
    process.exit(1);
  }
};

if (args.includes('--test')) {
  await runTests();
} else {
  await build(commonOptions);
}
