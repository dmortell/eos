// The workspace UNDO timeline (moved out of +page.svelte). ONE global linear timeline with a pointer (not
// two stacks), so the History panel can show future (undone) steps and jump to any point. steps[0] is the
// baseline; each step snapshots ALL models (entities, guides, sections, 3D objects — they live in the models)
// and ALL tabs' sheet frames AFTER that edit (B4: per-tab history silently reverted edits on other tabs).
// Up to 100 steps (a real tool would be command/inverse-op based).
//
// GESTURES (a drag, a nudge burst) are ONE step: while a gesture is open only its first mutation pushes a
// step; later ones just flag it dirty, and its final state is folded in once when it ends (P3).
import { docs } from './doc.svelte'
import { snapModels, setModels } from './3dview/models.svelte'
import type { Model } from './3dview/types'
import type { SheetFrame } from './types'

type HStep = { label: string; t: number; model: Model[]; frames: Record<string, SheetFrame[]> }
export type ChangeLogRow = { label: string; t: number; i: number; kind: 'past' | 'current' | 'future' }
export type HistoryHost = {
	/** An edit on a tab: mark it dirty. */
	markDirty: (tabId: string) => void
	/** An edit on a tab: a preview tab becomes a kept one. */
	promoteTab: (tabId: string) => void
}

const snapAllFrames = (): Record<string, SheetFrame[]> => $state.snapshot(docs.allFrames()) as Record<string, SheetFrame[]>

export class WorkspaceHistory {
	#host: HistoryHost
	// $state.raw (P3): steps are immutable plain snapshots, replaced wholesale — never deep-proxied.
	#hist = $state.raw<{ steps: HStep[]; ptr: number } | null>(null)
	#gestureActive = false
	#gesturePushed = false
	#gestureDirty = false
	#gestureEndTimer: ReturnType<typeof setTimeout> | null = null

