<!-- The outlets of one level as an editable grid (ADR 0001: tables are first-class editors). Same records as the
     plan: a click selects in both, an edit is one undo step. Renaming an outlet carries the change into its ports
     (the port labels that start with the old outlet label). -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import { TableState, arrowSelect, selectAllRows, copyRows, RowPick, CellEdit, focusCell, noTextPick } from './tableKit.svelte'
	import SortTh from './SortTh.svelte'
	import TableFrame from './TableFrame.svelte'
	import StatusChip from './StatusChip.svelte'
	import type { MenuItem } from './cadMenus'
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import { renameOutlet } from '../domain/ports'
	import { allocate } from '../domain/allocate'
	import { cableSettings } from '../domain/routing'
	import { cordAt } from '../domain/cords'

	let { project, ws, levelId }: { project: CadProject; ws: Workspace; levelId: string } = $props()

	/** "No panel yet": only outlets with a port not on a panel port (e.g. added after install). */
	let unassigned = $state(false)
	/** "no route" (a chip): only outlets with a port that has no route. */
	let noRoute = $state(false)
	/** Sort, filter and scope (UX review T5 / T6): This view = this level · Selection = the selected outlets (any level) · All. */
	const t = new TableState('outlets')
	const all = $derived.by(() => {
		const sel = new Set(ws.selection)
		const base = t.scope === 'all' ? project.index.outlets : t.scope === 'sel' ? project.index.outlets.filter((o) => sel.has(o.id)) : project.index.outlets.filter((o) => o.levelId === levelId)
		return [...base].sort((a, b) => naturalCompare(project.index.nameOf(a.levelId), project.index.nameOf(b.levelId)) || naturalCompare(a.label, b.label))
	})
	const rows = $derived(t.apply(
		(unassigned ? all.filter((o) => o.ports.some((p) => !project.index.linkAt({ on: o.id, port: p.port }))) : all).filter((o) => !noRoute || o.ports.some((p) => routeOf(o, p.port)?.problem)),
		(o) => `${o.label} ${o.usage} ${o.tier} ${o.mount} ${o.ports.map((p) => p.label).join(' ')} ${roomName(o.ports[0]?.serverRoomId)}`,
		{ label: (o) => o.label, usage: (o) => o.usage, tier: (o) => o.tier, mount: (o) => o.mount, room: (o) => roomName(o.ports[0]?.serverRoomId), panel: (o) => panelOf(o, o.ports[0]?.port ?? 1).text,
			length: (o) => routeOf(o, o.ports[0]?.port ?? 1)?.lengthM ?? -1, placed: (o) => (o.at ? 1 : 0) },
	))
	const nSel = $derived(rows.filter((o) => selected.has(o.id)).length)
	/** ↑ / ↓ move the selection; F2 / Enter edit the selected row; Ctrl+C copies the shown rows for Excel (UX review T7). */
	function tableKey(e: KeyboardEvent) {
		if (arrowSelect(e, rows.map((o) => o.id), ws.selection, ws.selectAndReveal) || ed.tableKey(e, ws.selection) || selectAllRows(e, rows.map((o) => o.id), ws.select)) { e.preventDefault(); e.stopPropagation(); return }
		if (copyRows(e, ['Level', 'Label', 'Usage', 'Tier', 'Mount', 'Ports', 'Server room', 'Panel', 'Length (m)'], rows.map((o) => [project.index.nameOf(o.levelId), o.label, o.usage, o.tier, o.mount, o.ports.map((p) => p.label).join(' '), roomName(o.ports[0]?.serverRoomId), o.ports.map((p) => panelOf(o, p.port).text).join(' '), o.ports.map((p) => routeOf(o, p.port)?.lengthM ?? '').join(' ')]), ws.say)) { e.preventDefault(); e.stopPropagation() }
	}
	const usages = $derived(sortedUsages(project.settings))
	const selected = $derived(new Set(ws.selection))
	// an outlet picked on the plan scrolls its row into view (UX10; as the patch list does) — only a new pick scrolls
	const rowEls: Record<string, HTMLTableRowElement> = $state({})
	$effect(() => {
		const want = selected
		untrack(() => { const id = rows.find((r) => want.has(r.id))?.id; if (id) rowEls[id]?.scrollIntoView({ block: 'nearest' }) })
	})
	const roomName = (id?: string) => (id ? project.index.nameOf(id) : '')

	function edit(o: Outlet, label: string, patch: Partial<Outlet>) {
		project.store.transact(label, (tx) => tx.put({ ...o, ...patch }))
	}
	/** The cell shows the new label when (if) the rename is written — a rename that would change printed panel labels
	 *  asks first. */
	function rename(o: Outlet, value: string) {
		const next = value.trim()
		if (!next || next === o.label) return
		project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}
	/** Every port in one server room: the Server room cell is editable (else "mixed": per port in Properties). */
	const oneRoom = (o: Outlet) => o.ports.every((p) => p.serverRoomId === o.ports[0]?.serverRoomId)
	// ── editing in place (tableKit.CellEdit): double-click, or F2 / Enter on the selected row ──
	type Field = 'label' | 'usage' | 'tier' | 'room'
	const ed = new CellEdit<Field>({
		fields: (id) => { const o = project.index.get<Outlet>(id); return o?.type === 'outlet' ? ['label', 'usage', 'tier', ...(oneRoom(o) ? ['room' as const] : [])] : [] },
		ids: () => rows.map((o) => o.id),
		save: (id, field, v) => {
			const o = project.index.get<Outlet>(id)
			if (o?.type !== 'outlet') return
			if (field === 'label') rename(o, v)
			else if (field === 'usage') { if (v !== (o.usage ?? '')) edit(o, 'Usage', { usage: v }) }
			else if (field === 'tier') { if (v !== o.tier) edit(o, 'Tier', { tier: v as Outlet['tier'] }) }
			else if (v !== (o.ports[0]?.serverRoomId ?? '')) setRoom(o, v)
		},
	})
	const usageLabel = (id: string) => usages.find((u) => u.id === id)?.label ?? id
	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room'))
	/** Every port of the outlet to one server room ('' = none). */
	function setRoom(o: Outlet, id: string) {
		edit(o, `${o.label} → ${roomName(id) || 'no server room'}`, { ports: o.ports.map((p) => ({ ...p, serverRoomId: id || undefined })) })
	}
	/** Where each port is cabled: "P3C U37:3" (pinned ◆), or "—"; `patched` = where the cord in that panel port goes
	 *  (User: "indicate which ports of each outlet have been patched") — drawn green. */
	function panelOf(o: Outlet, port: number): { text: string; pinned: boolean; patched?: string } {
		const l = project.index.linkAt({ on: o.id, port })
		const d = l ? project.index.get(l.a.on === o.id ? l.b.on : l.a.on) : undefined
		if (!l || d?.type !== 'device') return { text: '—', pinned: false }
		const pp = l.a.on === o.id ? l.b.port : l.a.port
		const c = cordAt(project.index, { on: d.id, port: pp })
		const patched = c && project.index.portPlace(c.a.on === d.id && c.a.port === pp ? c.b : c.a)
		return { text: `${project.index.nameOf(d.rackId)} U${d.u}:${pp}`, pinned: !!l.pinned, patched }
	}

	// ── cable lengths (Phase 5.2): the project's routes; slack / waste are project settings ──
	const cable = $derived(cableSettings(project.index))
	const routeOf = (o: Outlet, port: number) => { const l = project.index.linkAt({ on: o.id, port }); return l ? project.routes.get(l.id) : undefined }
	const routed = $derived.by(() => {
		const rs = project.index.outlets.filter((o) => o.levelId === levelId).flatMap((o) => o.ports.map((p) => routeOf(o, p.port))).filter((r) => !!r)
		return { n: rs.length, none: rs.filter((r) => r.problem).length, over: rs.filter((r) => r.over90).length }
	})

	// ── allocation (Phase 3.4): preview in the tool bar, apply as one undo step ──
	let issues = $state<string[]>([])
	/** Re-allocate the pinned (hand-placed) links too. */
	let withPinned = $state(false)
	/** The selected outlets — or, `level` (⋯ › … this level), every outlet on the level. */
	function runAllocate(reallocate: boolean, level = false) {
		const ids = level ? [] : ws.selection.filter((id) => project.index.get(id)?.type === 'outlet')
		const scope = ids.length ? { outletIds: ids } : { levelId }
		const r = allocate(project.index, { ...scope, reallocate, includePinned: reallocate && withPinned })
		issues = r.issues.map((i) => i.text)
		const what = ids.length ? `${ids.length} selected outlet(s)` : 'this level'
		const n = r.add.length, left = r.unallocated.length
		if (!n && !r.remove.length) { ws.say(left ? `Nothing to allocate — ${left} port(s) can't be placed (see the list)` : `Everything on ${what} is already allocated`); return }
		const label = `${reallocate ? 'Re-allocate' : 'Allocate'} ${what}`
		const msg = `${label}: ${n} port(s) to panels${r.remove.length ? `, ${r.remove.length} ${withPinned ? '' : 'unpinned '}link(s) replaced` : ''}${left ? ` · ${left} can't be placed` : ''}`
		// asks only when existing links (pinned ones too, with "incl. pinned") would move; filling free ports just happens
		if (r.remove.length) { ws.ask2(`${msg}.`, 'Apply', () => project.applyLinks(label, r.add, r.remove)); return }
		project.applyLinks(label, r.add, r.remove)
		ws.say(`${msg} — Undo brings them back`)
	}
	/** Drag outlets (the selection when the row is in it) onto a panel port in a rack view: assigned from that port —
	 *  "Assign → port…" by drag (backlog "Bulk patching by drag"). */
	function dragOutlets(e: DragEvent, o: Outlet) {
		const ids = selected.has(o.id) ? ws.selection.filter((id) => project.index.get(id)?.type === 'outlet') : [o.id]
		ws.startDrag(() => ws.assignOutlets(ids), () => { ws.assignTool.outlets = [] })
		e.dataTransfer?.setData('application/x-cad-outlets', ids.join(','))
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'link'
		ws.say(`Drop the ${ids.length} outlet(s) on a panel in a rack view: they go on from the port you drop on, or its first free port`)
	}
	function assign() {
		const ids = ws.selection.filter((id) => project.index.get(id)?.type === 'outlet')
		if (!ids.length) { ws.say('Select outlets in the grid (Shift / Ctrl for more), then Assign'); return }
		ws.assignOutlets(ids)
	}
	const selectedOutlets = $derived(ws.selection.filter((id) => project.index.get(id)?.type === 'outlet').length)

	// ── selection (tableKit.RowPick): click = one, Shift = the range from the last clicked (other things selected stay), Ctrl = add / drop one ──
	const rp = new RowPick()
	const pick = (o: Outlet, e: MouseEvent) => rp.pick(o.id, e, rows.map((r) => r.id), ws.selection, ws.selectAndReveal, ws.selection.filter((id) => project.index.get(id)?.type !== 'outlet'))

	// ── find / replace in outlet labels (User: 30F's "A.001" should be "001"): the Renumber panel's Find / replace, on
	// the selected outlets, else the ones shown here ──
	function findReplace() {
		const ids = ws.selection.filter((id) => project.index.get(id)?.type === 'outlet')
		if (!ids.length) ws.select(rows.map((o) => o.id))
		ws.renumberMode = 'replace'
		ws.say(`Find / replace in ${ids.length || rows.length} outlets: Properties (labels or port labels, text or a pattern)`)
	}

	// (the port label format, slack and waste moved to Project › Settings › Lengths & labels — UX review T4)

	/** ⋯: the whole level's allocation, the pinned switch for Re-allocate, Find / replace over the rows shown. */
	const more = $derived<MenuItem[]>([
		{ label: 'Allocate this level', title: 'Cable every unallocated outlet port on this level to a panel of its server room: racks in row order, top U down. Existing links stay.', run: () => runAllocate(false, true) },
		{ label: 'Re-allocate this level…', title: 'Drop the UNPINNED links on this level and allocate again from scratch. Pinned and patched ports stay.', run: () => runAllocate(true, true) },
		{ label: 'Re-allocate pinned links too', checked: withPinned, title: 'Re-allocate the PINNED links too (hand placements, imported ones) — when the outlets changed. Patched panel ports still stay.', run: () => (withPinned = !withPinned) },
		'-',
		{ label: `Find / replace in the ${rows.length} shown…`, disabled: !rows.length, title: 'Find and replace in outlet labels or port labels — plain text or a pattern: Properties › Find / replace', run: () => { ws.select(rows.map((o) => o.id)); findReplace() } },
	])
