import { collection, doc, setDoc, getDocs, query, orderBy, limit as fbLimit, serverTimestamp, type DocumentData, type Timestamp } from 'firebase/firestore'
import { firestore } from './db.svelte'

export interface LogEntry {
	id?: string
	timestamp: Timestamp | null
	uid: string
	tool: string
	floor?: number
	changes: ChangeDetail[]
}

export interface ChangeDetail {
	action: string
	field?: string
	zone?: string
	from?: unknown
	to?: unknown
	count?: number
	details?: string
}

/**
 * Write a log entry to Firestore at logs/{projectId}/{tool}
 * Reusable across tools — just pass the tool name.
 */
export async function writeLog(projectId: string, tool: string, uid: string, changes: ChangeDetail[], extra?: Record<string, unknown>) {
	if (!changes.length) return
	const colRef = collection(firestore, 'logs', projectId, tool)
	const entry: DocumentData = {
		timestamp: serverTimestamp(),
		uid,
		tool,
		changes,
		...extra,
	}
	await setDoc(doc(colRef), entry).catch(err => console.warn('Log write failed:', err))
}

/**
 * Fetch recent log entries from logs/{projectId}/{tool}, newest first.
 */
export async function fetchLogs(projectId: string, tool: string, count = 50): Promise<LogEntry[]> {
	const colRef = collection(firestore, 'logs', projectId, tool)
	const q = query(colRef, orderBy('timestamp', 'desc'), fbLimit(count))
	const snap = await getDocs(q)
	return snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry))
}

/** Format a single ChangeDetail into a human-readable string */
export function formatChange(c: ChangeDetail): string {
	if (c.details) return `${c.action} ${c.field ?? ''}: ${c.details}`.trim()
	const parts = [c.action, c.field ?? '']
	if (c.zone) parts.push(`zone ${c.zone}`)
	if (c.from !== undefined && c.to !== undefined) parts.push(`${c.from} → ${c.to}`)
	else if (c.to !== undefined) parts.push(` → ${c.to}`)
	return parts.filter(Boolean).join(' ')
}
