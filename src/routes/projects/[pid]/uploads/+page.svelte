<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import Uploads from './Uploads.svelte';

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

	/** @param {string} fileId @param {string} [utKey] */
	async function deleteFile(fileId, utKey) {
		if (utKey) {
			try {
				const res = await fetch('/api/uploadthing/delete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ key: utKey })
				});
				if (!res.ok) {
					console.error('UploadThing delete failed:', await res.text());
					return;
				}
			}
			catch (e) {
				console.error('UploadThing delete failed:', e);
				return;
			}
		}
		await db.delete('files', fileId);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading files...</Spinner>
	</div>
{:else}
	<Uploads {files} {projectName} projectId={page.params.pid} ondelete={deleteFile} />
{/if}
