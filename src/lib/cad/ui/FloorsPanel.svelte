<!-- Project settings › FLOORS & HEIGHTS and PLANS & FLOORPLANS (the Floor manager, User 2026-10-03): the building's
     floors as a lowest–top range with the floors that don't exist ticked off (no GF …), floor names from a pattern, and
     each floor's heights (slab, raised floor, clear height, plenum) with "apply to all". Every change re-stacks the FFL
     elevations. Plans & floorplans: each floor's plan and area plans, with the PDF pages under each.
     One edit = one undo step. Levels with something on them are never removed from here.
     The range and the name patterns wait for "Apply floors" (they add and remove levels); heights, No. and names save
     at once. A range that differs from the applied one is tinted "not applied", and the dialog asks before closing
     on it — so the panel stays mounted while another tab shows (`part` = null), keeping what was typed. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Building, Level, Id, Underlay } from '../domain/types'
	import type { Entity } from '../domain/drawing'
	import { floorName, floorNumbers, restack, planFloors, renameFloors, newAreaLevel, renumberFloor, DEFAULT_HEIGHTS, DEFAULT_NAMES, type Heights } from '../domain/floors'
	import NameInput from './NameInput.svelte'
	import { levelContents, levelRisers } from '../editor/commands'
	import { newId } from '../domain/ids'
	import { defaultSettings } from '../domain/settings'
	import { untrack } from 'svelte'
	import { watchProjectPdfs, storeFile, type PdfFile } from '../app/projectFiles'
	import { parsePaperScale, paperScaleRecord, paperOf, ratioOf, type CalibMode } from '../editor/calibrateTool'

	/** `part`: which tab shows (none = another tab of the dialog). `oncalibrate`: set a floorplan's origin / scale / crop
	 *  on the plan (the Calibrate tool; backlog "Calibrate an image in place"). `onplans`: go to Plans & floorplans (the
	 *  first-run path's next step, W9). */
	let { project, ws, part, oncalibrate, onplans, onsetupfloors }: { project: CadProject; ws: Workspace; part: 'floors' | 'plans' | null; oncalibrate?: (u: Underlay, mode: CalibMode) => void; onplans?: () => void; onsetupfloors?: (us: Underlay[]) => void } = $props()

	// the store isn't reactive itself: read project.rev, or an Apply (or a remote edit) is never seen here (Review 2 Q4)
	const building = $derived.by(() => { void project.rev; return project.store.ofType('building')[0] as Building | undefined })
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

	// ── what's applied: the building's record (or, before the first Apply, what the form started from) ──
	const applied = $derived.by(() => {
		const f = building?.floors
		return f ? { lo: f.lowest, hi: f.top, skip: f.skip ?? [], above: f.above ?? DEFAULT_NAMES.above, below: f.below ?? DEFAULT_NAMES.below, ground: f.ground ?? DEFAULT_NAMES.ground! } : init
	})
	const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x))
	/** The range / names typed here differ from the applied ones. */
	const pending = $derived(lowest !== applied.lo || top !== applied.hi || !sameSet(skip, applied.skip) || above !== applied.above || below !== applied.below || ground !== applied.ground)
	/** The levels don't match the range (a floor with no level, a level off the range): Apply has something to do. */
	const want = $derived(new Set(floorNumbers(lowest, top, skip)))
	/** W33: floors of the applied range with no level — their model was deleted on purpose (not in the Navigator; the riser
	 *  view still draws them). Apply leaves them; "+ model" makes one. */
	const noModel = $derived(building?.floors ? floorNumbers(applied.lo, applied.hi, applied.skip).filter((n) => !main.some((l) => l.number === n)) : [])
	const stale = $derived([...want].some((n) => !main.some((l) => l.number === n) && !noModel.includes(n)) || levels.some((l) => !want.has(l.number)))
	/** For the dialog: is there an unapplied range, and apply it. */
	export function isPending(): boolean { return pending }
	export function apply(): void { applyRange() }

	// ── each level's floorplan: a calibrated page of a project PDF (Uploads); picking another replaces it ──
	let pdfs = $state<PdfFile[]>([])
	$effect(() => watchProjectPdfs(project.db, project.pid, (f) => { pdfs = f }, (e) => { project.error = `Lost the live list of floorplan files: ${(e as Error)?.message ?? e}` }))
	// a plan can have several floorplans (a floor drawn on two sheets), each moved into place by its own X / Y offset
	const hasFloorplans = $derived.by(() => { void project.rev; return project.store.ofType('underlay').length > 0 })
	const underlaysOf = (l: Level) => { void project.rev; return project.store.ofType('underlay').filter((u) => u.levelId === l.id) }
	const fileName = (id: string) => pdfs.find((f) => f.id === id)?.name ?? id
	/** `u` = the floorplan to change, or none to add one. */
	function setFloorplan(l: Level, value: string, u?: Underlay) {
		if (!value) return
		const [fileId, page] = value.split('#'), n = underlaysOf(l).length
		const next: Underlay = { ...(u ?? { type: 'underlay', id: newId(), levelId: l.id, ...(n ? { name: `Floorplan ${n + 1}` } : {}) }), fileId, page: Number(page) }
		project.store.transact(`${l.name}: floorplan ${fileName(fileId)} p.${page}`, (tx) => tx.put(next))
	}
	/** Upload a PDF straight from a floor's row (backlog "Upload from Settings › Plans & floorplans", W9): it goes to the
	 *  project's Uploads like File › Uploads… does (Settings › Files' storage), then its first page is this floor's
	 *  floorplan (another page: pick it in the select). `uploading` = the level being uploaded to. */
	let uploading = $state<string | null>(null)
	async function uploadFloorplan(l: Level, files: FileList | null | undefined) {
		const file = [...(files ?? [])].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
		if (!file) { if (files?.length) ws.say('Only a PDF can be a floorplan'); return }
		uploading = l.id
		try {
			const { id } = await storeFile(project.db, project.pid, file, { storage: project.settings?.fileStorage, route: 'floorplanUploader' })
			setFloorplan(l, `${id}#1`)
			ws.say(`Uploaded ${id} — set its scale with 1: (or Scale), then its Origin`)
		} catch (e) { project.error = `Couldn't upload ${file.name}: ${(e as Error).message}` } finally { uploading = null }
	}
	/** A NEW REVISION of a floorplan (W4): `to` = a file already in Uploads, or a PDF to upload first. Its pages get the
	 *  old file's calibration, masks and hidden layers (where it has none of its own — `copyFileLook`), then every
	 *  floorplan of this project on the old file moves to it, in one undo step (the old file stays: issued sheets print
	 *  from it). */
	async function newRevision(z: Underlay, to: { fileId: string } | { file: File }) {
		const old = z.fileId
		uploading = z.id
		try {
			let id: string
			if ('file' in to) {
				if (!(to.file.type === 'application/pdf' || /\.pdf$/i.test(to.file.name))) { ws.say('Only a PDF can be a floorplan'); return }
				id = (await storeFile(project.db, project.pid, to.file, { storage: project.settings?.fileStorage, route: 'floorplanUploader' })).id
			} else id = to.fileId
			if (id === old) return
			const copied = await project.copyFileLook(old, id)
			const uses = project.store.ofType('underlay').filter((u) => u.fileId === old)
			const on = [...new Set(uses.map((u) => levels.find((l) => l.id === u.levelId)?.name).filter(Boolean))].join(', ')
			project.store.transact(`New floorplan revision: ${fileName(id)}`, (tx) => { for (const u of uses) tx.put({ ...u, fileId: id, prevFileId: old }) })   // W7 compares with `old`
			ws.say(`${fileName(id)} replaces ${fileName(old)} on ${on || 'this floor'} — ${copied.length ? 'its calibration and masks copied' : 'its own calibration kept'}; check the Origin lines up (Undo puts the old one back)`)
		} catch (e) { project.error = `Couldn't make the new revision: ${(e as Error).message}` } finally { uploading = null }
	}
	/** W7: compare this floorplan with `fileId` (none = stop) — red under it on this screen; turns Compare on. */
	function compareWith(z: Underlay, fileId: string) {
		const next = { ...ws.compareWith }
		if (fileId) next[z.id] = fileId
		else delete next[z.id]
		ws.compareWith = next
		ws.compareOn = !!fileId || Object.keys(next).length > 0
		if (fileId) ws.say(`Comparing with ${fileName(fileId)}: red = only in that one — close Floors… to look; Display › Compare floorplans turns it off`)
	}
	const putZone = (l: Level, u: Underlay, label: string, patch: Partial<Underlay>) => project.store.transact(`${l.name}: ${label}`, (tx) => tx.put({ ...u, ...patch }))
	function setOffset(l: Level, u: Underlay, k: 'x' | 'y', v: string) {
		const o = { x: 0, y: 0, ...u.origin, [k]: Number(v) || 0 }
		putZone(l, u, 'floorplan offset', { origin: o.x || o.y ? o : undefined })
	}
	/** "Drawn at 1:___" (W5): the PDF page's size gives the scale in one step — "100", or "100 A1" when the title block's
	 *  scale is for another paper size than the PDF page. Saved in the file like Scale (Uploads' record). */
	async function setPaperScale(z: Underlay, t: string, input: HTMLInputElement) {
		if (!t.trim()) return
		input.value = ''
		await project.pdf.placed(z)   // another floor's floorplan isn't drawn yet: its page size comes with the render
		const cal = project.pdf.calib[`${z.fileId}#${z.page ?? 1}`]
		const q = parsePaperScale(t), rec = q && cal?.page && paperScaleRecord(q.n, cal.page, q.paper)
		if (!cal?.page) { ws.say(`The floorplan couldn't be opened: ${project.pdf.problems[`${z.fileId}#${z.page ?? 1}`] ?? 'try again in a moment'}`); return }
		if (!rec) { ws.say('Type the scale as 100 or 1:100 — add the paper size when it is not the PDF page size: 100 A1'); return }
		const page = paperOf(cal.page)
		ws.calibIO.write(z, 'scale', rec, `Scaled: drawn at ${rec.paper}${q!.paper ? '' : page ? ` (an ${page} page)` : ''}`)
	}
	function removeFloorplan(l: Level, z: Underlay) {
		project.store.transact(`${l.name}: no floorplan ${fileName(z.fileId)}`, (tx) => tx.del(z.id))
		ws.say(`${l.name}: floorplan ${fileName(z.fileId)} removed — Undo brings it back`)
	}

	const range = $derived(floorNumbers(lowest, top).reverse())
	const names = $derived({ above, below, ground })
	const toggle = (n: number) => { skip = skip.includes(n) ? skip.filter((x) => x !== n) : [...skip, n] }

	/** What's on a level: its contents, sections, and sheet viewports that show it. */
	function contents(id: Id): number {
		return levelContents(project.store.all(), id).length + levelRisers(project.store.all(), id).length   // runs reaching it too (W36)
			+ project.store.ofType('section').filter((s) => s.levelId === id).length
			+ project.store.ofType('sheet').flatMap((s) => s.viewports).filter((v) => v.view.levelId === id).length
	}

	/** Write `changed` levels (and anything else in `extra`), re-stacking the elevations over the final set. */
	type Tx = { put: (e: Entity) => void; del: (id: Id) => void }
	const NOOP = (_tx: Tx) => {}
	function commit(label: string, changed: Level[], extra: (tx: Tx) => void = NOOP, gone: Id[] = [], stackSkip = building?.floors?.skip ?? [], datum = building?.floors?.datum): boolean {
		const next = new Map(levels.filter((l) => !gone.includes(l.id)).map((l) => [l.id, l]))
		for (const l of changed) next.set(l.id, l)
		for (const l of restack([...next.values()], stackSkip, datum)) next.set(l.id, l)
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

	/** W10: the floor whose FFL is 0 — every floor's FFL is stacked again from it (one undo step). */
	function setDatum(n: number) {
		const b = building
		if (!b) return
		const datum = n
		commit(`FFL 0 at ${main.find((l) => l.number === n)?.name ?? `floor ${n}`}`, [], (tx) => tx.put({ ...b, floors: { ...(b.floors ?? { lowest: n, top: n, above: DEFAULT_NAMES.above, below: DEFAULT_NAMES.below }), datum } } as Building), [], b.floors?.skip ?? [], datum)
	}
	function applyRange() {
		if (lowest > top) [lowest, top] = [top, lowest]   // a backwards range is the same floors the right way round (Q40)
		const b: Building = building ?? { type: 'building', id: newId(), name: project.name || 'Building', order: 0 }
		const was = b.floors ? floorNumbers(b.floors.lowest, b.floors.top, b.floors.skip) : undefined   // W33: floors already there
		const r = planFloors(levels, { lowest, top, skip, names, buildingId: b.id, before: was }, contents, newId)
		commit(`Floors ${floorName(Math.min(lowest, top), names)}–${floorName(Math.max(lowest, top), names)}`, r.add,
			(tx) => {
				tx.put({ ...b, floors: { lowest, top, skip: skip.length ? [...skip] : undefined, above, below, ground, ...(b.floors?.datum != null ? { datum: b.floors.datum } : {}) } } as Building)
				if (!project.settings) tx.put(defaultSettings())   // a new project's first floors bring its settings
			}, r.remove.map((l) => l.id), skip)
		const parts = [r.add.length && `${r.add.length} added`, r.remove.length && `${r.remove.length} removed`].filter(Boolean)
		const undo = parts.length ? ' — Undo brings the floors back as they were' : ''
		ws.say(`${parts.join(', ') || 'Floor range applied; no floors changed'}${undo}${r.keep.length ? ` · kept ${r.keep.map((l) => l.name).join(', ')} (they have content — delete them in the Levels list first)` : ''}`)
	}

	/** W33: make a model (a level) for a floor that has none — named from the pattern, the heights of the floor below,
	 *  stacked in its storey. */
	function createModel(n: number) {
		const b = building
		if (!b) return
		const r = planFloors(levels, { lowest: n, top: n, skip: [], names, buildingId: b.id }, contents, newId)
		if (!r.add.length) return
		const near = [...main].sort((x, y) => Math.abs(x.number - n) - Math.abs(y.number - n))[0]
		const l = { ...r.add[0], heights: { ...(near?.heights ?? r.add[0].heights) } }
		commit(`Model for ${l.name}`, [l])
		ws.say(`${l.name} has a model again — it's in the Navigator; Undo takes it out`)
	}

	/** Floor models with nothing on them (User 2026-10-16: "a building with 100 floors but the client uses 1"): no
	 *  content, section, viewport, floorplan or riser, no area plan; the open one stays. They go in one undo step and
	 *  stay floors of the building (riser view; "+ model" makes one again). */
	const emptyModels = $derived.by(() => {
		void project.rev
		return main.filter((l) => l.id !== ws.levelId && !contents(l.id) && !levels.some((a) => a.area && a.number === l.number))
	})
	let askEmpty = $state(false)
	function removeEmpty() {
		askEmpty = false
		const gone = emptyModels
		if (!gone.length) return
		commit(`Remove ${gone.length} empty floor model${gone.length === 1 ? '' : 's'}`, [], NOOP, gone.map((l) => l.id))
		ws.say(`${gone.length} empty floor model${gone.length === 1 ? '' : 's'} removed — still floors of the building (riser view); Undo brings them back`)
	}

	function renameAll() {
		const r = renameFloors(levels, names)
		if (!r.length) { ws.say('The names already match the pattern'); return }
		project.store.transact(`Rename ${r.length} floors`, (tx) => { for (const l of r) tx.put(l) })
		ws.say(`${r.length} floor${r.length === 1 ? '' : 's'} renamed — Undo brings the old names back`)
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
		else ws.say('Every floor has these heights now — Undo brings back the ones they had')
	}
	const HKEYS: [keyof Heights, string][] = [['slabMm', 'Slab'], ['raisedFloorMm', 'Raised floor'], ['clearHeightMm', 'Clear height'], ['plenumMm', 'Plenum']]

	// ── a floor's number, and its AREA plans (a tenant office on its own floorplan — Tourney's 33F 3303 / 3307) ──
	const areasOf = (l: Level) => levels.filter((x) => x.area && x.number === l.number).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
	/** Another number for a floor (its area plans follow); the building's range widens to take it. */
	function renumber(l: Level, v: string) {
		const n = Number(v), r = renumberFloor(levels, l.id, n)
		if ('problem' in r) { ws.say(r.problem); return }
		if (!r.put.length) return
		// the APPLIED range widens to take the number; a range typed but not yet applied stays as typed (Q40)
		const a = applied, wasPending = pending
		const lo = Math.min(a.lo, a.hi, n), hi = Math.max(a.lo, a.hi, n), sk = a.skip.filter((x) => x !== n)
		if (!wasPending) { lowest = lo; top = hi; skip = sk }
		const b = building
		commit(`${l.name}: floor ${l.number} → ${n}`, r.put, b ? (tx) => tx.put({ ...b, floors: { ...b.floors, lowest: lo, top: hi, skip: sk.length ? [...sk] : undefined, above: a.above, below: a.below, ground: a.ground } } as Building) : NOOP, [], sk)
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
	/** An empty area plan goes at once (undoable); one with something on it is deleted from the Navigator (it asks first). */
	function removeArea(a: Level) {
		const n = contents(a.id)
		if (n) { ws.say(`${a.name} has ${n} item${n === 1 ? '' : 's'} — delete it in the Navigator (⋮ › Delete level…), which asks first`); return }
		project.store.transact(`Delete area plan ${a.name}`, (tx) => { for (const u of underlaysOf(a)) tx.del(u.id); tx.del(a.id) })
		if (ws.levelId === a.id) ws.levelId = main[0]?.id ?? null
		ws.say(`Area plan ${a.name} deleted — Undo brings it back`)
	}
</script>

{#snippet pages()}
	{#each pdfs as f (f.id)}
		{#each Array.from({ length: f.pageCount }, (_, i) => i + 1) as n (n)}
			<!-- an uncalibrated page can be picked: it shows as if 1:100, and Origin / Scale / Crop here calibrate it in place -->
			<option value="{f.id}#{n}">{f.name}{f.pageCount > 1 ? ` p.${n}` : ""}{f.calibrated[n] ? "" : " (not calibrated — set its scale here)"}</option>
		{/each}
	{/each}
{/snippet}

{#if part === 'floors'}
	<section class:pending>
		<p class="h">The building's floors <span class="hint">· the range and the names wait for Apply floors</span></p>
		<div class="row">
			<label>Lowest <input type="number" bind:value={lowest} /></label>
			<label>Top <input type="number" bind:value={top} /></label>
			<label>Name <input class="pat" bind:value={above} title={'{n} = number, {nn} = two digits'} /></label>
			<label>Basements <input class="pat" bind:value={below} title={'{n} = number without the minus'} /></label>
			<label>Ground <input class="pat" bind:value={ground} title="The name of floor 0, when the building has one" /></label>
		</div>
		<p class="hint">Untick the floors that don't exist (e.g. GF). Blue = the floor has a level (its model). A floor whose level you deleted stays in the building — in its storey and the riser view, not the Navigator.</p>
		<div class="chips">
			{#each range as n (n)}
				<button class="chip" class:off={skip.includes(n)} class:has={main.some((l) => l.number === n)} title={skip.includes(n) ? 'Not a floor of this building' : noModel.includes(n) ? 'A floor of this building with no model (level): + model below makes one' : 'A floor of this building'} onclick={() => toggle(n)}>{floorName(n, names)}</button>
			{/each}
		</div>
		{#if noModel.length}
			<p class="hint">No model: {#each noModel as n (n)}<button class="mini" title="Make a level for {floorName(n, names)} (it shows in the Navigator again)" onclick={() => createModel(n)}>+ {floorName(n, names)} model</button>{/each}</p>
		{/if}
		<div class="row">
			<button class="btn pri" disabled={!pending && !stale} title={pending ? 'Add the floors of the range, remove the empty levels off it, keep the names' : stale ? 'The levels don’t match the range: add the floors with no level, remove the empty ones off it' : 'Nothing to apply — change the range or the names first'} onclick={applyRange}>Apply floors</button>
			{#if pending}<span class="na" role="status">not applied</span>{/if}
			<button class="btn" title="Rename every level from the pattern (area plans keep their suffix)" onclick={renameAll}>Rename all from the pattern</button>
			{#if askEmpty && emptyModels.length}
				<span class="na">Remove {emptyModels.length} empty floor model{emptyModels.length === 1 ? '' : 's'}? They stay in the riser view.</span>
				<button class="btn pri" onclick={removeEmpty}>Remove</button><button class="btn" onclick={() => (askEmpty = false)}>Cancel</button>
			{:else}
				<button class="btn" disabled={!emptyModels.length || pending} title={pending ? 'Apply floors first' : emptyModels.length ? `Remove the models of the floors with nothing on them (${emptyModels.map((l) => l.name).join(', ')}) — they leave the Navigator, stay floors of the building (riser view); “+ model” makes one again; one undo step. The open floor stays.` : 'Every floor model has something on it (or is open)'} onclick={() => (askEmpty = true)}>Remove empty floor models{emptyModels.length ? ` (${emptyModels.length})` : ''}</button>
			{/if}
			<!-- first run (W9): floors applied, no floorplan anywhere yet → the next step -->
			{#if onplans && main.length && !pending && !hasFloorplans}<button class="btn pri next" title="Add each floor's floorplan (a PDF page)" onclick={onplans}>Next: add floorplans →</button>{/if}
		</div>
	</section>

	<section>
		<p class="h">Heights (mm) <span class="hint">· saved at once; FFL is stacked from them{building?.floors?.datum == null ? ', floor 1 stays where it is' : ''}</span></p>
		<!-- W10: which floor is FFL 0 (AU / UK: GF; elsewhere often floor 1) -->
		{#if building && main.length}
			{@const dat = building.floors?.datum}
			<div class="row"><label title="The floor whose finished floor level is 0 — every other floor's FFL is stacked up / down from it">FFL 0 at
				<select value={dat == null ? '' : String(dat)} onchange={(e) => e.currentTarget.value !== '' && setDatum(Number(e.currentTarget.value))}>
					{#if dat == null}<option value="">{main.some((l) => l.number === 1) ? 'floor 1 (as it is)' : '—'}</option>{/if}
					{#each [...main].sort((a, b) => a.number - b.number) as l (l.id)}<option value={String(l.number)}>{l.name}</option>{/each}
				</select></label></div>
		{/if}
		<table>
			<thead><tr><th>Floor</th><th title="The floor's number (labels' F, the order of the floors); its area plans follow">No.</th>{#each HKEYS as [, t] (t)}<th>{t}</th>{/each}<th class="ffl">FFL (m)</th></tr></thead>
			<tbody>
				<tr class="typ">
					<td>Typical</td><td></td>
					{#each HKEYS as [k] (k)}<td><input type="number" bind:value={typical[k]} /></td>{/each}
					<td><button class="btn" title="Give every floor these heights (Undo brings back the ones they had)" onclick={applyTypical}>Apply to all</button></td>
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
{:else if part === 'plans'}
	<section>
		<p class="hint">Each floor has a <b>plan</b> (its level in the Navigator), drawn over its <b>floorplan</b> — a calibrated page of a project PDF. When the floor is drawn on two or more pages, add each one and move it into place with X / Y. An <b>area plan</b> is a separate plan of part of a floor, such as a tenant office with its own drawing (33F 3303): it has the floor's number and heights, and its own floorplans.</p>
		<!-- W6: Origin then Crop on every floor's floorplan in one go, lowest first, the floor below in red to line up -->
		{#if onsetupfloors && hasFloorplans}
			{@const all = main.flatMap((l) => underlaysOf(l)).filter((u) => !u.hidden)}
			<div class="row"><button class="btn pri" title="Origin, then Crop, on each floor's floorplan in turn (lowest floor first) without coming back here — the floor below shows in red to check they line up; Esc stops" onclick={() => onsetupfloors(all)}>Set up each floor…</button><span class="hint">Origin + Crop on {all.length} floorplan{all.length === 1 ? '' : 's'}; set each scale with 1: first</span></div>
		{/if}
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

{#snippet plan(p: Level, floor: Level | null)}
	<div class="plan">
		{#if floor}
			<div class="pname"><span class="tag" title="Area plan {p.area} of {floor.name}">Area</span><input class="name" value={p.name} title="The area plan's name" onchange={(e) => rename(p, e.currentTarget.value)} />
				<button class="x" title={contents(p.id) ? `Has ${contents(p.id)} item(s) — delete it in the Navigator (asks first)` : 'Delete this (empty) area plan (Undo brings it back)'} onclick={() => removeArea(p)}>✕</button></div>
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
						<!-- W5: the scale from the title block, no measuring -->
						<label class="ratio" title="Drawn at 1:… — type the scale from the floorplan's title block (100) and press Enter. When it's for another paper size than this PDF page{cal?.page && paperOf(cal.page) ? ` (${paperOf(cal.page)})` : ''}, add it: 100 A1">1:<input placeholder={cal && !cal.provisional ? String(ratioOf(cal.sf)) : '___'} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void setPaperScale(z, e.currentTarget.value, e.currentTarget) } }} onchange={(e) => void setPaperScale(z, e.currentTarget.value, e.currentTarget)} /></label>
					</span>
				{/if}
				<!-- W7: this floorplan on its own — shown or not, how faded (saved: sheets print it so), compared with another -->
				<label class="look" title="Show this floorplan (untick: hidden here and on every sheet — another trade's drawing, an old revision kept beside)"><input type="checkbox" checked={!z.hidden} onchange={(e) => putZone(l, z, e.currentTarget.checked ? 'floorplan shown' : 'floorplan hidden', { hidden: e.currentTarget.checked ? undefined : true })} /></label>
				<select class="fp fade" value={String(z.opacity ?? 0.6)} title="How strongly this floorplan is drawn (plan and sheets)" onchange={(e) => putZone(l, z, 'floorplan fade', { opacity: Number(e.currentTarget.value) === 0.6 ? undefined : Number(e.currentTarget.value) })}>
					{#each [1, 0.6, 0.35, 0.15] as v (v)}<option value={String(v)}>{Math.round(v * 100)}%</option>{/each}
				</select>
				<select class="fp cmp" value={ws.compareWith[z.id] ?? (ws.compareOn && z.prevFileId ? z.prevFileId : '')} title="Compare: another revision drawn in red under this one, on your screen only (View strip › Display › Compare floorplans turns it off)" onchange={(e) => compareWith(z, e.currentTarget.value)}>
					<option value="">Compare…</option>
					{#each pdfs.filter((f) => f.id !== z.fileId).sort((a, b) => Number(b.id === z.prevFileId) - Number(a.id === z.prevFileId)) as f (f.id)}<option value={f.id}>{f.name}{f.id === z.prevFileId ? ' (previous)' : ''}</option>{/each}
				</select>
				<!-- W4: the architect's next revision of this drawing, keeping its calibration, on every floor that uses it -->
				<select class="fp rev" value="" disabled={uploading === z.id} title="A new revision of this floorplan: it takes this one's place on every floor that uses it, with its origin, scale, crop, masks and hidden layers" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v === 'upload') document.getElementById(`cad-rev-${z.id}`)?.click(); else if (v) void newRevision(z, { fileId: v }) }}>
					<option value="">{uploading === z.id ? 'Uploading…' : 'New revision…'}</option>
					<option value="upload">Upload the new PDF…</option>
					{#each pdfs.filter((f) => f.id !== z.fileId) as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
				</select>
				<input id="cad-rev-{z.id}" type="file" accept="application/pdf,.pdf" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void newRevision(z, { file: f }) }} />
				<button class="x" title="Remove this floorplan (Undo brings it back)" onclick={() => removeFloorplan(l, z)}>✕</button>
			</div>
		{/each}
		<!-- picking a page here adds it: the plan's floorplan, or another page of it (moved into place with X / Y) -->
		<!-- …or a PDF uploaded from here (the button, or dropped on the row) -->
		<div class="addrow" role="group" ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); void uploadFloorplan(l, e.dataTransfer?.files) }}>
			<select class="fp add" value="" title={zones.length ? 'Another PDF page under this same plan — when the floor is drawn on several pages' : 'The PDF page to draw this plan over'} onchange={(e) => { setFloorplan(l, e.currentTarget.value); e.currentTarget.value = '' }}>
				<option value="">{zones.length ? '+ Another page…' : 'Choose a floorplan…'}</option>
				{@render pages()}
			</select>
			<label class="btn up" class:busy={uploading === l.id} title="Upload a PDF to the project's Uploads and use it here (or drop it on this row)">
				{uploading === l.id ? 'Uploading…' : 'Upload…'}<input type="file" accept="application/pdf,.pdf" hidden disabled={!!uploading} onchange={(e) => { void uploadFloorplan(l, e.currentTarget.files); e.currentTarget.value = '' }} />
			</label>
		</div>
{/snippet}

<style>
	.floor { border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; padding: 4px 8px 6px; }
	.fhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
	.plan { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: 8px; align-items: start; padding: 3px 0; }
	.plan + .plan { border-top: 1px dashed var(--cad-line, #e4e4e7); }
	.pname { display: flex; align-items: center; gap: 4px; min-height: 20px; }
	.tag { font-size: 10px; padding: 0 4px; border-radius: 3px; background: var(--cad-sel, #dbeafe); color: #1d4ed8; }
	.btn.sm { font-size: 11px; padding: 0 6px; }
	.x { color: var(--cad-muted, #71717a); }
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	/* the range typed here isn't applied yet */
	section.pending { background: color-mix(in srgb, #f59e0b 10%, var(--cad-panel, white)); box-shadow: inset 3px 0 0 #f59e0b; }
	.na { font-size: 11px; font-weight: 600; color: #b45309; }
	.h { font-weight: 600; }
	.hint { color: var(--cad-muted, #71717a); font-weight: 400; }
	.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	input { width: 4.5rem; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	input.pat { width: 5.5rem; font-family: ui-monospace, monospace; }
	input.name { width: 7rem; }
	input.no { width: 3.2rem; }
	td.nm { white-space: nowrap; }
	.pname input.name { width: 5.5rem; }
	select.fp { width: 14rem; min-width: 0; font-size: 11px; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	select.fp.add { border-style: dashed; color: var(--cad-muted, #52525b); }
	select.fp.rev { width: 7.5rem; color: #2563eb; }
	select.fp.fade { width: 3.6rem; }
	select.fp.cmp { width: 6.5rem; }
	.look { display: inline-flex; align-items: center; }
	.addrow { display: flex; align-items: center; gap: 4px; }
	.btn.up { font-size: 11px; cursor: pointer; color: #2563eb; }
	.btn.up.busy { color: var(--cad-muted, #71717a); cursor: progress; }
	.zone { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 3px; }
	input.zn { width: 5rem; font-size: 11px; }
	label.off { font-size: 11px; color: var(--cad-muted, #71717a); }
	label.off input { width: 3.8rem; font-size: 11px; color: var(--cad-text, #18181b); }
	.cal { display: inline-flex; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; overflow: hidden; }
	.cal button { font-size: 10.5px; padding: 0 5px; color: #2563eb; }
	.cal button + button { border-left: 1px solid var(--cad-line, #e4e4e7); }
	.cal button:hover { background: var(--cad-sel, #dbeafe); }
	.cal.todo { border-color: #f59e0b; }
	.cal .ratio { display: inline-flex; align-items: center; gap: 1px; font-size: 10.5px; padding-left: 5px; border-left: 1px solid var(--cad-line, #e4e4e7); color: var(--cad-muted, #71717a); }
	.cal .ratio input { width: 3.6rem; font-size: 10.5px; padding: 0 3px; border: 0; background: transparent; }
	button.x { color: var(--cad-muted, #71717a); padding: 0 4px; }
	button.x:hover { color: #b91c1c; }
	.chips { display: flex; flex-wrap: wrap; gap: 3px; }
	.chip { font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--cad-line, #d4d4d8); background: var(--cad-input, white); }
	.mini { margin-left: 4px; font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px dashed var(--cad-line, #d4d4d8); color: var(--cad-link, #1d4ed8); }
	.chip.has { border-color: #2563eb; color: #1d4ed8; }
	.chip.off { text-decoration: line-through; opacity: 0.45; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 8px; background: var(--cad-input, white); }
	.btn.pri { background: #2563eb; border-color: #2563eb; color: white; }
	.btn:disabled { opacity: 0.45; cursor: default; }
	table { border-collapse: collapse; }
	th { text-align: left; font-weight: 500; color: var(--cad-muted, #71717a); padding: 2px 4px; }
	td { padding: 1px 4px; }
	tr.typ td { padding-bottom: 6px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.ffl { font-family: ui-monospace, monospace; color: var(--cad-muted, #52525b); text-align: right; }
</style>
