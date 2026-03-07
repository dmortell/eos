/** LRU tile cache using object URLs with configurable memory limit */

export interface TileEntry {
	key: string
	objectUrl: string
	byteSize: number
	width: number
	height: number
	lastAccess: number
}

export class TileCache {
	private entries = new Map<string, TileEntry>()
	private totalBytes = 0
	private maxBytes: number

	constructor(maxBytes = 256 * 1024 * 1024) {
		this.maxBytes = maxBytes
	}

	get(key: string): TileEntry | undefined {
		const e = this.entries.get(key)
		if (e) e.lastAccess = Date.now()
		return e
	}

	set(key: string, entry: Omit<TileEntry, 'key' | 'lastAccess'>): void {
		// If entry already exists, remove old one first
		const existing = this.entries.get(key)
		if (existing) {
			URL.revokeObjectURL(existing.objectUrl)
			this.totalBytes -= existing.byteSize
		}

		this.evictIfNeeded(entry.byteSize)

		const full: TileEntry = {
			...entry,
			key,
			lastAccess: Date.now()
		}
		this.entries.set(key, full)
		this.totalBytes += entry.byteSize
	}

	has(key: string): boolean {
		return this.entries.has(key)
	}

	private evictIfNeeded(incomingBytes: number): void {
		while (this.totalBytes + incomingBytes > this.maxBytes && this.entries.size > 0) {
			let oldestKey: string | null = null
			let oldestTime = Infinity
			for (const [k, v] of this.entries) {
				if (v.lastAccess < oldestTime) {
					oldestTime = v.lastAccess
					oldestKey = k
				}
			}
			if (!oldestKey) break
			const e = this.entries.get(oldestKey)!
			URL.revokeObjectURL(e.objectUrl)
			this.totalBytes -= e.byteSize
			this.entries.delete(oldestKey)
		}
	}

	/** Evict entries matching a prefix (e.g. evict all tiles for a specific PDF) */
	evictByPrefix(prefix: string): void {
		for (const [key, entry] of this.entries) {
			if (key.startsWith(prefix)) {
				URL.revokeObjectURL(entry.objectUrl)
				this.totalBytes -= entry.byteSize
				this.entries.delete(key)
			}
		}
	}

	clear(): void {
		for (const e of this.entries.values()) URL.revokeObjectURL(e.objectUrl)
		this.entries.clear()
		this.totalBytes = 0
	}

	get size(): number { return this.entries.size }
	get bytes(): number { return this.totalBytes }
}
