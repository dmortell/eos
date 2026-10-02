// Shared state for the legacy import: the raw docs, the legacy-key → new-id map, lookups, and the issues list.
import type { Entity } from '../../domain/drawing'
import type { Id } from '../../domain/types'
import type { Issue } from '../../domain/validate'
import { newId as nanoid } from '../../domain/ids'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
export interface LegacySource {
	pid: string
	project: any
	/** Keyed by doc id. */
	frames: Record<string, any>
	racks: Record<string, any>
	patching: Record<string, any>
	outlets: Record<string, any>
}

export class ImportCtx {
	readonly entities: Entity[] = []
	readonly issues: Issue[] = []
	readonly ids: Record<string, Id> = {}
	constructor(readonly src: LegacySource, private makeId: () => string = nanoid) {}

	/** The new id for a legacy key — the same key always gets the same id within one import. */
	id(key: string): Id { return (this.ids[key] ??= this.makeId()) }
	known(key: string): Id | undefined { return this.ids[key] }
	add(e: Entity): void { this.entities.push(e) }
	get<T extends Entity>(id: Id): T | undefined { return this.entities.find((e) => e.id === id) as T | undefined }
	issue(id: Id, code: string, message: string, severity: Issue['severity'] = 'warning'): void { this.issues.push({ id, code, message, severity }) }

	levelId(floor: number): Id { return this.id(`level:${floor}`) }

	/** A server room space on a floor, by its letter. Created on first use. */
	serverRoom(floor: number, letter: string): Id {
		const key = `sr:${floor}:${letter}`
		if (!this.known(key)) {
			const names = (this.src.project?.floors ?? []).find((f: any) => f.number === floor)?.roomNames ?? {}
			this.add({ type: 'space', id: this.id(key), levelId: this.levelId(floor), kind: 'server room', name: names[letter] ?? `Server room ${letter}`, code: letter, order: 100 + letter.charCodeAt(0) })
		}
		return this.id(key)
	}

	/** A zone (Frames zone letter) or room (room number) space, created on first use. */
	space(floor: number, kind: 'zone' | 'room', code: string): Id {
		const key = `${kind}:${floor}:${code}`
		if (!this.known(key)) this.add({ type: 'space', id: this.id(key), levelId: this.levelId(floor), kind, name: kind === 'zone' ? `Zone ${code}` : code, code, order: kind === 'zone' ? code.charCodeAt(0) : 200 })
		return this.id(key)
	}
}

/** `{pid}_F33`, `{pid}_F33_RA`, `{pid}_F33__area1` → floor / room / area. */
export function floorOfDocId(pid: string, id: string): { floor: number; room?: string; area?: string } | undefined {
	const esc = pid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const m = new RegExp(`^${esc}_F(-?\\d+)(?:_R([A-Z]))?(?:__(.+))?$`).exec(id)
	return m ? { floor: Number(m[1]), ...(m[2] ? { room: m[2] } : {}), ...(m[3] ? { area: m[3] } : {}) } : undefined
}
