<!-- Project settings › USAGES, CABLE TYPES, LENGTHS & LABELS, SHEETS, FILES (Dave 2026-10-05):
     - USAGES (backlog "Editable usage list"): code, label, color; add, delete (refused while outlets or panels use it).
     - CABLE TYPES (backlog "Cable types editor"): label, media, color, outer diameter (fill uses it), the defaults for new
       outlets / cords; add, delete (refused while an outlet port or a cord uses it, or it's a default).
     - LENGTHS & LABELS (UX review T4: they were on the Outlets table's bar, looking like a filter): how port labels
       follow the outlet label (relabel existing ones on request), the cable slack per port and the BOM's waste.
     - SHEETS: sheet categories, and the project's TITLE BLOCK template (UX11: about 25 rows that change every sheet, so
       not under one sheet's Properties). FILES (backlog "Default file storage per project"): where cad's uploads go.
     Every edit is one undo step (sheet categories excepted: they're every project's, Delete only retires one).
     Adding a usage or a cable type takes its code / name first (Enter or + Add): a usage's code is what outlets store
     and can't be renamed, so it's never a placeholder; cable types work the same way, for one habit. -->
<script lang="ts">
	import { enterKey } from './keyGuards'
	import SheetCategoriesTab from './SheetCategoriesTab.svelte'
	import DisciplinesTab from './DisciplinesTab.svelte'
	import ContactsTab from './ContactsTab.svelte'
	import TitleBlockEditor from './TitleBlockEditor.svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { ProjectSettings } from '../domain/types'
	import type { TitleBlockTemplate } from '../domain/titleBlock'
	import { cableTypeUses, cantDelete, newCableTypeId, sortedCableTypes, type CableType } from '../domain/cableTypes'
	import { usageUses, sortedUsages, type Usage } from '../domain/usages'
	import ColorPick from './ColorPick.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { cableSettings, type CableSettings } from '../domain/routing'
	import { PORT_FORMATS, portLabelsFor, reformatPorts, type PortSep } from '../domain/labels'
	import type { FileStorage } from '../app/projectFiles'
	import CordMode from './CordMode.svelte'
	import { DASHES, WEIGHTS } from '../views/display'
	import { defaultSettings } from '../domain/settings'

	let { project, ws, tab }: { project: CadProject; ws: Workspace; tab: 'usages' | 'cables' | 'lengths' | 'drawing' | 'sheets' | 'files' } = $props()

	const st = $derived(project.settings)
	const types = $derived(sortedCableTypes(st))
	const uses = $derived(st ? new Map(types.map((t) => [t.id, cableTypeUses(project.index, st, t.id)])) : new Map())
	const MEDIA: CableType['media'][] = ['copper', 'fibre', 'other']
	const usages = $derived(sortedUsages(st))
	const usageUse = $derived(new Map(usages.map((u) => [u.id, usageUses(project.index.byId.values(), u.id)])))

	function save(label: string, f: (s: ProjectSettings) => ProjectSettings) {
		if (st) project.store.transact(label, (tx) => tx.put(f(st)))
	}
	// a project made before new projects got settings with their first floors (walkthrough 2026-10-14)
	const startDefaults = () => { if (!project.settings) project.store.transact('Default project settings', (tx) => tx.put(defaultSettings())) }
	const setType = (id: string, label: string, patch: Partial<CableType>) =>
		save(label, (s) => ({ ...s, cableTypes: s.cableTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
	let newType = $state('')
	function addType() {
		const label = newType.trim()
		if (!label) return
		if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) { ws.say(`There is a cable type ${label} already`); return }
		const id = newCableTypeId(label, types.map((t) => t.id))
		save(`Add cable type ${label}`, (s) => ({ ...s, cableTypes: [...s.cableTypes, { id, label, media: 'copper', color: '#64748b' }] }))
		newType = ''
	}
	function removeType(t: CableType) {
		save(`Delete cable type ${t.label}`, (s) => ({ ...s, cableTypes: s.cableTypes.filter((x) => x.id !== t.id) }))
		ws.say(`Cable type ${t.label} deleted — Undo brings it back`)
	}
	const setDefault = (k: 'outletCableType' | 'cordCableType', id: string) => save(k === 'outletCableType' ? 'Default outlet cable' : 'Default cord type', (s) => ({ ...s, defaults: { ...s.defaults, [k]: id } }))

	const setUsage = (id: string, label: string, patch: Partial<Usage>) =>
		save(label, (s) => ({ ...s, usages: s.usages.map((u) => (u.id === id ? { ...u, ...patch } : u)) }))
	let newCode = $state('')
	function addUsage() {
		const id = newCode.trim()
		if (!id) return
		if (usages.some((u) => u.id === id)) { ws.say(`There is a usage ${id} already`); return }
		save(`Add usage ${id}`, (s) => ({ ...s, usages: [...s.usages, { id, label: id, color: '#64748b' }] }))
		newCode = ''
	}
	function removeUsage(id: string) {
		save(`Delete usage ${id}`, (s) => ({ ...s, usages: s.usages.filter((u) => u.id !== id) }))
		ws.say(`Usage ${id} deleted — Undo brings it back`)
	}
	const usedText = (u: { outlets: number; panels: number } | undefined) => (u ? [u.outlets && `${u.outlets} outlets`, u.panels && `${u.panels} panels`].filter(Boolean).join(' · ') : '')
	// ── lengths & labels ──
	const cable = $derived(cableSettings(project.index))
	const setCable = (patch: Partial<CableSettings>) => save('Cable settings', (s) => ({ ...s, cable: { ...cable, ...patch } }))
	const fmtKey = $derived(`${st?.portSuffix ?? 'alpha'}|${st?.portSeparator ?? '.'}`)
	function setFormat(key: string) {
		const [style, sep] = key.split('|') as ['alpha' | 'numeric', PortSep]
		save(`Port labels like ${portLabelsFor('201', 1, style, sep)[0]}`, (s) => ({ ...s, portSuffix: style, portSeparator: sep }))
		const edits = project.index.outlets.map((o) => reformatPorts(o, style, sep)).filter((o): o is Outlet => !!o)
		if (edits.length) ws.ask2(`New outlets will be labelled like ${portLabelsFor('201', 1, style, sep)[0]}. Relabel the ports of ${edits.length} existing outlet(s) too? (imported / hand-made labels are left as they are)`, 'Relabel',
			() => project.relabel(`Relabel ports of ${edits.length} outlets`, edits, ws.ask2))
	}
	// ── drawing style: what new shapes start with ──
	const look = $derived(st?.shapeStyle ?? { color: '', dash: '', weightMm: 0 })
	const DASH_NAMES: Record<string, string> = { '': 'Solid (by kind)', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' }
	const setLook = (label: string, patch: Partial<NonNullable<ProjectSettings['shapeStyle']>>) => save(label, (s) => ({ ...s, shapeStyle: { ...look, ...patch } }))
	// ── the title block template ──
	function setTemplate(t: TitleBlockTemplate) {
		const s = project.settings
		if (s) project.store.transact('Title block template', (tx) => tx.put({ ...s, titleBlock: t }))
	}
</script>

{#snippet none()}
	<p class="hint">This project has no settings yet.</p>
	<button class="btn" onclick={startDefaults} title="Usages AP, TV and CCTV; cable types CAT6A, CAT6, OS2 and OM4 — all editable here afterwards">Start with the default settings</button>
{/snippet}

{#if tab === 'sheets'}
	<section>
		<p class="h">Sheet categories</p>
		<SheetCategoriesTab {project} />
	</section>
	<section>
		<p class="h">Disciplines</p>
		<DisciplinesTab {project} />
	</section>
	<section>
		<p class="h">Contacts <span class="hint">— who issues go to (this project)</span></p>
		<ContactsTab {project} />
	</section>
	<section>
		<p class="h">Title block <span class="hint">— the project's, on every sheet</span></p>
		{#if st}
			<div class="tb"><TitleBlockEditor template={st.titleBlock} onchange={setTemplate} files={{ db: project.db, pid: project.pid, storage: st.fileStorage }} /></div>
		{:else}{@render none()}{/if}
	</section>
{:else if !st}
	<div class="p-3">{@render none()}</div>
{:else if tab === 'usages'}
	<table>
		<thead><tr><th title="What outlets and panels store (from the old tools: desk, AP, PR …)">Code</th><th>Label</th><th>Color</th><th>Used by</th><th></th></tr></thead>
		<tbody>
			{#each usages as u (u.id)}
				{@const n = usageUse.get(u.id)}
				{@const used = !!n && (n.outlets > 0 || n.panels > 0)}
				<tr>
					<td class="font-mono">{u.id}</td>
					<td><input class="lbl" value={u.label} onchange={(e) => e.currentTarget.value.trim() && setUsage(u.id, 'Rename usage', { label: e.currentTarget.value.trim() })} /></td>
					<td><ColorPick value={u.color} onchange={(v) => v && setUsage(u.id, 'Usage color', { color: v })} /></td>
					<td class="text-zinc-500">{usedText(n) || '—'}</td>
					<td><button class="del" disabled={used} title={used ? `Can't delete: used by ${usedText(n)}` : 'Delete this usage (Undo brings it back)'} onclick={() => removeUsage(u.id)}>✕</button></td>
				</tr>
			{/each}
		</tbody>
	</table>
	<div class="foot">
		<input class="code" placeholder="New code (e.g. CAM)" title="The code outlets and panels store — it can't be changed later; the label can" bind:value={newCode} onkeydown={(e) => enterKey(e) && addUsage()} />
		<button class="btn" disabled={!newCode.trim()} onclick={addUsage}>+ Add usage</button>
	</div>
	<div class="foot">
		<!-- W11: where a new wall outlet goes (a ceiling one: the level's clear height; a floor box: 0) -->
		<label title="The height a new wall outlet is placed at, above the floor (FFL). Ceiling outlets go at the level's clear height, floor boxes at 0">New wall outlets at
			<input class="mm" type="number" min="0" step="50" value={st.defaults.wallOutletMm ?? 300} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); save('Wall outlet height', (s) => ({ ...s, defaults: { ...s.defaults, wallOutletMm: v } })) }} /> mm</label>
	</div>
{:else if tab === 'lengths'}
	<div class="form">
		<label title="How port labels follow the outlet label: new outlets get it; existing ones can be relabelled">Port labels
			<select value={fmtKey} onchange={(e) => setFormat(e.currentTarget.value)}>
				{#each PORT_FORMATS as f (f.style + f.sep)}<option value="{f.style}|{f.sep}">{portLabelsFor('201', 1, f.style, f.sep)[0]}</option>{/each}
			</select></label>
		<label title="Cable slack at the outlet, added to each routed length (the Length column)">Slack per port
			<span><input class="num" type="number" min="0" step="0.1" value={cable.slackM} onchange={(e) => setCable({ slackM: Math.max(0, Number(e.currentTarget.value) || 0) })} /> m</span></label>
		<label title="Waste added to the cable metres in the BOM">Waste in the BOM
			<span><input class="num" type="number" min="0" step="1" value={cable.wastePct} onchange={(e) => setCable({ wastePct: Math.max(0, Number(e.currentTarget.value) || 0) })} /> %</span></label>
	</div>
{:else if tab === 'drawing'}
	<div class="form">
		<label title="The line color of new lines, boxes, circles and the like. By layer = as now: the color of the layer they land on">Color
			<span><ColorPick value={look.color || undefined} allowByLayer onchange={(v) => setLook('Default shape color', { color: v ?? '' })} /></span></label>
		<label title="The line type of new shapes">Line type
			<select value={look.dash} onchange={(e) => setLook('Default line type', { dash: e.currentTarget.value })}>
				{#each ['', ...DASHES] as d (d)}<option value={d}>{DASH_NAMES[d]}</option>{/each}
			</select></label>
		<label title="The lineweight of new shapes on paper (mm)">Lineweight
			<select value={String(look.weightMm)} onchange={(e) => setLook('Default lineweight', { weightMm: Number(e.currentTarget.value) || 0 })}>
				<option value="0">Default weight</option>
				{#each WEIGHTS as w (w)}<option value={String(w)}>{w} mm</option>{/each}
			</select></label>
		<p class="wide text-zinc-500">What a new line, box, circle, ellipse, polygon or arc starts with. It is set on the shape when you draw it, except for what its layer sets itself (a layer’s own color, line type or lineweight rule). Shapes already drawn don’t change; Properties changes a shape any time.</p>
	</div>
{:else if tab === 'files'}
	<div class="form">
		<label title="Where cad puts the files it uploads: issue PDFs and title-block logos">New uploads go to
			<select value={st.fileStorage ?? 'uploadthing'} onchange={(e) => { const v = e.currentTarget.value as FileStorage; save(v === 'firebase' ? 'Uploads to Firebase Storage' : 'Uploads to UploadThing', (s) => ({ ...s, fileStorage: v })) }}>
				<option value="uploadthing">UploadThing</option><option value="firebase">Firebase Storage</option>
			</select></label>
		<p class="wide text-zinc-500">Issue PDFs and title-block logos, for everyone on this project. Files already uploaded stay where they are; Uploads lists both kinds.</p>
	</div>
{:else}
	<table>
		<thead><tr><th>Label</th><th>Media</th><th>Color</th><th title="A multi-core cable (a 24-core fibre): Link to… puts this many cores in each cable, and fill, the BOM and the cable schedule count the cable once. Blank = one">Cores</th><th title="Outer diameter — run fill uses it">Ø (mm)</th><th>Used by</th><th></th></tr></thead>
		<tbody>
			{#each types as t (t.id)}
				{@const u = uses.get(t.id)}
				{@const why = u ? cantDelete(u) : null}
				<tr>
					<td><input class="lbl" value={t.label} onchange={(e) => e.currentTarget.value.trim() && setType(t.id, 'Rename cable type', { label: e.currentTarget.value.trim() })} /></td>
					<td><select value={t.media} onchange={(e) => setType(t.id, 'Cable media', { media: e.currentTarget.value as CableType['media'] })}>{#each MEDIA as m (m)}<option value={m}>{m}</option>{/each}</select></td>
					<td><ColorPick value={t.color} onchange={(v) => v && setType(t.id, 'Cable color', { color: v })} /></td>
					<td><input class="num" type="number" min="1" step="1" value={t.cores ?? ''} placeholder="1" onchange={(e) => { const v = Math.floor(Number(e.currentTarget.value)); setType(t.id, 'Cable cores', { cores: v > 1 ? v : undefined }) }} /></td>
					<td><input class="num" type="number" min="1" step="0.1" value={t.diameterMm ?? ''} placeholder="—" onchange={(e) => { const v = Number(e.currentTarget.value); setType(t.id, 'Cable diameter', { diameterMm: v > 0 ? v : undefined }) }} /></td>
					<td class="text-zinc-500">{u ? [u.ports && `${u.ports} ports`, u.links && `${u.links} links`, u.cords && `${u.cords} cords`].filter(Boolean).join(' · ') || '—' : ''}</td>
					<td><button class="del" disabled={!!why} title={why ? `Can't delete: ${why}` : 'Delete this type (Undo brings it back)'} onclick={() => removeType(t)}>✕</button></td>
				</tr>
			{/each}
		</tbody>
	</table>
	<div class="foot">
		<input class="code" placeholder="New type (e.g. Cat6A)" bind:value={newType} onkeydown={(e) => enterKey(e) && addType()} />
		<button class="btn" disabled={!newType.trim()} onclick={addType}>+ Add type</button>
	</div>
	<div class="foot">
		<label>New outlets <select value={st.defaults.outletCableType} onchange={(e) => setDefault('outletCableType', e.currentTarget.value)}>{#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select></label>
		<label>New cords <select value={st.defaults.cordCableType} onchange={(e) => setDefault('cordCableType', e.currentTarget.value)}>{#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select></label>
		<span title="What new cords start as: ADD (planning a new install) or INSTALLED (surveying a built site)">start as <CordMode {project} /></span>
	</div>
{/if}

<style>
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	.h { font-weight: 600; margin: 0; }
	.hint { color: var(--cad-muted, #71717a); font-weight: 400; }
	.tb { max-width: 30rem; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); padding: 4px 8px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	td { padding: 2px 8px; border-bottom: 1px solid var(--cad-line, #f4f4f5); }
	input, select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 4px; background: var(--cad-input, white); color: inherit; }
	input.lbl { width: 10rem; }
	input.num { width: 4.5rem; }
	input.code { width: 10rem; font-family: ui-monospace, monospace; }
	input.mm { width: 5rem; margin: 0 2px; }
	.del { color: var(--cad-muted, #71717a); padding: 0 4px; }
	.del:hover:not(:disabled) { color: #b91c1c; }
	.del:disabled { opacity: 0.3; }
	.form { display: grid; grid-template-columns: 9rem auto; gap: 8px 12px; align-items: center; padding: 12px; }
	.form label { display: contents; }
	.form .wide { grid-column: 1 / -1; margin: 0; }
	.foot { display: flex; gap: 12px; align-items: center; padding: 8px 12px; }
	.foot + .foot { padding-top: 0; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:disabled { opacity: 0.4; }
</style>
