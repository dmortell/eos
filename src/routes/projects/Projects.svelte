<script lang="ts">
	import { getContext } from "svelte";
	import { Firestore, Button } from "$lib";
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
	<div class="flex items-center justify-between mb-4">
		<h1 class="text-xl font-bold">Projects</h1>
		<!-- <Button variant="primary" onclick={e=>db.add('projects', { name: `New Project ${Date.now()}` })}>New Project</Button> -->
	</div>

	{#each projects as project, idx}
		<div class="flex text-sm mb-2">
			<div class="w-4">&gt;</div>
			<div>
				<a href='/projects/{project.id}' class="text-blue-600 hover:text-blue-400">{project.name}</a>
				<div class="w-40 text-xs text-gray-500">{project.createdAt ? project.createdAt.toDate().toLocaleDateString(cfg.locale) :''}</div>
			</div>
			<span class="text-gray-600 mb-4">{project.description}</span>
		</div>
	{/each}
</div>
