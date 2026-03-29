<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import type { ChangeDetail } from '$lib/logger';
	import FillRate from './FillRate.svelte';

	let db = new Firestore();
	let session = getContext('session') as Session;
	let data: any = $state(null);
	let loading = $state(true);
	let projectName = $state('');

	// Subscribe to project doc for name
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, (d: any) => { if (d?.name) projectName = d.name; });
		return () => { unsub?.(); };
	});

	// Subscribe to fillrate doc
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		loading = true;
		const unsub = db.subscribeOne('fillrate', pid, (d: any) => { data = d; loading = false; });
		return () => { unsub?.(); };
	});

	function save(payload: any, changes: ChangeDetail[]) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('fillrate', { id: pid, ...payload });
		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown';
			writeLog(pid, 'fillrate', uid, changes);
		}
	}
</script>

{#if loading || 0}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading fill rate...</Spinner>
	</div>
{:else}
	<FillRate {data} projectId={page.params.pid} {projectName} onsave={save} />
{/if}
