/**
 * Presence tracker — tracks active users in `settings/presence` Firestore doc.
 * Mouse movement on `document` writes a heartbeat every 3 min.
 * Users with lastActive older than 5 min are cleaned up by any active client.
 */

import {
	doc, setDoc, onSnapshot, serverTimestamp, deleteField,
	type Unsubscribe, type Timestamp
} from 'firebase/firestore'
import { firestore } from '$lib/db.svelte'
import type { User } from 'firebase/auth'

export interface PresenceUser {
	uid: string
	displayName: string
	email: string
	photoURL: string | null
	lastActive: Date
}

// Reactive state — imported by PresenceAvatars
// Wrapped in object because Svelte 5 forbids reassigning exported $state
export const presence = $state<{ users: PresenceUser[] }>({ users: [] })

// Private state
let unsub: Unsubscribe | null = null
let currentUid: string | null = null
let currentUser: User | null = null
let lastWrite = 0
let listening = false

const HEARTBEAT = 3 * 60 * 1000   // write at most once per 3 min
const EXPIRY_MS = 5 * 60 * 1000   // consider user gone after 5 min
const docRef = doc(firestore, 'settings', 'presence')

function writePresence() {
	if (!currentUid || !currentUser) return
	setDoc(docRef, {
		users: {
			[currentUid]: {
				displayName: currentUser.displayName ?? currentUser.email ?? 'Anonymous',
				email: currentUser.email ?? '',
				photoURL: currentUser.photoURL ?? null,
				lastActive: serverTimestamp()
			}
		}
	}, { merge: true }).catch(() => {})
	if (!unsub) subscribe()
}

function removePresence() {
	if (!currentUid) return
	setDoc(docRef, { users: { [currentUid]: deleteField() } }, { merge: true }).catch(() => {})
}

/** Delete expired entries (>5 min) from Firestore */
function cleanupExpired(users: Record<string, any>, cutoff: number) {
	const deletes: Record<string, any> = {}
	let count = 0
	for (const [uid, entry] of Object.entries(users)) {
		if (!entry?.lastActive) { deletes[uid] = deleteField(); count++; continue }
		const ts = entry.lastActive instanceof Date
			? entry.lastActive.getTime()
			: (entry.lastActive as Timestamp).toDate().getTime()
		if (ts < cutoff) { deletes[uid] = deleteField(); count++ }
	}
	if (count > 0) {
		setDoc(docRef, { users: deletes }, { merge: true }).catch(() => {})
	}
}

function onMouseMove() {
	if (Date.now() - lastWrite < HEARTBEAT) return
	lastWrite = Date.now()
	writePresence()
}

function subscribe() {
	if (unsub) return
	unsub = onSnapshot(docRef, (snap) => {
		if (snap.metadata.hasPendingWrites) return
		const data = snap.data()
		if (!data?.users) { presence.users = []; return }
		const cutoff = Date.now() - EXPIRY_MS
		let self: PresenceUser | null = null
		const others: PresenceUser[] = []
		for (const [uid, entry] of Object.entries(data.users as Record<string, any>)) {
			if (!entry?.lastActive) continue
			const ts: Date = entry.lastActive instanceof Date
				? entry.lastActive
				: (entry.lastActive as Timestamp).toDate()
			if (ts.getTime() < cutoff) continue
			const u: PresenceUser = { uid, displayName: entry.displayName, email: entry.email ?? '', photoURL: entry.photoURL, lastActive: ts }
			if (uid === currentUid) self = u
			else others.push(u)
		}
		cleanupExpired(data.users, cutoff)
		others.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
		presence.users = self ? [self, ...others] : others
	}, () => {})
}

function onBeforeUnload() {
	removePresence()
}

/** Start tracking presence for the given user. Safe to call multiple times. */
export function startPresence(user: User) {
	if (listening && currentUid === user.uid) return
	if (currentUid && currentUid !== user.uid) stopPresence()

	currentUid = user.uid
	currentUser = user

	if (!listening) {
		document.addEventListener('mousemove', onMouseMove)
		window.addEventListener('beforeunload', onBeforeUnload)
		listening = true
	}

	// Write immediately so user shows up right away
	lastWrite = Date.now()
	writePresence()
}

/** Stop tracking presence entirely (sign-out). */
export function stopPresence() {
	if (listening) {
		document.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('beforeunload', onBeforeUnload)
		listening = false
	}
	removePresence()
	if (unsub) { unsub(); unsub = null }
	currentUid = null
	currentUser = null
	presence.users = []
}
