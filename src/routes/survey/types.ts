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
	annotations?: AnnotationData[]
	capturedAt: Timestamp | Date
	createdAt: Timestamp | Date
	sortOrder: number
}

export interface AnnotationData {
	type: 'path' | 'arrow' | 'rect' | 'text'
	points?: number[][]
	bounds?: { x: number; y: number; w: number; h: number }
	text?: string
	color: string
	strokeWidth: number
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
