// The COMMAND LINE's interpreter (Kestrel's executeCommand, ported): runs a typed line token by token. With no
// command running, a token is a command name (→ the page `host`, or a SCRIPTED command), or — for a draw tool — a
// point / distance / Enter / Esc / C / U fed to the focused pane's active viewport (ui/cmdBus).
//
// SCRIPTED commands (ui/cmdScripts.ts: MOVE, COPY, ROTATE, DIST, ZOOM …) are async functions that `ask` for input,
// AutoCAD style ("Specify base point:"). An ask is answered by the next typed token (a point X,Y / @DX,DY / D<A, a
// number, an option letter, Enter) OR by a click in the viewport (cmdBus.pick). Esc cancels. An empty Enter with
// nothing running finishes a draw tool, else repeats the last command.
import { cmdBus, type VpCommandTarget } from './cmdBus.svelte'
import { COMMANDS, commandById, primaryName, readToken, resolvePoint, tokenize, parseCoord, isNumber } from './commands'
import { SCRIPTS, Cancel, CmdError, fmt, type CmdCtx, type CmdHost, type Want, type Answer } from './cmdScripts'
import type { Pt } from './geometry'

/** Command id → the pane tool it arms. */
export const CMD_TOOL: Record<string, string> = {
	line: 'Line', rect: 'Rectangle', ellipse: 'Ellipse', dim: 'Dimension', text: 'Text', wall: 'Wall', trunk: 'Trunk',
	pipe: 'Pipe', box: 'Furniture', opening: 'Opening', section: 'Section', guide: 'Guide', select: 'Select',
}

type Line = { text: string; kind: 'in' | 'out' | 'err' }

export class CommandRunner {
	log = $state<Line[]>([])
	want = $state<Want | null>(null)
	private answer: ((a: Answer) => void) | null = null
	private abort: ((e: Error) => void) | null = null
	private running: Promise<void> | null = null
	private settleWaiters: (() => void)[] = []
	private chain: Promise<void> = Promise.resolve()
	private last: string | null = null
	private lastPt: Pt | null = null
	history: string[] = []

	constructor(private host: CmdHost) {
		cmdBus.signal = (k) => this.run(k === 'enter' ? '' : 'ESC', false)
	}

	private out(text: string, kind: Line['kind'] = 'out') { this.log.push({ text, kind }); if (this.log.length > 80) this.log.splice(0, this.log.length - 80) }

	get prompt(): string {
		const w = this.want; if (!w) return 'Command:'
		return `${w.prompt}${w.options?.length ? ` [${w.options.join('/')}]` : ''}${w.def ? ` <${w.def}>` : ''}:`
	}

	/** Run a typed line (queued behind any line still being processed). */
	run(line: string, echo = true): Promise<void> {
		this.chain = this.chain.then(() => this.runNow(line, echo)).catch((e) => { console.error(e) })
		return this.chain
	}

	private async runNow(line: string, echo: boolean) {
		const text = line.trim()
		if (text && echo) { this.history.push(text); if (this.history.length > 50) this.history.shift() }
		if (echo || text) this.out(`${this.prompt} ${text}`, 'in')
		if (!text) {   // Enter on its own
			if (this.want) return void (await this.feed(''))
			const t = cmdBus.target
			if (t?.drawing()) return t.finish()
			if (this.last) await this.exec(this.last)
			return
		}
		for (const tok of tokenize(text)) if (!(await this.step(tok))) break
	}

	/** One token; false stops the rest of the line (an error). */
	private async step(token: string): Promise<boolean> {
		if (this.want) return this.feed(token)
		const t = cmdBus.target
		const r = readToken(token, !!t?.drawing())
		const err = (m: string | null | void) => { if (m) { this.out(m, 'err'); return false } return true }
		switch (r.kind) {
			case 'cmd': return err(await this.exec(r.id))
			case 'point': return t ? err(t.acceptPoint(resolvePoint(r, t.lastPoint()))) : err('No active viewport — click into a view first')
			case 'number': return t?.drawing() ? err(t.distance(r.n)) : err(`${r.n}: pick a command first (type HELP for the list)`)
			case 'enter': t?.finish(); return true
			case 'cancel': t?.cancel(); this.host.tool('Select'); return true
			case 'close': t?.close(); return true
			case 'undo-point': t?.undoPoint(); return true
			case 'error': return err(r.message)
		}
	}

	// ── scripted commands ──
	/** Resolves once the running command asks for more input, or ends. */
	private settled(): Promise<void> {
		if (this.want || !this.running) return Promise.resolve()
		return new Promise((r) => this.settleWaiters.push(r))
	}
	private flushSettle() { const w = this.settleWaiters; this.settleWaiters = []; w.forEach((f) => f()) }

