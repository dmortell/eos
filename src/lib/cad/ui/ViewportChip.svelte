<!-- The VIEWPORT CHIP (UX18; Dave: "the pan / zoom content toggle of Pages / Sheets … always visible no matter the
     zoom level"): a small bar on the selected (or edited) viewport's top-left corner, at screen size — its scale (pick
     1:N), "Pan / zoom content" (a drag inside pans its view, the wheel steps its scale; no Alt needed), and Edit inside /
     Done. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, Viewport } from '../domain/drawing'
	import type { Camera } from '../editor/camera'
	import { SCALES } from '../views/sheet'
	import { Icon } from '$lib'

	let { project, ws, sheet, vp, editing, cam, onenter, onexit }: {
		project: CadProject; ws: Workspace; sheet: Sheet; vp: Viewport; editing: boolean; cam: Camera; onenter: () => void; onexit: () => void
	} = $props()

	/** Above the window's top-left corner, kept under the view strip. */
	const left = $derived(Math.max(4, cam.x + vp.rect.x * cam.k))
	const top = $derived(Math.max(32, cam.y + vp.rect.y * cam.k - 30))
	function setScale(n: number) {
		if (!(n > 0) || n === vp.scale) return
		const s = sheet
		project.store.transact(`Viewport scale 1:${n}`, (tx) => tx.put({ ...s, viewports: s.viewports.map((v) => (v.id === vp.id ? { ...v, scale: n } : v)) }))
	}
</script>

<div class="chip" style:left="{left}px" style:top="{top}px" role="toolbar" aria-label="Viewport">
	<label title="The viewport's scale">1:
		<select value={SCALES.includes(vp.scale) ? String(vp.scale) : ''} disabled={vp.locked} onchange={(e) => setScale(Number(e.currentTarget.value))}>
			{#if !SCALES.includes(vp.scale)}<option value="">{vp.scale}</option>{/if}
			{#each SCALES as n (n)}<option value={String(n)}>{n}</option>{/each}
		</select>
	</label>
	<button class:on={ws.vpContentNav} disabled={vp.locked} title="Pan / zoom content: a drag inside the viewport pans its view and the wheel steps its scale (off: they move the paper; Alt does it once)" onclick={() => (ws.vpContentNav = !ws.vpContentNav)}><Icon name="move" size={12} /> Pan / zoom content</button>
	<button title="Open this viewport's view (the model view) in its own tab" onclick={() => ws.openInTab({ levelId: vp.view.levelId, spec: $state.snapshot(vp.view.spec) })}><Icon name="link" size={12} /> Open view</button>
	{#if editing}
		<button class="done" title="Stop editing inside the viewport (Esc, or a double-click outside it)" onclick={onexit}>Done</button>
	{:else}
		<button title="Edit the model inside this viewport (or double-click it)" onclick={onenter}><Icon name="edit" size={12} /> Edit inside</button>
	{/if}
</div>

<style>
	.chip { position: absolute; z-index: 15; display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 6px; background: color-mix(in srgb, var(--cad-panel, #fff) 92%, transparent); border: 1px solid var(--cad-sel-line, #93c5fd); box-shadow: 0 2px 8px rgb(0 0 0 / 0.12); font-size: 11px; color: var(--cad-muted, #52525b); white-space: nowrap; }
	select { font-size: 11px; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; background: var(--cad-input, #fff); color: var(--cad-text); }
	button { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 4px; border: 1px solid transparent; }
	button:hover:not(:disabled) { background: var(--cad-hover, #f4f4f5); }
	button.on { background: var(--cad-sel, #dbeafe); color: var(--cad-link, #1d4ed8); border-color: var(--cad-sel-line, #93c5fd); }
	button.done { background: #2563eb; color: white; }
	/* the hover's pale background left white text unreadable (Dave): dark text on it */
	button.done:hover:not(:disabled) { background: var(--cad-sel, #dbeafe); color: var(--cad-sel-text, #1e3a8a); }
	button:disabled { opacity: 0.4; }
</style>
