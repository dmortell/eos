<script lang="ts">
	import { Dialog } from '$lib'
	import type { ViewportEditor } from './viewports.svelte'

	let { vps, open = $bindable(false) }: { vps: ViewportEditor; open?: boolean } = $props()
	const d = $derived(vps.annoDefaults)

	const HEADS: [string, string][] = [['none', 'None'], ['arrow', 'Arrow'], ['dot', 'Dot'], ['tick', 'Tick']]
	const DASHES: [string, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]
	const UNITS: [string, string][] = [['mm', 'mm'], ['m', 'm'], ['km', 'km'], ['none', 'none']]
	const val = (e: Event) => (e.currentTarget as HTMLSelectElement | HTMLInputElement).value
	const sel = 'h-7 w-full rounded border border-zinc-300 px-1 text-sm'
</script>

<Dialog title="Drawing defaults" bind:open>
	<div class="grid grid-cols-2 gap-2 px-6 pb-3 text-xs">
		<p class="col-span-2 text-[11px] text-zinc-500">Defaults for new annotations (project-wide). Existing items are unchanged.</p>
		<label class="text-zinc-500">Colour
			<input type="color" class="h-7 w-full rounded border border-zinc-300" value={d.color ?? '#dc2626'} oninput={(e) => vps.setDefaults({ color: val(e) })} /></label>
		<label class="text-zinc-500">Font (pt)
			<input type="number" min="2" class={sel} value={d.fontPt ?? 8} oninput={(e) => vps.setDefaults({ fontPt: Number(val(e)) || 8 })} /></label>
		<label class="text-zinc-500">Line start
			<select class={sel} value={d.lineStart ?? 'none'} onchange={(e) => vps.setDefaults({ lineStart: val(e) as any })}>{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
		<label class="text-zinc-500">Line end
			<select class={sel} value={d.lineEnd ?? 'none'} onchange={(e) => vps.setDefaults({ lineEnd: val(e) as any })}>{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
		<label class="text-zinc-500">Dim start
			<select class={sel} value={d.dimStart ?? 'arrow'} onchange={(e) => vps.setDefaults({ dimStart: val(e) as any })}>{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
		<label class="text-zinc-500">Dim end
			<select class={sel} value={d.dimEnd ?? 'arrow'} onchange={(e) => vps.setDefaults({ dimEnd: val(e) as any })}>{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
		<label class="text-zinc-500">Dash
			<select class={sel} value={d.dash ?? 'solid'} onchange={(e) => vps.setDefaults({ dash: val(e) as any })}>{#each DASHES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
		<label class="text-zinc-500">Dimension unit
			<select class={sel} value={d.dimUnit ?? 'mm'} onchange={(e) => vps.setDefaults({ dimUnit: val(e) as any })}>{#each UNITS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
	</div>
</Dialog>
