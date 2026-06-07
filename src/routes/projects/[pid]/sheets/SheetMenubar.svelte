<script lang="ts">
	import * as Menubar from "$lib/components/ui/menubar";
	import { Icon } from "$lib";
	import type { ViewportEditor } from "./viewports.svelte";

	let { vps }: { vps: ViewportEditor } = $props()

	function print() {
		// Canvas's beforeprint handler injects the @page size + 1mm→1mm scale; just trigger.
		window.print()
	}
</script>

<div class="dwg-menubar print:hidden flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-1">
	<Menubar.Root class="h-auto gap-0 border-0 p-0 shadow-none">
		<Menubar.Menu>
			<Menubar.Trigger class="px-2 py-0.5 text-sm font-normal">Insert</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item onSelect={() => vps.startInsert('viewport')}>Viewport</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>
	</Menubar.Root>

	<button class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:bg-slate-100" onclick={print}>
		<Icon name="print" size={14} />
		Print
	</button>
</div>
