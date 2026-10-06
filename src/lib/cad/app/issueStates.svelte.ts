// ISSUE STATES worked out in the background (sheets-organising slice 5): each issued sheet's fingerprint now, against
// its last revision's — so the register can show Not issued / Issued B / Changed since B / Superseded. It needs every
// such sheet drawn with its floorplans placed, so it only runs while something shows the states (the register's
// Issue column asks with `want()`), one sheet at a time with a pause between, and again ~1 s after the project changes.
// One per project (`issueStatesOf`); the Navigator reads the same states (its "changed" dot) but never asks for them.
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import type { Id } from '../domain/types'
import { fingerprint, issueState, type IssueState } from '../domain/issue'
import { frozenNow, placeUnderlays } from './issue'

class IssueStates {
	#fp = $state.raw<Map<Id, string>>(new Map())
	busy = $state(false)
	#want = 0
	#run = 0
	#at = -1
	#timer: ReturnType<typeof setTimeout> | undefined
	constructor(private project: CadProject) {}

	/** The sheet's state now ('unknown' while it's being worked out, or when nothing asked for states). */
	of(s: Sheet): IssueState {
		const rev = this.project.rev   // tracked: an edit re-reads, and schedules a fresh pass
		if (this.#want && rev !== this.#at) { this.#at = rev; this.#schedule(1000) }
		return issueState(s, this.#fp.get(s.id))
	}
	/** Show the states while the caller does; the returned function releases it. */
	want(): () => void {
		this.#want++
		this.#at = this.project.rev
		this.#schedule(0)
		return () => { this.#want = Math.max(0, this.#want - 1); if (!this.#want) clearTimeout(this.#timer) }
	}
	#schedule(ms: number): void { clearTimeout(this.#timer); this.#timer = setTimeout(() => void this.#work(), ms) }
	async #work(): Promise<void> {
		const run = ++this.#run, p = this.project
		const sheets = (p.store.ofType('sheet') as Sheet[]).filter((s) => s.revisions?.length && s.status !== 'archived')
		const out = new Map<Id, string>()
		this.busy = true
		try {
			for (const s of sheets) {
				if (run !== this.#run || !this.#want) return
				await placeUnderlays(p, [s])
				out.set(s.id, fingerprint(frozenNow(p, s)))
				await new Promise((r) => setTimeout(r, 0))   // let the page breathe between sheets
			}
			if (run === this.#run) this.#fp = out
		} catch { /* a floorplan that won't load: those sheets stay '…' */ }
		finally { if (run === this.#run) this.busy = false }
	}
}

const byProject = new WeakMap<CadProject, IssueStates>()
export function issueStatesOf(project: CadProject): IssueStates {
	let s = byProject.get(project)
	if (!s) byProject.set(project, (s = new IssueStates(project)))
	return s
}
