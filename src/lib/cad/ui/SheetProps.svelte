<!-- A sheet (Phase 4.1): its number, title and paper; or, with a viewport picked on it, that viewport — what it shows
     (level + plan / elevation / a room's racks), scale 1:N, window position and size, centre, label, frame, lock. Every
     edit is one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, Viewport } from '../domain/drawing'
	import { defaultViewport, contentCentre } from '../views/sheet'
	import { newId } from '../domain/ids'
	import { untie } from '../editor/noteTool'
	import { sectionsOn } from '../views/section'
	import type { TitleBlockTemplate } from '../domain/titleBlock'
	import TitleBlockEditor from './TitleBlockEditor.svelte'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Sheet } = $props()

	const vp = $derived(s.viewports.find((v) => v.id === ws.viewportId))
	const SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
	const levels = $derived(project.levels)
	const putSheet = (label: string, patch: Partial<Sheet>) => project.store.transact(label, (tx) => tx.put({ ...s, ...patch }))
	const putVp = (label: string, patch: Partial<Viewport>) => putSheet(label, { viewports: s.viewports.map((v) => (v.id === vp?.id ? { ...v, ...patch } : v)) })
	const num = (v: string) => Number(v)
	/** Notes tied to it go back on the paper where they showed. */
	function deleteViewport(v: Viewport) {
		project.store.transact('Delete viewport', (tx) => {
			tx.put({ ...s, viewports: s.viewports.filter((x) => x.id !== v.id) })
			for (const n of project.index.shapes) if (n.sheetId === s.id && n.vpId === v.id) tx.put(untie(n, v))
		})
		ws.selectViewport(null)
	}

	// what a viewport can show, as one picker: plan, the four elevations, each server room's racks front / rear
	const viewKey = (v: Viewport) => (v.view.spec.kind === 'row' ? `row:${v.view.spec.spaceId}:${v.view.spec.face}` : v.view.spec.kind === 'plan' ? 'plan' : v.view.spec.kind === 'riser' ? 'riser' : v.view.spec.kind === 'section' ? `section:${v.view.spec.sectionId}` : `elev:${v.view.spec.dir}`)
	const rooms = $derived(vp ? project.index.spaces.filter((x) => x.kind === 'server room' && x.levelId === vp.view.levelId) : [])
	function setView(v: Viewport, key: string) {
		const [kind, a, b] = key.split(':')
		const spec: Viewport['view']['spec'] = kind === 'plan' ? { kind: 'plan' } : kind === 'riser' ? { kind: 'riser' } : kind === 'section' ? { kind: 'section', sectionId: a } : kind === 'elev' ? { kind: 'elevation', dir: a as 'front' } : { kind: 'row', spaceId: a, face: b as 'front' | 'rear' }
		const next = { ...v, view: { ...v.view, spec } }
		putVp('Viewport view', { view: next.view, centre: contentCentre(project.index, next) })
	}
	function setLevel(v: Viewport, levelId: string) {
		const spec = v.view.spec.kind === 'row' || v.view.spec.kind === 'section' ? { kind: 'plan' as const } : v.view.spec   // a room's racks / a section belong to their level
		const next = { ...v, view: { levelId, spec } }
		putVp('Viewport level', { view: next.view, centre: contentCentre(project.index, next) })
	}
	let busy = $state(false)
	async function pdf() {
		busy = true
		try { const r = await downloadSheetsPdf(project, [s]); ws.say(`PDF: ${r.pages} page${r.pages === 1 ? '' : 's'}${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	/** The project's template lives on the settings record: one undo step per edit, shared by every sheet. */
	function setTemplate(t: TitleBlockTemplate) {
		const st = project.settings
		if (st) project.store.transact('Title block template', (tx) => tx.put({ ...st, titleBlock: t }))
	}
	function addViewport() {
		const lv = ws.levelId ?? levels[0]?.id
		if (!lv) return
		const v = defaultViewport(project.index, s, lv, newId(), { projectName: project.name, template: project.settings?.titleBlock })
		putSheet('Add viewport', { viewports: [...s.viewports, v] })
		ws.selectViewport(v.id)
	}
</script>

{#if vp}
	<p class="font-semibold">Viewport <span class="font-normal text-zinc-500">on {s.number}</span></p>
	<label class="row">Level
		<select class="inp" value={vp.view.levelId} onchange={(e) => setLevel(vp, e.currentTarget.value)}>
			{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
		</select>
	</label>
	<label class="row">View
		<select class="inp" value={viewKey(vp)} onchange={(e) => setView(vp, e.currentTarget.value)}>
			<option value="plan">Plan</option>
			{#each ['front', 'rear', 'left', 'right'] as d (d)}<option value="elev:{d}">Elevation {d}</option>{/each}
			{#each rooms as r (r.id)}{#each ['front', 'rear'] as f (f)}<option value="row:{r.id}:{f}">{r.name} racks {f}</option>{/each}{/each}
			{#each sectionsOn(project.index, vp.view.levelId) as sc (sc.id)}<option value="section:{sc.id}">Section {sc.name}</option>{/each}
			<option value="riser">Risers (building)</option>
		</select>
	</label>
	<label class="row">Scale 1:
		<span class="flex gap-1">
			<select class="inp" value={SCALES.includes(vp.scale) ? String(vp.scale) : ''} onchange={(e) => e.currentTarget.value && putVp('Viewport scale', { scale: num(e.currentTarget.value) })}>
				{#if !SCALES.includes(vp.scale)}<option value="">custom</option>{/if}
				{#each SCALES as n (n)}<option value={String(n)}>{n}</option>{/each}
			</select>
			<input class="inp w-16" type="number" min="1" value={vp.scale} title="Custom 1:N" onchange={(e) => num(e.currentTarget.value) > 0 && putVp('Viewport scale', { scale: num(e.currentTarget.value) })} />
		</span>
	</label>
	<div class="row"><span>Window (mm)</span>
		<span class="win">
			{#each ['x', 'y', 'w', 'h'] as const as k (k)}
				<label>{k.toUpperCase()} <input class="inp" type="number" value={Math.round(vp.rect[k])} onchange={(e) => putVp('Viewport window', { rect: { ...vp.rect, [k]: Math.max(k === 'w' || k === 'h' ? 10 : -1e6, num(e.currentTarget.value)) } })} /></label>
			{/each}
		</span>
	</div>
	<div class="row"><span>Centre</span>
		<span class="flex gap-1">
			<input class="inp" type="number" title="X (view mm)" value={Math.round(vp.centre.x)} onchange={(e) => putVp('Viewport centre', { centre: { ...vp.centre, x: num(e.currentTarget.value) } })} />
			<input class="inp" type="number" title="Y (view mm)" value={Math.round(vp.centre.y)} onchange={(e) => putVp('Viewport centre', { centre: { ...vp.centre, y: num(e.currentTarget.value) } })} />
			<button class="btn" title="Centre on what the view shows" onclick={() => putVp('Fit viewport', { centre: contentCentre(project.index, vp) })}>Fit</button>
		</span>
	</div>
	<label class="row">Label <input class="inp" value={vp.label ?? ''} placeholder="(none)" onchange={(e) => putVp('Viewport label', { label: e.currentTarget.value.trim() || undefined })} /></label>
	<label class="row">Frame <span><input type="checkbox" checked={vp.border !== false} onchange={(e) => putVp('Viewport frame', { border: e.currentTarget.checked ? undefined : false })} /> printed</span></label>
	<label class="row">Locked <span><input type="checkbox" checked={!!vp.locked} onchange={(e) => putVp(e.currentTarget.checked ? 'Lock viewport' : 'Unlock viewport', { locked: e.currentTarget.checked || undefined })} /> can't be moved</span></label>
	<button class="btn" onclick={() => deleteViewport(vp)}>Delete viewport</button>
{:else}
	<p class="font-semibold">Sheet</p>
	<label class="row">Number <input class="inp font-mono" value={s.number} onchange={(e) => putSheet('Sheet number', { number: e.currentTarget.value.trim() })} /></label>
	<label class="row">Title <input class="inp" value={s.title} onchange={(e) => putSheet('Sheet title', { title: e.currentTarget.value.trim() })} /></label>
	<label class="row">Paper
		<span class="flex gap-1">
			<select class="inp" value={s.paper.size} onchange={(e) => putSheet('Paper size', { paper: { ...s.paper, size: e.currentTarget.value as Sheet['paper']['size'] } })}>
				{#each ['A0', 'A1', 'A2', 'A3', 'A4'] as z (z)}<option value={z}>{z}</option>{/each}
			</select>
			<select class="inp" value={s.paper.orientation} onchange={(e) => putSheet('Paper orientation', { paper: { ...s.paper, orientation: e.currentTarget.value as 'landscape' | 'portrait' } })}>
				<option value="landscape">landscape</option><option value="portrait">portrait</option>
			</select>
		</span>
	</label>
	<label class="row">Margin (mm) <input class="inp" type="number" min="0" value={s.paper.marginMm} onchange={(e) => putSheet('Paper margin', { paper: { ...s.paper, marginMm: Math.max(0, num(e.currentTarget.value)) } })} /></label>
	<div class="flex gap-1">
		<button class="btn" title="A viewport onto the open level's plan; pick it to change its view, scale and window" onclick={addViewport}>Add viewport</button>
		<button class="btn" disabled={busy} title="This sheet as a PDF at true scale (download)" onclick={pdf}>{busy ? 'PDF…' : 'PDF'}</button>
	</div>
	<p class="text-zinc-500">{s.viewports.length} viewport{s.viewports.length === 1 ? '' : 's'} · click one on the paper to edit it, drag to move it</p>
	<!-- this sheet's own title-block settings; the template below is the project's -->
	<label class="row">Drawn <input class="inp" value={s.titleBlock?.fields?.drawn ?? ''} placeholder="initials" onchange={(e) => putSheet('Drawn by', { titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, drawn: e.currentTarget.value.trim() } } })} /></label>
	<label class="row">Title block <span><input type="checkbox" checked={!s.titleBlock?.hidden} onchange={(e) => putSheet(e.currentTarget.checked ? 'Show title block' : 'Hide title block', { titleBlock: { ...s.titleBlock, hidden: e.currentTarget.checked ? undefined : true } })} /> on this sheet</span></label>
	<TitleBlockEditor template={project.settings?.titleBlock} onchange={setTemplate} />
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid #e4e4e7; border-radius: 4px; padding: 1px 4px; background: white; }
	.win { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
	.win label { display: flex; align-items: center; gap: 3px; color: #71717a; }
	.btn { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; background: white; }
	.btn:hover { background: #f4f4f5; }
</style>
