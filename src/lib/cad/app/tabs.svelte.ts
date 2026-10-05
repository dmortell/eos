// DRAWING TABS (UX review D1; Dave: "would drawing tabs work in cad, like we have in Pages?" — shared by both panes,
// with a preview tab): a tab names one view — a level + a view spec (plan, an elevation, a section, a rack room, the
// riser view, a sheet). One list for both panes; each pane points at a tab. A single click in the Navigator opens the
// view in the PREVIEW tab (reused by the next single click); a double-click, an edit, or a double-click on the tab
// keeps it. Each tab has its own Back / Forward. Kept per project in this browser.
import type { Id } from '../domain/types'
import { specKey, type ViewSpec } from '../views/space'
import { newId } from '../domain/ids'

export interface TabView { levelId?: Id; spec: ViewSpec }
export interface Tab {
	id: string
	view: TabView
	/** A preview tab: the next single-click open reuses it; it's kept once you edit in it or double-click it. */
	preview?: boolean
	/** The project's revision when it was shown as a preview (an edit after that keeps it). */
	rev?: number
	back: TabView[]
	fwd: TabView[]
}

/** Two views are the same drawing: the same spec, and the same level unless it's a sheet / the riser view. */
export const viewKey = (v: TabView) => `${v.spec.kind === 'sheet' || v.spec.kind === 'riser' ? '' : v.levelId ?? ''}:${specKey(v.spec)}`
const copy = (v: TabView): TabView => JSON.parse(JSON.stringify(v))

export class Tabs {
	list = $state<Tab[]>([])
	/** The tab each pane shows (index = pane). */
	paneTab = $state<(string | null)[]>([null, null])
	#key: string

	constructor(pid: string) {
		this.#key = `cad-tabs:${pid}`
		try {
			const s = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as { list?: Tab[]; paneTab?: (string | null)[] }
			if (Array.isArray(s.list)) this.list = s.list.map((t) => ({ ...t, back: [], fwd: [] }))
			if (Array.isArray(s.paneTab)) this.paneTab = [s.paneTab[0] ?? null, s.paneTab[1] ?? null]
		} catch { /* nothing saved, or storage blocked */ }
	}
	/** The list and which tab each pane shows (not the histories). */
	save = (): void => {
		try { localStorage.setItem(this.#key, JSON.stringify({ list: this.list.map(({ back: _b, fwd: _f, ...t }) => t), paneTab: this.paneTab })) } catch { /* storage blocked */ }
	}
	get(id: string | null | undefined): Tab | undefined { return id ? this.list.find((t) => t.id === id) : undefined }
	of(pane: number): Tab | undefined { return this.get(this.paneTab[pane]) }

	/** The tab pane `i` shows, made to match `view`: its own tab if it shows that view, else a tab with that view,
	 *  else a new (kept) one. Used on load and whenever a pane's view changes outside the tabs. */
	ensure(i: number, view: TabView): Tab {
		const cur = this.of(i)
		if (cur && viewKey(cur.view) === viewKey(view)) return cur
		const same = this.list.find((t) => viewKey(t.view) === viewKey(view))
		const t = same ?? this.#add({ id: newId(), view: copy(view), back: [], fwd: [] }, i)
		this.paneTab[i] = t.id
		this.save()
		return t
	}
	/** The view in pane `i`'s tab changes (its strip, a level, To sheet): the old view goes on its Back list. */
	go(i: number, view: TabView): void {
		const t = this.of(i)
		if (!t) { this.ensure(i, view); return }
		if (viewKey(t.view) === viewKey(view)) { t.view = copy(view); this.save(); return }
		t.back = [...t.back.slice(-49), t.view]
		t.fwd = []
		t.view = copy(view)
		this.save()
	}
	/** Keep the tab's view in step with what its pane shows, without history (a level picked elsewhere). */
	sync(i: number, view: TabView): void {
		const t = this.of(i)
		if (!t) { this.ensure(i, view); return }
		if (viewKey(t.view) !== viewKey(view)) { t.view = copy(view); this.save() }
	}
	/** Back (−1) / forward (+1) inside pane `i`'s tab: the view to show, or null (`exists` skips deleted sheets). */
	nav(i: number, dir: -1 | 1, exists: (v: TabView) => boolean): TabView | null {
		const t = this.of(i)
		if (!t) return null
		const from = dir < 0 ? t.back : t.fwd
		let to: TabView | undefined
		while ((to = from.pop()) && !exists(to)) { /* a deleted sheet / section */ }
		if (!to) return null
		if (dir < 0) t.fwd.push(t.view); else t.back.push(t.view)
		t.view = to
		this.save()
		return to
	}
	/** Open `view` in pane `i` (the Navigator, a search, a link): its tab if one is open; else the preview tab
	 *  (reused unless the other pane shows it), else a new one. `keep` = a double-click: a kept tab. */
	open(i: number, view: TabView, keep: boolean, rev: number): Tab {
		let t = this.list.find((x) => viewKey(x.view) === viewKey(view))
		if (!t && !keep) {
			const pv = this.list.find((x) => x.preview && !this.paneTab.some((p, k) => k !== i && p === x.id))
			if (pv) { pv.view = copy(view); pv.back = []; pv.fwd = []; t = pv }
		}
		t ??= this.#add({ id: newId(), view: copy(view), preview: !keep, back: [], fwd: [] }, i)
		if (keep) t.preview = false
		if (t.preview) t.rev = rev
		this.paneTab[i] = t.id
		this.save()
		return t
	}
	keep(id: string): void { const t = this.get(id); if (t?.preview) { t.preview = false; this.save() } }
	/** Close a tab; the panes that showed it get the tab beside it (null = none left). */
	close(id: string): void {
		const at = this.list.findIndex((t) => t.id === id)
		if (at < 0) return
		this.list = this.list.filter((t) => t.id !== id)
		const next = this.list[Math.min(at, this.list.length - 1)]?.id ?? null
		this.paneTab = this.paneTab.map((p) => (p === id ? next : p))
		this.save()
	}
	closeOthers(id: string): void {
		this.list = this.list.filter((t) => t.id === id)
		this.paneTab = this.paneTab.map(() => id)
		this.save()
	}
	closeRight(id: string): void {
		const at = this.list.findIndex((t) => t.id === id)
		const gone = new Set(this.list.slice(at + 1).map((t) => t.id))
		this.list = this.list.slice(0, at + 1)
		this.paneTab = this.paneTab.map((p) => (p && gone.has(p) ? id : p))
		this.save()
	}
	/** Tabs whose sheet / section no longer exists go. */
	prune(exists: (v: TabView) => boolean): void {
		const gone = this.list.filter((t) => !exists(t.view))
		for (const t of gone) this.close(t.id)
	}
	/** A new tab goes after the one pane `i` shows (else at the end). */
	#add(t: Tab, i: number): Tab {
		const at = this.list.findIndex((x) => x.id === this.paneTab[i])
		const list = [...this.list]
		list.splice(at < 0 ? list.length : at + 1, 0, t)
		this.list = list
		return this.list.find((x) => x.id === t.id)!
	}
}
