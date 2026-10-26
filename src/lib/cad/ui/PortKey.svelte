<!-- What a rack view's port colors mean (User 2026-10-26: "user will also need to know what the different port colors
     mean"): the ports as drawn (rackRow.ts classes, Prims.svelte colors) and, while a cord or a link is being made, the
     lit ports (portTip.ts portLights, PortLights.svelte). `patching` = only the second list, compact (the tool bar). -->
<script lang="ts">
	let { patching = false, link = false }: { patching?: boolean; link?: boolean } = $props()
	const DRAWN = [
		{ c: 'plain', t: 'Not cabled, no label', tip: 'Nothing on it yet. A panel port needs a label (an outlet, a tie or a typed label) before a cord goes on it' },
		{ c: 'labelled', t: 'Labelled, no cable', tip: 'It has a label (a range on the panel, or typed) but no permanent cable yet — tie or link it' },
		{ c: 'linked', t: 'Cabled', tip: 'A permanent cable: to an outlet (tinted with the outlet’s usage color), a tie to another panel in the room, or backbone to another room' },
		{ c: 'patched', t: 'Patched (green edge)', tip: 'A patch cord is plugged in' },
		{ c: 'stale', t: 'Label changed since printed', tip: 'The panel’s labels were printed and this port’s label has changed since — reprint' },
		{ c: 'reserved', t: 'Reserved for a usage', tip: 'Properties › Reserve for… — Patch to… keeps it for that usage’s outlets' },
		{ c: 'sel', t: 'Selected', tip: 'The ports you picked' },
	]
	const LIT = $derived([
		{ c: 'from', t: link ? 'Linking from' : 'Patching from', tip: 'The port(s) you started from' },
		{ c: 'free', t: link ? 'Free for a cable' : 'Free for a cord', tip: link ? 'No permanent cable on it: a tie / backbone can land here' : 'A cord can go on it' },
		{ c: 'taken', t: link ? 'Has a cable' : 'Has a cord', tip: link ? 'It already has a permanent cable' : 'A cord is already plugged in' },
		{ c: 'blocked', t: link ? 'Can’t take a cable' : 'Can’t take a cord', tip: link ? 'Not a panel, enclosure or switch (a PDU, a server): patch it with a cord instead' : 'A panel port without a label: tie or label it first' },
		{ c: 'far', t: 'Other end (pointer)', tip: 'Where the cords and cable on the port under the pointer go' },
	])
</script>

{#if patching}
	<span class="key compact" aria-label="Port colors">{#each LIT.slice(0, 4) as k (k.c)}<span class="item" title={k.tip}><i class="sw {k.c}"></i>{k.t}</span>{/each}</span>
{:else}
	<div class="key" aria-label="Port colors">
		<b>Ports</b>
		{#each DRAWN as k (k.c)}<span class="item" title={k.tip}><i class="sw {k.c}"></i>{k.t}</span>{/each}
		<b>While patching or linking</b>
		{#each LIT as k (k.c)}<span class="item" title={k.tip}><i class="sw {k.c}"></i>{k.t}</span>{/each}
	</div>
{/if}

<style>
	.key { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--cad-text); }
	.key b { font-size: 11px; color: var(--cad-muted); font-weight: 600; margin-top: 4px; }
	.key b:first-child { margin-top: 0; }
	.key.compact { flex-direction: row; gap: 8px; font-size: 11px; color: var(--cad-muted); }
	.item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
	.sw { display: inline-block; width: 14px; height: 10px; border-radius: 2px; border: 1px solid #94a3b8; background: #ffffff; flex: none; }
	/* the ports as drawn (Prims.svelte) */
	.sw.labelled { background: #fef9c3; }
	.sw.linked { background: #e0f2fe; border-color: #0284c7; }
	.sw.patched { border: 2px solid #16a34a; }
	.sw.stale { border: 2px solid #dc2626; }
	.sw.reserved { background: #f5f3ff; border: 1px dashed #8b5cf6; }
	.sw.sel { background: rgb(37 99 235 / 0.3); border: 2px solid #1d4ed8; }
	/* lit while patching (PortLights.svelte) */
	.sw.free { background: rgb(34 197 94 / 0.3); border-color: #16a34a; }
	.sw.taken { background: rgb(239 68 68 / 0.35); border-color: #dc2626; }
	.sw.blocked { background: rgb(100 116 139 / 0.35); border-color: #64748b; }
	.sw.from { background: rgb(250 204 21 / 0.6); border: 2px solid #f59e0b; }
	.sw.far { background: rgb(56 189 248 / 0.55); border: 2px solid #0284c7; }
</style>
