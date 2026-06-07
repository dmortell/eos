<script lang="ts">
	import { page } from '$app/state';
	import { Firestore, Spinner, type DocWithId } from '$lib';
	import { storage } from '$lib/db.svelte';
	import { ref, deleteObject } from 'firebase/storage';
	import { isUploadThing } from './provider';
	import Uploads from './Uploads.svelte';

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

	async function deleteFile(file: DocWithId) {
		// Remove the stored object first, routed by provider, then drop the Firestore doc.
		if (isUploadThing(file)) {
			const utKey = (file.key ?? file.path) as string | undefined;
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
		} else if (file.path) {
			// Firebase Storage object.
			try {
				await deleteObject(ref(storage, file.path as string));
			} catch (e: any) {
				// A missing object (already gone) shouldn't block removing the record.
				if (e?.code !== 'storage/object-not-found') {
					console.error('Firebase Storage delete failed:', e);
					return;
				}
			}
		}
		await db.delete('files', file.id);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading files...</Spinner>
	</div>
{:else}
	<Uploads {files} {projectName} projectId={page.params.pid} ondelete={deleteFile} />
{/if}
