<script lang="ts">
	// Properties › SEVERAL sheet viewport frames (paper multi-select): what they share — scale, border, hidden lines,
	// colour, lock — applied to all of them in ONE step. A field whose frames differ shows blank ("mixed") until set.
	import { blurOnEnter, strVal } from './fields'
	import { type SheetFrame, SCALES } from '../../types'

	let { frames, onupdate }: { frames: SheetFrame[]; onupdate?: (patch: Partial<SheetFrame>) => void } = $props()

	/** The frames' common value, or undefined when they differ. */
	const common = <K extends keyof SheetFrame>(k: K, norm: (v: SheetFrame[K]) => unknown = (v) => v): unknown => {
		const vs = frames.map((f) => norm(f[k])); return vs.every((v) => v === vs[0]) ? vs[0] : undefined
	}
	const scale = $derived(common('scale') as string | undefined)
	const border = $derived(common('border') as string | undefined)
	const hide = $derived(common('hideHidden', (v) => !!v) as boolean | undefined)
	const mono = $derived(common('mono', (v) => !!v) as boolean | undefined)
	const locked = $derived(common('locked', (v) => !!v) as boolean | undefined)
	const parseScale = (v: string): number | null => { const m = /^\s*(?:1\s*:\s*)?(\d+)\s*$/.exec(v); const n = m ? Number(m[1]) : NaN; return n >= 1 ? n : null }
	let lockEl: HTMLInputElement | undefined = $state()
	$effect(() => { if (lockEl) lockEl.indeterminate = locked === undefined })
</script>

<div class="prop-sec">VIEWPORTS<span class="sec-hint">{frames.length} selected</span></div>
<div class="prop"><span>Scale</span>
	<input list="pp-scales-multi" value={scale ?? ''} placeholder="mixed" title="Any scale — 1:N or just N — for all of them"
		onchange={(e) => { const n = parseScale(strVal(e)); if (n) onupdate?.({ scale: `1:${n}` }); else (e.currentTarget as HTMLInputElement).value = scale ?? '' }} onkeydown={blurOnEnter} />
	<datalist id="pp-scales-multi">{#each SCALES as s (s)}<option value={s}></option>{/each}</datalist>
</div>
<div class="prop"><span>Border</span>
	<select value={border ?? ''} onchange={(e) => { const v = strVal(e); if (v) onupdate?.({ border: v as 'dashed' | 'solid' | 'none' }) }}>
		{#if border === undefined}<option value="" disabled>mixed</option>{/if}
		<option value="solid">Solid</option><option value="dashed">Dashed</option><option value="none">None</option>
	</select>
</div>
<div class="prop"><span>Hidden lines</span>
	<span class="pp-seg">
		<button class:on={hide === false} title="Every edge, as a wireframe" onclick={() => onupdate?.({ hideHidden: undefined })}>Show</button>
		<button class:on={hide === true} title="Nearer faces hide what's behind them (not in 3D views)" onclick={() => onupdate?.({ hideHidden: true })}>Hide</button>
	</span></div>
<div class="prop"><span>Colour</span>
	<span class="pp-seg">
		<button class:on={mono === false} onclick={() => onupdate?.({ mono: undefined })}>Colour</button>
		<button class:on={mono === true} title="Everything in black — for monochrome prints" onclick={() => onupdate?.({ mono: true })}>B/W</button>
	</span></div>
<label class="prop cb"><span>Lock</span><input type="checkbox" bind:this={lockEl} checked={!!locked} onchange={(e) => onupdate?.({ locked: (e.currentTarget as HTMLInputElement).checked || undefined })} /></label>
<div class="pp-hint">Set a field to change every selected viewport. Ctrl+C / Ctrl+D copy / duplicate them all; drag a border to move them together.</div>
