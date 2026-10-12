<!-- CORD LABELS: the patch cords bought, as batches of pre-printed labels (ui/CordBatches.svelte) — its own dialog
     (Dave 2026-10-12: easier to find than inside the schedule export), from the Patching tab's "Cord labels…" and
     Cabling › Cord label batches…. -->
<script lang="ts">
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import CordBatches from './CordBatches.svelte'

	let { project, onclose }: { project: CadProject; onclose: () => void } = $props()
	const typeLabel = (id: string) => project.settings?.cableTypes.find((t) => t.id === id)?.label ?? id
</script>

<CadDialog title="Cord labels · batches bought" label="Cord labels" width="58rem" top="5vh" {onclose}>
	<CordBatches {project} {typeLabel} />
</CadDialog>
