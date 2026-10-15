// WINDOWS (UX review S2, User: "the floating windows of the Sheets tool… keep two or more important ones open"):
// the Navigator, Properties, Layers, Blocks, Racks and Cables live in windows. A window is closed, docked in the left
// or right column (stacked, today's side panels), or floating over the drawing (moved by its title, resized by its
// corner). The layout is per user, per browser (localStorage), with Reset. Floating windows are kept on screen when
// the browser window shrinks (User: "be careful to handle browser window resizing"). Pure state; ui/CadWindow.svelte
// draws it.

export type WinId = 'navigator' | 'properties' | 'layers' | 'blocks' | 'racks' | 'devices' | 'cables' | 'walkthrough' | 'tips'
export type Dock = 'left' | 'right'
export interface WinState {
	open: boolean
	/** Docked in a column (stacked in `order`), or null = floating at x / y (px from the drawing area's top-left). */
	dock: Dock | null
	order: number
	x: number; y: number; w: number; h: number
	/** Folded to its title bar. */
	folded: boolean
	/** Floating stack order (higher = in front). */
	z: number
}

export const WIN_TITLES: Record<WinId, string> = { navigator: 'Navigator', properties: 'Properties', layers: 'Layers', blocks: 'Blocks', racks: 'Racks', devices: 'Device library', cables: 'Cables', walkthrough: 'Walkthrough', tips: 'Tips' }
export const WIN_IDS = Object.keys(WIN_TITLES) as WinId[]

const KEY = 'cad-windows:3'   // :3 — Blocks / Device library float by the tool strip (User 2026-10-12); :2 layouts carry over
const OLD_KEY = 'cad-windows:2'
const DEFAULTS: Record<WinId, WinState> = {
	navigator: { open: true, dock: 'left', order: 0, x: 16, y: 48, w: 240, h: 420, folded: false, z: 1 },
	properties: { open: true, dock: 'right', order: 0, x: 900, y: 48, w: 280, h: 480, folded: false, z: 1 },
	layers: { open: false, dock: null, order: 1, x: 260, y: 60, w: 260, h: 380, folded: false, z: 1 },
	// Blocks and the Device library open with their tool (Insert, Device): FLOATING near the tool strip, so they don't
	// halve the Navigator (User 2026-10-12); Racks opens with a rack view, docked under the Navigator
	blocks: { open: false, dock: null, order: 2, x: 12, y: 36, w: 260, h: 420, folded: false, z: 1 },
	racks: { open: false, dock: 'left', order: 3, x: 320, y: 100, w: 240, h: 420, folded: false, z: 1 },
	// its own window (User: the template list gets long): opens with the Device tool, floating like Blocks
	devices: { open: false, dock: null, order: 4, x: 284, y: 36, w: 240, h: 460, folded: false, z: 1 },
	cables: { open: false, dock: null, order: 5, x: 350, y: 120, w: 280, h: 300, folded: false, z: 1 },
	// Help › Walkthrough (User 2026-10-15: keep it open for reference): floating, tall enough for a stage or two
	walkthrough: { open: false, dock: null, order: 6, x: 420, y: 60, w: 360, h: 520, folded: false, z: 1 },
	// Help › Tips (User 2026-10-15): small, floating, opens by itself once a day (ui/tipsStart.ts)
	tips: { open: false, dock: null, order: 7, x: 460, y: 120, w: 340, h: 190, folded: false, z: 1 },
}
const clone = (s: Record<WinId, WinState>) => Object.fromEntries(WIN_IDS.map((id) => [id, { ...s[id] }])) as Record<WinId, WinState>

/** Keep a floating window's title bar reachable inside an area `aw` × `ah` (it may hang off the right / bottom, never
 *  all of it): at least 120 px of it across, its title fully in. Its size is capped to the area. Pure; tested. */
export function clampWin(s: WinState, aw: number, ah: number): WinState {
	if (aw <= 0 || ah <= 0) return s
	const w = Math.max(180, Math.min(s.w, aw)), h = Math.max(80, Math.min(s.h, ah))
	const x = Math.min(Math.max(s.x, 0 - w + 120), aw - 120), y = Math.min(Math.max(s.y, 0), ah - 28)
	return x === s.x && y === s.y && w === s.w && h === s.h ? s : { ...s, x, y, w, h }
}

