<!-- cad's color field (Dave 2026-10-05: "use a dropdown selector like the one in Pages"): the shared $lib ColorPicker — a
     swatch button opening a grid of colors plus Custom — dressed in cad's theme. `allowByLayer` adds "By layer" (the
     shape's own color cleared: undefined), `allowNone` adds "None" ('none'). `compact`: the swatch alone (a layer's
     row), its grid opening to the right. -->
<script lang="ts">
	import ColorPicker from '$lib/ui/ColorPicker.svelte'

	let { value, onchange, allowNone = false, allowByLayer = false, mixed = false, title = 'Color', compact = false }: {
		value?: string
		onchange: (v: string | undefined) => void
		allowNone?: boolean
		allowByLayer?: boolean
		mixed?: boolean
		title?: string
		compact?: boolean
	} = $props()

	/** The Sheets tool's layer palette (rainbow, then browns / greys / black; Dave 2026-10-05), plus a bright yellow
	 *  and white. */
	const COLORS = [
		'#ef4444', '#f97316', '#f59e0b', '#eab308', '#fde047', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
		'#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
		'#a16207', '#78716c', '#6b7280', '#334155', '#0369a1', '#285aa0', '#000000', '#ffffff',
	]
</script>

<span class="cc" class:compact><ColorPicker {value} {onchange} {allowNone} {allowByLayer} {mixed} {title} colors={COLORS} cols={7} /></span>

<style>
	/* the picker reads Pages' theme variables: give it cad's */
	.cc {
		display: block; min-width: 7rem;
		--panel: var(--cad-panel, white); --input: var(--cad-input, white); --text: var(--cad-text, #18181b); --line: var(--cad-line, #e4e4e7);
		--hover: var(--cad-hover, #f4f4f5); --muted: var(--cad-muted, #71717a); --accent: #2563eb; --accent-dim: #93c5fd;
	}
	.cc.compact { display: inline-block; min-width: 0; }
	.compact :global(.cp-btn) { padding: 1px; border-color: transparent; background: none; gap: 0; }
	.compact :global(.cp-lbl), .compact :global(.cp-btn > svg) { display: none; }
	.compact :global(.cp-pop) { left: 0; right: auto; }
</style>
