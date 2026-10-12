<script lang="ts">
	import { page } from '$app/state';
	import { Firestore, Spinner, type DocWithId } from '$lib';
	import { deleteProjectFile } from '$lib/uploads/deleteFile';
	import Uploads from '$lib/uploads/Uploads.svelte';

	let db = new Firestore();
	let files = $state<DocWithId[]>([]);
	let projectName = $state('');
	let loading = $state(true);

	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.name) projectName = data.name as string;
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

	const deleteFile = (file: DocWithId) => deleteProjectFile(db, page.params.pid ?? '', file);
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading files...</Spinner>
	</div>
{:else}
	<Uploads {files} {projectName} projectId={page.params.pid} ondelete={deleteFile} />
{/if}