	private ask = (w: Want): Promise<Answer> => new Promise<Answer>((resolve, reject) => {
		this.want = w; this.answer = resolve; this.abort = reject
		const kind = w.ent ? 'ent' : w.point ? 'point' : null
		cmdBus.pick = kind ? {
			kind, base: w.point?.base, ghost: w.point?.ghost, box: w.point?.box,
			resolve: (r) => {
				if (w.ent) { if (r.ent) return this.give({ kind: 'ent', id: r.ent, p: r.p }, '(picked a shape)'); if (!w.point) return this.out('Nothing there — click a shape', 'err') }
				this.give({ kind: 'point', p: r.p }, `${fmt(r.p[0])},${fmt(r.p[1])}`)
			},
		} : null
		this.flushSettle()
	})
	private give(a: Answer, echo?: string) {
		const f = this.answer; if (!f) return
		if (echo) this.out(`${this.prompt} ${echo}`, 'in')
		if (a.kind === 'point') this.lastPt = a.p
		this.want = null; this.answer = null; this.abort = null; cmdBus.pick = null
		f(a)
	}

	/** A token answering the current ask; false = rejected (the line stops, the ask stays open). */
	private async feed(token: string): Promise<boolean> {
		const w = this.want!, up = token.toUpperCase()
		const bad = (m: string) => { this.out(m, 'err'); return false }
		if (up === 'ESC' || up === 'CANCEL') { const ab = this.abort; this.want = null; this.answer = null; this.abort = null; cmdBus.pick = null; ab?.(new Cancel()); await this.settled(); return false }
		let a: Answer | null = null
		if (!token || up === 'ENTER') {
			if (w.def) return this.feed(w.def)
			if (!w.enter) return bad('A value is needed (Esc cancels)')
			a = { kind: 'enter' }
		} else if (w.options?.length && /^[A-Z]+$/.test(up) && w.options.some((o) => o.toUpperCase().startsWith(up))) {
			a = { kind: 'option', key: w.options.find((o) => o.toUpperCase().startsWith(up))! }
		} else if (w.point && parseCoord(token)) {
			a = { kind: 'point', p: resolvePoint(parseCoord(token)!, w.point.base ?? this.lastPt) }
		} else if (isNumber(token)) {
			const n = Number(token), base = w.point?.base, h = cmdBus.hover
			if (w.number) a = { kind: 'number', n }
			else if (w.point && base) {   // direct distance: n along base → cursor (default +X)
				const dx = h ? h[0] - base[0] : 1, dy = h ? h[1] - base[1] : 0, L = Math.hypot(dx, dy) || 1
				a = { kind: 'point', p: [base[0] + (dx / L) * n, base[1] + (dy / L) * n] }
			} else return bad('A number doesn\'t fit here')
		} else return bad(`Invalid input “${token}”${w.options?.length ? ` — options: ${w.options.join(' / ')}` : ''}`)
		this.give(a)
		await this.settled()
		return true
	}

	private async exec(id: string): Promise<string | void> {
		const c = commandById(id); if (!c) return `Unknown command ${id}`
		if (this.running) return `${c.label}: finish or Esc the running command first`
		this.last = id
		const t = cmdBus.target
		const tool = CMD_TOOL[id]
		if (tool) { t?.cancel(); this.host.tool(tool); return }
		const script = SCRIPTS[id]
		if (script) {
			if (!t) return 'No active viewport — click into a view first'
			const ctx: CmdCtx = { ask: this.ask, t, host: this.host, out: (m) => this.out(m) }
			cmdBus.busy = true
			this.running = script(ctx).catch((e) => { if (!(e instanceof Cancel)) { this.out(e instanceof Error ? e.message : String(e), 'err'); if (!(e instanceof CmdError)) console.error(e) } else this.out('*Cancel*') })
				.finally(() => { this.running = null; this.want = null; this.answer = null; this.abort = null; cmdBus.pick = null; cmdBus.busy = false; this.flushSettle() })
			await this.settled()
			return
		}
		switch (id) {
			case 'erase': return t ? void t.erase() : 'No active viewport'
			case 'group': return t ? t.group() ?? undefined : 'No active viewport'
			case 'ungroup': return t ? t.ungroup() ?? undefined : 'No active viewport'
			case 'selectall': return t ? void t.selectAll() : 'No active viewport'
			case 'deselect': return void t?.deselect()
			case 'help': {
				const groups = [...new Set(COMMANDS.map((x) => x.group))]
				for (const g of groups) this.out(`${g}: ${COMMANDS.filter((x) => x.group === g).map(primaryName).join(', ')}`)
				this.out('Points: X,Y · @DX,DY · D<ANGLE · @D<ANGLE · a bare number = distance toward the cursor · C closes · U undoes a point · Enter finishes / repeats · Esc cancels')
				return
			}
		}
		return this.host.run(id) || undefined
	}
}

export type { CmdHost }
