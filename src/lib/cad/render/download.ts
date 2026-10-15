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
export const fileSafe = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '') || 'export'

/** What an export is, for the project's file-name pattern (Dave 2026-10-15: "Edit file names on export"): `revision` = its
 *  own revision where it has one (a sheet's, a revision PDF's, the BOM's typed one); `version` = the release number
 *  ("03") — a release's own, else the page fills in the project's latest. */
export interface FileParts { what: string; scope?: string; revision?: string; version?: string }

/** The tokens a pattern can use (Settings › Files › Export file names). */
export const FILE_TOKENS = ['{project}', '{what}', '{scope}', '{revision}', '{version}', '{date}'] as const

const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }

/** A file name from the pattern: "{project} {what} {scope} {date}" → "Test_Project_Patching_L1.20_20261015.xlsx". An
 *  empty token takes the separator before it with it. Null = no pattern, keep the export's own name. */
export function patternName(pattern: string | undefined, project: string, parts: FileParts, ext: string, date = today()): string | null {
	if (!pattern?.trim()) return null
	const v: Record<string, string> = { project, what: parts.what, scope: parts.scope ?? '', revision: parts.revision ?? '', version: parts.version ?? '', date }
	const base = pattern.replace(/([ _.-]*)\{(project|what|scope|revision|version|date)\}/g, (_, sep: string, k: string) => (v[k] ? sep + v[k] : ''))
	return `${fileSafe(base)}.${ext}`
}

/** How the app names a file before it is saved: the pattern, then the user's edit (null = cancelled). Set by the
 *  open cad page (CadShell); unset (tests, other pages) = the suggested name as it is. */
type Namer = (suggested: string, parts: FileParts | undefined, ext: string) => Promise<string | null>
let namer: Namer | null = null
export function setFileNamer(f: Namer | null): void { namer = f }

/** Save a file under a name the user can change first (and the project's pattern fills). Returns the name saved, or
 *  null when they cancelled. */
export async function saveFile(data: BlobPart, suggested: string, type: string, parts?: FileParts): Promise<string | null> {
	const ext = suggested.match(/\.([a-z0-9]+)$/i)?.[1] ?? ''
	const name = namer ? await namer(suggested, parts, ext) : suggested
	if (!name) return null
	download(data, ext && !name.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${name}.${ext}` : name, type)
	return name
}
