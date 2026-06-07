<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar'

	/**
	 * Application-style menubar for the page editor (File / Edit / Insert / View).
	 * Wires to the editor's existing actions; capabilities not yet built (annotation,
	 * layers, package export) are shown disabled so the structure is visible without
	 * dead clicks. Grows toward an AutoCAD-like bar as later phases land.
	 */
	let {
		height = 34,
		selectedViewportId = null,
		canUndo = false,
		canRedo = false,
		canPublish = false,
		onaddviewport,
		onaddannotation,
		onundo, onredo, onduplicate, ondelete,
		onprint, onpublish, ondeletepage,
		onzoomfit, onzoom100, onsetviewportscale,
	}: {
		height?: number
		selectedViewportId?: string | null
		canUndo?: boolean
		canRedo?: boolean
		canPublish?: boolean
		/** Opens the Add-Viewport dialog (type + source picker). */
		onaddviewport?: () => void
		/** Arms placement of an annotation of the given kind. */
		onaddannotation?: (kind: 'text') => void
		onundo?: () => void
		onredo?: () => void
		onduplicate?: () => void
		ondelete?: () => void
		onprint?: () => void
		onpublish?: () => void
		ondeletepage?: () => void
		onzoomfit?: () => void
		onzoom100?: () => void
		onsetviewportscale?: (scale: number) => void
	} = $props()

	const SCALE_PRESETS = [10, 20, 50, 100, 200, 500]
	let hasSelection = $derived(!!selectedViewportId)
</script>

<div
	class="dwg-menubar print:hidden flex items-center border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-1 shrink-0"
	style:height="{height}px"
>
	<Menubar.Root class="h-auto gap-0 border-0 p-0 shadow-none bg-transparent">
		<!-- File -->
		<Menubar.Menu>
			<Menubar.Trigger class="px-2.5 py-1 text-xs font-normal">File</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item onSelect={() => onprint?.()}>Print…</Menubar.Item>
				<Menubar.Item disabled={!canPublish} onSelect={() => onpublish?.()}>Publish revision…</Menubar.Item>
				<Menubar.Item disabled>Export package (PDF)…</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item variant="destructive" onSelect={() => ondeletepage?.()}>Delete page…</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<!-- Edit -->
		<Menubar.Menu>
			<Menubar.Trigger class="px-2.5 py-1 text-xs font-normal">Edit</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item disabled={!canUndo} onSelect={() => onundo?.()}>Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut></Menubar.Item>
				<Menubar.Item disabled={!canRedo} onSelect={() => onredo?.()}>Redo <Menubar.Shortcut>⌘⇧Z</Menubar.Shortcut></Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item disabled={!hasSelection} onSelect={() => onduplicate?.()}>Duplicate viewport <Menubar.Shortcut>⌘D</Menubar.Shortcut></Menubar.Item>
				<Menubar.Item disabled={!hasSelection} variant="destructive" onSelect={() => ondelete?.()}>Delete viewport <Menubar.Shortcut>Del</Menubar.Shortcut></Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<!-- Insert -->
		<Menubar.Menu>
			<Menubar.Trigger class="px-2.5 py-1 text-xs font-normal">Insert</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item onSelect={() => onaddviewport?.()}>Viewport…</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item onSelect={() => onaddannotation?.('text')}>Text annotation</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<!-- View -->
		<Menubar.Menu>
			<Menubar.Trigger class="px-2.5 py-1 text-xs font-normal">View</Menubar.Trigger>
			<Menubar.Content align="start">
				<Menubar.Item onSelect={() => onzoomfit?.()}>Zoom to fit</Menubar.Item>
				<Menubar.Item onSelect={() => onzoom100?.()}>Zoom 100%</Menubar.Item>
				<Menubar.Separator />
				{#if hasSelection}
					<Menubar.Sub>
						<Menubar.SubTrigger>Viewport scale</Menubar.SubTrigger>
						<Menubar.SubContent>
							{#each SCALE_PRESETS as s (s)}
								<Menubar.Item onSelect={() => onsetviewportscale?.(s)}>1:{s}</Menubar.Item>
							{/each}
							<Menubar.Separator />
							<Menubar.Item onSelect={() => onsetviewportscale?.(0)}>Fit to viewport</Menubar.Item>
						</Menubar.SubContent>
					</Menubar.Sub>
				{:else}
					<Menubar.Item disabled>Viewport scale (select a viewport)</Menubar.Item>
				{/if}
				<Menubar.Separator />
				<Menubar.Item disabled>Layers… (coming soon)</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>
	</Menubar.Root>
</div>
