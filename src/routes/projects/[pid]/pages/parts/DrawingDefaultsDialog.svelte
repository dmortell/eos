<script lang="ts">
	// D10: Format › Drawing Defaults… — the project-wide style NEW shapes start with (colour, text size, line
	// weight / type, dimension heads + unit). Existing shapes keep theirs. Saved as you go; '' / 0 = unset.
	import { tick } from 'svelte'
	import { Icon, ColorPicker } from '$lib'
	import { COLORS } from '../palette'
	import { STYLE_DEFAULTS, type Dash, type Head } from '../ui/geometry'
	import type { DrawingDefaults, DimUnit } from '../ui/drawingDefaults'
	let { value, onchange, onclose }: { value?: DrawingDefaults; onchange: (d: DrawingDefaults) => void; onclose: () => void } = $props()

	// every field present: the project doc is merge-saved, so a cleared field must be written as '' / 0
	const full = (d?: DrawingDefaults): Required<DrawingDefaults> => ({ color: d?.color ?? '', fontPt: d?.fontPt ?? 0, weight: d?.weight ?? 0, dash: d?.dash ?? '', dimHead: d?.dimHead ?? '', dimUnit: d?.dimUnit ?? 'mm' })
	const set = (patch: Partial<DrawingDefaults>) => onchange({ ...full(value), ...patch })
	const cur = $derived(full(value))
	const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value
	const sel = (e: Event) => (e.currentTarget as HTMLSelectElement).value
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
	function focusFirst(node: HTMLElement) { tick().then(() => node.querySelector('input')?.focus()) }
</script>

<svelte:window onkeydown={onKey} />
<div class="dd-back">
	<button class="dd-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="dd" role="dialog" aria-modal="true" aria-label="Drawing defaults" tabindex="-1" use:focusFirst>
		<div class="dd-head"><span>Drawing defaults · this project</span><button class="dd-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="dd-body">
			<label><span>Colour</span><ColorPicker value={cur.color || undefined} colors={COLORS} allowByLayer onchange={(v) => set({ color: v ?? '' })} /></label>
			<label><span>Text size (pt)</span><input type="number" min="0" max="96" value={cur.fontPt || ''} placeholder={String(STYLE_DEFAULTS.fontPt)} onchange={(e) => set({ fontPt: Math.max(0, Math.round(num(e))) })} /></label>
			<label><span>Line weight</span><input type="number" min="0" step="0.1" value={cur.weight || ''} placeholder={String(STYLE_DEFAULTS.weight)} onchange={(e) => set({ weight: Math.max(0, num(e)) })} /></label>
			<label><span>Line type</span>
				<select value={cur.dash} onchange={(e) => set({ dash: sel(e) as Dash | '' })}>
					<option value="">ByLayer</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="dashdot">Dash-dot</option>
				</select></label>
			<label><span>Dimension ends</span>
				<select value={cur.dimHead} onchange={(e) => set({ dimHead: sel(e) as Head | '' })}>
					<option value="">Arrow</option><option value="tick">Tick</option><option value="dot">Dot</option><option value="none">None</option>
				</select></label>
			<label><span>Dimension unit</span>
				<select value={cur.dimUnit} onchange={(e) => set({ dimUnit: sel(e) as DimUnit })}>
					<option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
				</select></label>
		</div>
		<div class="dd-foot">New shapes start with these; existing ones keep their style (change them in Properties). Empty = the tool default.</div>
	</div>
</div>

<style>
	.dd-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:10vh; }
	.dd-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.dd { position:relative; width:min(360px,94vw); display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; }
	.dd-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; color:var(--text); }
	.dd-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.dd-body { display:flex; flex-direction:column; gap:6px; padding:10px 14px; }
	label { display:grid; grid-template-columns:120px 1fr; align-items:center; gap:8px; font-size:12px; color:var(--muted); }
	input, select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:12px; }
	input:focus, select:focus { outline:none; border-color:var(--accent); }
	.dd-foot { padding:8px 14px; font-size:10px; color:var(--faint); border-top:1px solid var(--line-soft); }
</style>
