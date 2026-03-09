/**
 * Presence tracker — tracks active users in `settings/presence` Firestore doc.
 * Mouse movement on `document` marks the user active (throttled at 3s).
 * After 5 min idle the entry is removed; mouse movement re-activates.
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
let trailingTimer: ReturnType<typeof setTimeout> | null = null
let inactivityTimer: ReturnType<typeof setTimeout> | null = null
let listening = false // mousemove listener attached
let active = false    // currently has a presence entry
let fakeUsers: PresenceUser[] = [] // TODO: remove — for testing

const THROTTLE = 3000
const INACTIVE_MS = 5 * 60 * 1000
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
	if (!active) {
		active = true
		subscribe()
	}
	resetInactivityTimer()
}

function removePresence() {
	if (!currentUid) return
	active = false
	setDoc(docRef, { users: { [currentUid]: deleteField() } }, { merge: true }).catch(() => {})
}

function onMouseMove() {
	const now = Date.now()
	if (trailingTimer) clearTimeout(trailingTimer)
	if (now - lastWrite >= THROTTLE) {
		lastWrite = now
		writePresence()
	} else {
		trailingTimer = setTimeout(() => {
			lastWrite = Date.now()
			writePresence()
		}, THROTTLE - (now - lastWrite))
	}
}

function resetInactivityTimer() {
	if (inactivityTimer) clearTimeout(inactivityTimer)
	inactivityTimer = setTimeout(markInactive, INACTIVE_MS)
}

function markInactive() {
	// Remove Firestore entry + unsubscribe snapshot, but keep mousemove listener
	// so moving the mouse again re-activates
	removePresence()
	if (unsub) { unsub(); unsub = null }
}

function subscribe() {
	if (unsub) return // already subscribed
	unsub = onSnapshot(docRef, { includeMetadataChanges: false }, (snap) => {
		// Skip snapshots from our own pending writes (serverTimestamp is null locally)
		if (snap.metadata.hasPendingWrites) return
		const data = snap.data()
		if (!data?.users) { presence.users = [...fakeUsers]; return } // TODO: remove fakeUsers
		const cutoff = Date.now() - INACTIVE_MS
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
		others.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
		const users = self ? [self, ...others] : others
		presence.users = [...users, ...fakeUsers] // TODO: remove fakeUsers spread
	}, () => {})
}

function onBeforeUnload() {
	removePresence()
}

/** Start tracking presence for the given user. Safe to call multiple times. */
export function startPresence(user: User) {
	if (listening && currentUid === user.uid) return
	// If switching users, clean up old
	if (currentUid && currentUid !== user.uid) stopPresence()

	currentUid = user.uid
	currentUser = user
	active = false

	if (!listening) {
		document.addEventListener('mousemove', onMouseMove)
		window.addEventListener('beforeunload', onBeforeUnload)
		listening = true
	}

	// Write immediately so user shows up right away
	lastWrite = Date.now()
	writePresence()

	// TODO: remove — fake users for testing
	fakeUsers = [
		{ uid: 'fake1', displayName: 'Alice Johnson', email: 'alice@example.com', photoURL: null, lastActive: new Date() },
		{ uid: 'fake2', displayName: 'Bob Smith', email: 'bob@example.com', photoURL: null, lastActive: new Date() },
		{ uid: 'fake3', displayName: 'Charlie Brown', email: 'charlie@example.com', photoURL: null, lastActive: new Date() },
		{ uid: 'fake4', displayName: 'Diana Prince', email: 'diana@example.com', photoURL: null, lastActive: new Date() },
	]
}

/** Stop tracking presence entirely (sign-out). */
export function stopPresence() {
	if (listening) {
		document.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('beforeunload', onBeforeUnload)
		listening = false
	}
	if (trailingTimer) { clearTimeout(trailingTimer); trailingTimer = null }
	if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null }
	removePresence()
	if (unsub) { unsub(); unsub = null }
	currentUid = null
	currentUser = null
	active = false
	presence.users = []
}
