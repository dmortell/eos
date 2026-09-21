// Reusable list drag-to-reorder helper (HTML5 DnD). Manages the drag/over state and hands each row a
// bundle of event props + before/after indicator flags, so any vertical list can be reordered by dragging.
// Direction-aware: dragging a row DOWN onto another drops it AFTER that row, dragging UP drops it BEFORE —
// so dropping onto the immediately-adjacent row still moves it (a plain before-insert would be a no-op).
//
// Usage:
//   const dr = new DragReorder(
//     (id, targetId, after) => moveItem(id, targetId, after),   // apply the move to your list
//     (id) => items.findIndex((x) => x.id === id),               // current index of an item (for direction)
//   )
//   {#each items as it (it.id)}
//     <div {...dr.row(it.id)} class:drag-before={dr.isBefore(it.id)} class:drag-after={dr.isAfter(it.id)}>…</div>
//   {/each}
//
// `row(id)` returns spreadable props: draggable + ondragstart/over/leave/drop/end. Pair with CSS on the
// `drag-before` / `drag-after` classes for a drop line (e.g. inset box-shadow on the top / bottom edge).
export class DragReorder {
	dragId = $state<string | null>(null)
	overId = $state<string | null>(null)
	overAfter = $state(false)
	#onMove: (id: string, targetId: string, after: boolean) => void
	#index: (id: string) => number

	constructor(onMove: (id: string, targetId: string, after: boolean) => void, index: (id: string) => number) {
		this.#onMove = onMove
		this.#index = index
	}

	/** True when the drop indicator should show ABOVE this row (inserting before it). */
	isBefore(id: string): boolean { return this.overId === id && this.dragId !== id && !this.overAfter }
	/** True when the drop indicator should show BELOW this row (inserting after it). */
	isAfter(id: string): boolean { return this.overId === id && this.dragId !== id && this.overAfter }

	#reset() { this.dragId = null; this.overId = null }

	/** Spread onto each reorderable row element. */
	row(id: string) {
		return {
			draggable: true,
			ondragstart: (e: DragEvent) => {
				this.dragId = id
				if (e.dataTransfer) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move' }
			},
			ondragover: (e: DragEvent) => {
				e.preventDefault()
				this.overId = id
				this.overAfter = this.dragId != null && this.#index(this.dragId) < this.#index(id)
			},
			ondragleave: () => { if (this.overId === id) this.overId = null },
			ondrop: (e: DragEvent) => {
				e.preventDefault()
				if (this.dragId && this.dragId !== id) this.#onMove(this.dragId, id, this.#index(this.dragId) < this.#index(id))
				this.#reset()
			},
			ondragend: () => this.#reset(),
		}
	}
}
