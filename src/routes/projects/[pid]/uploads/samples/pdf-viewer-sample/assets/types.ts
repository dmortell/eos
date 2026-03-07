/** Asset management types for cloud file storage integration */

export type ProviderType = 'dropbox' | 'box'

/** File entry from a cloud provider listing */
export interface FileEntry {
	id: string
	name: string
	mimeType: string
	size: number
	modifiedAt: string
	provider: ProviderType
	isFolder?: boolean
	path?: string
	thumbnailUrl?: string
	downloadUrl?: string
}

/** Resolved file access URLs (temporary links) */
export interface FileAccess {
	downloadUrl?: string
	previewUrl?: string
}

/** Per-page calibration data for PDFs and images */
export interface PageCalibration {
	origin: { x: number; y: number }
	scale: {
		x1: number; y1: number
		x2: number; y2: number
		offset: number
		distance: number
		units: string
		scale: number  // mm per pixel
	}
	pageWidth?: number   // pixel width of image/PDF page (in calibration coordinate space)
	pageHeight?: number  // pixel height of image/PDF page
}

/** Asset metadata stored in Firestore (drawings/{drawingId}/assets) */
export interface AssetMeta {
	id: string
	name: string
	provider: ProviderType
	mimeType: string
	size?: number
	url?: string
	path?: string          // provider file path for re-fetching temp links
	pages: Record<number, PageCalibration>
	addedAt: number
}

/** Drag transfer data when dragging an asset to the canvas */
export interface AssetDropData {
	type: 'asset-item'
	assetId: string
	name: string
	src: string            // URL or data URL for the image
	mimeType: string
	width?: number
	height?: number
	provider?: ProviderType   // cloud provider for URL refresh
	path?: string             // provider file path for refreshing expired temp links
	calibration?: PageCalibration  // saved calibration for real-world sizing on drop
}

/** Provider UI definition */
export interface ProviderInfo {
	id: ProviderType
	name: string
	icon: string
}

/** API response envelope */
export interface ApiResponse<T> {
	success: boolean
	data?: T
	error?: string
}

/** File list response from API */
export interface FileListResponse {
	files: FileEntry[]
	totalCount?: number
}
