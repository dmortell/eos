<!-- File › Uploads…: the Uploads tool (the project's floorplan files: upload, page list, origin / scale / crop / masks,
     layers) inside cad, so no second tab. It hosts the same components as the /uploads route ($lib/uploads) and writes the
     same `files/{id}` docs, so a floorplan changed here shows in the drawing at once. A file opens in the viewer inside
     the dialog; Esc steps back (viewer tool → file list → close). -->
<script lang="ts">
	import { Firestore, Spinner, type DocWithId } from '$lib'
	import Uploads from '$lib/uploads/Uploads.svelte'
	import PdfViewer from '$lib/uploads/PdfViewer.svelte'
	import { deleteProjectFile } from '$lib/uploads/deleteFile'
	import { CAD_FILE } from '$lib/files/cadFiles'
	import CadDialog from './CadDialog.svelte'

	let { pid, projectName = '', onclose }: { pid: string; projectName?: string; onclose: () => void } = $props()

	const db = new Firestore()
	let files = $state<DocWithId[]>([])
	let loading = $state(true)
	$effect(() => {
		const off = db.subscribeMany('files', (data) => { files = data; loading = false })
		return () => off?.()
	})

	/** The file open in the viewer: its id and the tool to start with; the doc itself comes live from `files`. */
	let viewing = $state<{ id: string; tool: string | null } | null>(null)
	let viewer = $state<{ escape(): void } | undefined>()
	// bound to the viewer, which writes the calibration itself; a plain copy of the live doc is what it reads
	let viewDoc = $derived(viewing ? files.find((f) => f.id === viewing!.id) : undefined)
	function open(file: { id: string; name?: string }, tool?: string) {
		if (CAD_FILE.test(file.name ?? file.id)) return
		viewing = { id: file.id, tool: tool ?? null }
	}
	const escape = () => { if (viewing) viewer?.escape(); else onclose() }
</script>

<CadDialog title={viewing ? `Uploads — ${viewDoc?.name ?? viewing.id}` : 'Uploads'} width="min(96vw, 80rem)" height="88vh" top="4vh" flush {onclose} onescape={escape}>
	<div class="host">
		{#if loading}
			<div class="mid"><Spinner>Loading files...</Spinner></div>
		{:else if viewing && viewDoc?.url}
			{#key viewing.id}
				<PdfViewer bind:this={viewer} embedded url={viewDoc.url as string} name={(viewDoc.name as string) ?? viewDoc.id} fileDoc={viewDoc} initialTool={viewing.tool} onclose={() => (viewing = null)} />
			{/key}
		{:else}
			<Uploads embedded {files} {projectName} projectId={pid} onopen={open} ondelete={(f) => void deleteProjectFile(db, pid, f as DocWithId)} />
		{/if}
	</div>
</CadDialog>

<style>
	.host { height: 100%; min-height: 0; position: relative; }
	.mid { display: flex; align-items: center; justify-content: center; height: 100%; }
</style>
