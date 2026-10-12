// A run token for async work that is restarted (the Issue panel's preview re-runs on every keystroke): only the newest
// run may deliver its result — a slow older one finishing late must not overwrite a newer answer (Review 2 Q61).
export interface RunToken {
	/** Start a run; the returned function says whether it is still the newest (and not cancelled). */
	start(): () => boolean
	/** Invalidate every run in flight (the panel closed). */
	cancel(): void
}

export function runToken(): RunToken {
	let n = 0
	return {
		start() { const mine = ++n; return () => mine === n },
		cancel() { n++ },
	}
}
