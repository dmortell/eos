/**
 * Debounced auto-save with echo-aware remote-sync gating.
 *
 * Replaces the timer-based `pauseSync()` pattern (racks/frames/patching),
 * which had a real clobber window: a remote snapshot arriving >1.5s after a
 * save — but before the subscription delivered our own write back — could
 * overwrite newer local edits. Instead:
 *
 * - `status !== 'saved'` (local edits pending/in flight) → never apply remote.
 * - A remote snapshot deep-equal to the last payload we saved is our own
 *   echo → skip (nothing to do).
 * - Anything else is a genuine remote change → apply.
 *
 * Callers pass the *comparable* payload subset (the same object shape they
 * save) to `shouldApplyRemote`, built with identical key order so the JSON
 * comparison is deterministic.
 */
export class AutoSave<T = unknown> {
	status = $state<'saved' | 'saving' | 'unsaved'>('saved')

	private timer: ReturnType<typeof setTimeout> | null = null
	/** Recent saved payloads (newest last). A ring, not a single value: with two
	 *  saves in quick succession (create → undo), the FIRST save's Firestore echo
	 *  can arrive after the second save — matching only the last payload made
	 *  that stale echo look like a genuine remote change and reverted the undo. */
	private recentSaves: string[] = []
	private getPayload: (() => T) | null = null

	constructor(
		private readonly save: (payload: T) => void,
		private readonly delay = 500,
	) {}

	/** Call on every local change; debounces, then saves via the constructor callback. */
	schedule(getPayload: () => T): void {
		this.getPayload = getPayload
		this.status = 'unsaved'
		if (this.timer) clearTimeout(this.timer)
		this.timer = setTimeout(() => this.flush(), this.delay)
	}

	/** Save immediately (also used by schedule's debounce). No-op if nothing pending. */
	flush(): void {
		if (!this.getPayload) return
		if (this.timer) { clearTimeout(this.timer); this.timer = null }
		this.status = 'saving'
		const payload = this.getPayload()
		this.recentSaves.push(JSON.stringify(payload))
		if (this.recentSaves.length > 8) this.recentSaves.shift()
		this.save(payload)
		this.status = 'saved'
	}

	/** Should a remote snapshot be applied over local state? */
	shouldApplyRemote(remoteComparable: unknown): boolean {
		if (this.status !== 'saved') return false
		if (this.recentSaves.length === 0) return true
		const json = JSON.stringify(remoteComparable)
		// Echo of ANY recent save (not just the newest) → nothing to apply.
		// The newest save always wins locally; stale echoes must never revert it.
		if (this.recentSaves.includes(json)) return false
		return true
	}
}
