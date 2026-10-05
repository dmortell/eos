<!-- The outlets of one level as an editable grid (ADR 0001: tables are first-class editors). Same records as the
     plan: a click selects in both, an edit is one undo step. Renaming an outlet carries the change into its ports
     (the port labels that start with the old outlet label). -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import { renameOutlet } from '../domain/ports'
	import { allocate } from '../domain/allocate'
	import { cableSettings, type CableSettings } from '../domain/routing'
	import { PORT_FORMATS, portLabelsFor, reformatPorts, type PortSep } from '../domain/labels'

	let { project, ws, levelId }: { project: CadProject; ws: Workspace; levelId: string } = $props()

	/** "No panel yet": only outlets with a port not on a panel port (e.g. added after install). */
	let unassigned = $state(false)
	const all = $derived(project.index.outlets.filter((o) => o.levelId === levelId).sort((a, b) => naturalCompare(a.label, b.label)))
	const rows = $derived(unassigned ? all.filter((o) => o.ports.some((p) => !project.index.linkAt({ on: o.id, port: p.port }))) : all)
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
	/** The input goes back to the stored label at once; it shows the new one when (if) the rename is written — a
	 *  rename that would change printed panel labels asks first. */
	function rename(o: Outlet, input: HTMLInputElement) {
		const next = input.value.trim()
		input.value = o.label
		if (!next || next === o.label) return
		project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}
	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room'))
	/** Every port of the outlet to one server room ('' = none). */
	function setRoom(o: Outlet, id: string) {
		edit(o, `${o.label} → ${roomName(id) || 'no server room'}`, { ports: o.ports.map((p) => ({ ...p, serverRoomId: id || undefined })) })
	}
	/** Where each port is cabled: "P3C U37:3" (pinned ◆), or "—". */
	function panelOf(o: Outlet, port: number): { text: string; pinned: boolean } {
		const l = project.index.linkAt({ on: o.id, port })
		const d = l ? project.index.get(l.a.on === o.id ? l.b.on : l.a.on) : undefined
		if (!l || d?.type !== 'device') return { text: '—', pinned: false }
		const pp = l.a.on === o.id ? l.b.port : l.a.port
		return { text: `${project.index.nameOf(d.rackId)} U${d.u}:${pp}`, pinned: !!l.pinned }
	}

	// ── cable lengths (Phase 5.2): the project's routes; slack / waste are project settings ──
	const cable = $derived(cableSettings(project.index))
	const routeOf = (o: Outlet, port: number) => { const l = project.index.linkAt({ on: o.id, port }); return l ? project.routes.get(l.id) : undefined }
	function setCable(patch: Partial<CableSettings>) {
		const s = project.settings
		if (!s) return
		project.store.transact('Cable settings', (tx) => tx.put({ ...s, cable: { ...cable, ...patch } }))
	}
	const routed = $derived.by(() => {
		const rs = project.index.outlets.filter((o) => o.levelId === levelId).flatMap((o) => o.ports.map((p) => routeOf(o, p.port))).filter((r) => !!r)
		return { n: rs.length, none: rs.filter((r) => r.problem).length, over: rs.filter((r) => r.over90).length }
	})

	// ── allocation (Phase 3.4): preview in the tool bar, apply as one undo step ──
	let issues = $state<string[]>([])
	function runAllocate(reallocate: boolean) {
		const ids = ws.selection.filter((id) => project.index.get(id)?.type === 'outlet')
		const scope = ids.length ? { outletIds: ids } : { levelId }
		const r = allocate(project.index, { ...scope, reallocate })
		issues = r.issues.map((i) => i.text)
		const what = ids.length ? `${ids.length} selected outlet(s)` : 'this level'
		const n = r.add.length, left = r.unallocated.length
		if (!n && !r.remove.length) { ws.say(left ? `Nothing to allocate — ${left} port(s) can't be placed (see the list)` : `Everything on ${what} is already allocated`); return }
		const msg = `${reallocate ? 'Re-allocate' : 'Allocate'} ${what}: ${n} port(s) to panels${r.remove.length ? `, ${r.remove.length} unpinned link(s) replaced` : ''}${left ? ` · ${left} can't be placed` : ''}.`
		ws.ask2(msg, 'Apply', () => project.applyLinks(`${reallocate ? 'Re-allocate' : 'Allocate'} ${what}`, r.add, r.remove))
	}
	function assign() {
		const ids = ws.selection.filter((id) => project.index.get(id)?.type === 'outlet')
		if (!ids.length) { ws.say('Select outlets in the grid (Shift / Ctrl for more), then Assign'); return }
		ws.assignOutlets(ids)
	}
	const selectedOutlets = $derived(ws.selection.filter((id) => project.index.get(id)?.type === 'outlet').length)

	// ── selection: click = one, Shift-click = the range from the last clicked, Ctrl-click = add / drop one ──
	let anchor: string | null = null
	function pick(o: Outlet, e: MouseEvent) {
		const others = ws.selection.filter((id) => project.index.get(id)?.type !== 'outlet')
		if (e.shiftKey && anchor) {
			const i = rows.findIndex((r) => r.id === anchor), j = rows.findIndex((r) => r.id === o.id)
			if (i >= 0 && j >= 0) { ws.select([...(e.ctrlKey ? ws.selection : others), ...rows.slice(Math.min(i, j), Math.max(i, j) + 1).map((r) => r.id)]); return }
		}
		anchor = o.id
		if (e.ctrlKey || e.metaKey) ws.select(selected.has(o.id) ? ws.selection.filter((x) => x !== o.id) : [...ws.selection, o.id])
		else ws.select([o.id])
	}

	// ── find / replace in outlet labels (Dave: 30F's "A.001" should be "001") ──
	function findReplace() {
		const ids = new Set(ws.selection.filter((id) => project.index.get(id)?.type === 'outlet'))
		const scope = ids.size ? rows.filter((o) => ids.has(o.id)) : rows
		ws.askText(`Find in ${ids.size ? `${ids.size} selected` : 'this level’s'} outlet labels`, '', (find) => {
			if (!find) return
			const hits = scope.filter((o) => o.label.includes(find))
			if (!hits.length) { ws.say(`No outlet label contains "${find}"`); return }
			ws.askText(`Replace "${find}" (${hits.length} outlets) with`, '', (repl) => {
				const taken = new Set(project.index.outlets.filter((o) => o.levelId === levelId && !hits.includes(o)).map((o) => o.label))
				const edits = hits.map((o) => renameOutlet(o, o.label.replace(find, repl)))
				const clash = edits.find((o) => taken.has(o.label) || !o.label.trim())
				if (clash) { ws.say(`"${clash.label || '(empty)'}" would clash or be empty — nothing changed`); return }
				project.relabel(`Labels: "${find}" → "${repl}" (${edits.length})`, edits, ws.ask2)
			})
		})
	}

	// ── port label format (project setting) ──
	const fmtKey = $derived(`${project.settings?.portSuffix ?? 'alpha'}|${project.settings?.portSeparator ?? '.'}`)
	function setFormat(key: string) {
		const s = project.settings
		if (!s) return
		const [style, sep] = key.split('|') as ['alpha' | 'numeric', PortSep]
		project.store.transact(`Port labels like ${portLabelsFor('201', 1, style, sep)[0]}`, (tx) => tx.put({ ...s, portSuffix: style, portSeparator: sep }))
		const edits = project.index.outlets.map((o) => reformatPorts(o, style, sep)).filter((o): o is Outlet => !!o)
		if (edits.length) ws.ask2(`New outlets will be labelled like ${portLabelsFor('201', 1, style, sep)[0]}. Relabel the ports of ${edits.length} existing outlet(s) too? (imported / hand-made labels are left as they are)`, 'Relabel',
			() => project.relabel(`Relabel ports of ${edits.length} outlets`, edits, ws.ask2))
	}
