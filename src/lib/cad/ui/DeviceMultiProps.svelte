<!-- Several selected devices: the fields they share ("mixed" where they differ; an edit sets all, one undo step).
     A change that would make any of them overlap or run off its rack is refused with the reason. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Device } from '../domain/types'
	import { placementProblem } from '../domain/devices'

	let { project, ws, devices }: { project: CadProject; ws: Workspace; devices: Device[] } = $props()

	function same<V>(get: (d: Device) => V): V | undefined {
		const v = devices.length ? get(devices[0]) : undefined
		return devices.every((d) => get(d) === v) ? v : undefined
	}
	function set(label: string, patch: (d: Device) => Partial<Device>) {
		const next = devices.map((d) => ({ ...d, ...patch(d) }))
		const others = project.index.devices.filter((d) => !devices.some((x) => x.id === d.id))
		for (const n of next) {
			const rack = project.index.get(n.rackId)
			const problem = rack?.type === 'rack' ? placementProblem(n, rack, [...others, ...next.filter((x) => x.id !== n.id)]) : null
			if (problem) { ws.say(problem); return }
		}
		project.store.transact(`${label} (${devices.length} devices)`, (tx) => { for (const n of next) tx.put(n) })
	}
	const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
	const text = (v: string) => v.trim() || undefined
	/** A typed whole number ≥ min, else nothing changes. */
	const whole = (v: string, min: number) => { const n = Number(v); return v.trim() !== '' && Number.isInteger(n) && n >= min ? n : null }
</script>

<p class="pt-1 font-semibold">{devices.length} devices</p>
<label class="row">Name <input class="inp" value={same((d) => d.name) ?? ''} placeholder="mixed" onchange={(e) => { const t = e.currentTarget.value.trim(); if (t) set('Rename devices', () => ({ name: t })) }} /></label>
<label class="row">Face
	<select class="inp" value={same((d) => d.face) ?? ''} onchange={(e) => set('Device face', () => ({ face: e.currentTarget.value as Device['face'] }))}>
		{#if !same((d) => d.face)}<option value="">mixed</option>{/if}
		{#each ['front', 'rear', 'both', 'none'] as f (f)}<option value={f}>{f}</option>{/each}
	</select>
</label>
<label class="row">Height (U) <input class="inp" type="number" min="1" value={same((d) => d.heightU) ?? ''} placeholder="mixed" onchange={(e) => { const n = whole(e.currentTarget.value, 1); if (n) set('Device height', () => ({ heightU: n })) }} /></label>
<label class="row">Ports <input class="inp" type="number" min="0" value={same((d) => d.portCount) ?? ''} placeholder="mixed" onchange={(e) => { const n = whole(e.currentTarget.value, 0); if (n !== null) set('Port count', () => ({ portCount: n })) }} /></label>
<label class="row">Numbering
	<select class="inp" value={same((d) => d.portNumbering ?? 'row') ?? ''} onchange={(e) => set('Port numbering', () => ({ portNumbering: e.currentTarget.value === 'column' ? 'column' : undefined }))}>
		{#if !same((d) => d.portNumbering ?? 'row')}<option value="">mixed</option>{/if}
		<option value="row">Across (2 beside 1)</option><option value="column">Down (2 under 1)</option>
	</select>
</label>
<label class="row">Width (mm) <input class="inp" type="number" min="10" value={same((d) => d.widthMm) ?? ''} placeholder={same((d) => d.widthMm) === undefined && devices.every((d) => !d.widthMm) ? '19-inch' : 'mixed'} onchange={(e) => set('Device width', () => ({ widthMm: num(e.currentTarget.value) }))} /></label>
<label class="row">Depth (mm) <input class="inp" type="number" min="10" value={same((d) => d.depthMm) ?? ''} placeholder="mixed" onchange={(e) => set('Device depth', () => ({ depthMm: num(e.currentTarget.value) }))} /></label>
<label class="row">Maker <input class="inp" value={same((d) => d.maker ?? '') ?? ''} placeholder={same((d) => d.maker ?? '') === undefined ? 'mixed' : ''} onchange={(e) => set('Device maker', () => ({ maker: text(e.currentTarget.value) }))} /></label>
<label class="row">Model <input class="inp" value={same((d) => d.model ?? '') ?? ''} placeholder={same((d) => d.model ?? '') === undefined ? 'mixed' : ''} onchange={(e) => set('Device model', () => ({ model: text(e.currentTarget.value) }))} /></label>
{#if devices.every((d) => d.kind === 'panel')}
	<label class="row">Tier
		<select class="inp" value={same((d) => d.panel?.tier ?? 'low') ?? ''} onchange={(e) => { const tier = e.currentTarget.value as 'low' | 'high'; set('Panel tier', (d) => ({ panel: { ...d.panel, tier } })) }}>
			{#if !same((d) => d.panel?.tier ?? 'low')}<option value="">mixed</option>{/if}<option value="low">Low</option><option value="high">High</option>
		</select>
	</label>
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
