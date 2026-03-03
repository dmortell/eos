<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import Frames from './Frames.svelte';

	let db = new Firestore();
	let frameData = $state(/** @type {any} */ (null));
	let loading = $state(true);

	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		loading = true;
		let unsub = db.subscribeOne('frames', pid, data => {
			frameData = data;
			loading = false;
		});
		return () => { unsub?.(); };
	});
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading frames...</Spinner>
	</div>
{:else}
	<Frames data={frameData} />
{/if}
