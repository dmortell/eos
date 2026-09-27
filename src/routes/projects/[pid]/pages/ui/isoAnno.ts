// SCREEN-FACING annotations in the 3D (iso / perspective) view. Plan 2D shapes are laid on the ground there
// (EntRender's `groundInIso` branch), which lies a callout's text flat / skews its box and squashes a legend.
// Callouts and legends instead read like OpenCad's 3D annotations: their ANCHORS are 3D points projected
// through the same view map the model draws with (the callout's text position + leader tip, the legend's
// top-left corner), and the box is drawn UPRIGHT, unskewed, at its paper size (annotative, `paperMm`) —
// so it stays legible from any orbit, and the leader still lands on what it points at.
//
// The trick: a projected COPY of the entity whose points are already in iso drawing coords, drawn / hit-tested
// by the ordinary 2D code (EntRender's `drawn`, hit.ts `hitEnt`) — no second renderer to keep in step.
import type { Pt, Ent } from './geometry'
import { isLegend } from './legend'
import { hitEnt, inThisView } from './hit'
import type { ViewCtx } from './view'

/** Plan point → iso drawing coords (vpView `isoGround`: the model's viewMap at z = 0). */
export type IsoProj = (x: number, y: number) => Pt

/** Drawn screen-facing in the iso view (not laid on the ground): a callout text or a legend insert. */
export const isoFacing = (e: Ent): boolean => (e.type === 'text' && !!e.callout) || isLegend(e)

/** The entity as the iso view draws it: its anchor points projected (`a`, and a callout's leader tip), no
 *  rotation (upright on screen). Everything else — the paper-mm box, font, border, legend rows — is
 *  unchanged, so the 2D renderer lays it out at paper size about the projected anchor. `b` / `pts` aren't
 *  used by either kind (text's box comes from `a` + its size; an insert from `a` + its scale). */
export function isoAnnoEnt(e: Ent, proj: IsoProj): Ent {
	const out: Ent = { ...e }
	if (e.a) out.a = proj(e.a[0], e.a[1])
	if (e.leader) out.leader = proj(e.leader[0], e.leader[1])
	delete out.rot
	return out
}

/** The top-most screen-facing annotation under p (iso drawing coords) — `ents` in PAINT order, the last drawn
 *  wins. Hits the same box the plan hits (a callout's text box, the legend's whole frame) but on the projected
 *  copy; `ok` is the caller's layer gate (visible + unlocked). null when nothing is hit / not an iso view. */
export function hitIsoAnno(ctx: ViewCtx, ents: Ent[], proj: IsoProj | null, p: Pt, thr: number, ok: (e: Ent) => boolean = () => true): string | null {
	if (!ctx.isIso || !proj) return null
	for (let i = ents.length - 1; i >= 0; i--) {
		const e = ents[i]
		if (!isoFacing(e) || !inThisView(ctx, e) || !ok(e)) continue
		if (hitEnt(ctx, isoAnnoEnt(e, proj), p, thr)) return e.id
	}
	return null
}
