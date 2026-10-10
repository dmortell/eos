// Arrow-key nudge (backlog "select all, nudge"): the selection moves a step a press in the view's own directions
// (the caller sizes it: 50 / 500 mm in the model, 1 / 10 paper mm on a sheet); in a rack row, devices go up / down 1 U. A burst of presses (a held key) is ONE
// undo step: the gesture stays open until the key is let go (or a moment passes).
import type { Id, Pt, Device, Rack } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { EntityStore, Gesture } from '../store/store'
import type { ViewSpace } from '../views/space'
import { moveBy, canMove, followAttached } from './behaviours'
import { startDeviceDrag, dragDevices, type DeviceDrag } from './deviceDrag'
import { tiedScale } from './tools'

export class Nudge {
	#g: Gesture | null = null
	#sum: Pt = { x: 0, y: 0 }
	#dev: DeviceDrag | null = null
	#timer: ReturnType<typeof setTimeout> | undefined

	/** One press: `d` in view mm (a rack row: d.y = −1 one U up, +1 down). Returns why it was refused, if it was. */
	press(store: EntityStore, ids: Id[], d: Pt, space: ViewSpace): string | null {
		const items = ids.map((id) => store.get(id)).filter((e) => !!e)
		const row = space.spec.kind === 'row'
		if (!items.some((e) => (row ? e.type === 'device' : canMove(e)))) return null
		const sum = { x: this.#sum.x + d.x, y: this.#sum.y + d.y }
		if (row) {
			this.#dev ??= startDeviceDrag(items.filter((e): e is Device => e.type === 'device'))
			const r = dragDevices(this.#dev, Math.round(-sum.y), undefined, false, store.ofType('device'), (id) => store.get(id) as Rack | undefined)
			if ('problem' in r) return r.problem
			this.#g ??= store.begin('Nudge')
			this.#g.update((tx) => { for (const n of r.put) tx.put(n) })
		} else {
			const s = space.deltaToWorld(sum), moved = new Set(ids)
			this.#g ??= store.begin(ids.length === 1 ? 'Nudge' : `Nudge ${ids.length} items`)
			this.#g.update((tx) => {
				for (const id of ids) {
					const en = tx.get(id)
					if (!en) continue
					const k = tiedScale(en, (x) => tx.get(x))   // a note tied to a viewport moves in its view mm
					tx.put(moveBy(en, k === 1 ? s : { ...s, x: s.x * k, y: s.y * k }))
				}
				for (const sh of followAttached(store.ofType('shape') as Shape[], moved, s)) tx.put(sh)
			})
		}
		this.#sum = sum
		clearTimeout(this.#timer)
		this.#timer = setTimeout(() => this.end(), 1500)
		return null
	}

	/** One press on a sheet with a viewport picked (backlog "Viewport handling" part 4): its window moves `d` paper mm
	 *  (the view stays put on the paper). A locked one stays. */
	pressViewport(store: EntityStore, sheetId: Id, vpId: Id, d: Pt): string | null {
		const sheet = store.get(sheetId)
		const vp = sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === vpId) : undefined
		if (sheet?.type !== 'sheet' || !vp) return null
		if (vp.locked) return 'Viewport locked — unlock it in Properties to move it'
		const sum = { x: this.#sum.x + d.x, y: this.#sum.y + d.y }
		this.#g ??= store.begin('Nudge viewport')
		this.#g.update((tx) => {   // each update starts again from before the burst: the whole sum
			const s = tx.get(sheetId) as Sheet
			tx.put({ ...s, viewports: s.viewports.map((v) => (v.id === vpId ? { ...v, rect: { ...v.rect, x: v.rect.x + sum.x, y: v.rect.y + sum.y } } : v)) })
		})
		this.#sum = sum
		clearTimeout(this.#timer)
		this.#timer = setTimeout(() => this.end(), 1500)
		return null
	}

	/** The burst is over (key let go): one undo step. */
	end(): void {
		clearTimeout(this.#timer)
		this.#g?.commit()
		this.#g = null; this.#sum = { x: 0, y: 0 }; this.#dev = null
	}
}
