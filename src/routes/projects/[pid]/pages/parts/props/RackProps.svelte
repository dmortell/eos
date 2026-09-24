<script lang="ts">
	// Properties › a RACK or a DEVICE of a rack-row model (G4): a rack's height in U and "+ Device" (1 U at the
	// lowest free slot); a device's U position / height / mounting face / ports / type. U edits move the box
	// (1 U = 45 mm above the rack's 40 mm rail — store/racksImport.ts), a face edit moves it to that face.
	import { num } from './fields'
	import { newId } from '../../ids'
	import { toast } from 'svelte-sonner'
	import { RU_MM, rackHeightMm, uToZ, freeU, DEVICE_W, DEVICE_COLORS } from '../../store/racksImport'
	import type { Obj, Model } from '../../3dview/types'
	import type { OutletRef } from '../../store/allocate'
	import AllocateDialog from '../AllocateDialog.svelte'

	let { obj, model = null, onupdate, onadd, outletsFor, allocated = new Map() }: {
		obj: Obj; model?: Model | null
		onupdate?: (patch: Record<string, unknown>) => void
		onadd?: (o: Obj) => void
		/** E8: the outlets a rack row's panels can serve, and every allocated outlet → where. */
		outletsFor?: (rackModelId: string) => (OutletRef & { modelName: string })[]
		allocated?: Map<string, string>
	} = $props()
	let allocOpen = $state(false)
	const rackOf = $derived(obj.device ? model?.objects.find((o) => o.id === obj.device!.rackId) ?? null : null)
	const maxU = $derived(rackOf?.rack?.u ?? 99)

	function setRackU(u: number) {
		if (obj.type !== 'prism' || !obj.rack || !(u >= 1)) return
		// never shorter than its highest mounted device (it would hang above the rack)
		const top = Math.max(0, ...(model?.objects ?? []).filter((o) => o.device?.rackId === obj.id).map((o) => o.device!.u + o.device!.hU - 1))
		if (u < top) toast(`A device reaches U${top} — the rack stays ${top}U`)
		const nu = Math.max(u, top)
		onupdate?.({ rack: { ...obj.rack, u: nu }, h: rackHeightMm(nu) })
	}
	function addDevice() {
		if (obj.type !== 'prism' || !obj.rack || !obj.id || !model) return
		const u = freeU(model.objects, obj.id, obj.rack.u, 1); if (u == null) { toast('This rack is full'); return }
		const w = Math.min(obj.w, DEVICE_W), d = Math.min(obj.d, obj.d - 100)
		onadd?.({ type: 'prism', id: newId('dv'), layer: 'devices', edges: 4, x: obj.x + (obj.w - w) / 2, y: obj.y, z: uToZ(obj.z, u), w, d, h: RU_MM,
			label: 'Device', color: DEVICE_COLORS.other, device: { rackId: obj.id, u, hU: 1, mount: 'both', kind: 'other' } } as Obj)
	}
	function setDevice(patch: Partial<NonNullable<Obj['device']>>) {
		if (obj.type !== 'prism' || !obj.device) return
		const dv = { ...obj.device, ...patch }, r = rackOf
		// fewer ports: allocations on the ports that no longer exist are dropped (E8)
		if ('ports' in patch && dv.alloc) { const n = patch.ports ?? 0; dv.alloc = Object.fromEntries(Object.entries(dv.alloc).filter(([k]) => Number(k) <= n)) }
		const out: Record<string, unknown> = { device: dv }
		if (r?.type === 'prism') {
			if (patch.u != null || patch.hU != null) { dv.u = Math.max(1, Math.min(maxU - dv.hU + 1, dv.u)); out.z = uToZ(r.z, dv.u); out.h = dv.hU * RU_MM }
			if (patch.mount) out.y = patch.mount === 'rear' ? r.y + r.d - obj.d : r.y
		}
		if (patch.kind && (!obj.color || obj.color === DEVICE_COLORS[obj.device.kind ?? 'other'])) out.color = DEVICE_COLORS[patch.kind] ?? DEVICE_COLORS.other
		onupdate?.(out)
	}
</script>

{#if obj.rack}
	<div class="prop-sec">RACK</div>
	<div class="prop"><span>Height U</span><input type="number" min="1" max="60" value={obj.rack.u} onchange={(e) => setRackU(Math.round(num(e)))} /></div>
	<div class="prop"><span></span><span class="pp-seg"><button onclick={addDevice} title="A 1 U device at the lowest free U">+ Device</button></span></div>
{:else if obj.device}
	<div class="prop-sec">DEVICE{#if rackOf}<span class="sec-hint">in {rackOf.label ?? 'rack'}</span>{/if}</div>
	<div class="prop"><span>U</span><input type="number" min="1" max={maxU} value={obj.device.u} title="Its bottom U (1 = the rack's bottom)" onchange={(e) => setDevice({ u: Math.round(num(e)) })} /></div>
	<div class="prop"><span>Height U</span><input type="number" min="1" max={maxU} value={obj.device.hU} onchange={(e) => setDevice({ hU: Math.max(1, Math.round(num(e))) })} /></div>
	<div class="prop"><span>Face</span>
		<span class="pp-seg">
			{#each [['front', 'Front'], ['rear', 'Rear'], ['both', 'Both']] as const as [v, l] (v)}
				<button class:on={(obj.device.mount ?? 'both') === v} title="Mounted on the {l.toLowerCase()} rails (shows in that elevation)" onclick={() => setDevice({ mount: v })}>{l}</button>
			{/each}
		</span></div>
	<div class="prop"><span>Type</span>
		<select value={obj.device.kind ?? 'other'} onchange={(e) => setDevice({ kind: (e.currentTarget as HTMLSelectElement).value })}>
			{#each Object.keys(DEVICE_COLORS) as k (k)}<option value={k}>{k}</option>{/each}
		</select></div>
	<div class="prop"><span>Ports</span><input type="number" min="0" value={obj.device.ports ?? 0} onchange={(e) => setDevice({ ports: Math.max(0, Math.round(num(e))) || undefined })} /></div>
	{#if obj.device.ports && outletsFor && model}
		<!-- E8: outlets → this panel's ports -->
		{@const n = Object.keys(obj.device.alloc ?? {}).length}
		<div class="prop"><span>Allocated</span><span class="pp-scale"><input value="{n} / {obj.device.ports}" readonly /><button class="pp-mini" onclick={() => (allocOpen = true)}>Allocate outlets…</button></span></div>
		{#if allocOpen}
			<AllocateDialog panel={obj.label ?? 'Panel'} ports={obj.device.ports} alloc={obj.device.alloc ?? {}} outlets={outletsFor(model.id)} {allocated}
				onapply={(a) => setDevice({ alloc: Object.keys(a).length ? a : undefined })} onclose={() => (allocOpen = false)} />
		{/if}
	{/if}
{/if}
