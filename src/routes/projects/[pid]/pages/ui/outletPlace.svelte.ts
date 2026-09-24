// OUTLET PLACEMENT (E1 / E2 / E3). Placing an outlet block (Insert › Outlet, or any 'outlet' block from the
// Blocks panel) uses STICKY DEFAULTS — the block, ports, type and layer of the outlet placed or edited last —
// and the NEXT LABEL after the last one issued (template-aware: 4A013 → 4A014, padding and suffix kept; with
// no history, after the highest-numbered outlet in the model). A WALK renumber (E3) is seeded from an outlet's
// label; each click on another outlet gives it the next one. Per browser (localStorage), not per project.
import { blockDef } from './blocks'
import { nextFreeLabel } from './clipboard'
import type { Ent } from './geometry'
import { isOutletEnt } from '../store/allocate'

const KEY = 'eos.pages.outletDefaults'
type Sticky = { block: string; ports: string; type: string; layer: string; lastLabel: string }
const DEFAULTS: Sticky = { block: 'outlet-box', ports: '1', type: 'network', layer: '', lastLabel: '' }

function load(): Sticky {
	try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && typeof s === 'object') return { ...DEFAULTS, ...s } } catch { /* private mode etc. */ }
	return { ...DEFAULTS }
}
export const outletSticky = $state<Sticky>(typeof localStorage === 'undefined' ? { ...DEFAULTS } : load())
/** E3: the label the walk renumber gave last (the next click gets the one after it); null = no walk. */
export const walk = $state<{ label: string | null }>({ label: null })
function save() { try { localStorage.setItem(KEY, JSON.stringify(outletSticky)) } catch { /* ignore */ } }

export const isOutletBlock = (id?: string) => blockDef(id)?.category === 'outlet'
const NUM = /^(.*?)(\d+)(\D*)$/

/** The label after `l`: its (last) number + 1, zero-padding kept. A label without a number → '' (none). */
export function incLabel(l: string): string {
	const m = NUM.exec(l); if (!m) return ''
	return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3]
}
/** The label a new outlet gets: after `last` (or the highest-numbered label in `existing`), skipping taken ones. */
export function nextOutletLabel(existing: Ent[], last: string): string {
	const labels = existing.filter(isOutletEnt).map((e) => e.attrs?.LABEL ?? '').filter(Boolean)
	let seed = last
	if (!seed) { let best = -1; for (const l of labels) { const m = NUM.exec(l); if (m && Number(m[2]) > best) { best = Number(m[2]); seed = l } } }
	const n = seed ? incLabel(seed) : ''
	return n ? nextFreeLabel(n, new Set(labels)) : ''
}

/** A new outlet insert's sticky attributes + next label + layer (if `layers` has it); records the label issued. */
export function newOutletFields(existing: Ent[], layers: string[]): Pick<Ent, 'attrs' | 'layer'> {
	const s = outletSticky, LABEL = nextOutletLabel(existing, s.lastLabel)
	if (LABEL) { s.lastLabel = LABEL; save() }
	return { attrs: { ...(LABEL ? { LABEL } : {}), PORTS: s.ports, TYPE: s.type }, layer: s.layer && layers.includes(s.layer) ? s.layer : undefined }
}
/** A placement was refused after `newOutletFields` issued a label: give the label back. */
export function restoreLastLabel(prev: string) { if (outletSticky.lastLabel !== prev) { outletSticky.lastLabel = prev; save() } }
/** An outlet was edited (Properties) — its block / ports / type / layer / label become the sticky defaults. */
export function rememberOutlet(e: Ent) {
	if (e.type !== 'insert' || !isOutletBlock(e.block)) return
	const s = outletSticky
	s.block = e.block!; s.ports = e.attrs?.PORTS ?? s.ports; s.type = e.attrs?.TYPE ?? s.type; s.layer = e.layer ?? ''
	if (e.attrs?.LABEL) s.lastLabel = e.attrs.LABEL
	save()
}
