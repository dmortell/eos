<script>
	import { Firestore } from '$lib'
	import { Titlebar } from '$lib'
	import { page } from '$app/state';
	let {params, ...other} = $props()
	let project = $state({})
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
	<div class="text-muted-foreground">{project.description}</div>
	<hr/>
	<b>Tools</b>
	<ul class="text-sm">
	<li><a href="{path}/frames">Patch Frames</a> - allocate outlet ports to patch frames</li>
	<li><a href="{path}/frames">Patch Frames</a></li>
	</ul>
	<!-- <a href="{path}/docs">Proposals</a>, -->
	<!-- <div>BOM, Quotes, Invoices, RFPs </div>
	<div>Drawings - Models, Floorplans, Elevations, Cable Routes, Patching, PDFs</div>
	<div>Documents, Schedules, Tasks, Minutes</div>
	<div>Settings</div>
	<i class="tabler-heart-outline"></i>
	<i class="tabler-star-outline"></i>
	<i class="bootstrap-folder"></i>
	<i class="flag-ie"></i> -->
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
