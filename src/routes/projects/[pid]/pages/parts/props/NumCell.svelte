<script lang="ts">
	// One labelled number cell for the compact X/Y/Z · W/D/H vector rows (`.vecrow`). Read-only without `set`.
	// `step` = the spinner step (default 1; e.g. 0.05 for a ratio).
	import { fnav, num } from './fields'
	let { k, v, set, step }: { k: string; v: number; set?: (n: number) => void; step?: number } = $props()
</script>

<label class="vcell"><em>{k}</em>
	<input class:navf={!!set} type="number" value={v} {step} readonly={!set} onkeydown={set ? fnav : undefined} onchange={(e) => set?.(num(e))} />
</label>