</script>

<div class="h-full overflow-auto text-xs">
	<div class="actions">
		<span class="font-semibold text-zinc-600">Outlets</span>
		<button title="Cable every unallocated outlet port (of the selected outlets, else this level) to a panel of its server room: racks in row order, top U down. Existing links stay." onclick={() => runAllocate(false)}>Allocate{selectedOutlets ? ` ${selectedOutlets}` : ''}</button>
		<button title="Drop the UNPINNED links (of the selection, else this level) and allocate again from scratch. Pinned and patched ports stay." onclick={() => runAllocate(true)}>Re-allocate…</button>
		<button title="Put the selected outlets on panel ports by hand: choose outlets here, then click the first panel port in a rack view. Hand placements are pinned." onclick={assign}>Assign {selectedOutlets || ''} → port…</button>
		<button title="Find and replace text in outlet labels (the selected outlets, else this level); their ports follow" onclick={findReplace}>Find/replace…</button>
		<label class="fmt" title="Only outlets with a port that isn't on a panel port yet (e.g. added after install)"><input type="checkbox" bind:checked={unassigned} /> No panel yet{unassigned ? ` (${rows.length})` : ''}</label>
		<label class="fmt" title="How port labels follow the outlet label (new outlets; existing ones can be relabelled)">Port labels
			<select value={fmtKey} onchange={(e) => setFormat(e.currentTarget.value)}>
				{#each PORT_FORMATS as f (f.style + f.sep)}<option value="{f.style}|{f.sep}">{portLabelsFor('201', 1, f.style, f.sep)[0]}</option>{/each}
			</select>
		</label>
		<label class="fmt" title="Cable slack at the outlet, added to each routed length">Slack <input class="num" type="number" min="0" step="0.1" value={cable.slackM} onchange={(e) => setCable({ slackM: Math.max(0, Number(e.currentTarget.value) || 0) })} /> m</label>
		<label class="fmt" title="Waste added to the cable metres in the BOM">Waste <input class="num" type="number" min="0" step="1" value={cable.wastePct} onchange={(e) => setCable({ wastePct: Math.max(0, Number(e.currentTarget.value) || 0) })} /> %</label>
		{#if routed.n}<span class="text-zinc-500" title="Cabled ports on this level">{routed.n - routed.none} routed{routed.none ? ` · ` : ''}{#if routed.none}<b class="text-red-600">{routed.none} no route</b>{/if}{#if routed.over} · <b class="text-red-600">{routed.over} over 90 m</b>{/if}</span>{/if}
		{#if issues.length}
			<details class="issues"><summary>{issues.length} allocation issue{issues.length > 1 ? 's' : ''}</summary><ul>{#each issues as t, i (i)}<li>{t}</li>{/each}</ul></details>
		{/if}
	</div>
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr>
				<th class="px-2 py-1">Label</th><th class="px-2">Usage</th><th class="px-2">Tier</th><th class="px-2">Mount</th>
				<th class="px-2">Ports</th><th class="px-2">Server room</th><th class="px-2">Panel (◆ pinned)</th><th class="px-2" title="Cable length per port: the route over the drawn containment + slack, rounded up (red = over 90 m, ? = no route)">Length</th><th class="px-2">Placed</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as o (o.id)}
				<!-- Shift / Ctrl on a row selects rows, not the page's text -->
				<tr bind:this={rowEls[o.id]} class="hov border-b border-zinc-100" class:row-sel={selected.has(o.id)} onmousedown={(e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault() }} onclick={(e) => pick(o, e)}>
					<td class="px-2 py-0.5">
						<input class="w-28 rounded border border-transparent bg-transparent px-1 font-mono hover:border-zinc-300 focus:border-blue-400"
							value={o.label} onchange={(e) => rename(o, e.currentTarget)} onclick={(e) => e.stopPropagation()} />
					</td>
					<td class="px-2">
						<select class="bg-transparent" value={o.usage} onchange={(e) => edit(o, 'Usage', { usage: e.currentTarget.value })} onclick={(e) => e.stopPropagation()}>
							{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
							{#if !usages.some((u) => u.id === o.usage)}<option value={o.usage}>{o.usage}</option>{/if}
						</select>
					</td>
					<td class="px-2">
						<select class="bg-transparent" value={o.tier} onchange={(e) => edit(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })} onclick={(e) => e.stopPropagation()}>
							<option value="low">Low</option><option value="high">High</option>
						</select>
					</td>
					<td class="px-2">{o.mount}</td>
					<td class="px-2 font-mono text-zinc-600">{o.ports.map((p) => p.label).join('  ')}</td>
					<td class="px-2">
						{#if o.ports.every((p) => p.serverRoomId === o.ports[0]?.serverRoomId)}
							<select class="bg-transparent" value={o.ports[0]?.serverRoomId ?? ''} onchange={(e) => setRoom(o, e.currentTarget.value)} onclick={(e) => e.stopPropagation()}>
								<option value="">—</option>
								{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}{s.levelId !== levelId ? ` (${project.index.nameOf(s.levelId)})` : ''}</option>{/each}
							</select>
						{:else}<span title="Ports go to different server rooms — set them per port in Properties">mixed</span>{/if}
					</td>
					<td class="px-2 font-mono text-zinc-600">
						{#each o.ports as p (p.port)}{@const at = panelOf(o, p.port)}<span class="pp" class:none={at.text === '—'}>{at.text}{at.pinned ? ' ◆' : ''}</span>{/each}
					</td>
					<td class="px-2 font-mono">
						{#each o.ports as p (p.port)}{@const r = routeOf(o, p.port)}<span class="pp" class:none={!r} class:over={r?.over90} class:bad={r?.problem}
							title={!r ? 'Not cabled' : r.problem ? `No route: ${r.problem}` : `${r.handSet ? 'Set by hand' : `Routed ${((r.routeMm ?? 0) / 1000).toFixed(1)} m + ${cable.slackM} m slack`}${r.over90 ? ' — over the 90 m permanent-link limit' : ''}`}>{!r ? '—' : r.problem ? '?' : `${r.lengthM}m`}</span>{/each}
					</td>
					<td class="px-2">{o.at ? '✓' : ''}</td>
				</tr>
			{:else}
				<tr><td colspan="9" class="px-2 py-3 text-zinc-400">No outlets on this level yet — use the Outlet tool on the plan.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.hov:hover { background: var(--cad-hover); }
	.actions { position: sticky; left: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.actions button { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.actions button:hover { background: var(--cad-hover); }
	.issues { color: #b45309; }
	.issues summary { cursor: pointer; }
	.issues ul { position: absolute; z-index: 5; max-height: 10rem; overflow: auto; background: var(--cad-pick); border: 1px solid var(--cad-line); border-radius: 4px; padding: 4px 8px; color: var(--cad-text); }
	.pp { margin-right: 10px; white-space: nowrap; }
	.fmt { display: inline-flex; gap: 4px; align-items: center; color: var(--cad-muted); }
	.fmt select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; font-family: ui-monospace, monospace; background: var(--cad-input); color: var(--cad-text); }
	.pp.none { color: var(--cad-faint); }
	.pp.over, .pp.bad { color: #dc2626; font-weight: 600; }
	.num { width: 3.5rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 3px; background: var(--cad-input); color: var(--cad-text); }
</style>
