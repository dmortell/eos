<!-- The Floor manager (Dave, 2026-10-03): the building's floors as a lowest–top range with the floors that don't exist
     ticked off (no GF …), floor names from a pattern, and each floor's heights (slab, raised floor, clear height,
     plenum) with "apply to all" and an import from the old Risers tool. Every change re-stacks the FFL elevations.
     One edit = one undo step. Levels with something on them are never removed from here. -->
<script lang="ts">
	import { backdropClose } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Building, Level, Id, Underlay } from '../domain/types'
	import type { Entity } from '../domain/drawing'
	import { floorName, floorNumbers, restack, planFloors, renameFloors, newAreaLevel, renumberFloor, DEFAULT_HEIGHTS, DEFAULT_NAMES, type Heights } from '../domain/floors'
	import NameInput from './NameInput.svelte'
	import { levelContents } from '../editor/commands'
	import { loadRiserHeights } from '../persist/import/legacyHeights'
	import { newId } from '../domain/ids'
	import { untrack } from 'svelte'
	import { watchProjectPdfs, type PdfFile } from '../app/projectFiles'
	import type { CalibMode } from '../editor/calibrateTool'

	/** `oncalibrate`: set a floorplan's origin / scale / crop on the plan (the Calibrate tool; backlog "Calibrate an image in place"). */
	let { project, ws, onclose, oncalibrate }: { project: CadProject; ws: Workspace; onclose: () => void; oncalibrate?: (u: Underlay, mode: CalibMode) => void } = $props()

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
	// a level can have several floorplans, one per zone (Dave: 33F = 3303 + 3307), each moved by its own X / Y offset
	const underlaysOf = (l: Level) => { void project.rev; return project.store.ofType('underlay').filter((u) => u.levelId === l.id) }
	const fileName = (id: string) => pdfs.find((f) => f.id === id)?.name ?? id
	/** `u` = the zone to change, or none to add one. */
	function setFloorplan(l: Level, value: string, u?: Underlay) {
		if (!value) return
		const [fileId, page] = value.split('#'), n = underlaysOf(l).length
		const next: Underlay = { ...(u ?? { type: 'underlay', id: newId(), levelId: l.id, ...(n ? { name: `Zone ${n + 1}` } : {}) }), fileId, page: Number(page) }
		project.store.transact(`${l.name}: floorplan ${fileName(fileId)} p.${page}`, (tx) => tx.put(next))
	}
	const putZone = (l: Level, u: Underlay, label: string, patch: Partial<Underlay>) => project.store.transact(`${l.name}: ${label}`, (tx) => tx.put({ ...u, ...patch }))
	function setOffset(l: Level, u: Underlay, k: 'x' | 'y', v: string) {
		const o = { x: 0, y: 0, ...u.origin, [k]: Number(v) || 0 }
		putZone(l, u, 'floorplan offset', { origin: o.x || o.y ? o : undefined })
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

	// ── a floor's number, and its AREA plans (a tenant office on its own floorplan — Journey's 33F 3303 / 3307) ──
	const areasOf = (l: Level) => levels.filter((x) => x.area && x.number === l.number).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
	/** Another number for a floor (its area plans follow); the building's range widens to take it. */
	function renumber(l: Level, v: string) {
		const n = Number(v), r = renumberFloor(levels, l.id, n)
		if ('problem' in r) { ws.say(r.problem); return }
		if (!r.put.length) return
		lowest = Math.min(lowest, top, n); top = Math.max(lowest, top, n); skip = skip.filter((x) => x !== n)
		const b = building
		commit(`${l.name}: floor ${l.number} → ${n}`, r.put, b ? (tx) => tx.put({ ...b, floors: { ...b.floors, lowest, top, skip: skip.length ? [...skip] : undefined, above, below, ground } } as Building) : NOOP, [], skip)
	}
	const rename = (l: Level, v: string) => { const t = v.trim(); if (t && t !== l.name) project.store.transact(`Rename ${l.name} → ${t}`, (tx) => tx.put({ ...l, name: t })) }
	let addingArea = $state<Id | null>(null)
	function addArea(l: Level, area: string) {
		addingArea = null
		if (areasOf(l).some((a) => a.area === area)) { ws.say(`${l.name} already has an area plan ${area}`); return }
		const a = newAreaLevel(l, area, newId())
		project.store.transact(`${l.name}: area plan ${area}`, (tx) => tx.put(a))
		ws.say(`${a.name} added — its own plan (Navigator); give it a floorplan here`)
	}
	/** An empty area plan goes; one with something on it is deleted from the Navigator (it asks first). */
	function removeArea(a: Level) {
		const n = contents(a.id)
		if (n) { ws.say(`${a.name} has ${n} item${n === 1 ? '' : 's'} — delete it in the Navigator (⋮ › Delete level…), which asks first`); return }
		project.store.transact(`Delete area plan ${a.name}`, (tx) => { for (const u of underlaysOf(a)) tx.del(u.id); tx.del(a.id) })
		if (ws.levelId === a.id) ws.levelId = main[0]?.id ?? null
	}
</script>

{#snippet pages()}
	{#each pdfs as f (f.id)}
		{#each Array.from({ length: f.pageCount }, (_, i) => i + 1) as n (n)}
			<option value="{f.id}#{n}" disabled={!f.calibrated[n]}>{f.name}{f.pageCount > 1 ? ` p.${n}` : ""}{f.calibrated[n] ? "" : " (calibrate in Uploads)"}</option>
		{/each}
	{/each}
{/snippet}

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
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
				<thead><tr><th>Floor</th><th title="The floor's number (labels' F, the order of the floors); its area plans follow">No.</th>{#each HKEYS as [, t] (t)}<th>{t}</th>{/each}<th>FFL</th><th title="The floorplan under this level's plan: a page of a project PDF, calibrated in Uploads (its crop is applied)">Floorplan <span class="hint">· X / Y offset (mm) per zone</span></th></tr></thead>
				<tbody>
					<tr class="typ">
						<td>Typical</td><td></td>
						{#each HKEYS as [k] (k)}<td><input type="number" bind:value={typical[k]} /></td>{/each}
						<td><button class="btn" onclick={applyTypical}>Apply to all</button></td>
						<td></td>
					</tr>
					{#each main as l (l.id)}
						<tr>
							<td class="nm"><input class="name" value={l.name} onchange={(e) => rename(l, e.currentTarget.value)} />
								<button class="add" title="A separate plan of part of this floor — a tenant office on its own floorplan (e.g. 3303)" onclick={() => (addingArea = l.id)}>+ Area</button></td>
							<td><input class="no" type="number" step="1" value={l.number} title="The floor's number — its area plans follow; a number another floor has is refused" onchange={(e) => { renumber(l, e.currentTarget.value); e.currentTarget.value = String(l.number) }} /></td>
							{#each HKEYS as [k] (k)}<td><input type="number" min="0" value={l.heights[k]} onchange={(e) => setHeight(l, k, e.currentTarget.value)} /></td>{/each}
							<td class="ffl">{(l.elevationMm / 1000).toFixed(3)}</td>
							<td>{@render floorplans(l)}</td>
						</tr>
						<!-- its area plans: same number, heights and FFL; their own name and floorplans -->
						{#each areasOf(l) as a (a.id)}
							<tr class="area">
								<td class="nm">↳ <input class="name" value={a.name} title="Area plan {a.area}" onchange={(e) => rename(a, e.currentTarget.value)} />
									<button class="x" title={contents(a.id) ? `Has ${contents(a.id)} item(s) — delete it in the Navigator (asks first)` : 'Delete this (empty) area plan'} onclick={() => removeArea(a)}>✕</button></td>
								<td class="hint">{a.area}</td>
								<td colspan={HKEYS.length} class="hint">heights as {l.name}</td>
								<td class="ffl">{(a.elevationMm / 1000).toFixed(3)}</td>
								<td>{@render floorplans(a)}</td>
							</tr>
						{/each}
						{#if addingArea === l.id}
							<tr class="area"><td colspan={HKEYS.length + 4}>↳ <NameInput create placeholder="Area name or number (e.g. 3303) — Enter adds it" wide={false} onsave={(t) => addArea(l, t)} oncancel={() => (addingArea = null)} /></td></tr>
						{/if}
					{/each}
				</tbody>
			</table>
			<button class="btn" disabled={busy} title="Read the floor heights the old Risers tool kept for this project" onclick={fromRisers}>Heights from the old Risers tool</button>
		</section>
	</div>
</div>

{#snippet floorplans(l: Level)}
	{@const zones = underlaysOf(l)}
		{#each zones as z (z.id)}
			<div class="zone">
				{#if zones.length > 1}<input class="zn" value={z.name ?? ''} placeholder="zone" title="Zone name" onchange={(e) => putZone(l, z, 'zone name', { name: e.currentTarget.value.trim() || undefined })} />{/if}
				<select class="fp" value="{z.fileId}#{z.page ?? 1}" onchange={(e) => setFloorplan(l, e.currentTarget.value, z)}>
					{#if !pdfs.some((f) => f.id === z.fileId)}<option value="{z.fileId}#{z.page ?? 1}">{z.fileId} p.{z.page ?? 1}</option>{/if}
					{@render pages()}
				</select>
				<input class="off" type="number" step="100" value={z.origin?.x ?? 0} title="Move this floorplan right (mm)" onchange={(e) => setOffset(l, z, 'x', e.currentTarget.value)} />
				<input class="off" type="number" step="100" value={z.origin?.y ?? 0} title="Move this floorplan down (mm)" onchange={(e) => setOffset(l, z, 'y', e.currentTarget.value)} />
				{#if oncalibrate}
					{@const cal = project.pdf.calib[`${z.fileId}#${z.page ?? 1}`]}
					<!-- calibrate on the plan (not in Uploads): what it writes is the file's, shared with Uploads and other projects -->
					<span class="cal" class:todo={cal?.provisional} title={cal?.provisional ? 'Not calibrated yet — shown as if 1:100' : 'Calibrate this floorplan on the plan (saved in its file, as Uploads does)'}>
						<button onclick={() => oncalibrate(z, 'origin')} title="Click the point that is 0, 0">Origin</button>
						<button onclick={() => oncalibrate(z, 'scale')} title="Click both ends of a distance you know, then type it">Scale</button>
						<button onclick={() => oncalibrate(z, 'crop')} title="Click two corners: only that part shows">Crop</button>
					</span>
				{/if}
				<button class="x" title="Remove this floorplan" onclick={() => project.store.transact(`${l.name}: no floorplan ${fileName(z.fileId)}`, (tx) => tx.del(z.id))}>✕</button>
			</div>
		{/each}
		<!-- picking a page here adds it: the first floorplan, or another zone -->
		<select class="fp add" value="" onchange={(e) => { setFloorplan(l, e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">{zones.length ? '+ Add zone…' : '—'}</option>
			{@render pages()}
		</select>
{/snippet}

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 6vh; }
	.dlg { width: min(66rem, 96vw); max-height: 86vh; overflow: auto; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	.h { font-weight: 600; }
	.hint { color: var(--cad-muted, #71717a); font-weight: 400; }
	.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	input { width: 4.5rem; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	input.pat { width: 5.5rem; font-family: ui-monospace, monospace; }
	input.name { width: 7rem; }
	input.no { width: 3.2rem; }
	td.nm { white-space: nowrap; }
	button.add { font-size: 10.5px; color: var(--cad-link, #2563eb); padding: 0 3px; }
	tr.area td { color: var(--cad-muted, #52525b); }
	tr.area input.name { width: 8.5rem; }
	select.fp { max-width: 14rem; font-size: 11px; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	select.fp.add { border-style: dashed; color: var(--cad-muted, #52525b); }
	.zone { display: flex; gap: 2px; align-items: center; margin-bottom: 2px; }
	input.zn { width: 5rem; font-size: 11px; }
	input.off { width: 4.5rem; font-size: 11px; }
	.cal { display: inline-flex; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; overflow: hidden; }
	.cal button { font-size: 10.5px; padding: 0 5px; color: #2563eb; }
	.cal button + button { border-left: 1px solid var(--cad-line, #e4e4e7); }
	.cal button:hover { background: var(--cad-sel, #dbeafe); }
	.cal.todo { border-color: #f59e0b; }
	button.x { color: var(--cad-muted, #71717a); padding: 0 4px; }
	button.x:hover { color: #b91c1c; }
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
