// The Opening tool's spec (the bar over the pane while it's armed): what the next opening box is — a door, a
// window or a plain rectangular hole — with its height and sill (its underside above the floor). Round holes are
// not offered: walls are cut into box panels, so a hole is always rectangular. Remembered per type in localStorage.
export type OpenKind = 'door' | 'window' | 'hole'
export type OpenSpec = { h: number; sill: number }
export const OPEN_KINDS: [OpenKind, string][] = [['door', 'Door'], ['window', 'Window'], ['hole', 'Rect hole']]

const LS = 'eos-pages-opening-spec'
const DEFAULTS: Record<OpenKind, OpenSpec> = { door: { h: 2100, sill: 0 }, window: { h: 1200, sill: 900 }, hole: { h: 600, sill: 300 } }
class OpeningSpec {
	kind = $state<OpenKind>('door')
	specs = $state<Record<OpenKind, OpenSpec>>(structuredClone(DEFAULTS))
	constructor() {
		try { const o = JSON.parse(localStorage.getItem(LS) ?? '{}'); if (o.kind) this.kind = o.kind; for (const k of Object.keys(DEFAULTS) as OpenKind[]) this.specs[k] = { ...DEFAULTS[k], ...o.specs?.[k] } } catch { /* no storage */ }
	}
	#save() { try { localStorage.setItem(LS, JSON.stringify({ kind: this.kind, specs: this.specs })) } catch { /* private mode */ } }
	setKind(k: OpenKind) { this.kind = k; this.#save() }
	set(patch: Partial<OpenSpec>) { this.specs[this.kind] = { ...this.specs[this.kind], ...patch }; this.#save() }
	/** The fields a new opening box gets (its subtype, height, and z = the sill). */
	extra(): { open: OpenKind; h: number; z: number } { const s = this.specs[this.kind]; return { open: this.kind, h: Math.max(1, s.h), z: Math.max(0, s.sill) } }
}
export const openingSpec = new OpeningSpec()
