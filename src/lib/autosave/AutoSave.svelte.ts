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
	private lastSavedJson: string | null = null
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
		this.lastSavedJson = JSON.stringify(payload)
		this.save(payload)
		this.status = 'saved'
	}

	/** Should a remote snapshot be applied over local state? */
	shouldApplyRemote(remoteComparable: unknown): boolean {
		if (this.status !== 'saved') return false
		if (this.lastSavedJson !== null && JSON.stringify(remoteComparable) === this.lastSavedJson) return false
		return true
	}
}
