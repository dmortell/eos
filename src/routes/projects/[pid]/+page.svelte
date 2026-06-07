<script lang="ts">
	import { Firestore, Icon, Button } from '$lib'
	import { Titlebar } from '$lib'
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { type Project } from './racks/parts/types';
	import { fmtFloor, migrateFloors } from '$lib/utils/floor'
	import ProjectSettingsDialog from '../ProjectSettingsDialog.svelte'
	let {params, ...other} = $props()
	let project: Record<string, any> = $state({})
	let settingsOpen = $state(false)
	let pid = $derived(params.pid)
	let id = $derived(page.params.pid); // This will correctly update id
	let path = $derived(page.url.pathname); // This will correctly update id
	let db = new Firestore();

	let floors = $state([{ number: 1, serverRoomCount: 1 }]);	// let floorFormat = $state('01');
	const fmt = (fl: number) => fl < 0 ? `B${String(Math.abs(fl))}` : `${fl}F`	// const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)

	let tools = $derived([
		{ detail:0, primary: false, href: 'workspace', icon: 'panels', label: 'Workspace', description: 'Unified tree navigator, view switcher, and live patch list. Tabs, library drag-to-canvas, inline edits — all five tools in one surface.', },
		{ detail:0, href: 'drawings', icon: 'list',  label: 'Drawing List', description: 'Master drawing register with revision history and Excel export.', },
		{ detail:0, href: 'packages', icon: 'layers', label: 'Drawing Packages', description: 'Assemble and publish drawing revision packages for vendors and clients.', },
		{ detail:1, href: 'outlets', icon: 'route',  label: 'Outlets and Routes', description: 'Draw racks, outlets, and cable routes on the floorplan.', },
		{ detail:1, href: 'racks',   icon: 'server', label: 'Rack Elevations', description: 'Manage server rooms, racks, and devices in elevation.' },
		{ detail:1, href: 'frames',  icon: 'rows',   label: 'Patch Frames', description: 'Assign floor ports and rack panels.', },
		{ detail:1, href: 'patching', icon: 'cable', label: 'Patching', description: 'Manage patch cord connections and cable schedules.', },
		{ detail:1, href: 'risers',  icon: 'rectVertical', label: 'Risers', description: 'Building elevation with inter-floor cable routing.', },
		{ detail:0, href: 'fillrate', icon: 'pile',  label: 'Fill Rates', description: 'Containment fill rates with cross-section diagrams.', },
		{ detail:0, href: 'uploads', icon: 'upload', label: 'Floorplan Uploads', description: 'Upload and manage floorplan files and pages.', },
		{ detail:0, href: `/survey?project=${pid}`, icon: 'camera', label: 'Photo Surveys', description: 'Take photos, voice notes, and share survey albums.', absolute: true },
	])


	$effect(()=>{
		let unsub = db.subscribeOne(`projects`, pid, data => {
			project = data
			if (Array.isArray(data?.floors) && data.floors.length) floors = migrateFloors(data.floors);
		})
		return () => { unsub?.() }
	})
</script>

<Titlebar title={project.name} />

<div class="p-4 md:p-6 bg-white dark:bg-black">
	<div class="mx-auto max-w-4xl space-y-4 md:space-y-5">
		<div class="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
			<div class="min-w-0">
				<div class="text-lg font-semibold tracking-tight">{project.name}</div>
				{#if project.description}
					<div class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{project.description}</div>
				{/if}
			</div>
			<Button variant="outline" icon="settings" onclick={() => settingsOpen = true}>Settings</Button>
		</div>

		<section class="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
			<div class="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Project Tools</div>
			<ul class="space-y-2">
				{#each tools as tool}
					<li>
						<a href={tool.absolute ? tool.href : `${path}/${tool.href}`} class="group grid grid-cols-[auto_1fr] md:grid-cols-[auto_180px_1fr] items-start gap-x-3 gap-y-1 rounded-xl border px-3 py-3 transition-all
							{tool.primary
								? 'border-blue-300 bg-blue-50/60 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-950/40 dark:hover:border-blue-600'
								: 'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/60 dark:border-zinc-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/40'}" >
							<span class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg
								{tool.primary
									? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
									: 'bg-zinc-100 text-zinc-700 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-zinc-900 dark:text-zinc-300 dark:group-hover:bg-blue-900/50 dark:group-hover:text-blue-300'}">
								<Icon name={tool.icon} size={16} />
							</span>
							<div class="col-start-2 row-start-1 block pt-0.5 text-sm text-zinc-900 group-hover:text-blue-800 dark:text-zinc-100 dark:group-hover:text-blue-200">
							<div class="font-semibold">{tool.label}</div>
							<div>
								{#if tool.detail}
								{#each floors as fl (fl.number)}
									<button class="text-xs pr-1">{fmt(fl.number)}</button>
									<!-- <button class="h-6 px-2 rounded text-[11px] font-mono font-medium transition-colors">{fmt(fl.number)}</button> -->
								{/each}
								{/if}

							</div>
							</div>
							<span class="col-start-2 row-start-2 md:col-start-3 md:row-start-1 block pt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</div>

<ProjectSettingsDialog bind:open={settingsOpen} mode="edit" project={project as any} onarchived={() => goto('/projects')} />
