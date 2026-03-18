import { error } from '@sveltejs/kit'
import { getAdminFirestore } from '$lib/server/firebase-admin'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
	const { token } = params
	if (!token) return error(404, 'Not found')

	const db = getAdminFirestore()

	const snap = await db.collection('surveys').where('shareToken', '==', token).limit(1).get()
	if (snap.empty) return error(404, 'Album not found')

	const doc = snap.docs[0]
	const surveyData = doc.data()
	if (!surveyData.isPublic) return error(404, 'Album not found')

	const survey = { id: doc.id, ...surveyData }

	// Fetch photos
	const photosSnap = await db
		.collection(`surveys/${doc.id}/photos`)
		.orderBy('sortOrder', 'asc')
		.get()
	const photos = photosSnap.docs.map(d => {
		const data = d.data()
		return {
			id: d.id,
			...data,
			// Convert Firestore Timestamps to ISO strings for serialization
			capturedAt: data.capturedAt?.toDate?.()?.toISOString?.() ?? data.capturedAt,
			createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
		}
	})

	return {
		survey: {
			...survey,
			createdAt: surveyData.createdAt?.toDate?.()?.toISOString?.() ?? surveyData.createdAt,
			updatedAt: surveyData.updatedAt?.toDate?.()?.toISOString?.() ?? surveyData.updatedAt,
		},
		photos,
	}
}
