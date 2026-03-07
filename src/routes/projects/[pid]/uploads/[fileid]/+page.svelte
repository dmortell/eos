<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import PdfViewer from '../PdfViewer.svelte';

	let db = new Firestore();
	let fileDoc = $state(/** @type {any} */ (null));
	let loading = $state(true);
	let error = $state('');
	let initialTool = new URLSearchParams(window.location.search).get('tool');

	$effect(() => {
		const pid = page.params.pid;
		const fileid = page.params.fileid;
		if (!pid || !fileid) return;

		const docId = decodeURIComponent(fileid);
		const unsub = db.subscribeOne('files', docId, data => {
			if (data?.url) {
				fileDoc = data;
			} else {
				error = 'File not found';
			}
			loading = false;
		});
		return () => { unsub?.(); };
	});

	function goBack() {
		history.back();
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen bg-gray-900">
		<Spinner>Loading file...</Spinner>
	</div>
{:else if error}
	<div class="flex items-center justify-center h-screen bg-gray-900">
		<div class="text-center">
			<p class="text-red-400 text-sm mb-4">{error}</p>
			<button class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700" onclick={goBack}>Go back</button>
		</div>
	</div>
{:else}
	<PdfViewer url={fileDoc.url} name={fileDoc.name ?? fileDoc.id} bind:fileDoc {initialTool} onclose={goBack} />
{/if}
