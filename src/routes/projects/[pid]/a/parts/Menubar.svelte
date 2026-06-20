<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar'
	import { Icon } from '$lib'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import type { Sheet } from './sheet.svelte'
	import { INSERTS } from './insert'

	let { sheet }: { sheet: Sheet } = $props()
	let pid = $derived(page.params.pid)

	const TOOLS = [
		{ label: 'Outlets', route: 'outlets' },
		{ label: 'Frames', route: 'frames' },
		{ label: 'Racks', route: 'racks' },
		{ label: 'Sheets', route: 'sheets' },
		{ label: 'Uploads', route: 'uploads' },
	]

	const PANELS = [
		{ key: 'layers', label: 'Layers' },
		{ key: 'outlets', label: 'Outlet list' },
		{ key: 'trunks', label: 'Trunk list' },
	] as const

	const print = () => window.print()
</script>

<div class="a-chrome print:hidden flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-1">
	<Menubar.Root class="h-auto gap-0 border-0 p-0 shadow-none">
		<Menubar.Menu>
			<Menubar.Trigger class="cursor-pointer px-2 py-0.5 text-sm font-normal">Insert</Menubar.Trigger>
			<Menubar.Content align="start">
				{#each INSERTS as ins (ins.kind)}
					<Menubar.Item class="cursor-pointer" disabled={ins.todo} onSelect={() => sheet.arm(ins.kind)}>
						{ins.label}{#if ins.todo}<span class="ml-2 text-xs text-slate-400">soon</span>{/if}
					</Menubar.Item>
				{/each}
			</Menubar.Content>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="cursor-pointer px-2 py-0.5 text-sm font-normal">View</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.CheckboxItem class="cursor-pointer" checked={sheet.hiddenLines} onCheckedChange={() => (sheet.hiddenLines = !sheet.hiddenLines)}>Hidden-line 3D</Menubar.CheckboxItem>
				<Menubar.Separator />
				{#each PANELS as p (p.key)}
					<Menubar.CheckboxItem class="cursor-pointer" checked={sheet.panels[p.key]} onCheckedChange={() => sheet.togglePanel(p.key)}>{p.label}</Menubar.CheckboxItem>
				{/each}
				<Menubar.Separator />
				<Menubar.Item class="cursor-pointer" onSelect={() => sheet.zoomToFit()}>Fit sheet</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="cursor-pointer px-2 py-0.5 text-sm font-normal">Tools</Menubar.Trigger>
			<Menubar.Content align="start">
				{#each TOOLS as t (t.route)}
					<Menubar.Item class="cursor-pointer" onSelect={() => goto(`/projects/${pid}/${t.route}`)}>{t.label}</Menubar.Item>
				{/each}
			</Menubar.Content>
		</Menubar.Menu>
	</Menubar.Root>

	<button class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:bg-slate-100" title="Fit the sheet (reset pan/zoom)" onclick={() => sheet.zoomToFit()}>
		<Icon name="scan" size={14} /> Fit
	</button>
	<button class="flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:bg-slate-100" onclick={print}>
		<Icon name="print" size={14} /> Print
	</button>
</div>