</script>

<TableFrame label="Outlets" {t} view={project.index.nameOf(levelId) || 'This level'} onkeydown={tableKey} {more}
	count="{rows.length} of {all.length}{nSel ? ` · ${nSel} selected` : ''}" nSel={selectedOutlets}
	hint="Select outlets (click · Shift · Ctrl) to allocate, assign or rename them — or drag them onto a panel · ⋯ for the whole level">
	{#snippet chips()}
		<StatusChip tone="warn" label="No panel yet{unassigned ? ` (${rows.length})` : ''}" upper={false} off={!unassigned} title="Show only the outlets with a port that isn't on a panel port yet (e.g. added after install)" onclick={() => (unassigned = !unassigned)} />
		{#if routed.none}<StatusChip tone="bad" label="{routed.none} no route" upper={false} off={!noRoute} title="Show only the outlets with a port that has no route over the containment" onclick={() => (noRoute = !noRoute)} />{/if}
		{#if routed.n}<span class="muted" title="Cabled ports on this level">{routed.n - routed.none} routed</span>{/if}
		{#if routed.over}<b class="over90">{routed.over} over 90 m</b>{/if}
		{#if issues.length}
			<details class="issues"><summary>{issues.length} allocation issue{issues.length > 1 ? 's' : ''}</summary><ul>{#each issues as t, i (i)}<li>{t}</li>{/each}</ul></details>
		{/if}
	{/snippet}
	{#snippet sel()}
		<button class="tb" title="Cable every unallocated port of the selected outlets to a panel of its server room: racks in row order, top U down. Existing links stay." onclick={() => runAllocate(false)}>Allocate {selectedOutlets}</button>
		<button class="tb" title="Drop the selected outlets’ UNPINNED links and allocate again from scratch. Pinned and patched ports stay (⋯ › Re-allocate pinned links too)." onclick={() => runAllocate(true)}>Re-allocate…</button>
		<button class="tb" title="Put the selected outlets on panel ports by hand: click the first panel port in a rack view (or drag the rows onto it). Hand placements are pinned." onclick={assign}>Assign {selectedOutlets} → port…</button>
		<button class="tb" title="Find and replace in the selected outlets’ labels or port labels — plain text or a pattern: Properties › Find / replace" onclick={findReplace}>Find/replace…</button>
	{/snippet}
	<table class="w-full border-collapse">
		<thead>
			<tr>
				{#if t.scope !== 'view'}<th class="px-2 py-1">Level</th>{/if}
				<SortTh {t} key="label" cls="px-2 py-1">Label</SortTh><SortTh {t} key="usage">Usage</SortTh><SortTh {t} key="tier">Tier</SortTh><SortTh {t} key="mount">Mount</SortTh>
				<th class="px-2">Ports</th><SortTh {t} key="room">Server room</SortTh><SortTh {t} key="panel" title="Where each port is cabled — ◆ = pinned (re-allocation leaves it), green = patched (a cord in that panel port)">Panel (◆ pinned · green patched)</SortTh><SortTh {t} key="length" title="Cable length per port: the route over the drawn containment + {cable.slackM} m slack, rounded up (red = over 90 m, ? = no route) — slack and waste are in Project › Settings › Lengths & labels">Length (+{cable.slackM} m)</SortTh><SortTh {t} key="placed">Placed</SortTh>
			</tr>
		</thead>
		<tbody>
			{#each rows as o (o.id)}
				<!-- Shift / Ctrl on a row selects rows, not the page's text; a row being edited doesn't drag -->
				<tr bind:this={rowEls[o.id]} class="hov" class:row-sel={selected.has(o.id)} draggable={ed.at?.id !== o.id} ondragstart={(e) => dragOutlets(e, o)} ondragend={() => ws.endDrag()} onmousedown={noTextPick} onclick={(e) => pick(o, e)}>
					{#if t.scope !== 'view'}<td class="px-2 muted">{project.index.nameOf(o.levelId)}</td>{/if}
					{#if ed.is(o.id, 'label')}
						<td class="ed"><input class="ed-box font-mono" value={o.label} use:focusCell onkeydown={(e) => ed.key(e, o.id, 'label')} onblur={(e) => ed.blur(o.id, 'label', e.currentTarget.value)} onclick={(e) => e.stopPropagation()} /></td>
					{:else}<td class="px-2 py-0.5 font-mono" title="Double-click (or F2) to rename — its ports follow" ondblclick={(e) => ed.start(o.id, 'label', e)}>{o.label}</td>{/if}
					{#if ed.is(o.id, 'usage')}
						<td class="ed"><select class="ed-box" value={o.usage ?? ''} use:focusCell onkeydown={(e) => ed.key(e, o.id, 'usage')} onblur={(e) => ed.blur(o.id, 'usage', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							<option value="">—</option>
							{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
							{#if o.usage && !usages.some((u) => u.id === o.usage)}<option value={o.usage}>{o.usage}</option>{/if}
						</select></td>
					{:else}<td class="px-2" title="Double-click to set the usage" ondblclick={(e) => ed.start(o.id, 'usage', e)}>{o.usage ? usageLabel(o.usage) : '—'}</td>{/if}
					{#if ed.is(o.id, 'tier')}
						<td class="ed"><select class="ed-box" value={o.tier} use:focusCell onkeydown={(e) => ed.key(e, o.id, 'tier')} onblur={(e) => ed.blur(o.id, 'tier', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							<option value="low">Low</option><option value="high">High</option>
						</select></td>
					{:else}<td class="px-2" title="Double-click to set the tier" ondblclick={(e) => ed.start(o.id, 'tier', e)}>{o.tier === 'high' ? 'High' : 'Low'}</td>{/if}
					<td class="px-2">{o.mount}</td>
					<td class="px-2 font-mono muted">{o.ports.map((p) => p.label).join('  ')}</td>
					{#if ed.is(o.id, 'room')}
						<td class="ed"><select class="ed-box" value={o.ports[0]?.serverRoomId ?? ''} use:focusCell onkeydown={(e) => ed.key(e, o.id, 'room')} onblur={(e) => ed.blur(o.id, 'room', e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
							<option value="">—</option>
							{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}{s.levelId !== levelId ? ` (${project.index.nameOf(s.levelId)})` : ''}</option>{/each}
						</select></td>
					{:else if oneRoom(o)}<td class="px-2" title="Double-click to set the server room of every port" ondblclick={(e) => ed.start(o.id, 'room', e)}>{roomName(o.ports[0]?.serverRoomId) || '—'}</td>
					{:else}<td class="px-2"><span title="Ports go to different server rooms — set them per port in Properties">mixed</span></td>{/if}
					<td class="px-2 font-mono muted">
						{#each o.ports as p (p.port)}{@const at = panelOf(o, p.port)}<span class="pp" class:none={at.text === '—'} class:patched={!!at.patched} title={at.patched ? `Patched to ${at.patched}` : undefined}>{at.text}{at.pinned ? ' ◆' : ''}</span>{/each}
					</td>
					<td class="px-2 font-mono">
						{#each o.ports as p (p.port)}{@const r = routeOf(o, p.port)}<span class="pp" class:none={!r} class:over={r?.over90} class:bad={r?.problem}
							title={!r ? 'Not cabled' : r.problem ? `No route: ${r.problem}` : `${r.handSet ? 'Set by hand' : `Routed ${((r.routeMm ?? 0) / 1000).toFixed(1)} m + ${cable.slackM} m slack`}${r.over90 ? ' — over the 90 m permanent-link limit' : ''}`}>{!r ? '—' : r.problem ? '?' : `${r.lengthM}m`}</span>{/each}
					</td>
					<td class="px-2">{o.at ? '✓' : ''}</td>
				</tr>
			{:else}
				<tr><td colspan="10" class="px-2 py-3 faint">{all.length ? 'No outlets match.' : t.scope === 'sel' ? 'No outlets selected.' : 'No outlets here yet — use the Outlet tool on the plan.'}</td></tr>
			{/each}
		</tbody>
	</table>
</TableFrame>

<style>
	.hov:hover { background: var(--cad-hover); }
	.over90 { color: #dc2626; }
	.issues { position: relative; color: #b45309; }
	.issues summary { cursor: pointer; }
	.issues ul { position: absolute; z-index: 5; max-height: 10rem; overflow: auto; background: var(--cad-pick); border: 1px solid var(--cad-line); border-radius: 4px; padding: 4px 8px; color: var(--cad-text); }
	.pp { margin-right: 10px; white-space: nowrap; }
	.pp.none { color: var(--cad-faint); }
	.pp.patched { color: #16a34a; font-weight: 600; }   /* a cord in that panel port: the rack view's green edge */
	.pp.over, .pp.bad { color: #dc2626; font-weight: 600; }
</style>
