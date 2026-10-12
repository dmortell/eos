<!-- The Floor manager (Dave, 2026-10-03): the building's floors as a lowest–top range with the floors that don't exist
     ticked off (no GF …), floor names from a pattern, and each floor's heights (slab, raised floor, clear height,
     plenum) with "apply to all". Every change re-stacks the FFL elevations.
     One edit = one undo step. Levels with something on them are never removed from here. Two tabs: Floors & heights,
     and Plans & floorplans (each floor's plan and area plans, with the PDF pages under each). -->
<script lang="ts">
	import { backdropClose, dialogFocus } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Building, Level, Id, Underlay } from '../domain/types'
	import type { Entity } from '../domain/drawing'
	import { floorName, floorNumbers, restack, planFloors, renameFloors, newAreaLevel, renumberFloor, DEFAULT_HEIGHTS, DEFAULT_NAMES, type Heights } from '../domain/floors'
	import NameInput from './NameInput.svelte'
	import { levelContents } from '../editor/commands'
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

	// ── each level's floorplan: a calibrated page of a project PDF (Uploads); picking another replaces it ──
	let pdfs = $state<PdfFile[]>([])
	$effect(() => watchProjectPdfs(project.db, project.pid, (f) => { pdfs = f }))
	// a plan can have several floorplans (a floor drawn on two sheets), each moved into place by its own X / Y offset
	const underlaysOf = (l: Level) => { void project.rev; return project.store.ofType('underlay').filter((u) => u.levelId === l.id) }
	const fileName = (id: string) => pdfs.find((f) => f.id === id)?.name ?? id
	/** `u` = the floorplan to change, or none to add one. */
	function setFloorplan(l: Level, value: string, u?: Underlay) {
		if (!value) return
		const [fileId, page] = value.split('#'), n = underlaysOf(l).length
		const next: Underlay = { ...(u ?? { type: 'underlay', id: newId(), levelId: l.id, ...(n ? { name: `Floorplan ${n + 1}` } : {}) }), fileId, page: Number(page) }
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
		ws.say(`${a.name} added — its own plan (Navigator); pick its floorplan here`)
	}
	/** An empty area plan goes; one with something on it is deleted from the Navigator (it asks first). */
	function removeArea(a: Level) {
		const n = contents(a.id)
		if (n) { ws.say(`${a.name} has ${n} item${n === 1 ? '' : 's'} — delete it in the Navigator (⋮ › Delete level…), which asks first`); return }
		project.store.transact(`Delete area plan ${a.name}`, (tx) => { for (const u of underlaysOf(a)) tx.del(u.id); tx.del(a.id) })
		if (ws.levelId === a.id) ws.levelId = main[0]?.id ?? null
	}

	// two tabs (Dave, 2026-10-12: one wide table mixed area plans with extra floorplans, and scrolled sideways)
	let tab = $state<'floors' | 'plans'>('floors')
</script>