export class WindowLayout {
	wins = $state<Record<WinId, WinState>>(clone(DEFAULTS))
	/** One key (Ctrl+.) hides every window and the tables panel, and brings them back (not stored). */
	allHidden = $state(false)
	/** While a window's title is dragged over the drawing's left / right edge: where it would dock (the shell draws it). */
	dropSide = $state<Dock | null>(null)
	/** Windows the user closed in this session — not opened again by a view or tool (Racks in a rack view …). */
	readonly closedByUser = new Set<WinId>()

	constructor() {
		try {
			const own = localStorage.getItem(KEY), saved = JSON.parse(own ?? localStorage.getItem(OLD_KEY) ?? '{}') as Partial<Record<WinId, Partial<WinState>>>
			// from a :2 layout, keep everything but where Blocks / Device library sit (they float now)
			if (!own) for (const id of ['blocks', 'devices'] as const) if (saved[id]) saved[id] = { ...saved[id], dock: null, x: DEFAULTS[id].x, y: DEFAULTS[id].y, open: false }   // shut: they open with their tool
			for (const id of WIN_IDS) if (saved[id]) this.wins[id] = { ...DEFAULTS[id], ...saved[id] }
		} catch { /* nothing saved, or storage blocked: the defaults */ }
	}
	save = (): void => { try { localStorage.setItem(KEY, JSON.stringify(this.wins)) } catch { /* storage blocked */ } }

	shown(id: WinId): boolean { return this.wins[id].open && !this.allHidden }
	/** Docked windows of a column, top to bottom. */
	docked(side: Dock): WinId[] { return WIN_IDS.filter((id) => this.shown(id) && this.wins[id].dock === side).sort((a, b) => this.wins[a].order - this.wins[b].order) }
	floating(): WinId[] { return WIN_IDS.filter((id) => this.shown(id) && !this.wins[id].dock) }

	/** Open it (and bring it to the front); no two copies of a window. `byUser` = from the Window menu. */
	open(id: WinId, byUser = true): void {
		if (!byUser && this.closedByUser.has(id)) return
		this.allHidden = false
		this.wins[id].open = true
		this.wins[id].folded = false
		this.front(id)
		this.save()
	}
	close(id: WinId): void { this.wins[id].open = false; this.closedByUser.add(id); this.save() }
	toggle(id: WinId): void { if (this.shown(id)) this.close(id); else { this.closedByUser.delete(id); this.open(id) } }
	front(id: WinId): void {
		const top = Math.max(...WIN_IDS.map((k) => this.wins[k].z))
		if (this.wins[id].z < top || WIN_IDS.filter((k) => this.wins[k].z === top).length > 1) this.wins[id].z = top + 1
	}
	fold(id: WinId): void { this.wins[id].folded = !this.wins[id].folded; this.save() }
	/** Dock it at the bottom of a column. */
	dock(id: WinId, side: Dock): void {
		const last = Math.max(-1, ...this.docked(side).map((k) => this.wins[k].order))
		this.wins[id] = { ...this.wins[id], dock: side, order: last + 1, open: true }
		this.save()
	}
	/** Float it at x / y (px in the drawing area). */
	float(id: WinId, x: number, y: number): void {
		this.wins[id] = { ...this.wins[id], dock: null, x: Math.round(x), y: Math.round(y), open: true }
		this.front(id)
		this.save()
	}
	moveTo(id: WinId, x: number, y: number): void { this.wins[id].x = Math.round(x); this.wins[id].y = Math.round(y) }
	resize(id: WinId, w: number, h: number): void { this.wins[id].w = Math.round(Math.max(180, w)); this.wins[id].h = Math.round(Math.max(80, h)) }
	/** Keep every floating window reachable in an area of `aw` × `ah` px (on load and when the browser resizes). */
	clampAll(aw: number, ah: number): void {
		let changed = false
		for (const id of WIN_IDS) {
			if (this.wins[id].dock) continue
			const next = clampWin(this.wins[id], aw, ah)
			if (next !== this.wins[id]) { this.wins[id] = next; changed = true }
		}
		if (changed) this.save()
	}
	reset(): void { this.wins = clone(DEFAULTS); this.allHidden = false; this.closedByUser.clear(); this.save() }
}
