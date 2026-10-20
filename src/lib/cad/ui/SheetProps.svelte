<!-- A sheet (Phase 4.1): its number, title and paper; or, with a viewport picked on it, that viewport — what it shows
     (level + plan / elevation / a room's racks / a section / the riser, or paper: a rack's port grid, a room's patch
     schedule, a fill section), scale 1:N, window position and size, centre, label, frame, lock. Every
     edit is one undo step. -->
<script lang="ts">
	import { enterKey } from './keyGuards'
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
	import { printRevision, lastIssued, frozenNow } from '../app/issue'
	import PropGroup from './PropGroup.svelte'
	import ChangesSection from './ChangesSection.svelte'
	import Field from './fields/Field.svelte'
	import { duplicateSheets, sheetsForEach } from '../app/sheetActions'
	import { issuesOfSheet, issueTag, changeLines, primChanges, nextMinor } from '../domain/issue'
	import { issueStatesOf } from '../app/issueStates.svelte'
	import type { Issue, SheetChange } from '../domain/drawing'
	import { ordered, categoryOf } from '../domain/sheetCategories'
	import { drawnFallback } from '../domain/titleBlock'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Sheet } = $props()

	// Show changes (W23): what is new / changed since the last issue (orange) and what has gone (red dashed), drawn over
	// the sheet on screen until switched off
	const showingChanges = $derived(ws.sheetChanges?.sheetId === s.id)
	let loadingChanges = $state(false)
	async function toggleChanges() {
		if (showingChanges) { ws.sheetChanges = null; return }
		loadingChanges = true
		try {
			const r = await lastIssued(project, s)
			if (!r) return
			ws.sheetChanges = { sheetId: s.id, rev: r.rev, issued: r.prims }
			const c = primChanges(r.prims, frozenNow(project, s))
			const pics = c.floorplans ? ' — its floorplans differ too (a new file or placement)' : ''
			const moved = c.moved ? ` · ${c.moved} more only moved with their viewport (not marked)` : ''
			ws.say(c.added.length || c.gone.length
				? `Since ${r.rev}: ${c.added.length} mark${c.added.length === 1 ? '' : 's'} new or changed (orange), ${c.gone.length} gone (red dashed)${moved}${pics} · on screen only`
				: `Nothing drawn on this sheet has changed since ${r.rev}${moved}${pics}`)
		} catch (e) { ws.say(`Could not load the released copy: ${(e as Error).message}`) }
		finally { loadingChanges = false }
	}

	const vp = $derived(ws.vpMore.length ? undefined : s.viewports.find((v) => v.id === ws.viewportId))
	/** Several picked (Ctrl-click, a window on the paper): the group below, not one viewport's rows. */
	const many = $derived(ws.vpMore.length ? s.viewports.filter((v) => ws.pickedViewports.includes(v.id)) : [])
	const issuedIn = $derived(issuesOfSheet(project.index.ofType('issue'), s.id))
	const levels = $derived(project.levels)
	// category / discipline / tags, as several sheets have them (SheetMultiProps)
	const cats = $derived(ordered(project.sheetCategories))
	const autoCat = $derived(categoryOf({ viewports: s.viewports }, cats).label)
	function setTag(t: string, on: boolean) {
		const cur = s.tags ?? [], next = on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)
		putSheet(on ? `Tag ${t}` : `Untag ${t}`, { tags: next.length ? next : undefined })
	}
	const putSheet = (label: string, patch: Partial<Sheet>) => project.store.transact(label, (tx) => tx.put({ ...s, ...patch }))
	// changed since its last release (worked out while this shows): Bump version… is offered
	$effect(() => { if (s.revisions?.length) return issueStatesOf(project).want() })
	const changedSince = $derived(!!s.revisions?.length && issueStatesOf(project).of(s) === 'changed')
	/** How it draws: its own setting, else the project's old one (as it prints). */
	const look = $derived({ gray: s.gray ?? !!project.settings?.grayFloorplans, byUsage: (s.outletColour ?? project.settings?.outletColour) !== 'layer', channels: (s.cordRoute ?? project.settings?.cordRoute) === 'channels' })
	const putVp = (label: string, patch: Partial<Viewport>) => putSheet(label, { viewports: s.viewports.map((v) => (v.id === vp?.id ? { ...v, ...patch } : v)) })
	const num = (v: string) => Number(v)
	/** A cleared number box keeps the value (it isn't 0): put it back and say nothing changed (Q40). */
	const blank = (e: Event & { currentTarget: HTMLInputElement }, was: number) => { if (e.currentTarget.value.trim()) return false; e.currentTarget.value = String(was); return true }
	// change notes typed before the design log: edit or remove (new ones are log changes: ChangesSection)
	const setChange = (id: string, patch: Partial<SheetChange>) => putSheet('Edit change note', { changes: (s.changes ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) })

	// what a viewport can show, as one picker: plan, the four elevations, each server room's racks front / rear, its
	// sections, the riser; on paper: a rack's port grid, a room's patch schedule (a fill section comes from a run's
	// Properties › Fill, a port map from its pane's To sheet…)
	// Each choice carries its view: the select's value is its key, which is only compared, never read back (hacky-code
	// review: the key was split on ':' to rebuild the view)
	type ViewChoice = { key: string; label: string; spec: Viewport['view']['spec'] }
	function viewKey(s: Viewport['view']['spec']): string {
		switch (s.kind) {
			case 'row': return `row:${s.spaceId}:${s.face}${s.rowId ? `:${s.rowId}` : ''}`
			case 'plan': return 'plan'
			case 'riser': return `${s.hideEmpty ? 'riser:compact' : 'riser'}${s.buildingId ? `:${s.buildingId}` : ''}`
			case 'section': return `section:${s.sectionId}`
			case 'portmap': return `portmap:${s.deviceIds.join('~')}`
			case 'ports': return `ports:${s.rackId}`
			case 'schedule': return `schedule:${s.spaceId ?? 'all'}`
			case 'fill': return `fill:${s.shapeId}:${s.segId}`
			case 'elevation': return `elev:${s.dir}`
		}
	}
	const rooms = $derived(vp ? project.index.spaces.filter((x) => x.kind === 'server room' && x.levelId === vp.view.levelId) : [])
	const rowsOf = (spaceId: string) => project.index.ofType('rackRow').filter((e) => e.spaceId === spaceId).sort((a, b) => a.order - b.order)
	/** A room's racks that have patch panels (a port grid of each). */
	const panelRacksOf = (spaceId: string) => racksInOrder(project.index, spaceId).filter((r) => project.index.devices.some((d) => d.rackId === r.id && d.kind === 'panel' && d.portCount > 0))
	/** The devices with ports in a rack, from the top U down (a port grid of one). */
	const portDevicesOf = (rackId: string) => project.index.devices.filter((d): d is Device => d.rackId === rackId && d.portCount > 0).sort((a, b) => b.u + b.heightU - (a.u + a.heightU))
	const viewChoices = $derived.by((): ViewChoice[] => {
		if (!vp) return []
		const out: ViewChoice[] = [], add = (spec: ViewChoice['spec'], label: string) => out.push({ key: viewKey(spec), label, spec })
		add({ kind: 'plan' }, 'Plan')
		for (const dir of ['front', 'rear', 'left', 'right'] as const) add({ kind: 'elevation', dir }, `Elevation ${dir}`)
		for (const r of rooms) {
			for (const face of ['front', 'rear'] as const) add({ kind: 'row', spaceId: r.id, face }, `${r.name} racks ${face}`)
			// one row of the room's racks (User: a sheet of 4AR01 … r6 only)
			for (const row of rowsOf(r.id)) for (const face of ['front', 'rear'] as const) add({ kind: 'row', spaceId: r.id, face, rowId: row.id }, `${r.name} · ${row.name} racks ${face}`)
		}
		for (const sc of sectionsOn(project.index, vp.view.levelId)) add({ kind: 'section', sectionId: sc.id }, `Section ${sc.name}`)
		// the risers of the viewport's level's building (User 2026-10-21: picking one dropped the building)
		const lv = project.index.getOf('level', vp.view.levelId), bid = lv?.type === 'level' && project.index.getOf('building', lv.buildingId) ? lv.buildingId : undefined
		add({ kind: 'riser', ...(bid ? { buildingId: bid } : {}) }, 'Risers (building)')
		add({ kind: 'riser', hideEmpty: true, ...(bid ? { buildingId: bid } : {}) }, 'Risers (floors with server rooms)')
		const cur = vp.view.spec
		if (cur.kind === 'portmap') add(cur, portMapTitle(project.index, cur.deviceIds))
		// paper: drawn at 1:1, from the window's top-left
		for (const r of rooms) {
			for (const rk of panelRacksOf(r.id)) add({ kind: 'ports', rackId: rk.id }, `${r.name} · ${rk.name} port grid`)
			add({ kind: 'schedule', table: 'patch', spaceId: r.id }, `${r.name} patch schedule`)
		}
		add({ kind: 'schedule', table: 'patch' }, 'Patch schedule (all rooms)')
		// a view the picker has no entry for (a fill section; a port grid of a rack on another level): listed as it is
		if (!out.some((c) => c.key === viewKey(cur))) add(cur, viewName(project.index, cur, vp.view.levelId))
		return out
	})
	/** Show another view in it: centred on its content; to or from paper (drawn at 1:1) also a scale that fits. */
	function showIn(v: Viewport, label: string, view: Viewport['view']) {
		const next = { ...v, view }
		putVp(label, isPaperSpec(view.spec) || isPaperSpec(v.view.spec) ? { view, ...fitViewport(project.index, next) } : { view, centre: contentCentre(project.index, next) })
	}
	const setView = (v: Viewport, key: string) => { const c = viewChoices.find((x) => x.key === key); if (c) showIn(v, 'Viewport view', { ...v.view, spec: c.spec }) }
	function setLevel(v: Viewport, levelId: string) {
		// a room's racks, a section, a rack's ports, a room's schedule and a run's fill belong to their level
		const s = v.view.spec, own = s.kind === 'row' || s.kind === 'section' || s.kind === 'ports' || s.kind === 'fill' || (s.kind === 'schedule' && !!s.spaceId)
		showIn(v, 'Viewport level', { levelId, spec: own ? { kind: 'plan' } : s })
	}
	/** A paper view's own setting (a port grid's device, a schedule's first cord), keeping where it sits. */
	const setSpec = (v: Viewport, label: string, spec: Viewport['view']['spec']) => putVp(label, { view: { ...v.view, spec } })
	/** The view a viewport shows, in its own tab (the chip's “Open view”, from the list too). */
	const openSource = (v: Viewport) => ws.openInTab({ levelId: v.view.levelId, spec: $state.snapshot(v.view.spec) })
	/** W19: copies of this sheet for each other floor / server room; they're selected, and the status says how many. */
	function forEach(kind: 'level' | 'room') {
		const ids = sheetsForEach(project, s.id, kind)
		if (!ids.length) { ws.say(`Every other ${kind === 'level' ? 'floor' : 'server room'} already has a sheet from ${s.number || s.title}`); return }
		ws.select(ids)
		ws.say(`${ids.length} sheet${ids.length === 1 ? '' : 's'} made from ${s.number || s.title} — check each one's title and viewports (Undo takes them all out)`)
	}
	let busy = $state(false)
	async function pdf() {
		busy = true
		try { const r = await downloadSheetsPdf(project, [s], ws.monoPdf); if (r) ws.say(`PDF: ${r.pages} page${r.pages === 1 ? '' : 's'}${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	async function printRev(code: string) {
		busy = true
		try { const r = await printRevision(project, s, code); if (r) ws.say(`${s.number} rev ${code} as released${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `Print failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	function addViewport() {
		const lv = ws.levelId ?? levels[0]?.id
		if (!lv) return
		const v = defaultViewport(project.index, s, lv, newId(), project.sheetBase)
		putSheet('Add viewport', { viewports: [...s.viewports, v] })
		ws.selectViewport(v.id)
	}
</script>

{#snippet vpList()}
		<!-- the list: click a row to pick that viewport (Ctrl-click: add it); the arrow opens its source view in a tab -->
		{#each s.viewports as v (v.id)}
			<div class="vrow" class:on={ws.pickedViewports.includes(v.id)}>
				<button class="pick" title="Pick this viewport (Ctrl-click: add it to the pick)" onclick={(e) => ws.selectViewport(v.id, e.ctrlKey || e.metaKey)}>
					<span class="no font-mono">{v.number ?? '·'}</span><span class="nm">{v.label || viewName(project.index, v.view.spec, v.view.levelId)}</span>{#if !isPaperSpec(v.view.spec)}<span class="sc">1:{v.scale}</span>{/if}
				</button>
				<button class="btn" title="Open source view: this viewport's view in its own tab" aria-label="Open the source view of {v.label || viewName(project.index, v.view.spec, v.view.levelId)}" onclick={() => openSource(v)}>Open</button>
			</div>
		{/each}
{/snippet}

{#if many.length}
	<PropGroup kind="viewport" title="Viewports picked">
		<p class="text-zinc-500">{many.length} viewports picked. Drag one to move them all, Ctrl-drag to leave copies, arrow keys nudge them; Ctrl+C / X / V, Ctrl+D copy, cut, paste and duplicate them with their views and tied notes; Delete removes them. Click one frame (or a row in the list) to work on it alone.</p>
		{@render vpList()}
	</PropGroup>
{:else if vp}
	<!-- groups (UX review "Properties groups"): View · Window (Delete: the header’s, or the Delete key) -->
	<PropGroup kind="viewport" title="View">
		<label class="row">Level
			<select class="inp" value={vp.view.levelId} onchange={(e) => setLevel(vp, e.currentTarget.value)}>
				{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</label>
		<label class="row">View
			<select class="inp" value={viewKey(vp.view.spec)} onchange={(e) => setView(vp, e.currentTarget.value)}>
				{#each viewChoices as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
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
			<label class="row" title="A long schedule goes on in another viewport from where the one before it stops — it follows when that one grows or shrinks">Continue from
				<select class="inp" value={ss.after ?? ''} onchange={(e) => { const { after: _, ...rest } = ss; setSpec(vp, 'Schedule continues', e.currentTarget.value ? { ...rest, after: e.currentTarget.value } : rest) }}>
					<option value="">(a cord number)</option>
					{#each s.viewports.filter((o) => o.id !== vp.id && o.view.spec.kind === 'schedule' && o.view.spec.spaceId === ss.spaceId) as o (o.id)}<option value={o.id}>{o.label ?? 'Patch schedule'} @ {Math.round(o.rect.x)},{Math.round(o.rect.y)}</option>{/each}
				</select>
			</label>
			{#if !ss.after}
			<label class="row" title="The first cord (#) it shows">From cord
				<input class="inp" type="number" min="1" value={ss.start ?? 1} onchange={(e) => { const n = Math.max(1, Math.round(num(e.currentTarget.value)) || 1); const { start: _, ...rest } = ss; setSpec(vp, 'Schedule from cord', n > 1 ? { ...rest, start: n } : rest) }} />
			</label>
			{/if}
		{/if}
		{#if !isPaperSpec(vp.view.spec)}
		<label class="row">Scale 1:
			<span class="flex gap-1">
				<select class="inp" value={SCALES.includes(vp.scale) ? String(vp.scale) : ''} onchange={(e) => e.currentTarget.value && putVp('Viewport scale', { scale: num(e.currentTarget.value) })}>
					{#if !SCALES.includes(vp.scale)}<option value="">custom</option>{/if}
					{#each SCALES as n (n)}<option value={String(n)}>{n}</option>{/each}
				</select>
				<input class="inp w-16" type="number" min="1" value={vp.scale} title="Custom 1:N" aria-label="Custom scale 1:N" onchange={(e) => num(e.currentTarget.value) > 0 && putVp('Viewport scale', { scale: num(e.currentTarget.value) })} />
			</span>
		</label>
		{/if}
		<label class="row">Label <input class="inp" value={vp.label ?? ''} placeholder="(none)" onchange={(e) => putVp('Viewport label', { label: e.currentTarget.value.trim() || undefined })} /></label>
		<label class="row" title="Shown in a small circle at the window's top-left (blank: none)">Number <input class="inp w-16" value={vp.number ?? ''} placeholder="(none)" onchange={(e) => putVp('Viewport number', { number: e.currentTarget.value.trim() || undefined })} /></label>
		<div class="acts"><button class="btn" title="Open this viewport's view (the model view it shows) in its own tab" onclick={() => openSource(vp)}>Open source view</button></div>
	</PropGroup>
	<PropGroup kind="viewport" title="Window">
		<Field label="Window" unit="mm">
			<span class="win">
				{#each ['x', 'y', 'w', 'h'] as const as k (k)}
					<label>{k.toUpperCase()} <input class="inp" type="number" value={Math.round(vp.rect[k])} onchange={(e) => !blank(e, Math.round(vp.rect[k])) && putVp('Viewport window', { rect: { ...vp.rect, [k]: Math.max(k === 'w' || k === 'h' ? 10 : -1e6, num(e.currentTarget.value)) } })} /></label>
				{/each}
			</span>
		</Field>
		<Field label="Centre">
			<span class="flex gap-1">
				<input class="inp" type="number" title="X (view mm)" aria-label="Centre X (view mm)" value={Math.round(vp.centre.x)} onchange={(e) => !blank(e, Math.round(vp.centre.x)) && putVp('Viewport centre', { centre: { ...vp.centre, x: num(e.currentTarget.value) } })} />
				<input class="inp" type="number" title="Y (view mm)" aria-label="Centre Y (view mm)" value={Math.round(vp.centre.y)} onchange={(e) => !blank(e, Math.round(vp.centre.y)) && putVp('Viewport centre', { centre: { ...vp.centre, y: num(e.currentTarget.value) } })} />
				<button class="btn" title="Centre on what the view shows, at the largest standard scale (1:N) at which it fits the window" onclick={() => putVp('Fit viewport', fitViewport(project.index, vp))}>Fit</button>
			</span>
		</Field>
		<label class="row">Frame <span><input type="checkbox" checked={vp.border !== false} onchange={(e) => putVp('Viewport frame', { border: e.currentTarget.checked ? undefined : false })} /> printed</span></label>
		<label class="row">Locked <span><input type="checkbox" checked={!!vp.locked} onchange={(e) => putVp(e.currentTarget.checked ? 'Lock viewport' : 'Unlock viewport', { locked: e.currentTarget.checked || undefined })} /> can't be moved</span></label>
	</PropGroup>
	<PropGroup kind="viewport" title="Viewports on this sheet">{@render vpList()}</PropGroup>
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
		<!-- picked from the global list (Settings › Sheets › Disciplines); a value not on it shows, flagged, until changed -->
		{@const off = !!s.discipline && !project.disciplines.includes(s.discipline)}
		<label class="row" title={off ? `“${s.discipline}” isn't on the discipline list (Settings › Sheets) — pick one, or add it there` : 'Picked from the discipline list (Settings › Sheets)'}>Discipline
			<select class="inp" class:flag={off} value={s.discipline ?? ''} onchange={(e) => putSheet('Sheet discipline', { discipline: e.currentTarget.value || undefined })}>
				<option value="">—</option>
				{#each project.disciplines as d (d)}<option value={d}>{d}</option>{/each}
				{#if off}<option value={s.discipline}>{s.discipline} (not on the list)</option>{/if}
			</select></label>
		<Field label="Tags">
			<span class="tags">
				{#each s.tags ?? [] as t (t)}<span class="tag">{t}<button title="Take this tag off" aria-label="Take the tag {t} off" onclick={() => setTag(t, false)}>×</button></span>{/each}
				<input class="inp tagin" placeholder="+ tag" aria-label="Add a tag" title="Type a tag, Enter adds it" onkeydown={(e) => { const t = e.currentTarget.value.trim(); if (enterKey(e) && t) { setTag(t, true); e.currentTarget.value = '' } }} />
			</span></Field>
		<!-- this sheet's own title-block settings; the template is the project's -->
		<label class="row">Drawn <input class="inp" value={s.titleBlock?.fields?.drawn ?? ''} placeholder={drawnFallback(project.details?.author, s.revisions?.at(-1)?.by) || 'initials'} title="Blank: the Project details’ author, else who released it last" onchange={(e) => putSheet('Drawn by', { titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, drawn: e.currentTarget.value.trim() } } })} /></label>
		<!-- the approvals, for templates that show them (Title block template… › add Checked / Approved) -->
		{#each [['checked', 'Checked'], ['approved', 'Approved']] as [k, l] (k)}
			<label class="row">{l} <input class="inp" value={s.titleBlock?.fields?.[k] ?? ''} placeholder="initials" onchange={(e) => putSheet(`${l} by`, { titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, [k]: e.currentTarget.value.trim() } } })} /></label>
		{/each}
		<label class="row">Title block <span><input type="checkbox" checked={!s.titleBlock?.hidden} onchange={(e) => putSheet(e.currentTarget.checked ? 'Show title block' : 'Hide title block', { titleBlock: { ...s.titleBlock, hidden: e.currentTarget.checked ? undefined : true } })} /> on this sheet</span></label>
		<div class="acts"><button class="btn" title="The project's title block (on every sheet): fields, logos, company, sizes" onclick={() => ws.openTitleBlock()}>Title block template…</button>
			<!-- Round 7 (User 2026-10-16): Release was only in the Sheets table's bar and the Drawings menu -->
			<button class="btn" title="Release this sheet: the Sheets table opens with the release form for it (name, purpose, revision, what changed, BOM / schedules) — Ctrl-click more rows there to release them together" onclick={() => ws.releaseSheets()}>Release…</button>
			<!-- design log step 3: a small update after its submittal -->
			{#if changedSince}<button class="btn" title="Release it at its next version ({s.revisions?.at(-1)?.code} → {nextMinor(s.revisions?.at(-1)?.code)}): a small update after its submittal — its clouds stay, change numbers carry on" onclick={() => ws.bumpVersion([s.id])}>Bump version…</button>{/if}</div>
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
		{@render vpList()}
		<div class="acts"><button class="btn" title="A viewport onto the open level's plan; pick it to change its view, scale and window" onclick={addViewport}>Add viewport</button></div>
	</PropGroup>
	<!-- change history (backlog T102): what changed, when and who asked, between issues; issuing moves them onto the
	     new revision ("what changed" defaults to them) -->
	<!-- the design log's changes linked to this sheet, not yet released on it (they go onto its next revision) -->
	<ChangesSection {project} {ws} ids={[s.id]} sheet={s} kind="sheet" />
	{#if s.changes?.length}
	<!-- notes typed before the design log: kept, still editable, released with the others -->
	<PropGroup kind="sheet" title="Earlier notes">
		{#each s.changes ?? [] as c (c.id)}
			<div class="chg"><span class="text-zinc-500">{c.date}</span>
				<input class="inp" value={c.text} placeholder="what changed" aria-label="Change of {c.date}: what changed" onchange={(e) => setChange(c.id, { text: e.currentTarget.value.trim() })} />
				<input class="inp" value={c.asked ?? ''} placeholder="asked by" title="Who asked for it" aria-label="Change of {c.date}: asked by" onchange={(e) => setChange(c.id, { asked: e.currentTarget.value.trim() || undefined })} />
				<button class="btn del" title="Remove this note" aria-label="Remove the change note of {c.date}" onclick={() => putSheet('Remove change note', { changes: (s.changes ?? []).filter((x) => x.id !== c.id) })}>×</button></div>
		{/each}
	</PropGroup>
	{/if}
	{#if s.revisions?.length}
		<!-- each issued revision, printable exactly as it went out (its frozen copy) -->
		<PropGroup kind="sheet" title="Released revisions">
			<div class="acts"><button class="btn" class:on={showingChanges} disabled={loadingChanges} title="Draw over the sheet what is new or changed since its last release (orange) and what has gone (red dashed) — kept up to date as you edit, on screen only, never printed" onclick={toggleChanges}>{loadingChanges ? 'Loading…' : showingChanges ? 'Hide changes' : `Show changes since ${s.revisions.at(-1)?.code}`}</button></div>
			{#each [...s.revisions].reverse() as r (r.code)}
				<div class="rev"><span class="font-mono">{r.code}</span><span>{r.date}</span><span class="note" title={[r.desc ?? r.note ?? '', r.by ? `released by ${r.by}` : '', changeLines(r.changes)].filter(Boolean).join('\n')}>{r.desc ?? r.note ?? ''}</span>
					<button class="btn" disabled={busy} title="Download this sheet as released at {r.code} (PDF)" onclick={() => printRev(r.code)}>Print</button></div>
			{/each}
		</PropGroup>
	{/if}
	{#if issuedIn.length}
		<!-- every issue that included it (slice 9), newest first: at which revision, new in it or as last issued -->
		<PropGroup kind="sheet" title="Released in">
			{#each issuedIn as x (x.issue.id)}
				<div class="rev2"><span>{issueTag(x.number)}</span><span>{x.issue.date}</span><span class="note" title={x.issue.name}>{x.issue.name}</span>
					<span class="font-mono" title={x.changed ? 'A new revision in that release' : 'As last released'}>{x.rev}{x.changed ? ' new' : ''}</span>
					{#if x.issue.file}<a class="text-blue-600 underline" href={x.issue.file.url} target="_blank" rel="noopener" title="The package PDF as released">PDF</a>{:else}<span></span>{/if}</div>
			{/each}
		</PropGroup>
	{/if}
	<div class="acts">
		<button class="btn" disabled={busy} title="Download THIS sheet as a PDF at true scale (several sheets: select them in the Sheets tab → PDF)" onclick={pdf}>{busy ? 'Sheet PDF…' : 'Download sheet PDF'}</button>
		<button class="btn" title="A copy with its viewports and notes (no number, no revisions), right after it" onclick={() => ws.select(duplicateSheets(project, [s.id]))}>Duplicate</button>
		<!-- W19: this sheet as a template, one copy per other floor / server room -->
		<select class="btn" value="" title="This sheet as a template: a copy for every other floor (or server room) that has none from it yet — its viewports show that floor / room, titled and numbered on from this one (one Undo)" onchange={(e) => { const k = e.currentTarget.value as 'level' | 'room' | ''; e.currentTarget.value = ''; if (k) forEach(k) }}>
			<option value="">A copy for each…</option>
			<option value="level">other floor</option>
			{#if s.viewports.some((v) => (v.view.spec as { spaceId?: string }).spaceId)}<option value="room">other server room</option>{/if}
		</select>
	</div>
{/if}

<style>
	.flag { outline: 1px solid #f59e0b; }
	.tags { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; }
	.tag { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 6px; border-radius: 8px; background: var(--cad-hover); font-size: 11px; }
	.tag button { color: var(--cad-muted); padding: 0 3px; }
	.tag button:hover { color: #dc2626; }
	.tagin { width: 5rem; flex: 1; }
	.vrow { display: grid; grid-template-columns: 1fr auto; gap: 4px; align-items: center; border-radius: 4px; }
	.vrow.on { background: var(--cad-sel, #dbeafe); }
	.vrow .pick { display: grid; grid-template-columns: 1.6rem 1fr auto; gap: 4px; text-align: left; align-items: center; min-width: 0; padding: 1px 2px; }
	.vrow .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.vrow .sc { color: var(--cad-muted); }
	.win { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
	.win label { display: flex; align-items: center; gap: 3px; color: var(--cad-muted); }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; }
	.btn.on { border-color: #ea580c; color: #c2410c; }   /* Show changes is on */
	.rev { display: grid; grid-template-columns: 2.2rem 5.5rem 1fr auto; align-items: center; gap: 4px; }
	.chg { display: grid; grid-template-columns: 4.6rem 1fr 4.5rem auto; align-items: center; gap: 4px; margin-bottom: 2px; }
	.rev2 { display: grid; grid-template-columns: 3.6rem 5rem 1fr auto 1.8rem; align-items: center; gap: 4px; }
	.rev2 .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cad-muted); }
	.rev .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cad-muted); }
</style>
