import { SurfaceEditor } from '../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { Annotation, AnnotationKind } from '../types'

export type AnnTool = 'select' | AnnotationKind

/** Editor for a viewport's model-space annotations (text / arrow / rect / symbol). */
export class AnnotationEditor extends SurfaceEditor {
	annotations = $state<Annotation[]>([])
	tool = $state<AnnTool>('select')
	symbol = $state('section')

	seed(a: Annotation[] | undefined) { this.annotations = (a ?? []).map(x => ({ ...x })) }
	snapshot() { return $state.snapshot(this.annotations) as Annotation[] }
	selAnn = $derived(this.sel?.kind === 'ann' ? this.annotations.find(a => a.id === this.sel!.id) ?? null : null)

	add(a: Annotation) { this.annotations.push(a); this.select('ann', a.id); this.notify() }

	/** Click placement (text / symbol). */
	click(p: Point) {
		if (this.tool === 'text') this.add({ id: this.uid('a'), kind: 'text', x: p.x, y: p.y, text: 'Text', fontPt: 8, layerId: 'annotations' })
		else if (this.tool === 'symbol') this.add({ id: this.uid('a'), kind: 'symbol', x: p.x, y: p.y, symbol: this.symbol, layerId: 'annotations' })
	}
	/** Drag placement (arrow / rect). */
	startShape(p: Point) {
		if (this.tool !== 'arrow' && this.tool !== 'rect') return
		const a: Annotation = { id: this.uid('a'), kind: this.tool, x: p.x, y: p.y, x2: p.x, y2: p.y, layerId: 'annotations' }
		this.annotations.push(a); this.select('ann', a.id)
		this.startDrag(e => { const w = this.toWorld(e); if (w) { a.x2 = w.x; a.y2 = w.y } }, () => { this.tool = 'select'; this.notify() })
	}
	move(a: Annotation, e0: MouseEvent) {
		this.select('ann', a.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const o = { x: a.x, y: a.y, x2: a.x2, y2: a.y2 }
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const dx = w.x - w0.x, dy = w.y - w0.y
			a.x = o.x + dx; a.y = o.y + dy
			if (o.x2 != null) { a.x2 = o.x2 + dx; a.y2 = (o.y2 ?? 0) + dy }
		}, () => this.notify())
	}
	setSel(patch: Partial<Annotation>) { const a = this.selAnn; if (!a) return; Object.assign(a, patch); this.notify() }
	setLink(patch: Partial<NonNullable<Annotation['link']>>) { const a = this.selAnn; if (!a) return; a.link = { kind: 'drawing', ...(a.link ?? {}), ...patch } as any; this.notify() }
	deleteSel() { const a = this.selAnn; if (!a) return; this.annotations = this.annotations.filter(x => x.id !== a.id); this.clearSel(); this.notify() }
}
