// Viewport actions of a sheet view (split out of ViewCanvas): ENTER / LEAVE editing inside a viewport (UX review S5:
// its level opens, the selection starts empty; leaving picks the viewport), Alt+wheel STEPS its scale (T126), and a
// DRAG that arms a tool dropped on a view (`ws.dragArm`): a Device library template (the Device tool's ghost at the
// snapped U), outlets from the table (Assign), ports from Port Properties (Patch / Link) on rack views; a block from
// the Blocks list (Insert) on a plan, an elevation / section or a sheet — the drop is the tool's click there; the
// source puts the old tool back when the drag ends.
import type { CadProject } from '../app/project.svelte'
import { toolWorksIn, type Workspace } from '../app/workspace.svelte'
import type { Sheet } from '../domain/drawing'
import type { ViewSpec } from '../views/space'
import type { Pt } from '../domain/types'
import type { PointerIn, ToolCtx } from '../editor/tools'
import { nextScale } from '../views/sheet'
import { specLabel } from '../views/space'

export function enterViewport(ws: Workspace, sheet: Sheet, id: string): boolean {
	const vp = sheet.viewports.find((v) => v.id === id)
	if (!vp) return false
	ws.vpEdit = { sheetId: sheet.id, vpId: id }
	ws.levelId = vp.view.levelId
	ws.select([])
	ws.say(`Editing ${specLabel(vp.view.spec)} in ${sheet.number} — Esc, or a double-click outside the viewport, to leave`)
	return true
}
export function leaveViewport(ws: Workspace, sheet: Sheet | undefined): void {
	const e = ws.vpEdit
	ws.vpEdit = null
	if (e && sheet) { ws.select([sheet.id]); ws.selectViewport(e.vpId) }
}

/** Alt+wheel over the picked (or edited), unlocked viewport: the next standard scale. False = not over one. */
export function rescaleViewport(project: CadProject, ws: Workspace, sheet: Sheet | undefined, editedVpId: string | undefined, dir: 1 | -1, p: Pt): boolean {
	const vp = sheet?.viewports.find((v) => v.id === (editedVpId ?? ws.viewportId))
	if (!sheet || !vp || vp.locked || p.x < vp.rect.x || p.x > vp.rect.x + vp.rect.w || p.y < vp.rect.y || p.y > vp.rect.y + vp.rect.h) return false
	const scale = nextScale(vp.scale, dir), s = sheet
	if (scale !== vp.scale) project.store.transact(`Viewport scale 1:${scale}`, (tx) => tx.put({ ...s, viewports: s.viewports.map((v) => (v.id === vp.id ? { ...v, scale } : v)) }))
	ws.say(`1:${scale} — the wheel steps the viewport's scale with Pan / zoom content on (or Alt+wheel)`)
	return true
}

/** Whether a view of this kind takes a library drag: one that names its tool (a block → Insert) where that tool works,
 *  else (device templates, outlets, ports) rack views only; never inside an edited viewport. */
export function dropTakes(drag: Workspace['dragArm'], kind: ViewSpec['kind'], inViewport: boolean): boolean {
	return !!drag && !inViewport && (drag.tool ? toolWorksIn(drag.tool, kind) : kind === 'row')
}

/** The drop handlers for a library drag over a view; `ok()` = this view takes it (a rack view, not inside a viewport). */
export function libraryDrop(o: { ws: Workspace; ok: () => boolean; input: (e: MouseEvent) => PointerIn; ctx: () => ToolCtx; surface: () => Element | undefined; changed: () => void; focus?: () => void }) {
	const { ws } = o
	return {
		over(e: DragEvent) {
			const d = ws.dragArm
			if (!d || !o.ok()) return
			e.preventDefault()
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
			if (!d.armed) { d.arm(); d.armed = true }   // the tool it arms, once (it stays armed until the drop / drag end)
			o.focus?.()
			ws.tool.hover?.(o.input(e), o.ctx()); o.changed()
		},
		drop(e: DragEvent) {
			if (!ws.dragArm || !o.ok()) return
			e.preventDefault()
			ws.tool.down(o.input(e), o.ctx()); o.changed()
		},
		leave(e: DragEvent) {
			if (e.relatedTarget instanceof Node && o.surface()?.contains(e.relatedTarget)) return   // onto a child: still over the view
			ws.tool.unhover?.(); o.changed()
		},
	}
}
