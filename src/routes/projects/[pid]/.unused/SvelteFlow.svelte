<script>
	import { Firestore, Session } from '$lib'
	import { Titlebar } from '$lib'
	let db = new Firestore();
	let {params, ...other} = $props()
	let project = $state({})
	let pid = $derived(params.pid)
	// $inspect(params)

	$effect(()=>{
		let unsub = db.subscribeOne(`projects`, pid, data => project=data)
		return () => { unsub?.() }
	})

  import { SvelteFlow, Background, Position } from '@xyflow/svelte';
	// import { EdgeToolbar } from '@xyflow/svelte';
	import CustomEdge from '../CustomEdge.svelte';
	const edgeTypes = {
		custom: CustomEdge
	};
  import '@xyflow/svelte/dist/style.css';

  let nodes = $state.raw([
    // { id: '1', position: { x: 50, y: 20 }, data: { label: '1' } },
    // { id: '2', position: { x: 130, y: 200 }, data: { label: '2' } },
		{
			id: '1',
			data: { label: 'Node 1', toolbarPosition: Position.Top },
			position: { x: 0, y: 0 },
			class: 'svelte-flow__node-default'
		},
		{
			id: '2',
			data: { label: 'Node 2', toolbarPosition: Position.Top },
			position: { x: 100, y: 150 },
			class: 'svelte-flow__node-default'
		},
		{
			id: '3',
			data: { label: 'Node 3', toolbarPosition: Position.Top },
			position: { x: 200, y: 0 },
			class: 'svelte-flow__node-default'
		}
  ]);

  let edges = $state.raw([
    // { id: 'e1-2', source: '1', target: '2' },
		// { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', label: 'to the' },
		{
			id: 'e1-2',
			source: '1',
			target: '2',
			type: 'custom'
		},
		{
			id: 'e3-2',
			source: '3',
			target: '2',
			type: 'custom'
		},
		{
			id: 'e1-3',
			source: '1',
			target: '3',
			type: 'custom'
		}
  ]);

</script>

<Titlebar title={project.name} height={30}/>

<div style:width="100vw" style:height="90%" class="absolute">
  <SvelteFlow bind:nodes bind:edges fitView>
		<Background />
	</SvelteFlow>
</div>

<!-- <div class="p-4 bg-white dark:bg-black">
	<div class="font-semibold">{project.name}</div>
	<div class="text-gray-500">{project.description}</div>
	<hr/>
	<div>Proposal, BOM, Quotes, Invoices, RFPs </div>
	<div>Drawings - Models, Floorplans, Elevations, Cable Routes, Patching, PDFs</div>
	<div>Documents, Schedules, Tasks, Minutes</div>
	<div>Settings</div>
	<i class="tabler-heart-outline"></i>
	<i class="tabler-star-outline"></i>
	<i class="bootstrap-folder"></i>
	<i class="flag-ie"></i>
</div> -->
