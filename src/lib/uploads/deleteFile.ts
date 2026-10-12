import type { DocWithId, Firestore } from '$lib'
import { storage } from '$lib/db.svelte'
import { ref, deleteObject } from 'firebase/storage'
import { isUploadThing } from './provider'
import { fileProjectIds, membershipPayload } from '$lib/files'

/**
 * Delete a project's file. A file still shared with other projects is only unlinked from this one — the blob and
 * calibration must survive for the others. Otherwise the stored object goes first (routed by provider), then the doc.
 * Shared by the Uploads route and cad's embedded Uploads.
 */
export async function deleteProjectFile(db: Firestore, pid: string, file: DocWithId) {
	const members = fileProjectIds(file)
	if (members.length > 1) {
		await db.save('files', membershipPayload(file.id, members.filter(p => p !== pid)))
		return
	}
	if (isUploadThing(file)) {
		const utKey = (file.key ?? file.path) as string | undefined
		if (utKey) {
			try {
				const res = await fetch('/api/uploadthing/delete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ key: utKey })
				})
				if (!res.ok) {
					console.error('UploadThing delete failed:', await res.text())
					return
				}
			}
			catch (e) {
				console.error('UploadThing delete failed:', e)
				return
			}
		}
	} else if (file.path) {
		try {
			await deleteObject(ref(storage, file.path as string))
		} catch (e: any) {
			// A missing object (already gone) shouldn't block removing the record.
			if (e?.code !== 'storage/object-not-found') {
				console.error('Firebase Storage delete failed:', e)
				return
			}
		}
	}
	await db.delete('files', file.id)
}
