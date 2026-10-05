<!-- The project's SETTINGS (Dave 2026-10-05), two tabs:
     - USAGES (backlog "Editable usage list"): code, label, color; add, delete (refused while outlets or panels use it).
     - CABLE TYPES (backlog "Cable types editor"): label, media, color, outer diameter (fill uses it), the defaults for new
       outlets / cords; add, delete (refused while an outlet port or a cord uses it, or it's a default).
     Every edit is one undo step. -->
<script lang="ts">
	import { backdropClose } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import type { ProjectSettings } from '../domain/types'
	import { cableTypeUses, cantDelete, newCableTypeId, sortedCableTypes, type CableType } from '../domain/cableTypes'
	import { usageUses, sortedUsages, type Usage } from '../domain/usages'
	import ColorPick from './ColorPick.svelte'

	let { project, onclose, tab = $bindable('usages') }: { project: CadProject; onclose: () => void; tab?: 'usages' | 'cables' } = $props()

	const st = $derived(project.settings)
	const types = $derived(sortedCableTypes(st))
	const uses = $derived(st ? new Map(types.map((t) => [t.id, cableTypeUses(project.index, st, t.id)])) : new Map())
	const MEDIA: CableType['media'][] = ['copper', 'fibre', 'other']
	const usages = $derived(sortedUsages(st))
	const usageUse = $derived(new Map(usages.map((u) => [u.id, usageUses(project.index.byId.values(), u.id)])))

	function save(label: string, f: (s: ProjectSettings) => ProjectSettings) {
		if (st) project.store.transact(label, (tx) => tx.put(f(st)))
	}
	const setType = (id: string, label: string, patch: Partial<CableType>) =>
		save(label, (s) => ({ ...s, cableTypes: s.cableTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
	function addType() {
		const label = 'New cable', id = newCableTypeId(label, types.map((t) => t.id))
		save('Add cable type', (s) => ({ ...s, cableTypes: [...s.cableTypes, { id, label, media: 'copper', color: '#64748b' }] }))
	}
	const removeType = (id: string) => save('Delete cable type', (s) => ({ ...s, cableTypes: s.cableTypes.filter((t) => t.id !== id) }))
	const setDefault = (k: 'outletCableType' | 'cordCableType', id: string) => save(k === 'outletCableType' ? 'Default outlet cable' : 'Default cord type', (s) => ({ ...s, defaults: { ...s.defaults, [k]: id } }))

	const setUsage = (id: string, label: string, patch: Partial<Usage>) =>
		save(label, (s) => ({ ...s, usages: s.usages.map((u) => (u.id === id ? { ...u, ...patch } : u)) }))
	let newCode = $state('')
	function addUsage() {
		const id = newCode.trim()
		if (!id) return
		if (usages.some((u) => u.id === id)) { newCode = ''; return }
		save(`Add usage ${id}`, (s) => ({ ...s, usages: [...s.usages, { id, label: id, color: '#64748b' }] }))
		newCode = ''
	}
	const removeUsage = (id: string) => save(`Delete usage ${id}`, (s) => ({ ...s, usages: s.usages.filter((u) => u.id !== id) }))
	const usedText = (u: { outlets: number; panels: number } | undefined) => (u ? [u.outlets && `${u.outlets} outlets`, u.panels && `${u.panels} panels`].filter(Boolean).join(' · ') : '')
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" aria-label="Settings" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head">
			<span class="tabs">
				<b>Settings</b>
				<button class:on={tab === 'usages'} onclick={() => (tab = 'usages')}>Usages</button>
				<button class:on={tab === 'cables'} onclick={() => (tab = 'cables')}>Cable types</button>
			</span>
			<button class="x" title="Close (Esc)" onclick={onclose}>✕</button>
		</div>
		{#if !st}
			<p class="p-3 text-zinc-500">This project has no settings yet.</p>
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
				<input class="code" placeholder="New code (e.g. CAM)" bind:value={newCode} onkeydown={(e) => e.key === 'Enter' && addUsage()} />
				<button class="btn" disabled={!newCode.trim()} onclick={addUsage}>+ Add usage</button>
			</div>
		{:else}
			<table>
				<thead><tr><th>Label</th><th>Media</th><th>Color</th><th title="Outer diameter — run fill uses it">Ø (mm)</th><th>Used by</th><th></th></tr></thead>
				<tbody>
					{#each types as t (t.id)}
						{@const u = uses.get(t.id)}
						{@const why = u ? cantDelete(u) : null}
						<tr>
							<td><input class="lbl" value={t.label} onchange={(e) => e.currentTarget.value.trim() && setType(t.id, 'Rename cable type', { label: e.currentTarget.value.trim() })} /></td>
							<td><select value={t.media} onchange={(e) => setType(t.id, 'Cable media', { media: e.currentTarget.value as CableType['media'] })}>{#each MEDIA as m (m)}<option value={m}>{m}</option>{/each}</select></td>
							<td><ColorPick value={t.color} onchange={(v) => v && setType(t.id, 'Cable color', { color: v })} /></td>
							<td><input class="num" type="number" min="1" step="0.1" value={t.diameterMm ?? ''} placeholder="—" onchange={(e) => { const v = Number(e.currentTarget.value); setType(t.id, 'Cable diameter', { diameterMm: v > 0 ? v : undefined }) }} /></td>
							<td class="text-zinc-500">{u ? [u.ports && `${u.ports} ports`, u.cords && `${u.cords} cords`].filter(Boolean).join(' · ') || '—' : ''}</td>
							<td><button class="del" disabled={!!why} title={why ? `Can't delete: ${why}` : 'Delete this type (Undo brings it back)'} onclick={() => removeType(t.id)}>✕</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="foot">
				<button class="btn" onclick={addType}>+ Add type</button>
				<label>New outlets <select value={st.defaults.outletCableType} onchange={(e) => setDefault('outletCableType', e.currentTarget.value)}>{#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select></label>
				<label>New cords <select value={st.defaults.cordCableType} onchange={(e) => setDefault('cordCableType', e.currentTarget.value)}>{#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select></label>
			</div>
		{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(40rem, 96vw); max-height: 84vh; overflow: auto; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.tabs { display: flex; align-items: center; gap: 6px; }
	.tabs b { margin-right: 6px; }
	.tabs button { padding: 0 8px; border-radius: 4px; color: var(--cad-muted, #71717a); }
	.tabs button.on { background: #2563eb; color: white; }
	.x { color: var(--cad-muted, #71717a); }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); padding: 4px 8px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	td { padding: 2px 8px; border-bottom: 1px solid var(--cad-line, #f4f4f5); }
	input, select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 4px; background: var(--cad-input, white); color: inherit; }
	input.lbl { width: 10rem; }
	input.num { width: 4.5rem; }
	input.code { width: 10rem; font-family: ui-monospace, monospace; }
	.del { color: var(--cad-muted, #71717a); padding: 0 4px; }
	.del:hover:not(:disabled) { color: #b91c1c; }
	.del:disabled { opacity: 0.3; }
	.foot { display: flex; gap: 12px; align-items: center; padding: 8px 12px; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:disabled { opacity: 0.4; }
</style>
