<!-- CORD LABELS: the patch cords bought, as batches of pre-printed labels (ui/CordBatches.svelte) — its own dialog
     (Dave 2026-10-12: easier to find than inside the schedule export), from the Patching tab's "Cord labels…" and
     Cabling › Cord label batches…. -->
<script lang="ts">
	import { backdropClose, dialogFocus } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import CordBatches from './CordBatches.svelte'

	let { project, onclose }: { project: CadProject; onclose: () => void } = $props()
	const typeLabel = (id: string) => project.settings?.cableTypes.find((t) => t.id === id)?.label ?? id
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" use:dialogFocus aria-label="Cord labels" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Cord labels · batches bought</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<div class="body"><CordBatches {project} {typeLabel} /></div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(58rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.body { overflow: auto; padding: 0 12px 12px; }
</style>
