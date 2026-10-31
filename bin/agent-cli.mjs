#!/usr/bin/env node
// agent-cli — answers the lookups and runs the commands agents repeated across sessions in this repo (mined from the
// Claude Code transcripts, 2026-11-01). Terse output for agents; every subcommand has --help and --json. No deps.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAD = 'src/lib/cad'
const LIVE_PID = '4Z9WBy4PbwdG5FRQPQnp'   // Project Journey — the live data the user tests cad on
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')
const read = (p) => fs.readFileSync(path.resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\0/g, '')
const run = (cmd, args, env = {}) => {
	const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 })
	return { code: r.status ?? 1, out: stripAnsi((r.stdout ?? '') + (r.stderr ?? '')) }
}
/** a node_modules tool run by node directly (no shell, no npx) */
const tool = (script, args, env) => run(process.execPath, [path.join(ROOT, 'node_modules', script), ...args], env)
const fileUrl = (p) => 'file:///' + path.join(ROOT, p).replace(/\\/g, '/')
function* walk(dir, test = () => true) {
	for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
		if (f.name === 'node_modules' || f.name.startsWith('.')) continue
		const p = path.join(dir, f.name)
		if (f.isDirectory()) yield* walk(p, test)
		else if (/\.(ts|svelte|js|mjs)$/.test(f.name) && test(p)) yield p
	}
}
const isTest = (p) => /\.test\.ts$|\.spec\.ts$/.test(p)

