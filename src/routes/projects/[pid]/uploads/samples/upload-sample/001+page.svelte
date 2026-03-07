<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import Uploads from '../Uploads.svelte';

	let db = new Firestore();
	/** @type {any[]} */
	let files = $state([]);
	let projectName = $state('');
	let loading = $state(true);

	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.name) projectName = data.name;
		});
		return () => { unsub?.(); };
	});

	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		let unsub = db.subscribeMany('files', data=>{ files = data; loading = false; })
		// const unsub = db.subscribeWhere('files', 'projectId', pid, data => { files = data; loading = false; });
		return () => { unsub?.(); };
	});

	/** @param {string} fileId */
	async function deleteFile(fileId) {
		await db.delete('files', fileId);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading files...</Spinner>
	</div>
{:else}
	<Uploads {files} {projectName} ondelete={deleteFile} />
{/if}
