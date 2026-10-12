<!-- File › Import legacy drawings: pick a FEW legacy drawings of this project — Pages models (their boxes and walls) and
     Sheets-tool sheets — and bring them into cad once, as one undo step. Reading the legacy docs never writes; nothing
     changes until "Import". Items already imported (stamped `importedFrom`) are skipped. -->
<script lang="ts">
	import { backdropClose, dialogFocus } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import type { Id } from '../domain/types'
	import { loadLegacyDrawings } from '../persist/import/legacyDrawings'
	import { planDrawings, importedKeys, levelForName, levelForSheet, type DrawingsSource, type DrawingsChoice } from '../persist/import/drawings'
	import { pagesCounts, pagesKey } from '../persist/import/drawingsPages'
	import type { LegacySheetDoc, LegacyVp } from '../persist/import/drawingsSheets'
	import { fitViewport } from '../views/sheet'

	let { project, onclose, say }: { project: CadProject; onclose: () => void; say: (msg: string) => void } = $props()

	let src = $state.raw<DrawingsSource | null>(null)
	let failed = $state<string | null>(null)
	type ModelPick = { on: boolean; prism: boolean; wall: boolean; levelId: Id | '' }
	let models = $state<Record<string, ModelPick>>({})
	let sheets = $state<Record<string, { on: boolean; levelId: Id | '' }>>({})

	const levels = $derived(project.levels)
	/** What is already in the project from earlier imports. */
	const done = $derived.by(() => { void project.rev; return importedKeys(project.store.all()) })

	$effect(() => {
		loadLegacyDrawings(project.db, project.pid).then((s) => {
			const lv = project.levels
			models = Object.fromEntries(s.models.map((m) => [m.id, { on: false, prism: true, wall: true, levelId: levelForName(m.name, lv) ?? '' }]))
			sheets = Object.fromEntries(s.sheets.map((d) => [d.id, { on: false, levelId: levelForSheet(s, d, lv) ?? '' }]))
			src = s
		}, (e) => { failed = (e as Error).message })
	})

	const modelList = $derived(src ? [...src.models].sort((a, b) => a.name.localeCompare(b.name)).filter((m) => (m.objects ?? []).length) : [])
	const sheetList = $derived(src ? [...src.sheets].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.title ?? '').localeCompare(b.title ?? '')) : [])
	const sheetDone = (d: LegacySheetDoc) => done.has(`sheets:${d.id}`)
	const modelDone = (id: string) => { const m = src?.models.find((x) => x.id === id); return (m?.objects ?? []).filter((o, i) => done.has(pagesKey(id, o, i))).length }

	const choice = $derived<DrawingsChoice>({
		models: Object.entries(models).filter(([, p]) => p.on && p.levelId).map(([id, p]) => ({ id, levelId: p.levelId as Id, prism: p.prism, wall: p.wall })),
		sheets: Object.entries(sheets).filter(([id, p]) => p.on && p.levelId && !done.has(`sheets:${id}`)).map(([id, p]) => ({ id, levelId: p.levelId as Id })),
	})
	const missingLevel = $derived(Object.values(models).some((p) => p.on && !p.levelId) || Object.values(sheets).some((p) => p.on && !p.levelId))
	const fit = (vp: Parameters<typeof fitViewport>[1]) => fitViewport(project.index, vp, { blocks: project.blockOf })
	const preview = $derived(src && (choice.models.length || choice.sheets.length) ? planDrawings(src, choice, project.store.all(), { fit }) : null)
	const nothing = $derived(!preview || (!preview.counts.boxes && !preview.counts.walls && !preview.counts.openings && !preview.counts.sheets))

	function vpSummary(v: LegacyVp): string {
		const s = v.source
		if (s.kind === 'outlets') return `plan (${String(s.outletsDocId ?? '').replace(/^.*_F/, 'F')})`
		if (s.kind === 'model3d') return `${s.direction ?? 'plan'}${s.clip && /^(front|rear|left|right)$/.test(s.direction ?? '') ? ' (a section on its clip box)' : ''} of “${src?.models3d.find((m) => m.id === s.modelId)?.name ?? `model ${s.modelId}`}”`
		return `${s.kind} (not imported)`
	}

	function run() {
		if (!src || missingLevel) return
		// planned again against the project as it is now, so the write matches what's there
		const p = planDrawings(src, choice, project.store.all(), { fit })
		if (!p.entities.length) { say('Nothing new to import'); return }
		const what = [p.counts.boxes && `${p.counts.boxes} boxes`, p.counts.walls && `${p.counts.walls} walls`, p.counts.openings && `${p.counts.openings} openings`, p.counts.sheets && `${p.counts.sheets} sheet${p.counts.sheets > 1 ? 's' : ''}`].filter(Boolean).join(', ')
		project.store.transact(`Import legacy drawings: ${what}`, (tx) => { for (const e of p.entities) tx.put(e) })
		say(`Imported ${what}${p.counts.notes ? ` (${p.counts.notes} notes)` : ''} — Ctrl+Z undoes it`)
		onclose()
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" use:dialogFocus aria-label="Import legacy drawings" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Import legacy drawings</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		{#if failed}
			<p class="pad err">Couldn't read the legacy drawings: {failed}</p>
		{:else if !src}
			<p class="pad">Reading this project's Pages models and Sheets-tool sheets…</p>
		{:else}
			<div class="body">
				<p class="h">Pages models <span class="hint">— their boxes and walls go on the level you pick (opening boxes become openings in the walls); conduits and 2D shapes stay behind</span></p>
				{#if !modelList.length}<p class="hint">No Pages models with 3D objects.</p>{/if}
				<table>
					<tbody>
						{#each modelList as m (m.id)}
							{@const c = pagesCounts(m)}
							{@const p = models[m.id]}
							{@const already = modelDone(m.id)}
							<tr>
								<td><label><input type="checkbox" bind:checked={models[m.id].on} /> <b>{m.name}</b></label>{#if m.kind}<span class="hint"> {m.kind}</span>{/if}</td>
								<td>
									<label class:off={!p.on}><input type="checkbox" bind:checked={models[m.id].prism} disabled={!p.on || !c.prism} /> {c.prism} boxes</label>
									<label class:off={!p.on}><input type="checkbox" bind:checked={models[m.id].wall} disabled={!p.on || !c.wall} /> {c.wall} walls</label>
									<div class="hint">{Object.entries(c.prismLayers).map(([l, k]) => `${l} ${k}`).join(' · ')}{c.conduit || Object.keys(c.shapes).length ? ` — not imported: ${[c.conduit && `${c.conduit} conduits`, ...Object.entries(c.shapes).map(([k, v]) => `${v} ${k}`)].filter(Boolean).join(', ')}` : ''}{already ? ` — ${already} already imported` : ''}</div>
								</td>
								<td>
									<select bind:value={models[m.id].levelId} disabled={!p.on} class:need={p.on && !p.levelId}>
										<option value="">Level…</option>
										{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
									</select>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>

				<p class="h">Sheets-tool sheets <span class="hint">— a cad sheet each: its viewport, and the viewport's annotations as notes tied to it</span></p>
				{#if !sheetList.length}<p class="hint">No Sheets-tool sheets.</p>{/if}
				<table>
					<tbody>
						{#each sheetList as d (d.id)}
							{@const p = sheets[d.id]}
							{@const isDone = sheetDone(d)}
							<tr class:off={isDone}>
								<td><label><input type="checkbox" bind:checked={sheets[d.id].on} disabled={isDone} /> {#if d.drawingNumber}<span class="mono">{d.drawingNumber}</span> {/if}<b>{d.title || d.id}</b></label></td>
								<td class="hint">{isDone ? 'already imported' : (d.viewports ?? []).map((v) => `${vpSummary(v)}, ${(v.annotations ?? []).length} notes`).join(' · ') || 'no viewports'}</td>
								<td>
									<select bind:value={sheets[d.id].levelId} disabled={!p.on || isDone} class:need={p.on && !p.levelId}>
										<option value="">Level…</option>
										{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
									</select>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>

				{#if preview}
					<p class="h">Will import</p>
					<p>{preview.counts.boxes} boxes, {preview.counts.walls} walls{preview.counts.openings ? `, ${preview.counts.openings} openings in them` : ''}{preview.counts.layers.length ? ` (new layers: ${preview.counts.layers.join(', ')})` : ''}; {preview.counts.sheets} sheets with {preview.counts.notes} notes{preview.counts.sections ? ` and ${preview.counts.sections} section${preview.counts.sections > 1 ? 's' : ''} for their elevations` : ''}{preview.counts.already ? `; ${preview.counts.already} already imported, skipped` : ''}.</p>
					{#if preview.notes.length}
						<ul class="notes">{#each preview.notes as t, i (i)}<li>{t}</li>{/each}</ul>
					{/if}
				{/if}
			</div>
			<section class="foot">
				{#if missingLevel}<span class="err">Pick a level for each ticked item</span>{/if}
				<span class="grow"></span>
				<button class="btn" onclick={onclose}>Cancel</button>
				<button class="btn go" disabled={nothing || missingLevel} onclick={run}>Import</button>
			</section>
		{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(60rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.pad { padding: 8px 12px; }
	.body { overflow: auto; padding: 0 12px 12px; }
	.h { font-weight: 600; margin: 10px 0 4px; }
	.hint { color: var(--cad-muted, #71717a); font-weight: normal; }
	.err { color: #dc2626; }
	.off { opacity: 0.55; }
	.mono { font-family: ui-monospace, monospace; }
	table { width: 100%; border-collapse: collapse; }
	td { padding: 3px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	td label { margin-right: 10px; white-space: nowrap; }
	select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	select.need { border-color: #dc2626; }
	.notes { margin: 4px 0 0 16px; list-style: disc; color: var(--cad-muted, #52525b); }
	.foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--cad-line, #e4e4e7); }
	.grow { flex: 1; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
</style>
