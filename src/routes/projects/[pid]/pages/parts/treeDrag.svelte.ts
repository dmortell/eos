// Drag-and-drop for a TREE (HTML5 DnD): like $lib's DragReorder, but a drop has three zones by pointer
// position within the target row — top quarter = BEFORE it, bottom quarter = AFTER it, the middle = INTO it
// (become its last child). Used by the navigator to move places (drawings-plan §4).
//
//   const td = new TreeDrag((id, targetId, zone) => move(id, targetId, zone))
//   <div {...td.row(n.id)} class:drop-into={td.zoneOf(n.id) === 'into'} …>
export type DropZone = 'before' | 'into' | 'after'

export class TreeDrag {
	dragId = $state<string | null>(null)
	overId = $state<string | null>(null)
	zone = $state<DropZone>('into')
	#onDrop: (id: string, targetId: string, zone: DropZone) => void

	constructor(onDrop: (id: string, targetId: string, zone: DropZone) => void) { this.#onDrop = onDrop }

	/** The zone shown on this row while something else is dragged over it (null otherwise). */
	zoneOf(id: string): DropZone | null { return this.overId === id && this.dragId != null && this.dragId !== id ? this.zone : null }

	#reset() { this.dragId = null; this.overId = null }

	/** Spread onto each row. `draggable` false = the row is a drop target only. */
	row(id: string, draggable = true) {
		return {
			draggable,
			ondragstart: (e: DragEvent) => {
				if (!draggable) return
				e.stopPropagation()
				this.dragId = id
				if (e.dataTransfer) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move' }
			},
			ondragover: (e: DragEvent) => {
				if (this.dragId == null) return   // not our drag (a file, another list)
				e.preventDefault()
				const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), f = (e.clientY - r.top) / (r.height || 1)
				this.zone = f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'into'
				this.overId = id
			},
			ondragleave: () => { if (this.overId === id) this.overId = null },
			ondrop: (e: DragEvent) => {
				if (this.dragId == null) return
				e.preventDefault()
				if (this.dragId !== id) this.#onDrop(this.dragId, id, this.zone)
				this.#reset()
			},
			ondragend: () => this.#reset(),
		}
	}
}
