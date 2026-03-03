<script lang="ts">
    import { Input } from "$lib";
    import { Firestore } from "$lib/db.svelte";
    import { getContext } from "svelte";

	// import { setLocale } from '$lib/paraglide/runtime';
	// import { m } from '$lib/paraglide/messages.js';
	// import { getContext } from 'svelte';
	// import { Button, Firestore, Session} from '$lib'
	// import { Titlebar, Loading } from '$lib'
	// import * as Dialog from "$lib/components/ui/dialog/index.js";
	// import * as Sheet from "$lib/components/ui/sheet/index.js";
	// import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "$lib/components/ui/dialog";
	// import { buttonVariants } from "$lib/components/ui/button/index.js";
	let db = new Firestore();
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
		let unsub = db.subscribeMany('projects', data=>{ projects = data; loading=0 })
		return () => { unsub?.() }
	})
</script>

<div class="p-8">

	{#each projects as project, idx}
		<div class="flex text-sm">
			<div class="w-4">{idx+1}</div>
			<div>
				<a href='/projects/{project.id}' class="text-blue-600 hover:text-blue-400">{project.name}</a>
				<div class="w-40 text-xs text-gray-500">{project.createdAt ? project.createdAt.toDate().toLocaleDateString(cfg.locale) :''}</div>
			</div>
			<span class="text-gray-600 mb-4">{project.description}</span>
		</div>
	{/each}
</div>


		<!-- <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
			{#each projects as project (project.id)}
				<div class="border rounded p-4 hover:shadow-lg transition-shadow">
					<h3 class=" font-semibold mb-2">{project.name}</h3>
					<p class="text-gray-600 mb-4">{project.description}</p>
					<div class="flex justify-between items-center">
						<span class="text-sm text-gray-500">
							Created: {project.createdAt ? project.createdAt.toDate().toLocaleDateString(cfg.locale) :''}
						</span>
						<a href="/projects/{project.id}" class="text-blue-500 hover:text-blue-700">Open →</a >
					</div>
				</div>
			{/each}
		</div> -->
