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

	// Fetch photos
	const photosSnap = await db
		.collection(`surveys/${doc.id}/photos`)
		.orderBy('sortOrder', 'asc')
		.get()
	const photos = photosSnap.docs.map(d => {
		const data = d.data()
		return {
			id: d.id,
			title: (data.title ?? '') as string,
			description: (data.description ?? '') as string,
			imageUrl: (data.imageUrl ?? '') as string,
			barcode: (data.barcode ?? '') as string,
			latitude: data.latitude as number | undefined,
			longitude: data.longitude as number | undefined,
			sortOrder: (data.sortOrder ?? 0) as number,
			capturedAt: data.capturedAt?.toDate?.()?.toISOString?.() ?? data.capturedAt ?? '',
			createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? '',
		}
	})

	return {
		survey: {
			id: doc.id,
			name: (surveyData.name ?? '') as string,
			date: (surveyData.date ?? '') as string,
			description: (surveyData.description ?? '') as string,
			ownerName: (surveyData.ownerName ?? '') as string,
			projectName: (surveyData.projectName ?? '') as string,
			isPublic: surveyData.isPublic as boolean,
			photoCount: (surveyData.photoCount ?? 0) as number,
			createdAt: surveyData.createdAt?.toDate?.()?.toISOString?.() ?? surveyData.createdAt ?? '',
			updatedAt: surveyData.updatedAt?.toDate?.()?.toISOString?.() ?? surveyData.updatedAt ?? '',
		},
		photos,
	}
}
