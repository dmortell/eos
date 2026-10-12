<!-- A sheet (Phase 4.1): its number, title and paper; or, with a viewport picked on it, that viewport — what it shows
     (level + plan / elevation / a room's racks / a section / the riser, or paper: a rack's port grid, a room's patch
     schedule, a fill section), scale 1:N, window position and size, centre, label, frame, lock. Every
     edit is one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, Viewport } from '../domain/drawing'
	import type { RackRow, Device } from '../domain/types'
	import { defaultViewport, contentCentre, fitViewport, SCALES } from '../views/sheet'
	import { isPaperSpec } from '../views/space'
	import { racksInOrder } from '../domain/devices'
	import { viewName } from '../domain/navTree'
	import { newId } from '../domain/ids'
	import { sectionsOn } from '../views/section'
	import { portMapTitle } from '../domain/portMap'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'
	import { printRevision, today } from '../app/issue'
	import PropGroup from './PropGroup.svelte'
	import { duplicateSheets } from '../app/sheetActions'
	import { issuesOfSheet, issueTag, changeLines } from '../domain/issue'
	import type { Issue, SheetChange } from '../domain/drawing'
	import { ordered, categoryOf } from '../domain/sheetCategories'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Sheet } = $props()

	const vp = $derived(s.viewports.find((v) => v.id === ws.viewportId))
	const issuedIn = $derived(issuesOfSheet([...project.index.byId.values()].filter((e): e is Issue => e.type === 'issue'), s.id))
	const levels = $derived(project.levels)
	// category / discipline / tags, as several sheets have them (SheetMultiProps)
	const cats = $derived(ordered(project.sheetCategories))
	const autoCat = $derived(categoryOf({ viewports: s.viewports }, cats).label)
	function setTag(t: string, on: boolean) {
		const cur = s.tags ?? [], next = on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)
		putSheet(on ? `Tag ${t}` : `Untag ${t}`, { tags: next.length ? next : undefined })
	}
	const putSheet = (label: string, patch: Partial<Sheet>) => project.store.transact(label, (tx) => tx.put({ ...s, ...patch }))
	/** How it draws: its own setting, else the project's old one (as it prints). */
	const look = $derived({ gray: s.gray ?? !!project.settings?.grayFloorplans, byUsage: (s.outletColour ?? project.settings?.outletColour) !== 'layer', channels: (s.cordRoute ?? project.settings?.cordRoute) === 'channels' })
	const putVp = (label: string, patch: Partial<Viewport>) => putSheet(label, { viewports: s.viewports.map((v) => (v.id === vp?.id ? { ...v, ...patch } : v)) })
	const num = (v: string) => Number(v)
	// change notes since the last issue: add one (dated today), edit or remove
	let newText = $state(''), newAsked = $state('')
	$effect(() => { void s.id; newText = ''; newAsked = '' })   // another sheet picked: start empty
	function addChange() {
		if (!newText.trim()) return
		putSheet('Add change note', { changes: [...(s.changes ?? []), { id: newId(), date: today(), text: newText.trim(), ...(newAsked.trim() ? { asked: newAsked.trim() } : {}) }] })
		newText = ''
	}
	const setChange = (id: string, patch: Partial<SheetChange>) => putSheet('Edit change note', { changes: (s.changes ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) })

	// what a viewport can show, as one picker: plan, the four elevations, each server room's racks front / rear, its
	// sections, the riser; on paper: a rack's port grid, a room's patch schedule (a fill section comes from a run's
	// Properties › Fill, a port map from its pane's To sheet…)
	function viewKey(v: Viewport): string {
		const s = v.view.spec
		switch (s.kind) {
			case 'row': return `row:${s.spaceId}:${s.face}${s.rowId ? `:${s.rowId}` : ''}`
			case 'plan': return 'plan'
			case 'riser': return s.hideEmpty ? 'riser:compact' : 'riser'
			case 'section': return `section:${s.sectionId}`
			case 'portmap': return `portmap:${s.deviceIds.join('~')}`
			case 'ports': return `ports:${s.rackId}`
			case 'schedule': return `schedule:${s.spaceId ?? 'all'}`
			case 'fill': return `fill:${s.shapeId}:${s.segId}`
			case 'elevation': return `elev:${s.dir}`
		}
	}
	const rooms = $derived(vp ? project.index.spaces.filter((x) => x.kind === 'server room' && x.levelId === vp.view.levelId) : [])
	const rowsOf = (spaceId: string) => [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === spaceId).sort((a, b) => a.order - b.order)
	/** A room's racks that have patch panels (a port grid of each). */
	const panelRacksOf = (spaceId: string) => racksInOrder(project.index, spaceId).filter((r) => project.index.devices.some((d) => d.rackId === r.id && d.kind === 'panel' && d.portCount > 0))
	/** The devices with ports in a rack, from the top U down (a port grid of one). */
	const portDevicesOf = (rackId: string) => project.index.devices.filter((d): d is Device => d.rackId === rackId && d.portCount > 0).sort((a, b) => b.u + b.heightU - (a.u + a.heightU))
	function specOf(key: string): Viewport['view']['spec'] {
		const [kind, a, b, c] = key.split(':')
		switch (kind) {
			case 'plan': return { kind: 'plan' }
			case 'riser': return { kind: 'riser', ...(a === 'compact' ? { hideEmpty: true } : {}) }
			case 'section': return { kind: 'section', sectionId: a }
			case 'portmap': return { kind: 'portmap', deviceIds: a.split('~') }
			case 'ports': return { kind: 'ports', rackId: a }
			case 'schedule': return { kind: 'schedule', table: 'patch', ...(a === 'all' ? {} : { spaceId: a }) }
			case 'fill': return { kind: 'fill', shapeId: a, segId: b }
			case 'elev': return { kind: 'elevation', dir: a as 'front' }
			default: return { kind: 'row', spaceId: a, face: b as 'front' | 'rear', ...(c ? { rowId: c } : {}) }
		}
	}
	/** Show another view in it: centred on its content; to or from paper (drawn at 1:1) also a scale that fits. */
	function showIn(v: Viewport, label: string, view: Viewport['view']) {
		const next = { ...v, view }
		putVp(label, isPaperSpec(view.spec) || isPaperSpec(v.view.spec) ? { view, ...fitViewport(project.index, next) } : { view, centre: contentCentre(project.index, next) })
	}
	const setView = (v: Viewport, key: string) => showIn(v, 'Viewport view', { ...v.view, spec: specOf(key) })
	function setLevel(v: Viewport, levelId: string) {
		// a room's racks, a section, a rack's ports, a room's schedule and a run's fill belong to their level
		const s = v.view.spec, own = s.kind === 'row' || s.kind === 'section' || s.kind === 'ports' || s.kind === 'fill' || (s.kind === 'schedule' && !!s.spaceId)
		showIn(v, 'Viewport level', { levelId, spec: own ? { kind: 'plan' } : s })
	}
	/** A paper view's own setting (a port grid's device, a schedule's first cord), keeping where it sits. */
	const setSpec = (v: Viewport, label: string, spec: Viewport['view']['spec']) => putVp(label, { view: { ...v.view, spec } })
	/** The picker has no entry for it (a fill section; a port grid of a rack on another level): list it as it is. */
	const offPicker = (v: Viewport) => v.view.spec.kind === 'fill' || (v.view.spec.kind === 'ports' && !rooms.some((r) => panelRacksOf(r.id).some((rk) => viewKey(v) === `ports:${rk.id}`)))
	let busy = $state(false)
	async function pdf() {
		busy = true
		try { const r = await downloadSheetsPdf(project, [s]); ws.say(`PDF: ${r.pages} page${r.pages === 1 ? '' : 's'}${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	async function printRev(code: string) {
		busy = true
		try { const r = await printRevision(project, s, code); ws.say(`${s.number} rev ${code} as issued${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `Print failed: ${(e as Error).message}` }
		finally { busy = false }
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
	<!-- groups (UX review "Properties groups"): View · Window (Delete: the header’s, or the Delete key) -->
	<PropGroup kind="viewport" title="View">
		<label class="row">Level
			<select class="inp" value={vp.view.levelId} onchange={(e) => setLevel(vp, e.currentTarget.value)}>
				{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</label>
		<label class="row">View
			<select class="inp" value={viewKey(vp)} onchange={(e) => setView(vp, e.currentTarget.value)}>
				<option value="plan">Plan</option>
				{#each ['front', 'rear', 'left', 'right'] as d (d)}<option value="elev:{d}">Elevation {d}</option>{/each}
				{#each rooms as r (r.id)}
					{#each ['front', 'rear'] as f (f)}<option value="row:{r.id}:{f}">{r.name} racks {f}</option>{/each}
					<!-- one row of the room's racks (Dave: a sheet of 4AR01 … r6 only) -->
					{#each rowsOf(r.id) as row (row.id)}{#each ['front', 'rear'] as f (f)}<option value="row:{r.id}:{f}:{row.id}">{r.name} · {row.name} racks {f}</option>{/each}{/each}
				{/each}
				{#each sectionsOn(project.index, vp.view.levelId) as sc (sc.id)}<option value="section:{sc.id}">Section {sc.name}</option>{/each}
				<option value="riser">Risers (building)</option>
				<option value="riser:compact">Risers (floors with server rooms)</option>
				{#if vp.view.spec.kind === 'portmap'}<option value={viewKey(vp)}>{portMapTitle(project.index, vp.view.spec.deviceIds)}</option>{/if}
				<!-- paper: drawn at 1:1, from the window's top-left -->
				{#each rooms as r (r.id)}
					{#each panelRacksOf(r.id) as rk (rk.id)}<option value="ports:{rk.id}">{r.name} · {rk.name} port grid</option>{/each}
					<option value="schedule:{r.id}">{r.name} patch schedule</option>
				{/each}
				<option value="schedule:all">Patch schedule (all rooms)</option>
				{#if offPicker(vp)}<option value={viewKey(vp)}>{viewName(project.index, vp.view.spec, vp.view.levelId)}</option>{/if}
			</select>
		</label>
		{#if vp.view.spec.kind === 'ports'}
			{@const ps = vp.view.spec}
			<label class="row" title="All the rack's patch panels (a frame), or one device's ports">Panel
				<select class="inp" value={ps.deviceId ?? ''} onchange={(e) => { const { deviceId: _, ...rest } = ps; setSpec(vp, 'Port grid panel', e.currentTarget.value ? { ...rest, deviceId: e.currentTarget.value } : rest) }}>
					<option value="">All patch panels</option>
					{#each portDevicesOf(ps.rackId) as d (d.id)}<option value={d.id}>{d.name} (U{d.u})</option>{/each}
				</select>
			</label>
		{:else if vp.view.spec.kind === 'schedule'}
			{@const ss = vp.view.spec}
			<label class="row" title="The first cord (#) it shows: a long schedule goes on in another viewport from where this one stops">From cord
				<input class="inp" type="number" min="1" value={ss.start ?? 1} onchange={(e) => { const n = Math.max(1, Math.round(num(e.currentTarget.value)) || 1); const { start: _, ...rest } = ss; setSpec(vp, 'Schedule from cord', n > 1 ? { ...rest, start: n } : rest) }} />
			</label>
		{/if}
		{#if !isPaperSpec(vp.view.spec)}
		<label class="row">Scale 1:
			<span class="flex gap-1">
				<select class="inp" value={SCALES.includes(vp.scale) ? String(vp.scale) : ''} onchange={(e) => e.currentTarget.value && putVp('Viewport scale', { scale: num(e.currentTarget.value) })}>
					{#if !SCALES.includes(vp.scale)}<option value="">custom</option>{/if}
					{#each SCALES as n (n)}<option value={String(n)}>{n}</option>{/each}
				</select>
				<input class="inp w-16" type="number" min="1" value={vp.scale} title="Custom 1:N" onchange={(e) => num(e.currentTarget.value) > 0 && putVp('Viewport scale', { scale: num(e.currentTarget.value) })} />
			</span>
		</label>
		{/if}
		<label class="row">Label <input class="inp" value={vp.label ?? ''} placeholder="(none)" onchange={(e) => putVp('Viewport label', { label: e.currentTarget.value.trim() || undefined })} /></label>
	</PropGroup>
	<PropGroup kind="viewport" title="Window">
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
				<button class="btn" title="Centre on what the view shows, at the largest standard scale (1:N) at which it fits the window" onclick={() => putVp('Fit viewport', fitViewport(project.index, vp))}>Fit</button>
			</span>
		</div>
		<label class="row">Frame <span><input type="checkbox" checked={vp.border !== false} onchange={(e) => putVp('Viewport frame', { border: e.currentTarget.checked ? undefined : false })} /> printed</span></label>
		<label class="row">Locked <span><input type="checkbox" checked={!!vp.locked} onchange={(e) => putVp(e.currentTarget.checked ? 'Lock viewport' : 'Unlock viewport', { locked: e.currentTarget.checked || undefined })} /> can't be moved</span></label>
	</PropGroup>
{:else}
	<!-- groups: General · Paper · Viewports · Issued revisions; the actions below them -->
	<PropGroup kind="sheet" title="General">
		<label class="row">Number <input class="inp font-mono" value={s.number} onchange={(e) => putSheet('Sheet number', { number: e.currentTarget.value.trim() })} /></label>
		<label class="row">Title <input class="inp" value={s.title} onchange={(e) => putSheet('Sheet title', { title: e.currentTarget.value.trim() })} /></label>
		<label class="row" title="Its category in the sheet register (Auto: worked out from its viewports)">Category
			<select class="inp" value={s.kind ?? ''} onchange={(e) => putSheet('Sheet category', { kind: e.currentTarget.value || undefined })}>
				<option value="">Auto ({autoCat})</option>
				{#each cats as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
				{#if s.kind && !cats.some((c) => c.id === s.kind)}<option value={s.kind}>{s.kind}</option>{/if}
			</select></label>
		<label class="row">Discipline <input class="inp" value={s.discipline ?? ''} placeholder="—" onchange={(e) => putSheet('Sheet discipline', { discipline: e.currentTarget.value.trim() || undefined })} /></label>
		<div class="row"><span>Tags</span>
			<span class="tags">
				{#each s.tags ?? [] as t (t)}<span class="tag">{t}<button title="Take this tag off" onclick={() => setTag(t, false)}>×</button></span>{/each}
				<input class="inp tagin" placeholder="+ tag" aria-label="Add a tag" title="Type a tag, Enter adds it" onkeydown={(e) => { const t = e.currentTarget.value.trim(); if (e.key === 'Enter' && t) { setTag(t, true); e.currentTarget.value = '' } }} />
			</span></div>
		<!-- this sheet's own title-block settings; the template is the project's -->
		<label class="row">Drawn <input class="inp" value={s.titleBlock?.fields?.drawn ?? ''} placeholder="initials" onchange={(e) => putSheet('Drawn by', { titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, drawn: e.currentTarget.value.trim() } } })} /></label>
		<!-- the approvals, for templates that show them (Title block template… › add Checked / Approved) -->
		{#each [['checked', 'Checked'], ['approved', 'Approved']] as [k, l] (k)}
			<label class="row">{l} <input class="inp" value={s.titleBlock?.fields?.[k] ?? ''} placeholder="initials" onchange={(e) => putSheet(`${l} by`, { titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, [k]: e.currentTarget.value.trim() } } })} /></label>
		{/each}
		<label class="row">Title block <span><input type="checkbox" checked={!s.titleBlock?.hidden} onchange={(e) => putSheet(e.currentTarget.checked ? 'Show title block' : 'Hide title block', { titleBlock: { ...s.titleBlock, hidden: e.currentTarget.checked ? undefined : true } })} /> on this sheet</span></label>
		<div class="acts"><button class="btn" title="The project's title block (on every sheet): fields, logos, company, sizes" onclick={() => ws.openTitleBlock()}>Title block template…</button></div>
	</PropGroup>
	<PropGroup kind="sheet" title="Paper">
		<label class="row">Size
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
	</PropGroup>
	<!-- how this sheet draws (screen, PDF, issues) — its own, not the plan strip's (that's each user's screen) -->
	<PropGroup kind="sheet" title="Display">
		<label class="row" title="Floorplans on this sheet in black and white, so colored markup stands out">B/W <span><input type="checkbox" checked={look.gray} onchange={(e) => putSheet(e.currentTarget.checked ? 'Sheet floorplans black and white' : 'Sheet floorplans in color', { gray: e.currentTarget.checked })} /> floorplans</span></label>
		<label class="row" title="Outlets in their usage's color (on) or their layer's (off)">Usage colors <span><input type="checkbox" checked={look.byUsage} onchange={(e) => putSheet(e.currentTarget.checked ? 'Sheet outlets in usage colors' : 'Sheet outlets by layer color', { outletColour: e.currentTarget.checked ? 'usage' : 'layer' })} /> outlets</span></label>
		<label class="row" title="Cords in rack views along the cable channels (off = straight lines)">Cord channels <span><input type="checkbox" checked={look.channels} onchange={(e) => putSheet(e.currentTarget.checked ? 'Sheet cords along channels' : 'Sheet cords straight', { cordRoute: e.currentTarget.checked ? 'channels' : 'straight' })} /> in rack views</span></label>
	</PropGroup>
	<PropGroup kind="sheet" title="Viewports">
		<p class="text-zinc-500" title="Click a frame on the paper to pick one; double-click inside to edit in it">{s.viewports.length} viewport{s.viewports.length === 1 ? '' : 's'}</p>
		<div class="acts"><button class="btn" title="A viewport onto the open level's plan; pick it to change its view, scale and window" onclick={addViewport}>Add viewport</button></div>
	</PropGroup>
	<!-- change history (backlog T102): what changed, when and who asked, between issues; issuing moves them onto the
	     new revision ("what changed" defaults to them) -->
	<PropGroup kind="sheet" title={s.revisions?.length ? 'Changes since last issue' : 'Changes'}>
		{#each s.changes ?? [] as c (c.id)}
			<div class="chg"><span class="text-zinc-500">{c.date}</span>
				<input class="inp" value={c.text} placeholder="what changed" onchange={(e) => setChange(c.id, { text: e.currentTarget.value.trim() })} />
				<input class="inp" value={c.asked ?? ''} placeholder="asked by" title="Who asked for it" onchange={(e) => setChange(c.id, { asked: e.currentTarget.value.trim() || undefined })} />
				<button class="btn del" title="Remove this note" onclick={() => putSheet('Remove change note', { changes: (s.changes ?? []).filter((x) => x.id !== c.id) })}>×</button></div>
		{/each}
		<div class="chg"><span class="text-zinc-500">{today()}</span>
			<input class="inp" bind:value={newText} placeholder="what changed" onkeydown={(e) => e.key === 'Enter' && addChange()} />
			<input class="inp" bind:value={newAsked} placeholder="asked by" title="Who asked for it" onkeydown={(e) => e.key === 'Enter' && addChange()} />
			<button class="btn" disabled={!newText.trim()} title="Note this change; the next issue records it on the new revision" onclick={addChange}>Add</button></div>
	</PropGroup>
	{#if s.revisions?.length}
		<!-- each issued revision, printable exactly as it went out (its frozen copy) -->
		<PropGroup kind="sheet" title="Issued revisions">
			{#each [...s.revisions].reverse() as r (r.code)}
				<div class="rev"><span class="font-mono">{r.code}</span><span>{r.date}</span><span class="note" title={[r.desc ?? r.note ?? '', r.by ? `issued by ${r.by}` : '', changeLines(r.changes)].filter(Boolean).join('\n')}>{r.desc ?? r.note ?? ''}</span>
					<button class="btn" disabled={busy} title="Download this sheet as issued at {r.code} (PDF)" onclick={() => printRev(r.code)}>Print</button></div>
			{/each}
		</PropGroup>
	{/if}
	{#if issuedIn.length}
		<!-- every issue that included it (slice 9), newest first: at which revision, new in it or as last issued -->
		<PropGroup kind="sheet" title="Issued in">
			{#each issuedIn as x (x.issue.id)}
				<div class="rev2"><span>{issueTag(x.number)}</span><span>{x.issue.date}</span><span class="note" title={x.issue.name}>{x.issue.name}</span>
					<span class="font-mono" title={x.changed ? 'A new revision in that issue' : 'As last issued'}>{x.rev}{x.changed ? ' new' : ''}</span>
					{#if x.issue.file}<a class="text-blue-600 underline" href={x.issue.file.url} target="_blank" rel="noopener" title="The package PDF as issued">PDF</a>{:else}<span></span>{/if}</div>
			{/each}
		</PropGroup>
	{/if}
	<div class="acts">
		<button class="btn" disabled={busy} title="Download THIS sheet as a PDF at true scale (several sheets: select them in the Sheets tab → PDF)" onclick={pdf}>{busy ? 'Sheet PDF…' : 'Download sheet PDF'}</button>
		<button class="btn" title="A copy with its viewports and notes (no number, no revisions), right after it" onclick={() => ws.select(duplicateSheets(project, [s.id]))}>Duplicate</button>
	</div>
{/if}

<style>
	.tags { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; }
	.tag { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 6px; border-radius: 8px; background: var(--cad-hover); font-size: 11px; }
	.tag button { color: var(--cad-muted); padding: 0 3px; }
	.tag button:hover { color: #dc2626; }
	.tagin { width: 5rem; flex: 1; }
	.win { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
	.win label { display: flex; align-items: center; gap: 3px; color: var(--cad-muted); }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; }
	.rev { display: grid; grid-template-columns: 2.2rem 5.5rem 1fr auto; align-items: center; gap: 4px; }
	.chg { display: grid; grid-template-columns: 4.6rem 1fr 4.5rem auto; align-items: center; gap: 4px; margin-bottom: 2px; }
	.rev2 { display: grid; grid-template-columns: 3.6rem 5rem 1fr auto 1.8rem; align-items: center; gap: 4px; }
	.rev2 .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cad-muted); }
	.rev .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cad-muted); }
</style>
