export interface Command {
	redo: () => void | Promise<void>
	undo: () => void | Promise<void>
	label: string
}

export class HistoryStore {
	private undoStack = $state<Command[]>([])
	private redoStack = $state<Command[]>([])
	private maxSize = 100
	canUndo = $derived(this.undoStack.length > 0)
	canRedo = $derived(this.redoStack.length > 0)
	undoDepth = $derived(this.undoStack.length)
	redoDepth = $derived(this.redoStack.length)

	async push(command: Command): Promise<void> {
		await command.redo()
		this.undoStack.push(command)
		this.redoStack = []
		if (this.undoStack.length > this.maxSize) this.undoStack.shift()
	}
	/** Record a command without executing it (for when the action already happened) */
	record(command: Command): void {
		this.undoStack.push(command)
		this.redoStack = []
		if (this.undoStack.length > this.maxSize) this.undoStack.shift()
	}
	async undo(): Promise<boolean> { const cmd = this.undoStack.pop(); if (!cmd) return false; await cmd.undo(); this.redoStack.push(cmd); return true }
	async redo(): Promise<boolean> { const cmd = this.redoStack.pop(); if (!cmd) return false; await cmd.redo(); this.undoStack.push(cmd); return true }
	clear(): void { this.undoStack = []; this.redoStack = [] }
}

/*
Usage example:

			this.history.record({
				label: mode,
				undo: async () => { this.activeShapes.restoreSnapshot(initialShapesSnapshot); this.selectMany(selectedIds); await this.data.saveShapes(targetPageId, initialShapes) },
				redo: async () => { this.activeShapes.restoreSnapshot(finalShapesSnapshot); this.selectMany(selectedIds); await this.data.saveShapes(targetPageId, finalShapes) }
			})

*/
