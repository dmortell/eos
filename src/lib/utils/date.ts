/**
 * Normalize any timestamp shape we might read from Firestore into a JS `Date`.
 *
 * Firestore values can arrive as:
 *  - a real `Timestamp` instance (has `.toDate()`)
 *  - a flattened `{ seconds, nanoseconds }` map (a Timestamp that lost its prototype,
 *    e.g. legacy data written before sanitizeFirestoreData preserved Timestamps)
 *  - a JS `Date`
 *  - an epoch number (seconds or milliseconds)
 *  - an ISO date string
 *
 * Returns `null` for anything unparseable, so callers never crash on `.toDate()`.
 */
export function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return isNaN(value.getTime()) ? null : value

	// Real Firestore Timestamp (duck-typed to avoid importing the SDK here).
	if (typeof (value as any).toDate === 'function') {
		try { return (value as any).toDate() } catch { return null }
	}

	// Flattened { seconds, nanoseconds } map.
	if (typeof value === 'object' && typeof (value as any).seconds === 'number') {
		const { seconds, nanoseconds = 0 } = value as { seconds: number; nanoseconds?: number }
		return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6))
	}

	// Epoch number: treat values below ~year 2001 in ms as seconds.
	if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value)

	if (typeof value === 'string') {
		const d = new Date(value)
		return isNaN(d.getTime()) ? null : d
	}

	return null
}

/** Format any Firestore timestamp shape as a locale date string; empty string if unparseable. */
export function formatDate(value: unknown, locale?: string, options?: Intl.DateTimeFormatOptions): string {
	const d = toDate(value)
	return d ? d.toLocaleDateString(locale, options) : ''
}