{#snippet pages()}
	{#each pdfs as f (f.id)}
		{#each Array.from({ length: f.pageCount }, (_, i) => i + 1) as n (n)}
			<option value="{f.id}#{n}" disabled={!f.calibrated[n]}>{f.name}{f.pageCount > 1 ? ` p.${n}` : ""}{f.calibrated[n] ? "" : " (calibrate in Uploads)"}</option>
		{/each}
	{/each}
{/snippet}

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" use:dialogFocus aria-label="Floors" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Floors</b>
			<div class="tabs" role="tablist">
				<button role="tab" aria-selected={tab === 'floors'} class:on={tab === 'floors'} onclick={() => (tab = 'floors')}>Floors & heights</button>
				<button role="tab" aria-selected={tab === 'plans'} class:on={tab === 'plans'} onclick={() => (tab = 'plans')}>Plans & floorplans</button>
			</div>
			<button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>

		{#if tab === 'floors'}
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
				<thead><tr><th>Floor</th><th title="The floor's number (labels' F, the order of the floors); its area plans follow">No.</th>{#each HKEYS as [, t] (t)}<th>{t}</th>{/each}<th class="ffl">FFL (m)</th></tr></thead>
				<tbody>
					<tr class="typ">
						<td>Typical</td><td></td>
						{#each HKEYS as [k] (k)}<td><input type="number" bind:value={typical[k]} /></td>{/each}
						<td><button class="btn" onclick={applyTypical}>Apply to all</button></td>
					</tr>
					{#each main as l (l.id)}
						{@const areas = areasOf(l)}
						<tr>
							<td class="nm"><input class="name" value={l.name} onchange={(e) => rename(l, e.currentTarget.value)} />
								{#if areas.length}<span class="hint" title="Its area plans ({areas.map((a) => a.name).join(', ')}) have the same number and heights">+{areas.length} area</span>{/if}</td>
							<td><input class="no" type="number" step="1" value={l.number} title="The floor's number — its area plans follow; a number another floor has is refused" onchange={(e) => { renumber(l, e.currentTarget.value); e.currentTarget.value = String(l.number) }} /></td>
							{#each HKEYS as [k] (k)}<td><input type="number" min="0" value={l.heights[k]} onchange={(e) => setHeight(l, k, e.currentTarget.value)} /></td>{/each}
							<td class="ffl">{(l.elevationMm / 1000).toFixed(3)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
		{:else}
		<section>
			<p class="hint">Each floor has a <b>plan</b> (its level in the Navigator), drawn over its <b>floorplan</b> — a calibrated page of a project PDF. When the floor is drawn on two or more pages, add each one and move it into place with X / Y. An <b>area plan</b> is a separate plan of part of a floor, such as a tenant office with its own drawing (33F 3303): it has the floor's number and heights, and its own floorplans.</p>
			{#each main as l (l.id)}
				<div class="floor">
					<div class="fhead"><b>{l.name}</b>
						<button class="btn sm" title="A separate plan of part of this floor — a tenant office on its own floorplan (e.g. 3303)" onclick={() => (addingArea = l.id)}>+ Area plan</button></div>
					{@render plan(l, null)}
					{#each areasOf(l) as a (a.id)}{@render plan(a, l)}{/each}
					{#if addingArea === l.id}
						<div class="plan"><div class="pname">Area plan</div><div><NameInput create placeholder="e.g. 3303 — Enter adds it" wide={false} onsave={(t) => addArea(l, t)} oncancel={() => (addingArea = null)} /></div></div>
					{/if}
				</div>
			{/each}
		</section>
		{/if}
	</div>
</div>

{#snippet plan(p: Level, floor: Level | null)}
	<div class="plan">
		{#if floor}
			<div class="pname"><span class="tag" title="Area plan {p.area} of {floor.name}">Area</span><input class="name" value={p.name} title="The area plan's name" onchange={(e) => rename(p, e.currentTarget.value)} />
				<button class="x" title={contents(p.id) ? `Has ${contents(p.id)} item(s) — delete it in the Navigator (asks first)` : 'Delete this (empty) area plan'} onclick={() => removeArea(p)}>✕</button></div>
		{:else}
			<div class="pname hint">Whole floor</div>
		{/if}
		<div>{@render floorplans(p)}</div>
	</div>
{/snippet}

{#snippet floorplans(l: Level)}
	{@const zones = underlaysOf(l)}
		{#each zones as z (z.id)}
			<div class="zone">
				{#if zones.length > 1}<input class="zn" value={z.name ?? ''} placeholder="name" title="This floorplan's name" onchange={(e) => putZone(l, z, 'floorplan name', { name: e.currentTarget.value.trim() || undefined })} />{/if}
				<select class="fp" value="{z.fileId}#{z.page ?? 1}" title="The PDF page under this plan" onchange={(e) => setFloorplan(l, e.currentTarget.value, z)}>
					{#if !pdfs.some((f) => f.id === z.fileId)}<option value="{z.fileId}#{z.page ?? 1}">{z.fileId} p.{z.page ?? 1}</option>{/if}
					{@render pages()}
				</select>
				<label class="off" title="Move this floorplan right (mm)">X <input type="number" step="100" value={z.origin?.x ?? 0} onchange={(e) => setOffset(l, z, 'x', e.currentTarget.value)} /></label>
				<label class="off" title="Move this floorplan down (mm)">Y <input type="number" step="100" value={z.origin?.y ?? 0} onchange={(e) => setOffset(l, z, 'y', e.currentTarget.value)} /></label>
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
		<!-- picking a page here adds it: the plan's floorplan, or another page of it (moved into place with X / Y) -->
		<select class="fp add" value="" title={zones.length ? 'Another PDF page under this same plan — when the floor is drawn on several pages' : 'The PDF page to draw this plan over'} onchange={(e) => { setFloorplan(l, e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">{zones.length ? '+ Another page…' : 'Choose a floorplan…'}</option>
			{@render pages()}
		</select>
{/snippet}

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 6vh; }
	.dlg { width: min(60rem, 96vw); max-height: 86vh; overflow-y: auto; overflow-x: hidden; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; gap: 16px; align-items: center; padding: 6px 12px 0; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.head > .x { margin-left: auto; align-self: center; }
	.tabs { display: flex; gap: 2px; align-self: flex-end; }
	.tabs button { padding: 4px 10px; border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; color: var(--cad-muted, #71717a); margin-bottom: -1px; }
	.tabs button.on { border-color: var(--cad-line, #e4e4e7); background: var(--cad-panel, white); color: inherit; font-weight: 500; }
	.tabs button:not(.on):hover { color: inherit; }
	.floor { border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; padding: 4px 8px 6px; }
	.fhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
	.plan { display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: 8px; align-items: start; padding: 3px 0; }
	.plan + .plan { border-top: 1px dashed var(--cad-line, #e4e4e7); }
	.pname { display: flex; align-items: center; gap: 4px; min-height: 20px; }
	.tag { font-size: 10px; padding: 0 4px; border-radius: 3px; background: var(--cad-sel, #dbeafe); color: #1d4ed8; }
	.btn.sm { font-size: 11px; padding: 0 6px; }
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
	.pname input.name { width: 8rem; }
	select.fp { width: 14rem; min-width: 0; font-size: 11px; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	select.fp.add { border-style: dashed; color: var(--cad-muted, #52525b); }
	.zone { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 3px; }
	input.zn { width: 5rem; font-size: 11px; }
	label.off { font-size: 11px; color: var(--cad-muted, #71717a); }
	label.off input { width: 3.8rem; font-size: 11px; color: var(--cad-text, #18181b); }
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
