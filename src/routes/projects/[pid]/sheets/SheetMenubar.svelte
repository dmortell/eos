<script lang="ts">
	import * as Menubar from "$lib/components/ui/menubar";
	import { Icon } from "$lib";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import type { ViewportEditor } from "./viewports.svelte";

	let { vps, onsettings, ondefaults, onfit }: { vps: ViewportEditor; onsettings?: () => void; ondefaults?: () => void; onfit?: () => void } = $props()
	let pid = $derived(page.params.pid)

	// Quick navigation to the other project tools.
	const TOOLS: { label: string; route: string }[] = [
		{ label: 'Outlets', route: 'outlets' },
		{ label: 'Frames', route: 'frames' },
		{ label: 'Patching', route: 'patching' },
		{ label: 'Fill rates', route: 'fillrate' },
		{ label: 'Uploads', route: 'uploads' },
		{ label: 'Surveys', route: 'surveys' },
	]

	function print() {
		// Canvas's beforeprint handler injects the @page size + 1mm→1mm scale; just trigger.
		window.print()
	}
</script>

<div class="dwg-menubar print:hidden flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-1">
	<Menubar.Root class="h-auto gap-0 border-0 p-0 shadow-none">
		<Menubar.Menu>
			<Menubar.Trigger class="cursor-pointer px-2 py-0.5 text-sm font-normal">File</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item class="cursor-pointer" onSelect={() => onsettings?.()}>Project details…</Menubar.Item>
				<Menubar.Item class="cursor-pointer" onSelect={() => ondefaults?.()}>Drawing defaults…</Menubar.Item>
				<Menubar.Item class="cursor-pointer" onSelect={print}>Print</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="cursor-pointer px-2 py-0.5 text-sm font-normal">Insert</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item class="cursor-pointer" onSelect={() => vps.startInsert('viewport')}>Viewport</Menubar.Item>
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

	<button class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:bg-slate-100" title="Fit the sheet to the view (reset pan/zoom)" onclick={() => onfit?.()}>
		<Icon name="scan" size={14} />
		Fit
	</button>
	<button class="flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:bg-slate-100" onclick={print}>
		<Icon name="print" size={14} />
		Print
	</button>
</div>
