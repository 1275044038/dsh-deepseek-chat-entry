import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDirectory = path.join(projectRoot, 'tests')
const files = (await readdir(testsDirectory)).filter(file => file.endsWith('.test.ts')).sort()
if (files.length === 0) throw new Error('No tests/*.test.ts files found')
const outputDirectory = await mkdtemp(path.join(tmpdir(), 'dsh-chat-entry-tests-'))
let exitCode = 1
try {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: files.map(file => path.join('tests', file)),
    outdir: outputDirectory,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    jsx: 'automatic',
    plugins: [{
      // Client DI integration tests exercise the real controller while keeping
      // presentation modules inert. Native guest/React behavior is not tested here.
      name: 'client-controller-presentation-fixtures',
      setup(plugin) {
        plugin.onResolve({ filter: /^\.\/(?:chat-panel|icons|settings-section)\.js$/ }, args => {
          if (path.resolve(args.importer) !== path.join(projectRoot, 'src/client.ts')) return
          return { path: args.path, namespace: 'client-di-fixture' }
        })
        plugin.onLoad({ filter: /.*/, namespace: 'client-di-fixture' }, args => ({
          contents: args.path === './chat-panel.js'
            ? 'export const ChatPanel = () => null;'
            : args.path === './icons.js'
              ? 'export const ChatEntryPanelIcon = () => null; export const ChatEntrySettingsIcon = () => null;'
              : 'export const ChatEntrySettingsSection = () => null;',
          loader: 'js',
        }))
      },
    }],
  })
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=spec',
    ...files.map(file => path.join(outputDirectory, file.replace(/\.ts$/, '.mjs'))),
  ], { cwd: projectRoot, stdio: 'inherit' })
  if (result.error) throw result.error
  exitCode = result.status ?? 1
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
process.exitCode = exitCode
