// Save a generated file in the browser.
export function download(data: BlobPart, filename: string, type: string): void {
	const url = URL.createObjectURL(new Blob([data], { type }))
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A safe file name from free text ("Test Project 1F" → "Test_Project_1F"). */
export const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'export'
