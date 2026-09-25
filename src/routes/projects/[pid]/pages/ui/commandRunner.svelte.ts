// The COMMAND LINE's interpreter (Kestrel's executeCommand, ported): runs a typed line token by token — commands go
// to the page (`host`: tools, views, toggles, panels, files), points / distances / Enter / Esc / C / U go to the
// focused pane's active viewport (ui/cmdBus). MOVE / ROTATE / SCALE take an argument (typed on the same line or
// the next). An empty Enter finishes a drawing tool, else repeats the last command (like AutoCAD).
import { cmdBus } from './cmdBus.svelte'
import { COMMANDS, commandById, primaryName, readToken, resolvePoint, tokenize, type CmdDef } from './commands'

export type CmdHost = {
	/** Arm a tool in the focused pane ('Line', 'Rectangle', … or 'Select'). */
	tool(name: string): void
	run(id: string): string | void   // every other command (views, toggles, panels, files) — may return an error
}

/** Command id → the pane tool it arms. */
export const CMD_TOOL: Record<string, string> = {
	line: 'Line', rect: 'Rectangle', ellipse: 'Ellipse', dim: 'Dimension', text: 'Text', wall: 'Wall', trunk: 'Trunk',
	pipe: 'Pipe', box: 'Furniture', opening: 'Opening', section: 'Section', guide: 'Guide', select: 'Select',
}

type Line = { text: string; kind: 'in' | 'out' | 'err' }

export class CommandRunner {
	log = $state<Line[]>([])
	pending = $state<CmdDef | null>(null)   // a command waiting for its argument
	private last: string | null = null
	history: string[] = []

	constructor(private host: CmdHost) {}

	private out(text: string, kind: Line['kind'] = 'out') { this.log.push({ text, kind }); if (this.log.length > 60) this.log.splice(0, this.log.length - 60) }

	get prompt(): string { const p = this.pending; return p ? `${p.label} — ${p.arg}:` : 'Command:' }

	run(line: string) {
		const text = line.trim()
		if (text) { this.history.push(text); if (this.history.length > 50) this.history.shift() }
		this.out(`${this.prompt} ${text}`, 'in')
		const t = cmdBus.target
		if (!text) {   // Enter on its own
			if (this.pending) { this.out(`${this.pending.label} cancelled`); this.pending = null; return }
			if (t?.drawing()) return t.finish()
			if (this.last) return this.exec(this.last)
			return
		}
		for (const tok of tokenize(text)) if (!this.step(tok)) break
	}

	/** One token; false stops the rest of the line (an error). */
	private step(token: string): boolean {
		const t = cmdBus.target
		if (this.pending) return this.arg(this.pending, token)
		const r = readToken(token, !!t?.drawing())
		const err = (m: string | null | void) => { if (m) { this.out(m, 'err'); return false } return true }
		switch (r.kind) {
			case 'cmd': return err(this.exec(r.id))
			case 'point': return t ? err(t.acceptPoint(resolvePoint(r, t.lastPoint()))) : err('No active viewport — click into a view first')
			case 'number': return t?.drawing() ? err(t.distance(r.n)) : err(`${r.n}: pick a command first (type HELP for the list)`)
			case 'enter': t?.finish(); return true
			case 'cancel': t?.cancel(); this.host.tool('Select'); return true
			case 'close': t?.close(); return true
			case 'undo-point': t?.undoPoint(); return true
			case 'error': return err(r.message)
		}
	}

	private arg(c: CmdDef, token: string): boolean {
		const t = cmdBus.target; this.pending = null
		if (/^(ESC|CANCEL)$/i.test(token)) { this.out(`${c.label} cancelled`); return false }
		if (!t) { this.out('No active viewport — click into a view first', 'err'); return false }
		const r = readToken(token, false)
		let e: string | null = null
		if (c.id === 'move') {
			if (r.kind !== 'point') e = 'MOVE wants DX,DY (e.g. 500,0 or @500<90)'
			else e = t.move(r.p[0], r.p[1])
		} else if (r.kind !== 'number') e = `${primaryName(c)} wants a number (${c.arg})`
		else e = c.id === 'rotate' ? t.rotate(r.n) : t.scale(r.n)
		if (e) { this.out(e, 'err'); return false }
		return true
	}

	private exec(id: string): string | void {
		const c = commandById(id); if (!c) return `Unknown command ${id}`
		this.last = id
		const t = cmdBus.target
		const tool = CMD_TOOL[id]
		if (tool) { t?.cancel(); this.host.tool(tool); return }
		switch (id) {
			case 'move': case 'rotate': case 'scale': this.pending = c; return
			case 'erase': return t ? void t.erase() : 'No active viewport'
			case 'copy': return t ? t.duplicate() ?? undefined : 'No active viewport'
			case 'group': return t ? t.group() ?? undefined : 'No active viewport'
			case 'ungroup': return t ? t.ungroup() ?? undefined : 'No active viewport'
			case 'selectall': return t ? void t.selectAll() : 'No active viewport'
			case 'deselect': return void t?.deselect()
			case 'help': {
				const groups = [...new Set(COMMANDS.map((x) => x.group))]
				for (const g of groups) this.out(`${g}: ${COMMANDS.filter((x) => x.group === g).map(primaryName).join(', ')}`)
				this.out('Points: X,Y · @DX,DY · D<ANGLE · @D<ANGLE · a bare number = distance toward the cursor · C closes · U undoes a point · Enter finishes / repeats')
				return
			}
		}
		return this.host.run(id) || undefined
	}
}