// ── subcommands ──────────────────────────────────────────────────────────────────────────────────────────────────
const cmds = {
	test: {
		help: 'Run vitest (server project) and print only the summary + failures.\nusage: agent-cli test [paths…=src/lib/cad] [--all-projects]\n  e.g. agent-cli test src/lib/cad/views/rackRow.test.ts',
		run(a, o) {
			const paths = a.length ? a : [CAD]
			const r = tool('vitest/vitest.mjs', ['run', ...(o['all-projects'] ? [] : ['--project', 'server']), ...paths])
			const lines = r.out.split('\n')
			const pick = (re) => lines.find((l) => re.test(l))?.trim()
			const fails = [...new Set(lines.filter((l) => /^\s*(FAIL|×)\s/.test(l)).map((l) => l.trim()))]
			const why = lines.filter((l) => /AssertionError|Expected|Received|Error:/.test(l)).map((l) => l.trim()).slice(0, 20)
			return { ok: r.code === 0, files: pick(/Test Files/), tests: pick(/^\s*Tests\s/), failures: fails, detail: why }
		},
		text: (x) => [x.ok ? 'PASS' : 'FAIL', x.files, x.tests, ...x.failures, ...(x.ok ? [] : x.detail)].filter(Boolean).join('\n'),
	},
	check: {
		help: 'svelte-check (8 GB heap, errors only) — totals, plus every error under the filter path.\nusage: agent-cli check [--filter=src/lib/cad] [--warnings]\n  slow (~2-5 min); the repo baseline is 10 errors, none in cad (2026-10-31)',
		run(_a, o) {
			const filter = o.filter ?? CAD
			const r = tool('svelte-check/bin/svelte-check', ['--tsconfig', './tsconfig.json', '--output', 'machine', '--threshold', o.warnings ? 'warning' : 'error'], { NODE_OPTIONS: '--max-old-space-size=8192' })
			const errs = r.out.split('\n').map((l) => l.match(/^\d+ (ERROR|WARNING) "([^"]+)" (\d+):(\d+) "(.*)"$/)).filter(Boolean)
				.map((m) => ({ level: m[1], file: m[2].replace(/\\/g, '/'), line: +m[3], col: +m[4], msg: m[5].replace(/\\n/g, ' ').slice(0, 300) }))
			const done = r.out.split('\n').find((l) => /COMPLETED/.test(l))?.replace(/^\d+ /, '')
			const inside = errs.filter((e) => e.file.startsWith(filter))
			return { completed: done ?? 'svelte-check did not complete', total: errs.length, filter, inFilter: inside.length, outside: errs.length - inside.length, errors: inside }
		},
		text: (x) => [`${x.completed}`, `${x.inFilter} in ${x.filter} · ${x.outside} elsewhere`, ...x.errors.map((e) => `${e.level[0]} ${e.file}:${e.line}:${e.col} ${e.msg}`)].join('\n'),
	},
	compile: {
		help: 'Compile .svelte / .svelte.ts files with the svelte compiler (seconds, vs minutes for check).\nusage: agent-cli compile <file…>',
		async run(a) {
			if (!a.length) throw new Error('give at least one file')
			const { compile, compileModule } = await import(fileUrl('node_modules/svelte/src/compiler/index.js'))
			const ts = (await import(fileUrl('node_modules/typescript/lib/typescript.js'))).default
			return a.map((f) => {
				try {
					const src = read(f)
					if (f.endsWith('.svelte')) compile(src, { filename: f, generate: 'client' })
					else if (/\.svelte\.(ts|js)$/.test(f)) compileModule(f.endsWith('.ts') ? ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText : src, { filename: f })
					return { file: f, ok: true }
				} catch (e) { return { file: f, ok: false, error: `${e.start ? `${e.start.line}:${e.start.column} ` : ''}${e.message.split('\n')[0]}` } }
			})
		},
		text: (x) => x.map((r) => (r.ok ? `ok ${r.file}` : `ERR ${r.file} ${r.error}`)).join('\n'),
	},
	def: {
		help: 'Where a symbol is defined (function / const / class / type / interface / method / prop), optionally with its body.\nusage: agent-cli def <name> [--in=src] [--body] [--max=80]\n  e.g. agent-cli def portGrid --body · agent-cli def Device --in=src/lib/cad/domain --body',
		run(a, o) {
			const name = a[0]; if (!name) throw new Error('give a symbol name')
			const n = name.replace(/[$]/g, '\\$')
			const re = new RegExp(`^\\s*(export\\s+)?(default\\s+)?(declare\\s+)?(async\\s+)?(function\\*?\\s+${n}\\b|(const|let|var)\\s+${n}\\b|class\\s+${n}\\b|interface\\s+${n}\\b|type\\s+${n}\\b|enum\\s+${n}\\b|(static\\s+|private\\s+|readonly\\s+|get\\s+|set\\s+)*${n}\\s*(<[^>]*>)?\\(.*\\)\\s*(:[^=]*)?\\{\\s*$|${n}\\s*=\\s*\\$(derived|state))`)
			const hits = []
			for (const p of walk(path.resolve(ROOT, o.in ?? 'src'), (p) => !isTest(p))) {
				const lines = read(p).split('\n')
				lines.forEach((l, i) => {
					if (!re.test(l) || /^\s*(if|for|while|switch|return)\b/.test(l)) return
					const h = { file: rel(p), line: i + 1, text: l.trim().slice(0, 200) }
					if (o.body) h.body = block(lines, i, +(o.max ?? 80))
					hits.push(h)
				})
			}
			return hits
		},
		text: (x) => (x.length ? x.map((h) => `${h.file}:${h.line}  ${h.text}${h.body ? '\n' + h.body + '\n' : ''}`).join('\n') : 'not found'),
	},
	uses: {
		help: 'Where a symbol is used (word match), tests excluded unless --tests. Counts per file; --lines prints them.\nusage: agent-cli uses <name> [--in=src] [--tests] [--lines]',
		run(a, o) {
			const name = a[0]; if (!name) throw new Error('give a symbol name')
			const re = new RegExp(`(^|[^\\w$])${name.replace(/[$]/g, '\\$')}(?![\\w$])`)
			const out = []
			for (const p of walk(path.resolve(ROOT, o.in ?? 'src'), (p) => o.tests || !isTest(p))) {
				const hits = read(p).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l))
				if (hits.length) out.push({ file: rel(p), count: hits.length, lines: hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 160)}`) })
			}
			return out.sort((a, b) => b.count - a.count)
		},
		text: (x, o) => x.map((f) => `${f.count} ${f.file}${o.lines ? '\n  ' + f.lines.join('\n  ') : ''}`).join('\n') || 'no uses',
	},
	backlog: {
		help: `cad backlog items (${CAD}/docs/plan/backlog.md): line, state, priority, title. Open items by default.\nusage: agent-cli backlog [query] [--done] [--all] [--full]\n  query matches the whole item text (case-insensitive)`,
		run(a, o) {
			const file = `${CAD}/docs/plan/backlog.md`, lines = read(file).split('\n'), items = []
			lines.forEach((l, i) => {
				const m = l.match(/^- \[( |x)\] (.*)$/); if (!m) return
				let text = m[2]; for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) text += ' ' + lines[j].trim()
				const section = lines.slice(0, i).reverse().find((s) => s.startsWith('## '))?.slice(3)
				items.push({ line: i + 1, done: m[1] === 'x', prio: text.match(/\*\*(P[\d?][^*]*)\*\*/)?.[1] ?? '', title: text.match(/^(?:❓\s*)?\*\*(.+?)\*\*/)?.[1] ?? text.slice(0, 80), section, text })
			})
			const q = a.join(' ').toLowerCase()
			return items.filter((it) => (o.all || (o.done ? it.done : !it.done)) && (!q || it.text.toLowerCase().includes(q))).map((it) => (o.full ? it : { ...it, text: undefined }))
		},
		text: (x, o) => x.map((it) => `${it.line} ${it.done ? 'x' : '·'} ${(it.prio || '-').padEnd(8)} ${it.title}${o.full ? '\n    ' + it.text : ''}`).join('\n') || 'none',
	},
	helpq: {
		help: `Help-dialog entries (${CAD}/ui/helpContent.ts): line, area, question. --answers adds the answer text.\nusage: agent-cli helpq [query] [--answers]   (keep Help current with every user-visible feature)`,
		run(a, o) {
			const file = `${CAD}/ui/helpContent.ts`, q = a.join(' ').toLowerCase()
			return read(file).split('\n').map((l, i) => ({ l, i })).filter(({ l }) => /\{\s*area:/.test(l))
				.map(({ l, i }) => ({ line: i + 1, area: l.match(/area:\s*'([^']*)'/)?.[1], q: l.match(/\bq:\s*'((?:[^'\\]|\\.)*)'/)?.[1], a: o.answers ? l.match(/\ba:\s*'((?:[^'\\]|\\.)*)'/)?.[1] : undefined, raw: l }))
				.filter((e) => !q || e.raw.toLowerCase().includes(q)).map(({ raw, ...e }) => e)
		},
		text: (x) => x.map((e) => `${e.line} [${e.area}] ${e.q}${e.a ? '\n    ' + e.a : ''}`).join('\n') || 'none',
	},
	status: {
		help: 'git: branch, ahead/behind, changed files, last commits, worktrees — one call.\nusage: agent-cli status [--log=5]',
		run(_a, o) {
			const g = (...x) => run('git', x).out.trim()
			return { branch: g('rev-parse', '--abbrev-ref', 'HEAD'), sync: g('status', '-sb').split('\n')[0], changed: g('status', '--short').split('\n').filter(Boolean), log: g('log', '--oneline', `-${o.log ?? 5}`).split('\n'), worktrees: g('worktree', 'list').split('\n') }
		},
		text: (x) => [x.sync, ...x.changed.map((c) => '  ' + c), '--', ...x.log, '--', ...x.worktrees].join('\n'),
	},
	snippet: {
		help: `Print in-page JS for the user's live tab (javascript_tool). Read-only.\nusage: agent-cli snippet <audit|sel|find> [--pid=${LIVE_PID}] [--type=device] [--name=re]\n  audit: Firestore cadEntities + by-id map, then your filter · sel: the Port properties header + device name · find: entities whose name/label matches --name`,
		run(a, o) {
			const pid = o.pid ?? LIVE_PID, load = `const { Firestore } = await import('/src/lib/db.svelte.ts'); const all = await new Firestore().getMany('projects/${pid}/cadEntities'); const by = Object.fromEntries(all.map(e=>[e.id,e]));`
			const s = {
				audit: `${load} JSON.stringify(all.filter(e=>e.type==='${o.type ?? 'device'}').slice(0,5))`,
				sel: `[[...document.querySelectorAll('p.font-semibold')].map(p=>p.textContent).find(t=>/^Ports? /.test(t)), document.querySelector('.font-semibold')?.parentElement?.textContent?.slice(0,60)]`,
				find: `${load} JSON.stringify(all.filter(e=>new RegExp(${JSON.stringify(o.name ?? '.')},'i').test(e.name??e.label??'')).map(e=>[e.type,e.id,e.name??e.label,e.rackId?by[e.rackId]?.name:undefined,e.u]))`,
			}[a[0]]
			if (!s) throw new Error('snippet: audit | sel | find')
			return { js: s }
		},
		text: (x) => x.js,
	},
	worktree: {
		help: 'WRITES. A git worktree beside the repo with node_modules junctioned in, or its safe removal (the junction is\nremoved FIRST — git worktree remove with a junction inside deletes the main node_modules through it).\nusage: agent-cli worktree add <name> [--branch=<name>] · agent-cli worktree rm <path>',
		run(a, o) {
			const [op, arg] = a
			if (op === 'add') {
				if (!arg) throw new Error('give a name')
				const dir = path.resolve(ROOT, '..', `eos-${arg}`)
				const r = run('git', ['worktree', 'add', dir, '-b', o.branch ?? arg]); if (r.code) throw new Error(r.out)
				fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
				return { added: dir, branch: o.branch ?? arg, node_modules: 'junction → main', note: 'dev server in a worktree: see memory reference_worktree_dev_server (fs.allow, spare port)' }
			}
			if (op === 'rm') {
				if (!arg) throw new Error('give the worktree path')
				const dir = path.resolve(ROOT, arg), nm = path.join(dir, 'node_modules')
				if (path.resolve(dir) === ROOT) throw new Error('refusing to remove the main checkout')
				if (fs.existsSync(nm)) {
					if (!fs.lstatSync(nm).isSymbolicLink()) throw new Error(`${nm} is a real folder, not a junction — remove it by hand`)
					fs.unlinkSync(nm)   // removes the junction only, never its target
				}
				const r = run('git', ['worktree', 'remove', dir]); if (r.code) throw new Error(r.out)
				return { removed: dir }
			}
			throw new Error('worktree add <name> | rm <path>')
		},
		text: (x) => Object.entries(x).map(([k, v]) => `${k}: ${v}`).join('\n'),
	},
}

