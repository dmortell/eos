<script lang="ts">
	import { Firestore, Icon } from '$lib'
	import { Titlebar } from '$lib'
	import { page } from '$app/state';
	import { type Project } from './racks/parts/types';
	let {params, ...other} = $props()
	let project: Record<string, any> = $state({})
	let pid = $derived(params.pid)
	let id = $derived(page.params.pid); // This will correctly update id
	let path = $derived(page.url.pathname); // This will correctly update id
	let db = new Firestore();

	const tools = [
		{ href: 'racks',   icon: 'server', label: 'Rack Elevations', description: 'Manage server rooms, racks, and devices.' },
		{ href: 'frames',  icon: 'rows',   label: 'Patch Frames', description: 'Allocate outlet ports to patch frames.', },
		{ href: 'outlets', icon: 'route',  label: 'Outlets and Routes', description: 'Manage floorplan outlets and cable routes.', },
		{ href: 'uploads', icon: 'upload', label: 'Floorplan Uploads', description: 'Upload and manage floorplan files and pages.', },
	]

	$effect(()=>{
		let unsub = db.subscribeOne(`projects`, pid, data => project=data)
		return () => { unsub?.() }
	})
</script>

<Titlebar title={project.name} height={30}/>

<div class="p-4 md:p-6 bg-white dark:bg-black">
	<div class="mx-auto max-w-4xl space-y-4 md:space-y-5">
		<div class="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
			<div class="text-lg font-semibold tracking-tight">{project.name}</div>
			{#if project.description}
				<div class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{project.description}</div>
			{/if}
		</div>

		<section class="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
			<div class="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Project Tools</div>
			<ul class="space-y-2">
				{#each tools as tool}
					<li>
						<a href="{path}/{tool.href}" class="group grid grid-cols-[auto_1fr] md:grid-cols-[auto_180px_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-zinc-200 px-3 py-3 transition-all hover:border-blue-300 hover:bg-blue-50/60 dark:border-zinc-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/40" >
							<span class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-zinc-900 dark:text-zinc-300 dark:group-hover:bg-blue-900/50 dark:group-hover:text-blue-300">
								<Icon name={tool.icon} size={16} />
							</span>
							<span class="col-start-2 row-start-1 block pt-0.5 text-sm font-semibold text-zinc-900 group-hover:text-blue-800 dark:text-zinc-100 dark:group-hover:text-blue-200">{tool.label}</span>
							<span class="col-start-2 row-start-2 md:col-start-3 md:row-start-1 block pt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</div>
