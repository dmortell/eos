import type { Timestamp } from 'firebase/firestore'

export interface Survey {
	id: string
	name: string
	description?: string
	date: string
	ownerId: string
	ownerName?: string
	projectId?: string
	projectName?: string
	shareToken?: string
	isPublic: boolean
	photoCount: number
	coverPhoto?: string
	createdAt: Timestamp | Date
	updatedAt: Timestamp | Date
}

export interface SurveyPhoto {
	id: string
	title: string
	description?: string
	imageUrl: string
	latitude?: number
	longitude?: number
	floorplanId?: string
	pinX?: number
	pinY?: number
	direction?: number
	barcode?: string
	capturedAt: Timestamp | Date
	createdAt: Timestamp | Date
	sortOrder: number
}

export type ViewState = 'home' | 'detail' | 'camera' | 'editor' | 'photo'

export interface SurveyFloorplan {
	id: string
	name: string
	url: string
	key?: string
	size: number
	pageCount?: number
	uploadedAt: Timestamp | Date
}
