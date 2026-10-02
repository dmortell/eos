// A whole project as one portable JSON file (Pages todo O14): backup, moving data between projects / environments,
// test fixtures. Reading a file validates it but never writes anywhere — the caller decides what to do with it.
import type { Entity } from '../domain/drawing'
import { validateProject, type Issue } from '../domain/validate'
import { stripUndefined } from './docs'

export const FILE_FORMAT = 'eos-cad'
export const FILE_VERSION = 1

export interface ProjectFile {
	format: typeof FILE_FORMAT
	version: number
	exportedAt: string
	project?: { id?: string; name?: string }
	entities: Entity[]
}

export function exportProject(entities: Iterable<Entity>, project?: ProjectFile['project']): ProjectFile {
	const list = [...entities].map((e) => stripUndefined(e)).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
	return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), ...(project ? { project } : {}), entities: list }
}

export function readProjectFile(text: string): { file?: ProjectFile; issues: Issue[]; error?: string } {
	let data: unknown
	try { data = JSON.parse(text) } catch (e) { return { issues: [], error: `Not JSON: ${(e as Error).message}` } }
	const f = data as Partial<ProjectFile>
	if (f?.format !== FILE_FORMAT) return { issues: [], error: 'Not an EOS cad project file' }
	if (typeof f.version !== 'number' || f.version > FILE_VERSION) return { issues: [], error: `File version ${f.version} is newer than this app understands (${FILE_VERSION})` }
	if (!Array.isArray(f.entities)) return { issues: [], error: 'The file has no entities' }
	const ids = new Set<string>()
	const dupes = f.entities.filter((e) => (ids.has(e.id) ? true : (ids.add(e.id), false)))
	const issues = validateProject(f.entities)
	for (const d of dupes) issues.push({ id: d.id, code: 'file-dup-id', message: `Id ${d.id} appears twice in the file`, severity: 'error' })
	return { file: f as ProjectFile, issues }
}
