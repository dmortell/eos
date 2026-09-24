<script lang="ts">
	// Menubar (Pages mockup). Owns its open/close state; emits the chosen item via onaction
	// (the parent does the work). Most items are still mock no-ops.
	let { onaction }: { onaction?: (item: string) => void } = $props()
	const MENUS: Record<string, string[]> = {
		File: ['New Page', 'Open Project…', 'Drawings…', '—', 'Save', 'Export…', 'Outlet Schedule…', '—', 'Print…'],
		Edit: ['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', '—', 'Delete'],
		View: ['Zoom In', 'Zoom Out', 'Fit', '—', 'Split Editor', 'Unsplit', '—', 'Toggle Left Panel', 'Toggle Right Panel'],
		Insert: ['Image…', '—', 'Outlet', 'Trunk', 'Rack', '—', 'Text', 'Dimension'],
		Format: ['Drawing Defaults…'],
	}
	let openMenu = $state<string | null>(null)
	function pick(item: string) { openMenu = null; onaction?.(item) }
</script>

{#if openMenu}<button class="mb-backdrop" aria-label="Close menu" onclick={() => (openMenu = null)}></button>{/if}
<nav class="menubar">
	{#each Object.keys(MENUS) as m (m)}
		<div class="menu-wrap">
			<button class="menu-btn" class:open={openMenu === m}
				onclick={() => (openMenu = openMenu === m ? null : m)}
				onmouseenter={() => { if (openMenu) openMenu = m }}>{m}</button>
			{#if openMenu === m}
				<div class="menu-pop">
					{#each MENUS[m] as item, i (i)}
						{#if item === '—'}<div class="menu-sep"></div>
						{:else}<button class="menu-item" onclick={() => pick(item)}>{item}</button>{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</nav>

<style>
	.mb-backdrop { position:fixed; inset:0; z-index:40; background:none; border:none; }
	.menubar { position:relative; z-index:45; height:30px; flex:0 0 auto; display:flex; align-items:stretch; gap:1px;
		background:var(--panel); border-bottom:1px solid var(--line-soft); padding:0 4px; }
	.menu-wrap { position:relative; display:flex; align-items:stretch; }
	.menu-btn { padding:0 10px; font-size:12px; color:var(--text); border-radius:4px; background:none; border:none; }
	.menu-btn:hover, .menu-btn.open { background:var(--hover); }
	.menu-pop { position:absolute; top:100%; left:0; min-width:170px; z-index:50; margin-top:2px;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 15px 40px #0006; padding:4px; }
	.menu-item { display:block; width:100%; text-align:left; padding:5px 9px; font-size:12px; border-radius:4px; background:none; border:none; color:var(--text); }
	.menu-item:hover { background:var(--active); }
	.menu-sep { height:1px; background:var(--line-soft); margin:4px 6px; }
</style>
