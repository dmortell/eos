<script>
	import { Titlebar, Icon, Button, Loading } from '$lib';
	import {Input, InputGroup} from "$lib/components/ui/input-group/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Firestore, Session} from '$lib'
  import { page } from '$app/state';
	let db = new Firestore();
	let proposals = $state([])
	let loading = $state(1)
	let search = $state('')
	let show = $state(0)

	let filtered = $derived(
		proposals.filter(p =>
			p.title.toLowerCase().includes(search.toLowerCase()) ||
			p.clientName.toLowerCase().includes(search.toLowerCase())
		)
		.sort((a, b) => b.createdAt - a.createdAt)
	)

	let path = $derived(page.url.pathname); // This will correctly update id

	let app = {

		getStatusColor: (status) => {
			switch(status) {
				case 'sent': return 'bg-blue-100 text-blue-800';
				case 'accepted': return 'bg-green-100 text-green-800';
				case 'rejected': return 'bg-red-100 text-red-800';
			}
			return 'text-secondary-foreground bg-secondary';
		}
	}

	$effect(()=>{
		// let unsub = store.getCollection('proposals').then(proposals => {app.proposals = proposals})
		let unsub = db.subscribeMany('proposals', data=>{proposals = data; loading = 0})
		return () => { unsub?.() }
	})

	// let cfg = getContext('settings')


</script>

<Titlebar title="Proposals" height={32}/>

<Loading {loading}>

<main class="p-4">
	<!-- {#await app.proposals}
		<h1>Proposals</h1>
		<div>Loading...</div>
	{:then proposals} -->

		<!-- {#if user} -->
<div class="grid w-full max-w-sm gap-2">


  <InputGroup class="px-2">
		<Icon name=search/>
		<Input placeholder="Search..." bind:value={search}/>
    <div>{filtered.length} results</div>
  </InputGroup>

    <!-- <textarea placeholder="Autoresize textarea..." data-slot="input-group-control"
      class="flex field-sizing-content min-h-16 w-full resize-none rounded border
			bg-transparent px-2 py-2 text-base transition-[color,box-shadow] outline-none md:text-sm"
    ></textarea> -->

</div>

		<!-- <div class="flex items-center justify-between mb-4">
			<h2 class="text-xl font-semibold">Proposals</h2>
			<div class="relative rounded border border-gray-300">
				<Search class="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input type="search" placeholder="Search proposals..." class="pl-8" bind:value={searchQuery} />
			</div>
			<Button variant="outline" class="" onclick={e=>e}><Plus class="w-4 h-4"/>New Proposal</Button>
		</div> -->

		<div class="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 space-y-2">
			{#each filtered as proposal}
				<div class="flex gap-2 justify-between text-foreground rounded-md border border-border hover:shadow-md transition p-2">
					<div class="flex-1">
						<div class="flex justify-between">
							<a class="font-semibold text-popover-foreground hover:opacity-90" href="{path}/{proposal.id}">{proposal.title}</a>
							<div class="flex gap-2 items-end p-1">
								<Button icon=pen  size="sm" variant="ghost"  href="{path}/{proposal.id}"></Button>
								<Button icon=copy size="sm" variant="ghost"  onclick={() => copyProposal(proposal)}></Button>
								<Button icon=trash size="sm" variant="ghost" onclick={() => showDeleteConfirm = proposal.id}></Button>
							</div>
						</div>
						<div class="text-sm text-muted-foreground">{proposal.clientName || 'No client'}</div>
						<div class="flex gap-2 mt-1 items-center text-xs">
							<div class="{app.getStatusColor(proposal.status)} text-xs rounded p-1 px-3">{proposal.status}</div>
							<span>{proposal.sections.length} sections</span>
							<span class="text-muted-foreground">Updated: {new Date(proposal.updatedAt).toLocaleDateString()}</span>
						</div>
					</div>
				</div>
						<!-- {#if showDeleteConfirm === proposal.id}
							<div class="mt-4 pt-4 border-t space-y-3">
								<p class="text-sm text-destructive font-medium">Delete this proposal?</p>
								<div class="flex gap-2">
									<Button size="sm" variant="destructive" class="flex-1" onclick={() => deleteProposal(proposal.id)}>Delete</Button>
									<Button size="sm" variant="outline" class="flex-1" onclick={() => showDeleteConfirm = null}>Cancel</Button>
								</div>
							</div>
						{/if} -->
			{:else}
				<div class="text-gray-500">No proposals</div>
			{/each}
		</div>
		<!-- {:else}
			<div class="text-gray-500">Please sign in</div>
		{/if} -->


	<!-- {:catch error}
		<div>Error: {error.message}</div>
	{/await} -->
</main>

</Loading>