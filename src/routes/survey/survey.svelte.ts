import { Firestore, type DocWithId } from '$lib'
import { nanoid } from 'nanoid'
import type { Survey, SurveyPhoto, SurveyFloorplan } from './types'

const db = new Firestore()

export function subscribeSurveys(ownerId: string, callback: (surveys: Survey[]) => void) {
	return db.subscribeWhere('surveys', 'ownerId', ownerId, (docs) => {
		const surveys = (docs as unknown as Survey[]).sort((a, b) => {
			const da = a.createdAt && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime()
			const db2 = b.createdAt && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime()
			return db2 - da
		})
		callback(surveys)
	})
}

export function subscribePhotos(surveyId: string, callback: (photos: SurveyPhoto[]) => void) {
	return db.subscribeMany(`surveys/${surveyId}/photos`, (docs) => {
		const photos = (docs as unknown as SurveyPhoto[]).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		callback(photos)
	})
}

export async function createSurvey(ownerId: string, ownerName: string, name: string, date: string, projectId?: string, projectName?: string): Promise<string> {
	const id = nanoid(10)
	const survey: Survey = {
		id,
		name,
		date,
		ownerId,
		ownerName,
		isPublic: false,
		photoCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		...(projectId ? { projectId, projectName } : {}),
	}
	await db.save('surveys', survey as unknown as DocWithId)
	return id
}

export async function updateSurvey(survey: Partial<Survey> & { id: string }) {
	await db.save('surveys', { ...survey, updatedAt: new Date() } as unknown as DocWithId)
}

export async function deleteSurvey(surveyId: string) {
	// Delete photos subcollection first
	const photos = await db.getMany(`surveys/${surveyId}/photos`)
	if (photos.length) await db.deleteMany(`surveys/${surveyId}/photos`, photos)
	await db.delete('surveys', surveyId)
}

export async function savePhoto(surveyId: string, photo: Omit<SurveyPhoto, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
	const id = photo.id || nanoid(10)
	const doc = { ...photo, id, createdAt: new Date() }
	await db.save(`surveys/${surveyId}/photos`, doc as unknown as DocWithId)
	// Update survey photo count and cover
	const photos = await db.getMany(`surveys/${surveyId}/photos`)
	await db.save('surveys', {
		id: surveyId,
		photoCount: photos.length,
		coverPhoto: photo.imageUrl,
		updatedAt: new Date(),
	} as unknown as DocWithId)
	return id
}

export async function updatePhoto(surveyId: string, photo: Partial<SurveyPhoto> & { id: string }) {
	await db.save(`surveys/${surveyId}/photos`, photo as unknown as DocWithId)
}

export async function deletePhoto(surveyId: string, photoId: string) {
	await db.delete(`surveys/${surveyId}/photos`, photoId)
	const photos = await db.getMany(`surveys/${surveyId}/photos`)
	await db.save('surveys', {
		id: surveyId,
		photoCount: photos.length,
		coverPhoto: photos[0]?.imageUrl ?? '',
		updatedAt: new Date(),
	} as unknown as DocWithId)
}

export function getGeoLocation(): Promise<{ latitude: number; longitude: number } | null> {
	return new Promise((resolve) => {
		if (!navigator.geolocation) return resolve(null)
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
			() => resolve(null),
			{ enableHighAccuracy: true, timeout: 5000 }
		)
	})
}

// --- Floorplans ---

export function subscribeFloorplans(surveyId: string, callback: (plans: SurveyFloorplan[]) => void) {
	return db.subscribeMany(`surveys/${surveyId}/floorplans`, (docs) => {
		callback(docs as unknown as SurveyFloorplan[])
	})
}

export async function saveFloorplan(surveyId: string, plan: Omit<SurveyFloorplan, 'id'> & { id?: string }): Promise<string> {
	const id = plan.id || nanoid(10)
	const doc = { ...plan, id }
	await db.save(`surveys/${surveyId}/floorplans`, doc as unknown as DocWithId)
	return id
}

export async function deleteFloorplan(surveyId: string, planId: string) {
	await db.delete(`surveys/${surveyId}/floorplans`, planId)
}

// --- Projects ---

export function subscribeProjects(callback: (projects: Array<{ id: string; name: string }>) => void) {
	return db.subscribeMany('projects', (docs) => {
		const projects = (docs as Array<{ id: string; name: string }>).sort((a, b) =>
			(a.name ?? '').localeCompare(b.name ?? '')
		)
		callback(projects)
	})
}

export function subscribeProjectSurveys(projectId: string, callback: (surveys: Survey[]) => void) {
	return db.subscribeWhere('surveys', 'projectId', projectId, (docs) => {
		const surveys = (docs as unknown as Survey[]).sort((a, b) => {
			const da = a.createdAt && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime()
			const db2 = b.createdAt && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime()
			return db2 - da
		})
		callback(surveys)
	})
}
