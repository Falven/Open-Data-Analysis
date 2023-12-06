import { BuildOptions, OnResolveArgs, Plugin, PluginBuild, build, context } from 'esbuild';
import { glob } from 'glob';
import { ChildProcess, spawn } from 'node:child_process';

const args = process.argv.slice(2);

const parseExternals = (args: string[]): string[] => {
  const externals = [];
  for (const arg of args) {
    if (arg.startsWith('--external-')) {
      externals.push(arg.replace('--external-', ''));
    }
  }
  return externals;
};

const esmOptions: Partial<BuildOptions> = {
  format: 'esm',
  outExtension: { '.js': '.js' },
};

const cjsOptions: Partial<BuildOptions> = {
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
};

let serverProcess: ChildProcess | null = null;

const startServer = () => {
  if (serverProcess !== null) {
    serverProcess.kill();
  }
  serverProcess = spawn('node', ['--inspect', '--preserve-symlinks', 'dist/index.js'], {
    stdio: 'inherit',
  });
};

const dynamicNodeNativeModulePlugin: Plugin = {
  name: 'dynamic-node-native-module',
  setup(build: PluginBuild) {
    build.onResolve({ filter: /^#(.+)$/ }, (args: OnResolveArgs) => {
      const moduleName = args.path.substring(1);
      return { path: moduleName, external: true };
    });
  },
};

const onEndPlugin: Plugin = {
  name: 'on-end',
  setup(build: PluginBuild) {
    build.onEnd((result) => {
      console.log(`build ended with ${result.errors.length} errors`);
      if (result.errors.length === 0) {
        console.log('Starting server...');
        startServer();
      }
    });
  },
};

const plugins: Plugin[] = [dynamicNodeNativeModulePlugin];

const appOptions: Partial<BuildOptions> = {
  entryPoints: ['src/server_tool_example.ts', 'src/hub_tool_example.ts'],
  outdir: 'dist/',
  bundle: false,
  plugins,
  external: parseExternals(args),
//   banner: {
//     js: `import { createRequire as esbCreateRequire } from 'module';
// import { fileURLToPath as esbFileURLToPath } from 'url';
// import { dirname as esbDirname } from 'node:path';
// const require = esbCreateRequire(import.meta.url);
// const __filename = esbFileURLToPath(import.meta.url);
// const __dirname = esbDirname(__filename);`,
//   },
};

const libOptions: Partial<BuildOptions> = {
  entryPoints: await glob('src/**/*.ts'),
  outdir: 'dist/',
};

const devOptions: Partial<BuildOptions> = {
  sourcemap: 'linked',
  sourcesContent: true,
  logLevel: 'info',
};

const prodOptions: Partial<BuildOptions> = {
  minify: true,
};

const commonOptions: BuildOptions = {
  target: 'node18',
  platform: 'node',
  keepNames: true,
  ...(args.includes('--cjs') ? cjsOptions : esmOptions),
  ...(args.includes('--lib') ? libOptions : appOptions),
  ...(args.includes('--dev') ? devOptions : prodOptions),
};

if (args.includes('--watch')) {
  plugins.push(onEndPlugin);
  const { watch } = await context(commonOptions);
  await watch();
} else {
  await build(commonOptions);
}
