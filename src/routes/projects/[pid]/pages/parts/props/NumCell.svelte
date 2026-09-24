<script lang="ts">
	// One labelled number cell for the compact X/Y/Z · W/D/H vector rows (`.vecrow`). Read-only without `set`.
	import { fnav, num } from './fields'
	let { k, v, set }: { k: string; v: number; set?: (n: number) => void } = $props()
</script>

<label class="vcell"><em>{k}</em>
	<input class:navf={!!set} type="number" value={v} readonly={!set} onkeydown={set ? fnav : undefined} onchange={(e) => set?.(num(e))} />
</label>
