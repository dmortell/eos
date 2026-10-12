/**
 * File storage-provider helpers.
 *
 * Files can live in one of two places: UploadThing (the original provider) or
 * Firebase Storage (added as an alternative). Every `files/{id}` doc records a
 * `provider` field so we can route downloads/deletes correctly.
 *
 * The `files` collection is shared with the eos2 POC, which wrote the legacy
 * value `'firestore'` for Firebase Storage uploads — treat it as `'firebase'`.
 * Pre-provider production docs are all UploadThing and are detected by their key.
 */

export type FileProvider = 'uploadthing' | 'firebase'

export interface ProviderFileDoc {
	/** 'uploadthing' | 'firebase' | legacy 'firestore'. */
	provider?: string
	/** UploadThing storage key (used for deletion via UTApi). */
	key?: string
	/** Firebase Storage object path (used for deletion via deleteObject). */
	path?: string
	/** Tolerate the wider file-doc shapes (FileDoc / DocWithId) passed by callers. */
	[key: string]: unknown
}

/** True if the file lives in UploadThing. */
export function isUploadThing(f: ProviderFileDoc): boolean {
	if (f.provider === 'uploadthing') return true
	if (f.provider === 'firebase' || f.provider === 'firestore') return false
	// Legacy doc with no provider: a UploadThing key (and no storage path) ⇒ UploadThing.
	return !!f.key && !f.path
}

/** Human-readable provider label for the file list. */
export function providerLabel(f: ProviderFileDoc): string {
	return isUploadThing(f) ? 'UploadThing' : 'Firebase'
}

/** Canonical provider value to persist for a doc that is missing one (backfill). */
export function inferProvider(f: ProviderFileDoc): FileProvider {
	return isUploadThing(f) ? 'uploadthing' : 'firebase'
}
