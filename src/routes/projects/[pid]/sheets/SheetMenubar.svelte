<script lang="ts">
	import * as Menubar from "$lib/components/ui/menubar";
	import type { ViewportEditor } from "./viewports.svelte";

	let { vps }: { vps: ViewportEditor } = $props()
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
</div>
