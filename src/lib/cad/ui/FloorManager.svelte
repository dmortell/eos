<!-- The Floor manager (Dave, 2026-10-03): the building's floors as a lowest–top range with the floors that don't exist
     ticked off (no GF …), floor names from a pattern, and each floor's heights (slab, raised floor, clear height,
     plenum) with "apply to all" and an import from the old Risers tool. Every change re-stacks the FFL elevations.
     One edit = one undo step. Levels with something on them are never removed from here. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Building, Level, Id } from '../domain/types'
	import type { Entity } from '../domain/drawing'
	import { floorName, floorNumbers, restack, planFloors, renameFloors, DEFAULT_HEIGHTS, DEFAULT_NAMES, type Heights } from '../domain/floors'
	import { levelContents } from '../editor/commands'
	import { loadRiserHeights } from '../persist/import/legacyHeights'
	import { newId } from '../domain/ids'
	import { untrack } from 'svelte'
	import { watchProjectPdfs, type PdfFile } from '../app/projectFiles'

	let { project, ws, onclose }: { project: CadProject; ws: Workspace; onclose: () => void } = $props()

	const building = $derived(project.store.ofType('building')[0] as Building | undefined)
	const levels = $derived.by(() => { void project.rev; return project.store.ofType('level') })
	const main = $derived(levels.filter((l) => !l.area).sort((a, b) => b.number - a.number))   // top floor first

	// the form starts (once) from what the building remembers, else from the levels there are
	const init = untrack(() => {
		const nums = main.map((l) => l.number), f = building?.floors
		const lo = f?.lowest ?? (nums.length ? Math.min(...nums) : 1), hi = f?.top ?? (nums.length ? Math.max(...nums) : 1)
		// no level ≠ no floor: a floor is only "not there" when it's ticked off here
		return { lo, hi, skip: f?.skip ?? [], above: f?.above ?? DEFAULT_NAMES.above, below: f?.below ?? DEFAULT_NAMES.below, ground: f?.ground ?? DEFAULT_NAMES.ground!, heights: main[0]?.heights ?? DEFAULT_HEIGHTS }
	})
	let lowest = $state(init.lo)
	let top = $state(init.hi)
	let skip = $state<number[]>(init.skip)
	let above = $state(init.above)
	let below = $state(init.below)
	let ground = $state(init.ground)
	let typical = $state<Heights>({ ...init.heights })
	let busy = $state(false)

	// ── each level's floorplan: a calibrated page of a project PDF (Uploads); picking another replaces it ──
	let pdfs = $state<PdfFile[]>([])
	$effect(() => watchProjectPdfs(project.db, project.pid, (f) => { pdfs = f }))
	const underlayOf = (l: Level) => project.store.ofType('underlay').find((u) => u.levelId === l.id)
	function setFloorplan(l: Level, value: string) {
		const u = underlayOf(l)
		if (!value) { if (u) project.store.transact(`${l.name}: no floorplan`, (tx) => tx.del(u.id)); return }
		const [fileId, page] = value.split('#'), name = pdfs.find((f) => f.id === fileId)?.name ?? fileId
		const next = { ...(u ?? { type: 'underlay' as const, id: newId(), levelId: l.id }), fileId, page: Number(page) }
		project.store.transact(`${l.name}: floorplan ${name} p.${page}`, (tx) => tx.put(next))
	}

	const range = $derived(floorNumbers(lowest, top).reverse())
	const names = $derived({ above, below, ground })
	const toggle = (n: number) => { skip = skip.includes(n) ? skip.filter((x) => x !== n) : [...skip, n] }

	/** What's on a level: its contents, sections, and sheet viewports that show it. */
	function contents(id: Id): number {
		return levelContents(project.store.all(), id).length
			+ project.store.ofType('section').filter((s) => s.levelId === id).length
			+ project.store.ofType('sheet').flatMap((s) => s.viewports).filter((v) => v.view.levelId === id).length
	}

	/** Write `changed` levels (and anything else in `extra`), re-stacking the elevations over the final set. */
	type Tx = { put: (e: Entity) => void; del: (id: Id) => void }
	const NOOP = (_tx: Tx) => {}
	function commit(label: string, changed: Level[], extra: (tx: Tx) => void = NOOP, gone: Id[] = [], stackSkip = building?.floors?.skip ?? []): boolean {
		const next = new Map(levels.filter((l) => !gone.includes(l.id)).map((l) => [l.id, l]))
		for (const l of changed) next.set(l.id, l)
		for (const l of restack([...next.values()], stackSkip)) next.set(l.id, l)
		// only levels that really change are written (an import with the same heights is no edit at all)
		const before = new Map(levels.map((l) => [l.id, JSON.stringify(l)]))
		const puts = [...next.values()].filter((l) => before.get(l.id) !== JSON.stringify(l))
		if (!puts.length && !gone.length && extra === NOOP) return false
		project.store.transact(label, (tx) => {
			extra(tx)
			for (const id of gone) tx.del(id)
			for (const l of puts) tx.put(l)
		})
		return true
	}

	function applyRange() {
		const b: Building = building ?? { type: 'building', id: newId(), name: project.name || 'Building', order: 0 }
		const r = planFloors(levels, { lowest, top, skip, names, buildingId: b.id }, contents, newId)
		commit(`Floors ${floorName(Math.min(lowest, top), names)}–${floorName(Math.max(lowest, top), names)}`, r.add,
			(tx) => tx.put({ ...b, floors: { lowest, top, skip: skip.length ? [...skip] : undefined, above, below, ground } } as Building), r.remove.map((l) => l.id), skip)
		const parts = [r.add.length && `${r.add.length} added`, r.remove.length && `${r.remove.length} removed`].filter(Boolean)
		ws.say(`${parts.join(', ') || 'No floors changed'}${r.keep.length ? ` · kept ${r.keep.map((l) => l.name).join(', ')} (they have content — delete them in the Levels list first)` : ''}`)
	}

	function renameAll() {
		const r = renameFloors(levels, names)
		if (!r.length) { ws.say('The names already match the pattern'); return }
		project.store.transact(`Rename ${r.length} floors`, (tx) => { for (const l of r) tx.put(l) })
	}

	/** Heights belong to the floor: its area levels (separate plans of it) get the same. */
	const withAreas = (l: Level, h: Heights) => levels.filter((x) => x.number === l.number).map((x) => ({ ...x, heights: { ...h } }))
	function setHeight(l: Level, key: keyof Heights, v: string) {
		const n = Number(v)
		if (!Number.isFinite(n) || n < 0) return
		commit(`${l.name} ${key.replace('Mm', '')} ${n}`, withAreas(l, { ...l.heights, [key]: n }))
	}
	function applyTypical() {
		if (!commit('Heights for every floor', levels.map((l) => ({ ...l, heights: { ...typical } })))) ws.say('Every floor already has these heights')
	}
	async function fromRisers() {
		busy = true
		try {
			const r = await loadRiserHeights(project.db, project.pid)
			const changed = main.flatMap((l) => { const h = r.byFloor.get(l.number) ?? r.fallback; return h ? withAreas(l, h) : [] })
			if (!r.docs) { ws.say('The old Risers tool has no data for this project'); return }
			const did = commit(`Heights from the Risers tool (${r.byFloor.size} floors)`, changed)
			ws.say(`Risers tool: ${r.docs} doc(s), ${r.byFloor.size} floor(s) with their own heights${r.fallback ? ', a default for the rest' : ''} — ${did ? 'heights updated' : 'already the same here'}`)
		} catch (e) { project.error = `Risers heights: ${(e as Error).message}` }
		finally { busy = false }
	}
	const HKEYS: [keyof Heights, string][] = [['slabMm', 'Slab'], ['raisedFloorMm', 'Raised floor'], ['clearHeightMm', 'Clear height'], ['plenumMm', 'Plenum']]
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
	<div class="dlg" role="dialog" aria-label="Floors" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Floors</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>

		<section>
			<p class="h">The building's floors</p>
			<div class="row">
				<label>Lowest <input type="number" bind:value={lowest} /></label>
				<label>Top <input type="number" bind:value={top} /></label>
				<label>Name <input class="pat" bind:value={above} title={'{n} = number, {nn} = two digits'} /></label>
				<label>Basements <input class="pat" bind:value={below} title={'{n} = number without the minus'} /></label>
				<label>Ground <input class="pat" bind:value={ground} title="The name of floor 0, when the building has one" /></label>
			</div>
			<p class="hint">Untick the floors that don't exist (e.g. GF). Blue = the floor has a level.</p>
			<div class="chips">
				{#each range as n (n)}
					<button class="chip" class:off={skip.includes(n)} class:has={main.some((l) => l.number === n)} title={skip.includes(n) ? 'Not a floor of this building' : 'A floor of this building'} onclick={() => toggle(n)}>{floorName(n, names)}</button>
				{/each}
			</div>
			<div class="row">
				<button class="btn pri" onclick={applyRange}>Apply floors</button>
				<button class="btn" title="Rename every level from the pattern (area plans keep their suffix)" onclick={renameAll}>Rename all from the pattern</button>
			</div>
		</section>

		<section>
			<p class="h">Heights (mm) <span class="hint">· FFL is stacked from them, floor 1 stays where it is</span></p>
			<table>
				<thead><tr><th>Floor</th>{#each HKEYS as [, t] (t)}<th>{t}</th>{/each}<th>FFL</th><th title="The floorplan under this level's plan: a page of a project PDF, calibrated in Uploads (its crop is applied)">Floorplan</th></tr></thead>
				<tbody>
					<tr class="typ">
						<td>Typical</td>
						{#each HKEYS as [k] (k)}<td><input type="number" bind:value={typical[k]} /></td>{/each}
						<td><button class="btn" onclick={applyTypical}>Apply to all</button></td>
						<td></td>
					</tr>
					{#each main as l (l.id)}
						{@const u = underlayOf(l)}
						<tr>
							<td><input class="name" value={l.name} onchange={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== l.name) project.store.transact(`Rename ${l.name} → ${t}`, (tx) => tx.put({ ...l, name: t })) }} /></td>
							{#each HKEYS as [k] (k)}<td><input type="number" min="0" value={l.heights[k]} onchange={(e) => setHeight(l, k, e.currentTarget.value)} /></td>{/each}
							<td class="ffl">{(l.elevationMm / 1000).toFixed(3)}</td>
							<td>
								<select class="fp" value={u ? `${u.fileId}#${u.page ?? 1}` : ''} onchange={(e) => setFloorplan(l, e.currentTarget.value)}>
									<option value="">—</option>
									{#if u && !pdfs.some((f) => f.id === u.fileId)}<option value="{u.fileId}#{u.page ?? 1}">{u.fileId} p.{u.page ?? 1}</option>{/if}
									{#each pdfs as f (f.id)}
										{#each Array.from({ length: f.pageCount }, (_, i) => i + 1) as n (n)}
											<option value="{f.id}#{n}" disabled={!f.calibrated[n]}>{f.name}{f.pageCount > 1 ? ` p.${n}` : ''}{f.calibrated[n] ? '' : ' (calibrate in Uploads)'}</option>
										{/each}
									{/each}
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<button class="btn" disabled={busy} title="Read the floor heights the old Risers tool kept for this project" onclick={fromRisers}>Heights from the old Risers tool</button>
		</section>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 6vh; }
	.dlg { width: min(46rem, 94vw); max-height: 86vh; overflow: auto; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	.h { font-weight: 600; }
	.hint { color: var(--cad-muted, #71717a); font-weight: 400; }
	.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	input { width: 4.5rem; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	input.pat { width: 5.5rem; font-family: ui-monospace, monospace; }
	input.name { width: 7rem; }
	select.fp { max-width: 14rem; font-size: 11px; }
	.chips { display: flex; flex-wrap: wrap; gap: 3px; }
	.chip { font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--cad-line, #d4d4d8); background: var(--cad-input, white); }
	.chip.has { border-color: #2563eb; color: #1d4ed8; }
	.chip.off { text-decoration: line-through; opacity: 0.45; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 8px; background: var(--cad-input, white); }
	.btn.pri { background: #2563eb; border-color: #2563eb; color: white; }
	table { border-collapse: collapse; }
	th { text-align: left; font-weight: 500; color: var(--cad-muted, #71717a); padding: 2px 4px; }
	td { padding: 1px 4px; }
	tr.typ td { padding-bottom: 6px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.ffl { font-family: ui-monospace, monospace; color: var(--cad-muted, #52525b); text-align: right; }
</style>
