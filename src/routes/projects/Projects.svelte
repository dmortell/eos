<script lang="ts">
	import { Firestore } from "$lib/db.svelte";
	import { getContext } from "svelte";
	// import { Button, Firestore, Session} from '$lib'
	let db = getContext('db') as Firestore
	let projects = $state<Project[]>([])
	let loading = $state(1)
	let search = $state('')
	let cfg = getContext<{ locale: string }>('settings')

	interface Project {
		id: string;
		name: string;
		description?: string;
		createdAt?: any;
		updatedAt?: any;
		ownerId?: string;
	}

	$effect(()=>{
		let unsub = db.subscribeMany('projects', data=>{ projects = data as unknown as Project[]; loading=0 })
		return () => { unsub?.() }
	})
</script>

<div class="p-8">
	{#each projects as project, idx}
		<div class="flex text-sm mb-2">
			<div class="w-4">{idx+1}</div>
			<div>
				<a href='/projects/{project.id}' class="text-blue-600 hover:text-blue-400">{project.name}</a>
				<div class="w-40 text-xs text-gray-500">{project.createdAt ? project.createdAt.toDate().toLocaleDateString(cfg.locale) :''}</div>
			</div>
			<span class="text-gray-600 mb-4">{project.description}</span>
		</div>
	{/each}
</div>