/** The block starting at line i: up to the brace / paren that closes it (or a one-line arrow), capped at max lines. */
function block(lines, i, max) {
	let depth = 0, seen = false
	for (let j = i; j < lines.length && j < i + max; j++) {
		for (const ch of lines[j].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) { if ('{(['.includes(ch)) { depth++; seen = true } else if ('})]'.includes(ch)) depth-- }
		if ((seen && depth <= 0) || (!seen && j > i) || (!seen && /;\s*$/.test(lines[j]))) return lines.slice(i, j + 1).join('\n')
	}
	return lines.slice(i, i + max).join('\n') + '\n…'
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2), opts = {}, args = []
for (const x of argv) { const m = x.match(/^--([^=]+)(?:=(.*))?$/); if (m) opts[m[1]] = m[2] ?? true; else args.push(x) }
const name = args.shift()
if (!name || !cmds[name]) {
	if (name) console.error(`unknown: ${name}`)
	const list = Object.entries(cmds).map(([k, c]) => ({ cmd: k, about: c.help.split('\n')[0] }))
	console.log(opts.json ? JSON.stringify(list) : 'agent-cli <cmd> [--help] [--json]\n' + list.map((c) => `  ${c.cmd.padEnd(9)} ${c.about}`).join('\n'))
	process.exit(name ? 1 : 0)
}
const c = cmds[name]
if (opts.help) { console.log(c.help); process.exit(0) }
try {
	const x = await c.run(args, opts)
	console.log(opts.json ? JSON.stringify(x) : c.text(x, opts))
	if (x && x.ok === false) process.exit(1)
} catch (e) { console.error(`${name}: ${e.message}`); process.exit(2) }
