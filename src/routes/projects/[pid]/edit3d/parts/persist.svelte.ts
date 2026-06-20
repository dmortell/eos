import { nanoid } from 'nanoid'
import type { Firestore } from '$lib'
import type { Sheet } from './sheet.svelte'
import type { Model, View } from './types'
import { models as defaultModels } from './data'

// Bump when the seeded model schema changes; older docs get reseeded once.
const SCHEMA = 2

/**
 * Wire a Sheet to Firestore.
 *
 *   drawings/{pid}                  → { models }            (project-shared geometry)
 *   drawings/{pid}/sheets/{id}      → { name, views }       (one per named sheet)
 *
 * Returns a dispose function (call on component destroy). Saves are debounced and
 * de-duplicated by JSON so loading remote data doesn't echo straight back.
 */
export function connectFirestore(sheet: Sheet, db: Firestore, pid: string) {
	return $effect.root(() => {
		let modelsLoaded = false
		let loadedSheetId = '' // the sheet whose views are currently loaded (guards switch)
		let lastModels = '', lastViews = ''

		// ---- shared models: drawings/{pid} (listener reads; seeding is below) ----
		const unsubModels = db.subscribeOne('drawings', pid, (data: any) => {
			if (data?.models) {
				sheet.models = data.models as Model[]
				lastModels = JSON.stringify(data.models)
			}
			modelsLoaded = true
		})
		// Seed (or migrate) defaults if the doc has none or predates the current
		// schema. Reseeds from data.ts (server check, not cache).
		db.getOne('drawings', pid).then((doc: any) => {
			if (!doc?.models || (doc.schemaVersion ?? 0) < SCHEMA) {
				lastModels = JSON.stringify(defaultModels)
				db.save('drawings', { id: pid, models: defaultModels, schemaVersion: SCHEMA })
			}
		})

		// ---- sheet list: drawings/{pid}/sheets (listener reads; seeding is below) ----
		const unsubList = db.subscribeMany(`drawings/${pid}/sheets`, (docs: any[]) => {
			sheet.sheetList = docs
				.map((d) => ({ id: d.id as string, name: (d.name as string) ?? 'Sheet' }))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
			if (!sheet.currentSheetId && docs.length) sheet.currentSheetId = docs[0].id
		})
		// Create the first sheet only if none exist on the server (avoids cache-race dupes).
		db.getMany(`drawings/${pid}/sheets`).then((existing) => {
			if (existing.length === 0) {
				const id = nanoid(8)
				db.save(`drawings/${pid}/sheets`, { id, name: 'Sheet 1', views: $state.snapshot(sheet.views) })
				sheet.currentSheetId = id
			} else if (!sheet.currentSheetId) {
				sheet.currentSheetId = existing[0].id
			}
		})

		// ---- current sheet's views: drawings/{pid}/sheets/{id} ----
		let unsubSheet: (() => void) | null = null
		$effect(() => {
			const sid = sheet.currentSheetId
			unsubSheet?.()
			unsubSheet = null
			if (!sid) return
			unsubSheet = db.subscribeOne(`drawings/${pid}/sheets`, sid, (data: any) => {
				if (!data?.views) return
				sheet.views = data.views as View[]
				sheet.sheetName = (data.name as string) ?? 'Sheet'
				lastViews = JSON.stringify(data.views)
				loadedSheetId = sid
			})
		})

		// ---- debounced, de-duplicated saves ----
		let mt: ReturnType<typeof setTimeout> | null = null, vt: ReturnType<typeof setTimeout> | null = null

		$effect(() => {
			const snap = $state.snapshot(sheet.models)
			const json = JSON.stringify(snap)
			if (!modelsLoaded || json === lastModels) return
			lastModels = json
			if (mt) clearTimeout(mt)
			mt = setTimeout(() => db.save('drawings', { id: pid, models: snap }), 500)
		})

		$effect(() => {
			const sid = sheet.currentSheetId
			const name = sheet.sheetName
			const snap = $state.snapshot(sheet.views)
			const json = JSON.stringify({ name, views: snap })
			// Don't save until this sheet's views have loaded (avoids clobbering on switch).
			if (!sid || sid !== loadedSheetId || json === lastViews) return
			lastViews = json
			if (vt) clearTimeout(vt)
			vt = setTimeout(() => db.save(`drawings/${pid}/sheets`, { id: sid, name, views: snap }), 500)
		})

		return () => {
			unsubModels?.(); unsubList?.(); unsubSheet?.()
			if (mt) clearTimeout(mt)
			if (vt) clearTimeout(vt)
		}
	})
}

// Create a new (empty) sheet and switch to it.
export function createSheet(sheet: Sheet, db: Firestore, pid: string) {
	const id = nanoid(8)
	const name = `Sheet ${sheet.sheetList.length + 1}`
	db.save(`drawings/${pid}/sheets`, { id, name, views: [] as View[] })
	sheet.currentSheetId = id
}

// Delete the current sheet (keeps at least one) and switch to another.
export function deleteSheet(sheet: Sheet, db: Firestore, pid: string) {
	const id = sheet.currentSheetId
	if (!id || sheet.sheetList.length <= 1) return
	const next = sheet.sheetList.find((s) => s.id !== id)
	db.delete(`drawings/${pid}/sheets`, id)
	sheet.currentSheetId = next?.id ?? ''
}
