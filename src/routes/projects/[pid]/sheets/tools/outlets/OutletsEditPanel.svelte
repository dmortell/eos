<script lang="ts">
	import { Window } from '$lib'
	import PropText from '../../parts/PropText.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import PropColor from '../../parts/PropColor.svelte'
	import AnnotationControls from '../../edit/AnnotationControls.svelte'
	import { portal } from '../../edit/portal'
	import type { OutletsEditor } from './outlets-editor.svelte'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'
	import { PIPE_CATALOG, RECT_CATALOG } from './types'

	let { editor, tool = $bindable(), annEditor }: { editor: OutletsEditor; tool: string; annEditor: AnnotationEditor } = $props()

	const objTools = [
		{ id: 'select', label: 'Select' },
		{ id: 'outlet', label: 'Outlet' },
		{ id: 'trunk', label: 'Trunk' },
		{ id: 'rack', label: 'Rack' },
	] as const

	function pick(id: typeof objTools[number]['id']) {
		if (id === 'trunk') { tool = 'trunk'; editor.startDraw() }
		else { if (editor.draw) editor.finishDraw(); tool = id }
	}
	const val = (e: Event) => (e.currentTarget as HTMLSelectElement | HTMLInputElement).value
	const cls = (active: boolean) => ['flex-1 rounded border px-1 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
</script>

<div use:portal>
<Window title="Edit" name="outlets-edit" left={10} top={72} open class="w-60 space-y-2 p-2 text-zinc-700">
	<div class="flex flex-wrap gap-1">
		{#each objTools as t (t.id)}
			<button class={cls(tool === t.id)} onclick={() => pick(t.id)}>{t.label}</button>
		{/each}
	</div>
	<AnnotationControls bind:tool editor={annEditor} />
	{#if editor.draw}
		<button class="w-full rounded border px-1 py-0.5 text-xs hover:bg-slate-100" onclick={() => { editor.finishDraw(); tool = 'select' }}>Finish trunk</button>
	{/if}

	{#if editor.hasMulti}
		{@const n = editor.selOutlets.length}
		<hr class="border-zinc-200" />
		<p class="text-xs text-zinc-500">{n} outlet{n === 1 ? '' : 's'}{editor.selRacks.length ? ` · ${editor.selRacks.length} rack${editor.selRacks.length === 1 ? '' : 's'}` : ''} selected</p>
		{#if n}
			<div class="flex items-center justify-between gap-2">
				<span class="w-24 shrink-0 text-xs text-zinc-500">Level</span>
				<div class="flex w-full gap-0.5">
					{#each [['low', 'Low'], ['high', 'High']] as [lvl, lbl] (lvl)}
						<button class={['flex-1 rounded border px-1 py-0.5 text-xs hover:bg-slate-100']} onclick={() => editor.setOutletMany({ level: lvl as any })}>{lbl}</button>
					{/each}
				</div>
			</div>
			<PropSelect label="Usage" value="" onchange={(e: Event) => { if (val(e)) editor.setOutletMany({ usage: val(e) as any }) }}>
				<option value="">— set usage —</option>
				{#each ['network', 'phone', 'av', 'printer', 'security', 'ap', 'rb', 'mep', 'new'] as u (u)}<option value={u}>{u}</option>{/each}
			</PropSelect>
			<PropSelect label="Mount" value="" onchange={(e: Event) => { if (val(e)) editor.setOutletMany({ mountType: val(e) as any }) }}>
				<option value="">— set mount —</option>
				<option value="box">Rosette</option><option value="wall">Wall</option><option value="floor">Floor</option>
			</PropSelect>
			<PropSelect label="Cable" value="" onchange={(e: Event) => { if (val(e)) editor.setOutletMany({ cableType: val(e) as any }) }}>
				<option value="">— set cable —</option>
				{#each [['cat5e', 'Cat5e'], ['cat6', 'Cat6'], ['cat6a', 'Cat6a'], ['fiber-sm', 'Fiber SM'], ['fiber-mm', 'Fiber MM']] as [v, lbl] (v)}<option value={v}>{lbl}</option>{/each}
			</PropSelect>
		{/if}
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteMany()}>Delete selection</button>
	{:else if editor.selOutlet}
		{@const o = editor.selOutlet}
		<hr class="border-zinc-200" />
		<PropText label="Label" value={o.label ?? ''} oninput={(e: Event) => editor.setOutlet({ label: val(e) })} />
		<div class="flex items-center justify-between gap-2">
			<span class="w-24 shrink-0 text-xs text-zinc-500">Level</span>
			<div class="flex w-full gap-0.5">
				{#each [['low', 'Low'], ['high', 'High']] as [lvl, lbl] (lvl)}
					<button class={cls(o.level === lvl)} onclick={() => editor.setOutlet({ level: lvl as any })}>{lbl}</button>
				{/each}
			</div>
		</div>
		<PropText label="Ports" type="number" min="1" max="24" value={String(o.portCount)} oninput={(e: Event) => editor.setOutlet({ portCount: Number(val(e)) || 1 })} />
		<PropSelect label="Usage" value={o.usage} onchange={(e: Event) => editor.setOutlet({ usage: val(e) as any })}>
			{#each ['network', 'phone', 'av', 'printer', 'security', 'ap', 'rb', 'mep', 'new'] as u (u)}<option value={u}>{u}</option>{/each}
		</PropSelect>
		<PropSelect label="Mount" value={o.mountType} onchange={(e: Event) => editor.setOutlet({ mountType: val(e) as any })}>
			<option value="box">Rosette</option><option value="wall">Wall</option><option value="floor">Floor</option>
		</PropSelect>
		<PropSelect label="Cable" value={o.cableType} onchange={(e: Event) => editor.setOutlet({ cableType: val(e) as any })}>
			{#each [['cat5e', 'Cat5e'], ['cat6', 'Cat6'], ['cat6a', 'Cat6a'], ['fiber-sm', 'Fiber SM'], ['fiber-mm', 'Fiber MM']] as [v, lbl] (v)}<option value={v}>{lbl}</option>{/each}
		</PropSelect>
		<PropText label="Room" value={o.roomNumber ?? ''} oninput={(e: Event) => editor.setOutlet({ roomNumber: val(e) || undefined })} />
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete outlet</button>
	{:else if editor.selTrunk}
		{@const t = editor.selTrunk}
		<hr class="border-zinc-200" />
		<div class="flex items-center justify-between gap-2">
			<span class="w-24 shrink-0 text-xs text-zinc-500">Shape</span>
			<div class="flex w-full gap-0.5">
				{#each [['rect', 'Rect'], ['pipe', 'Pipe']] as [v, lbl] (v)}
					<button class={cls(t.shape === v)} onclick={() => editor.setTrunkShape(v as any)}>{lbl}</button>
				{/each}
			</div>
		</div>
		<div class="flex items-center justify-between gap-2">
			<span class="w-24 shrink-0 text-xs text-zinc-500">Location</span>
			<div class="flex w-full gap-0.5">
				<!-- "Ceiling" maps to ceiling-tray; both ceiling-* values keep it highlighted. -->
				{#each [['floor', 'Floor'], ['ceiling-tray', 'Ceiling'], ['wall', 'Wall']] as [v, lbl] (v)}
					<button class={cls(v === 'ceiling-tray' ? t.location.startsWith('ceiling') : t.location === v)} onclick={() => editor.setTrunk({ location: v as any })}>{lbl}</button>
				{/each}
			</div>
		</div>
		<PropSelect label="Type" value={(t.spec as any).catalog ?? 'custom'} onchange={(e: Event) => editor.setTrunkCatalog(val(e))}>
			{#each Object.entries(t.shape === 'pipe' ? PIPE_CATALOG : RECT_CATALOG) as [v, c] (v)}<option value={v}>{c.label}</option>{/each}
		</PropSelect>
		<PropColor label="Color" value={t.color ?? '#0369a1'} allowNone={false} onchange={(c: string) => editor.setTrunk({ color: c })} />
		<PropText label={t.shape === 'pipe' ? 'Diameter (mm)' : 'Width (mm)'} type="number" min="0" value={String(editor.selTrunkWidth)} oninput={(e: Event) => editor.setTrunkWidth(Number(val(e)) || 0)} />
		{#if t.shape !== 'pipe'}
			<PropText label="Height (mm)" type="number" min="0" value={String(editor.selTrunkHeight)} oninput={(e: Event) => editor.setTrunkHeight(Number(val(e)) || 0)} />
		{/if}
		<PropText label="Z elev (mm)" type="number" step="100" value={String(editor.selTrunkZ)} oninput={(e: Event) => editor.setTrunkZ(Number(val(e)) || 0)} />
		<PropText label="Bend radius (mm)" type="number" min="0" placeholder="10" value={String(t.bendRadiusMm ?? '')} oninput={(e: Event) => editor.setTrunk({ bendRadiusMm: Number(val(e)) || undefined })} />
		<div class="flex items-center justify-between gap-2 text-xs text-zinc-500">
			<span>Run length</span><span class="tabular-nums text-zinc-700">{(editor.selTrunkLengthMm / 1000).toFixed(2)} m</span>
		</div>
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete trunk</button>
	{:else if editor.selRackPlacement}
		{@const r = editor.selRackPlacement}
		<hr class="border-zinc-200" />
		<PropText label="Label" value={r.label ?? ''} oninput={(e: Event) => editor.setRackPlacement({ label: val(e) })} />
		<PropText label="Width (mm)" type="number" min="100" value={String(r.widthMm ?? 600)} oninput={(e: Event) => editor.setRackPlacement({ widthMm: Number(val(e)) || 600 })} />
		<PropText label="Depth (mm)" type="number" min="100" value={String(r.depthMm ?? 1000)} oninput={(e: Event) => editor.setRackPlacement({ depthMm: Number(val(e)) || 1000 })} />
		<PropText label="Height (U)" type="number" min="1" max="58" value={String(r.heightU ?? 42)} oninput={(e: Event) => editor.setRackPlacement({ heightU: Number(val(e)) || 42 })} />
		<PropText label="Height (mm)" type="number" min="0" value={String(r.heightMm ?? 0)} oninput={(e: Event) => editor.setRackPlacement({ heightMm: Number(val(e)) || 0 })} />
		<PropSelect label="Type" value={r.type ?? '4-post'} onchange={(e: Event) => editor.setRackPlacement({ type: val(e) as any })}>
			{#each ['2-post', '4-post', 'cabinet', 'desk', 'shelf', 'vcm'] as t (t)}<option value={t}>{t}</option>{/each}
		</PropSelect>
		<PropText label="Maker" value={r.maker ?? ''} oninput={(e: Event) => editor.setRackPlacement({ maker: val(e) || undefined })} />
		<PropText label="Model" value={r.model ?? ''} oninput={(e: Event) => editor.setRackPlacement({ model: val(e) || undefined })} />
		<PropText label="Rotation°" type="number" value={String(r.rotation ?? 0)} oninput={(e: Event) => editor.setRackPlacement({ rotation: Number(val(e)) || 0 })} />
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete rack</button>
	{/if}
</Window>
</div>