	constructor(host: HistoryHost) { this.#host = host }

	/** Capture the baseline (pre-first-edit) state once, BEFORE anything is mutated. (The tab id callers pass is
	 *  unused — the timeline is global.) */
	ensure = (_tabId?: string) => {
		if (this.#hist) return
		this.#hist = { steps: [{ label: 'Start', t: Date.now(), model: snapModels(), frames: snapAllFrames() }], ptr: 0 }
	}
	/** A sheet doc loaded AFTER history began joins every existing step in its initial state. */
	addDoc = (did: string) => {
		const h = this.#hist; if (!h) return
		const frames = $state.snapshot(docs.framesOf(did)) as SheetFrame[]
		this.#hist = { ...h, steps: h.steps.map((st) => (did in st.frames ? st : { ...st, frames: { ...st.frames, [did]: frames } })) }
	}
	/** A model that enters the registry AFTER history began (created, or loaded from Firestore) joins every step
	 *  in its initial state, so undoing past its first edit returns it to that state (setModels restores by id). */
	addModel = (m: Model) => {
		const h = this.#hist; if (!h) return
		const snap = $state.snapshot(m) as Model
		this.#hist = { ...h, steps: h.steps.map((s) => (s.model.some((x) => x.id === m.id) ? s : { ...s, model: [...s.model, snap] })) }
	}
	/** An OUT-OF-BAND change to model `id` (derived / remote, not a user edit — an attached floorplan, a live
	 *  calibration move) applied to EVERY step's snapshot too, so undo / redo never revert it. `fn` must not
	 *  mutate its argument (return a changed copy, or the same object for "no change"). */
	amendModel = (id: string, fn: (m: Model) => Model) => {
		const h = this.#hist; if (!h) return
		this.#hist = { ...h, steps: h.steps.map((s) => (s.model.some((x) => x.id === id) ? { ...s, model: s.model.map((x) => (x.id === id ? fn(x) : x)) } : s)) }
	}
	/** A new step after an edit on `tabId` (drops the redo tail — a new edit forks the future). */
	push = (tabId: string, label: string) => {
		this.#host.markDirty(tabId)
		this.ensure(); const h = this.#hist!
		const steps = h.steps.slice(0, h.ptr + 1)
		steps.push({ label, t: Date.now(), model: snapModels(), frames: snapAllFrames() })
		while (steps.length > 100) steps.shift()
		this.#hist = { steps, ptr: steps.length - 1 }
	}
	/** Fold the latest state into the current (already open) step. */
	#update() {
		const h = this.#hist; if (!h) return
		const steps = h.steps.slice(); steps[h.ptr] = { ...steps[h.ptr], model: snapModels(), frames: snapAllFrames(), t: Date.now() }
		this.#hist = { ...h, steps }
	}

	// ── gestures ──
	beginGesture = () => {
		if (this.#gestureEndTimer) { clearTimeout(this.#gestureEndTimer); this.#gestureEndTimer = null }
		this.#gestureActive = true; this.ensure()
	}
	endGesture = (debounceMs = 0) => {
		const finish = () => { if (this.#gestureDirty) this.#update(); this.#gestureActive = false; this.#gesturePushed = false; this.#gestureDirty = false; this.#gestureEndTimer = null }
		if (this.#gestureEndTimer) { clearTimeout(this.#gestureEndTimer); this.#gestureEndTimer = null }
		if (debounceMs) this.#gestureEndTimer = setTimeout(finish, debounceMs); else finish()
	}
	/** Runs AFTER a mutation: snapshots the new state onto the timeline. During a gesture only the first
	 *  mutation adds a step; the rest fold their final state into it. */
	record = (tabId: string, label: string) => {
		this.#host.promoteTab(tabId)
		if (this.#gestureActive) { if (!this.#gesturePushed) { this.push(tabId, label); this.#gesturePushed = true } else this.#gestureDirty = true }
		else this.push(tabId, label)
	}
	// A gesture's deferred fold (P3) must land before the pointer moves, or it would overwrite the step undo lands on.
	// The open gesture's step is then CLOSED: a later mutation in it pushes a new step instead of folding into the
	// step undo just landed on.
	#flushGesture() { if (this.#gestureDirty) { this.#update(); this.#gestureDirty = false } this.#gesturePushed = false }

	/** The timeline length now — pass it to `squashSince` to fold everything recorded after it into one step. */
	mark = (): number => { this.ensure(); return this.#hist!.steps.length }
	/** Fold the steps recorded since `mark()` into ONE (the last state, `label`) — e.g. a walk renumber. Only when
	 *  they are still the contiguous tail and the pointer is at the end (an undo in between leaves them as they are). */
	squashSince = (since: number, label: string) => {
		const h = this.#hist; if (!h || h.ptr !== h.steps.length - 1 || h.steps.length <= since + 1) return
		const last = h.steps[h.steps.length - 1]
		this.#hist = { steps: [...h.steps.slice(0, since), { ...last, label }], ptr: since }
	}

	// ── moving the pointer ──
	#apply() {
		const h = this.#hist; if (!h) return
		setModels(h.steps[h.ptr].model)   // restore all models (entities + guides + sections + 3D objects)
		docs.restoreFrames($state.snapshot(h.steps[h.ptr].frames) as Record<string, SheetFrame[]>)   // restore every tab's frames
	}
	#moveTo(i: number) {
		this.#flushGesture()
		const h = this.#hist; if (!h || i < 0 || i >= h.steps.length || i === h.ptr) return
		this.#hist = { ...h, ptr: i }; this.#apply()
	}
	undo = () => { this.#flushGesture(); const h = this.#hist; if (h) this.#moveTo(h.ptr - 1) }
	redo = () => { this.#flushGesture(); const h = this.#hist; if (h) this.#moveTo(h.ptr + 1) }
	jump = (i: number) => this.#moveTo(i)

	/** The change log, newest first, tagged past / current / future (undone). */
	changeLog = $derived.by((): ChangeLogRow[] => {
		const h = this.#hist; if (!h) return []
		return h.steps.map((s, i) => ({ label: s.label, t: s.t, i, kind: (i === h.ptr ? 'current' : i > h.ptr ? 'future' : 'past') as ChangeLogRow['kind'] })).reverse()
	})
}
