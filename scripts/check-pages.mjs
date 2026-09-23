// Pre-commit gate for the Pages tool (src/routes/projects/[pid]/pages, review.md §P5):
//   1. the Pages unit tests, pages/ only, BOTH vitest projects (`server` + the browser `client` one that runs
//      the rune-store `*.svelte.test.ts` files)
//   2. svelte-check, failing ONLY on errors under pages/ — the rest of the repo carries a known baseline
//      of errors in other tools (sheets, lib/dev), which must not block a Pages commit.
// Run it with `pnpm check:pages`; `.githooks/pre-commit` runs it when a commit touches pages/.
import { spawnSync } from 'node:child_process'

const PAGES = 'src/routes/projects/[pid]/pages'
const sh = (cmd, opts = {}) => spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts })

console.log('pages gate: unit tests…')
const tests = sh(`npx vitest run "${PAGES}"`, { stdio: 'inherit' })
if (tests.status !== 0) { console.error('pages gate: unit tests FAILED'); process.exit(1) }

console.log('pages gate: svelte-check (errors under pages/ only)…')
sh('npx svelte-kit sync', { stdio: 'ignore' })
const check = sh('npx svelte-check --threshold error --output machine', {
	env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },   // the full check needs the bigger heap
	maxBuffer: 64 * 1024 * 1024,
})
const out = `${check.stdout ?? ''}${check.stderr ?? ''}`
if (!/COMPLETED/.test(out)) { console.error(out.slice(-2000)); console.error('pages gate: svelte-check did not complete'); process.exit(1) }
const errors = out.split('\n').filter((l) => / ERROR /.test(l) && l.replace(/\\\\/g, '/').includes('routes/projects/[pid]/pages/'))
if (errors.length) {
	for (const e of errors) console.error(e)
	console.error(`pages gate: ${errors.length} svelte-check error(s) under pages/`)
	process.exit(1)
}
console.log('pages gate: clean')
