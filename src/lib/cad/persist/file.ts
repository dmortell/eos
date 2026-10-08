// A project, or chosen models of it, as one portable JSON file — the BACKUP format (ADR 0008 §5): File › Download
// backup… writes it (gzipped, `.eoscad`), and a stored backup holds the same JSON in chunks. Reading a file validates
// it but never writes anywhere — the caller decides what to do with it.
import type { Entity } from '../domain/drawing'
import type { Block } from '../domain/blocks'
import type { Id } from '../domain/types'
import { validateProject, type Issue } from '../domain/validate'
import { inParts, type Parts } from '../domain/backupParts'
import { stripUndefined } from './docs'

export const FILE_FORMAT = 'eos-cad'
export const FILE_VERSION = 1

export interface ProjectFile {
	format: typeof FILE_FORMAT
	version: number
	exportedAt: string
	project?: { id?: string; name?: string }
	/** Who made it. */
	by?: { uid: string; name: string }
	/** What it holds: the whole project, or these models (level ids). Absent = the whole project. */
	parts?: Parts
	entities: Entity[]
	/** Copies of the global blocks its shapes and outlets draw (not built-ins), so a restore can bring back one
	 *  that has since gone from the library. Never overwrites the library's own copy. */
	library?: { blocks: Block[] }
}

export function exportProject(entities: Iterable<Entity>, project?: ProjectFile['project'], more: Pick<ProjectFile, 'by' | 'parts' | 'library'> = {}): ProjectFile {
	const list = [...entities].map((e) => stripUndefined(e)).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
	const parts = more.parts && more.parts !== 'all' ? { parts: more.parts } : {}
	return {
		format: FILE_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), ...(project ? { project } : {}),
		...(more.by ? { by: more.by } : {}), ...parts, entities: list, ...(more.library?.blocks.length ? { library: { blocks: more.library.blocks.map((b) => stripUndefined(b)) } } : {}),
	}
}

/** A backup of `parts` of a project: the entities they hold (domain/backupParts.ts) and the blocks those draw. */
export function makeBackup(entities: Iterable<Entity>, parts: Parts, o: { project?: ProjectFile['project']; by?: ProjectFile['by']; blockOf?: (id: Id) => Block | undefined } = {}): ProjectFile {
	const all = [...entities], { inside } = inParts(all, parts)
	const held = all.filter((e) => inside.has(e.id))
	return exportProject(held, o.project, { by: o.by, parts, library: { blocks: o.blockOf ? usedBlocks(held, o.blockOf) : [] } })
}

/** The non-built-in blocks the entities draw: inserts, outlets' own blocks, and inserts inside those blocks. */
export function usedBlocks(entities: Iterable<Entity>, blockOf: (id: Id) => Block | undefined): Block[] {
	const ids = new Set<Id>(), out: Block[] = []
	const add = (id: Id | undefined) => {
		const b = id && !ids.has(id) ? blockOf(id) : undefined
		if (!id || !b) return
		ids.add(id)
		if (!b.builtin) out.push(b)
		for (const s of b.shapes) if (s.geom.kind === 'insert') add(s.geom.blockId)
	}
	for (const e of entities) {
		if (e.type === 'shape' && e.geom.kind === 'insert') add(e.geom.blockId)
		else if (e.type === 'outlet') add(e.blockId)
	}
	return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function readProjectFile(text: string): { file?: ProjectFile; issues: Issue[]; error?: string } {
	let data: unknown
	try { data = JSON.parse(text) } catch (e) { return { issues: [], error: `Not JSON: ${(e as Error).message}` } }
	const f = data as Partial<ProjectFile>
	if (f?.format !== FILE_FORMAT) return { issues: [], error: 'Not an EOS cad project file' }
	if (typeof f.version !== 'number' || f.version > FILE_VERSION) return { issues: [], error: `File version ${f.version} is newer than this app understands (${FILE_VERSION})` }
	if (!Array.isArray(f.entities)) return { issues: [], error: 'The file has no entities' }
	if (f.parts !== undefined && f.parts !== 'all' && !(Array.isArray(f.parts) && f.parts.every((p) => typeof p === 'string'))) return { issues: [], error: 'The file\'s list of models is damaged' }
	const ids = new Set<string>()
	const dupes = f.entities.filter((e) => (ids.has(e.id) ? true : (ids.add(e.id), false)))
	// a link that crosses the edge of the models in a file has its far end outside it: not an error
	const { crossing } = inParts(f.entities, f.parts ?? 'all')
	const issues = validateProject(f.entities).filter((i) => !(crossing.has(i.id) && i.code.endsWith('-end')))
	for (const d of dupes) issues.push({ id: d.id, code: 'file-dup-id', message: `Id ${d.id} appears twice in the file`, severity: 'error' })
	return { file: f as ProjectFile, issues }
}
