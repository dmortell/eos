<script lang="ts">
	// Shared colour picker: a swatch button that opens a GRID of colours (Sheets-style). Reusable
	// across tools. `value` is a CSS colour, '' / undefined = By layer (when allowByLayer), or
	// 'none' = no paint (when allowNone). onchange gives undefined for By layer, 'none' for None.
	import Icon from './Icon.svelte'

	type Swatch = string | { name?: string; value: string }
	// A general-purpose default palette (vivid row + greys). Declared BEFORE $props so it can be the
	// `colors` default (referencing it after $props would hit the temporal dead zone). Callers can pass their own.
	const DEFAULT_COLORS: Swatch[] = [
		'#1e293b', '#475569', '#94a3b8', '#dc2626', '#ea580c', '#d97706', '#16a34a',
		'#0e7490', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#0d9488', '#ffffff',
	]
	let { value = undefined, onchange, colors = DEFAULT_COLORS, allowNone = false, allowByLayer = false,
		allowCustom = true, mixed = false, cols = 7, title = 'Colour' }: {
		value?: string
		onchange?: (v: string | undefined) => void
		colors?: Swatch[]
		allowNone?: boolean
		allowByLayer?: boolean
		allowCustom?: boolean
		mixed?: boolean
		cols?: number
		title?: string
	} = $props()

	let open = $state(false)
	const norm = $derived(colors.map((c) => (typeof c === 'string' ? { value: c, name: c } : { value: c.value, name: c.name ?? c.value })))
	const isBlank = (v?: string) => v === undefined || v === '' || v === 'none'
	const nameOf = (v?: string) => (v === undefined || v === '' ? 'By layer' : v === 'none' ? 'None' : (norm.find((c) => c.value === v)?.name ?? v))
	function pick(v: string | undefined) { onchange?.(v === '' ? undefined : v); open = false }
</script>

<div class="cp">
	<button type="button" class="cp-btn" onclick={() => (open = !open)} {title}>
		<span class="sw" class:blank={isBlank(value)} style:background={isBlank(value) ? undefined : value}></span>
		<span class="cp-lbl">{mixed ? 'Mixed' : nameOf(value)}</span>
		<Icon name="chevronDown" size={10} />
	</button>
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div class="cp-back" onclick={() => (open = false)}></div>
		<div class="cp-pop">
			<div class="cp-grid" style:grid-template-columns="repeat({cols}, 1fr)">
				{#if allowByLayer}
					<button type="button" class="cell" class:sel={isBlank(value) && value !== 'none'} title="By layer" onclick={() => pick(undefined)}><span class="sw blank"></span></button>
				{/if}
				{#if allowNone}
					<button type="button" class="cell" class:sel={value === 'none'} title="None" onclick={() => pick('none')}><span class="sw blank"></span></button>
				{/if}
				{#each norm as c (c.value + c.name)}
					<button type="button" class="cell" class:sel={value === c.value} title={c.name} onclick={() => pick(c.value)}><span class="sw" style:background={c.value}></span></button>
				{/each}
			</div>
			{#if allowCustom}
				<label class="cp-custom">Custom
					<input type="color" value={isBlank(value) ? '#475569' : value} oninput={(e) => pick((e.currentTarget as HTMLInputElement).value)} />
				</label>
			{/if}
		</div>
	{/if}
</div>

<style>
	.cp { position:relative; min-width:0; }
	.cp-btn { display:flex; align-items:center; gap:6px; width:100%; background:var(--input); color:var(--text);
		border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; }
	.cp-btn:hover { border-color:var(--accent-dim); }
	.cp-lbl { flex:1; min-width:0; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.sw { width:14px; height:14px; flex:0 0 auto; border:1px solid #0003; border-radius:3px; display:block; }
	/* By-layer / None swatch: a red slash over a light checker */
	.sw.blank { background:
		linear-gradient(to top right, transparent 44%, #ef4444 44%, #ef4444 56%, transparent 56%),
		repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 0 / 8px 8px; }
	.cp-back { position:fixed; inset:0; z-index:40; }
	.cp-pop { position:absolute; z-index:41; top:calc(100% + 3px); right:0; width:max-content; max-width:230px;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 10px 30px #0007; padding:6px; }
	.cp-grid { display:grid; gap:4px; }
	.cell { padding:2px; border:1px solid transparent; border-radius:4px; background:none; line-height:0; cursor:pointer; }
	.cell:hover { border-color:var(--accent-dim); background:var(--hover); }
	.cell.sel { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; }
	.cell .sw { width:18px; height:18px; }
	.cp-custom { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:10px; color:var(--muted); }
	.cp-custom input { flex:1; height:22px; padding:0; border:1px solid var(--line); border-radius:4px; background:var(--input); cursor:pointer; }
</style>
