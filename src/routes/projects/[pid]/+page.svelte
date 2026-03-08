<script lang="ts">
	import { Firestore } from '$lib'
	import { Titlebar } from '$lib'
	import { page } from '$app/state';
	import { type Project } from './racks/parts/types';
	let {params, ...other} = $props()
	let project: Record<string, any> = $state({})
	let pid = $derived(params.pid)
	let id = $derived(page.params.pid); // This will correctly update id
	let path = $derived(page.url.pathname); // This will correctly update id
	let db = new Firestore();

	$effect(()=>{
		let unsub = db.subscribeOne(`projects`, pid, data => project=data)
		return () => { unsub?.() }
	})
</script>

<Titlebar title={project.name} height={30}/>

<div class="p-4 bg-white dark:bg-black space-y-1">
	<div class="font-semibold">{project.name}</div>
	<div class="text-muted-foreground text-sm">{project.description}</div>
	<hr/>
	<div class="text-muted-foreground mt-2 py-1">Tools</div>
	<ul class="text-sm space-y-1 ml-2">
		<li><a href="{path}/racks">Rack Elevations</a> - manage server rooms, racks and devices</li>
		<li><a href="{path}/frames">Patch Frames</a> - allocate outlet ports to patch frames</li>
		<li><a href="{path}/uploads">Floorplan Uploads</a> - upload and manage floorplans</li>
		<li><a href="{path}/outlets">Outlets and Routes</a> - manage floorplan outlets and cable routes</li>
	</ul>
	<!-- <a href="{path}/docs">Proposals</a>, -->
	<!-- <div>BOM, Quotes, Invoices, RFPs </div>
	<div>Drawings - Models, Floorplans, Elevations, Cable Routes, Patching, PDFs</div>
	<div>Documents, Schedules, Tasks, Minutes</div>
	<div>Settings</div>
	 -->
</div>

<!-- <p>Currently at {page.url.pathname}</p> -->

<!-- {#if page.error}
	<span class="red">Problem detected</span>
{:else}
	<span class="small">All systems operational</span>
{/if} -->

<style>
	a { color:blue; }
	a:hover { text-decoration: underline;}
</style>
