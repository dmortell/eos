<!-- The NAVIGATOR window (UX review S2 / S3): levels, sheets and sections — open one in the active pane. Levels can be
     renamed / deleted here (Floors… for the rest). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import { deleteEntities, levelContents } from '../editor/commands'
	import SideSection from './SideSection.svelte'
	import SheetList from './SheetList.svelte'
	import SectionList from './SectionList.svelte'

	let { project, ws, openSheet, levelShown, onlevel, onview, onfloors, onsettings }: {
		project: CadProject; ws: Workspace; openSheet?: string; levelShown: boolean
		onlevel: (id: string) => void; onview: (s: ViewSpec) => void; onfloors: () => void; onsettings: () => void
	} = $props()

	const counts = $derived.by(() => {
		const m = new Map<string, number>()
		for (const o of project.index.outlets) m.set(o.levelId, (m.get(o.levelId) ?? 0) + 1)
		return m
	})
	// ── levels: rename, delete (Dave: Journey's 1F and 3307F aren't needed) ──
	function renameLevel(l: Level) {
		ws.askText('Level name', l.name, (t) => { if (t.trim() && t.trim() !== l.name) project.store.transact(`Rename level ${l.name} → ${t.trim()}`, (tx) => tx.put({ ...l, name: t.trim() })) })
	}
	function deleteLevel(l: Level) {
		const on = levelContents(project.store.all(), l.id)
		ws.ask2(`Delete level ${l.name} and everything on it (${on.length} item${on.length === 1 ? '' : 's'}: outlets, racks + devices, links, cords, drawing, floorplan, rooms)? Undo brings it back.`, 'Delete level', () => {
			deleteEntities(project.store, [l.id, ...on])
			if (ws.levelId === l.id) ws.levelId = project.levels.find((x) => x.id !== l.id)?.id ?? null
		})
	}
</script>

<div class="p-2">
	<SideSection key="levels" title="Levels" first>
		{#snippet actions()}<button title="The building's floors, their names and heights" onclick={onfloors}>Floors…</button><button title="The project's outlet usages and cable types" onclick={onsettings}>Settings…</button>{/snippet}
		{#each project.levels as l (l.id)}
			<div class="lvl" class:on={ws.levelId === l.id} class:dim={ws.levelId === l.id && !levelShown} title={ws.levelId === l.id && !levelShown ? 'The open level — not showing now: a sheet or the riser view is open' : undefined}>
				<button class="name" title={l.area ? `A separate plan of floor ${l.number} (area ${l.area})` : ''} onclick={() => onlevel(l.id)}>
					<span>{l.name}</span><span class="n">{counts.get(l.id) ?? ''}</span>
				</button>
				<button class="act" title="Rename this level" onclick={() => renameLevel(l)}>✎</button>
				<button class="act" title="Delete this level and everything on it" onclick={() => deleteLevel(l)}>✕</button>
			</div>
		{/each}
	</SideSection>
	<SheetList {project} {ws} open={openSheet} {onview} />
	<SectionList {project} {ws} {onview} />
</div>

<style>
	.lvl { display: flex; align-items: center; border-radius: 4px; }
	.lvl:hover { background: var(--cad-hover); }
	.lvl.on { background: var(--cad-sel); }
	.lvl.on.dim { background: none; box-shadow: inset 0 0 0 1px var(--cad-sel); color: var(--cad-muted); }
	.name { flex: 1; display: flex; justify-content: space-between; padding: 1px 8px; text-align: left; }
	.n { font-size: 11px; color: var(--cad-faint); }
	.act { visibility: hidden; padding: 0 3px; font-size: 11px; color: var(--cad-muted); }
	.lvl:hover .act { visibility: visible; }
	.act:hover { color: #dc2626; }
</style>
