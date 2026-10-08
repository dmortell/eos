// The RESTORE NOTICE (ADR 0008 §6): a restore changes the project for everyone in it, so it is announced first. One
// doc per project, `projects/{pid}/cadMeta/restore`, that every open cad session listens to:
//   pending (30 s countdown; the person restoring can cancel) → running (everyone else read-only) → done | cancelled.
// It is advisory — cad has no server to enforce it — and one restore runs at a time. A notice left pending / running
// for 10 minutes (the tab closed) counts as abandoned.
import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore'
import { newId } from '../domain/ids'
import type { CadProject } from './project.svelte'

export const COUNTDOWN_MS = 30_000
export const ABANDONED_MS = 10 * 60_000

export interface Notice {
	id: string
	state: 'pending' | 'running' | 'done' | 'cancelled'
	by: { uid: string; name: string; client: string }
	/** The backup or file restored from. */
	what: string
	/** "1F", "33F 3303 + 32F", "Whole project". */
	parts: string
	startsAt: number
	/** When the state last changed. */
	at: number
	/** The outcome (done) or why it stopped (cancelled). */
	summary?: string
}

/** Pending or running, and not left behind by a closed tab. */
export const isLive = (n: Notice | null | undefined, now = Date.now()): boolean =>
	!!n && (n.state === 'pending' || n.state === 'running') && now - n.at < ABANDONED_MS

const ref = (db: Firestore, pid: string) => doc(db, 'projects', pid, 'cadMeta', 'restore')

export class RestoreNotices {
	notice = $state.raw<Notice | null>(null)
	#off: () => void
	#tick: ReturnType<typeof setInterval>
	#cleared = new Set<string>()
	#seen = new Set<string>()
	/** This session saw the notice before it ended (a cancelled one only matters to those who saw it coming). */
	sawComing = (id: string) => this.#seen.has(id)

	constructor(private project: CadProject) {
		this.#off = onSnapshot(ref(project.db, project.pid), (s) => { this.notice = (s.data() as Notice | undefined) ?? null; this.#apply() })
		this.#tick = setInterval(() => this.#apply(), 15_000)   // an abandoned run frees the others
	}

	/** Someone else's running restore makes this session read-only; when it's done, this session's undo steps would
	 *  fight it, so they go. (Called from the listener, not an effect: it reads and writes state.) */
	#apply(): void {
		const n = this.notice, store = this.project.store
		if (n && isLive(n)) this.#seen.add(n.id)
		const other = !!n && !this.mine(n)
		store.readOnly = other && n.state === 'running' && isLive(n) ? `${n.by.name || 'Someone'} is restoring ${n.parts} — editing is paused until it's done` : null
		if (other && n.state === 'done' && !this.#cleared.has(n.id) && Date.now() - n.at < ABANDONED_MS) { this.#cleared.add(n.id); store.clearHistory() }
		this.project.rev++
	}

	/** This tab wrote it. */
	mine = (n: Notice | null = this.notice) => !!n && n.by.client === this.project.client

	/** Announce a restore: refused while another one is pending or running. Returns the notice's id. */
	async announce(what: string, parts: string): Promise<string> {
		const p = this.project, id = newId(), now = Date.now()
		await runTransaction(p.db, async (tx) => {
			const cur = (await tx.get(ref(p.db, p.pid))).data() as Notice | undefined
			if (cur && isLive(cur, now)) throw new Error(`${cur.by.name || 'Someone'} is already restoring ${cur.parts} — try again when it's done`)
			const n: Notice = { id, state: 'pending', by: { uid: p.user, name: p.userName, client: p.client }, what, parts, startsAt: now + COUNTDOWN_MS, at: now }
			tx.set(ref(p.db, p.pid), n)
		})
		return id
	}

	/** Move OUR notice on (pending → running → done); refused if it was cancelled or replaced meanwhile. */
	async #step(id: string, from: Notice['state'][], to: Notice['state'], summary?: string): Promise<void> {
		const p = this.project
		await runTransaction(p.db, async (tx) => {
			const cur = (await tx.get(ref(p.db, p.pid))).data() as Notice | undefined
			if (cur?.id !== id || !from.includes(cur.state)) throw new Error(cur?.id === id && cur.state === 'cancelled' ? 'The restore was cancelled' : 'The restore notice was replaced')
			tx.set(ref(p.db, p.pid), { ...cur, state: to, at: Date.now(), ...(summary ? { summary } : {}) })
		})
	}
	start = (id: string) => this.#step(id, ['pending'], 'running')
	finish = (id: string, summary: string) => this.#step(id, ['running'], 'done', summary)
	cancel = (id: string, why = 'Cancelled') => this.#step(id, ['pending', 'running'], 'cancelled', why).catch(() => {})

	/** Wait out the countdown; throws if our notice is cancelled meanwhile. */
	async countdown(id: string): Promise<void> {
		const until = Date.now() + COUNTDOWN_MS + 15_000
		for (;;) {
			const n = this.notice
			if (n?.id === id && n.state === 'cancelled') throw new Error('The restore was cancelled')
			if (n?.id === id && Date.now() >= n.startsAt) return
			if (Date.now() > until) throw new Error('The restore notice was replaced')
			await new Promise((r) => setTimeout(r, 250))
		}
	}

	destroy(): void { this.#off(); clearInterval(this.#tick); this.project.store.readOnly = null }
}
