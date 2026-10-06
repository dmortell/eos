<!-- What each WINDOW holds (split out of CadShell): Navigator, Properties (+ import notes), Layers, Blocks, Racks,
     Device library, Cables. The shell docks / floats the window; this is its inside. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { WinId } from '../app/windows.svelte'
	import type { Level } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import type { NavNode } from '../domain/navTree'
	import type { Block } from '../domain/blocks'
	import Navigator from './Navigator.svelte'
	import Properties from './Properties.svelte'
	import ImportNotes from './ImportNotes.svelte'
	import LayersPanel from './LayersPanel.svelte'
	import BlockManager from './BlockManager.svelte'
	import RackList from './RackList.svelte'
	import DeviceLibrary from './DeviceLibrary.svelte'
	import CableList from './CableList.svelte'

	let { id, project, ws, level, projectName, current, tabbed, on }: {
		id: WinId; project: CadProject; ws: Workspace; level: Level | undefined; projectName: string
		/** What the active pane shows (the Navigator marks it). */
		current: { levelId?: string; spec: ViewSpec }
		/** The views open in tabs (the Navigator's dots). */
		tabbed: Set<string>
		on: {
			navOpen(n: NavNode, keep?: boolean): void; floors(): void; settings(): void; newSheet(): void; pdfAll(): void; pdf(id: string): void
			/** A block picked in Blocks (null = back to Select). */
			insert(b: Block | null): void
			view(s: ViewSpec): void
		}
	} = $props()
</script>

{#if id === 'navigator'}
	<Navigator {project} {ws} {current} onopen={on.navOpen} {tabbed} onfloors={on.floors} onsettings={on.settings} onnewsheet={on.newSheet} onpdfall={on.pdfAll} onpdf={on.pdf} />
{:else if id === 'properties'}
	<Properties {project} {ws} />
	<ImportNotes {project} {ws} />
{:else if id === 'layers'}
	<div class="p-2"><LayersPanel {project} {ws} /></div>
{:else if id === 'blocks'}
	<div class="p-2"><BlockManager {project} {ws} levelId={level?.id} onpick={(b) => on.insert(b ?? null)} /></div>
{:else if id === 'racks'}
	<div class="p-2">{#if level}<RackList {project} {ws} {projectName} levelId={level.id} onview={on.view} />{/if}</div>
{:else if id === 'devices'}
	<div class="p-2"><DeviceLibrary {project} {ws} /></div>
{:else if id === 'cables'}
	<div class="p-2"><CableList {project} {ws} /></div>
{/if}
