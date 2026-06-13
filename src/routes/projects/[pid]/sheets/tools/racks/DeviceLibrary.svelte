<script lang="ts">
	// Device library window for rack elevations: list of device templates (built-in palette + the
	// doc's custom library); drag an item onto the rack to place it; add custom devices to the list.
	import { Window, Search } from '$lib'
	import { formNav } from '$lib/formNav'
	import { portal } from '../../edit/portal'
	import { DEVICE_PALETTE, type DeviceTemplate } from './palette'
	import type { RacksEditor } from './racks-editor.svelte'

	let { editor, ondrop, onclose }: {
		editor: RacksEditor
		ondrop: (t: DeviceTemplate, clientX: number, clientY: number) => void
		onclose: () => void
	} = $props()

	let query = $state('')
	let builderOpen = $state(false)
	let custom = $state({ label: '', type: 'switch', heightU: 1, portCount: 0, widthMm: 0 })

	let all = $derived([...DEVICE_PALETTE, ...editor.library])
	let filtered = $derived(query ? all.filter(t => t.label.toLowerCase().includes(query.toLowerCase())) : all)

	// drag-to-place: track the cursor, show a ghost, drop onto the rack on mouse-up
	let ghost = $state<{ label: string; x: number; y: number } | null>(null)
	let dragTpl: DeviceTemplate | null = null
	function onMove(e: MouseEvent) { if (ghost) ghost = { ...ghost, x: e.clientX, y: e.clientY } }
	function onUp(e: MouseEvent) {
		window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
		const t = dragTpl; dragTpl = null; ghost = null
		if (t) ondrop(t, e.clientX, e.clientY)
	}
	function beginDrag(t: DeviceTemplate, e: MouseEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		dragTpl = t; ghost = { label: t.label, x: e.clientX, y: e.clientY }
		window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
	}

	function addCustom() {
		if (!custom.label.trim()) return
		editor.addLibraryDevice({ id: '', label: custom.label.trim(), type: custom.type as any, heightU: Number(custom.heightU) || 1, portCount: Number(custom.portCount) || 0, ...(custom.widthMm ? { widthMm: Number(custom.widthMm) } : {}) })
		custom = { label: '', type: 'switch', heightU: 1, portCount: 0, widthMm: 0 }
		builderOpen = false
	}
</script>

<div use:portal>
	<Window title="Devices" name="racks-library" right={10} top={72} open class="w-60 space-y-2 p-2 text-zinc-700">
		<Search bind:value={query} class="text-sm" />

		<div class="max-h-72 space-y-0.5 overflow-auto">
			{#each filtered as t (t.id + t.label)}
				{@const isCustom = editor.library.some(l => l.id === t.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 p-1.5 text-xs hover:bg-zinc-100"
					style:cursor="grab" onmousedown={(e: MouseEvent) => beginDrag(t, e)}>
					<span class="min-w-0 flex-1 truncate" title={t.label}>{t.label}</span>
					<span class="shrink-0 text-[10px] text-zinc-400">{t.heightU}U</span>
					{#if isCustom}
						<button class="shrink-0 text-red-400 hover:text-red-600" title="Remove from library"
							onclick={(e: MouseEvent) => { e.stopPropagation(); editor.removeLibraryDevice(t.id) }}>✕</button>
					{/if}
				</div>
			{/each}
		</div>
		<p class="text-[10px] text-zinc-400">Drag a device onto the rack to place it.</p>

		<hr class="border-zinc-200" />
		<button class="w-full rounded border px-1 py-0.5 text-xs hover:bg-slate-100" onclick={() => (builderOpen = !builderOpen)}>+ Custom Device</button>
		{#if builderOpen}
			<div class="grid grid-cols-2 gap-1 text-xs" use:formNav>
				<label class="col-span-2 text-[10px] text-zinc-500">Label
					<input class="h-6 w-full rounded border border-zinc-300 px-1 text-xs" bind:value={custom.label} />
				</label>
				<label class="text-[10px] text-zinc-500">Type
					<select class="h-6 w-full rounded border border-zinc-300 px-1 text-xs" bind:value={custom.type}>
						{#each ['panel', 'enclosure', 'switch', 'server', 'manager', 'shelf', 'pdu', 'other'] as ty (ty)}<option value={ty}>{ty}</option>{/each}
					</select>
				</label>
				<label class="text-[10px] text-zinc-500">Height (U)
					<input type="number" min="1" max="58" class="h-6 w-full rounded border border-zinc-300 px-1 text-xs" bind:value={custom.heightU} />
				</label>
				<label class="text-[10px] text-zinc-500">Ports
					<input type="number" min="0" class="h-6 w-full rounded border border-zinc-300 px-1 text-xs" bind:value={custom.portCount} />
				</label>
				<label class="text-[10px] text-zinc-500">Width (mm)
					<input type="number" min="0" class="h-6 w-full rounded border border-zinc-300 px-1 text-xs" bind:value={custom.widthMm} placeholder="auto" />
				</label>
				<div class="col-span-2">
					<button class="w-full rounded bg-blue-600 px-1 py-0.5 text-xs text-white hover:bg-blue-500" onclick={addCustom}>Save to library</button>
				</div>
			</div>
		{/if}
		<button class="w-full rounded border px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-slate-100" onclick={onclose}>Close</button>
	</Window>

	{#if ghost}
		<div class="fixed z-50 rounded border border-blue-400 bg-blue-50/90 px-2 py-0.5 text-xs text-blue-700 shadow pointer-events-none"
			style:left="{ghost.x + 12}px" style:top="{ghost.y + 8}px">{ghost.label}</div>
	{/if}
</div>
