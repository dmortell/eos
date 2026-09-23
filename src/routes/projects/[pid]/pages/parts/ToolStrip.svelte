<script lang="ts">
	// The floating tool strip (R9 commit 2, review.md §R9) — split out of parts/Pane.svelte's `.floattools`
	// block verbatim: a single tool button, or a grouped fly-out (hover to reveal variants; the Guide group
	// is a special case with no `members` — its fly-out picks H/V orientation instead of a tool). Pane.svelte
	// still owns `guideVert`/`openGroup`/`groupTool` (bound two-way, unchanged) and `STRIP`/`iconOf` (its own
	// tool-name → icon lookup); this component is a pure render, same as Pane.svelte's own split out of
	// +page.svelte. `tool` itself is a PLAIN read-only prop + an `onTool` callback (not bindable) — Pane
	// doesn't own `pane.tool` either (it's +page.svelte's `session.panes[i].tool`), so the write has to
	// bubble all the way up to whoever actually owns the state, not stop at the first ancestor.
	import { Icon } from '$lib'
	import type { StripItem } from '../types'

	let {
		tool, onTool, dim, STRIP, iconOf,
		guideVert = $bindable(), openGroup = $bindable(), groupTool = $bindable(),
	}: {
		tool: string; onTool: (t: string) => void; dim: boolean; STRIP: StripItem[]; iconOf: (tool: string) => string
		guideVert: boolean; openGroup: string | null; groupTool: Record<string, string>
	} = $props()
</script>

<div class="floattools glass-bar" class:dim>
	{#each STRIP as s (('tool' in s) ? s.tool : s.group)}
		<!-- strip: single tool, or a grouped fly-out (hover to reveal variants) -->
			{#if 'tool' in s}
				<button class="tool" class:on={tool === s.tool} title={s.tool} onclick={() => onTool(s.tool)}><Icon name={iconOf(s.tool)} size={16} /></button>
			{:else if s.group === 'guide'}
				<!-- Guide: pick Horizontal / Vertical from the fly-out (touch has no Shift) -->
				<div class="grp">
					<button class="tool grp-btn" class:on={tool === 'Guide'} title="Guide — {guideVert ? 'vertical' : 'horizontal'}" onclick={() => { onTool('Guide'); openGroup = 'guide' }}>
						<Icon name={guideVert ? 'moveVertical' : 'moveHorizontal'} size={16} /><span class="grp-caret"></span>
					</button>
					<div class="flyout" class:open={openGroup === 'guide'}>
						<button class="tool" class:on={tool === 'Guide' && !guideVert} title="Horizontal guide" onclick={() => { onTool('Guide'); guideVert = false; openGroup = null }}><Icon name="moveHorizontal" size={16} /></button>
						<button class="tool" class:on={tool === 'Guide' && guideVert} title="Vertical guide" onclick={() => { onTool('Guide'); guideVert = true; openGroup = null }}><Icon name="moveVertical" size={16} /></button>
					</div>
				</div>
			{:else}
				{@const inGrp = s.members.includes(tool)}
				{@const cur = inGrp ? tool : groupTool[s.group]}
				<div class="grp">
					<button class="tool grp-btn" class:on={inGrp} title="{s.label} — {cur}" onclick={() => { onTool(cur); openGroup = s.group }}>
						<Icon name={iconOf(cur)} size={16} /><span class="grp-caret"></span>
					</button>
					<div class="flyout" class:open={openGroup === s.group}>
						{#each s.members as m (m)}
							<button class="tool" class:on={tool === m} title={m} onclick={() => { onTool(m); groupTool = { ...groupTool, [s.group]: m }; openGroup = null }}><Icon name={iconOf(m)} size={16} /></button>
						{/each}
					</div>
				</div>
			{/if}
	{/each}
</div>

<style>
	.glass-bar { position:absolute; display:flex; gap:2px; padding:4px; border-radius:8px;
		background:color-mix(in srgb, var(--panel) 82%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0004; }
	.floattools { top:12px; left:12px; flex-direction:column; transition:opacity .15s; z-index:5; }
	.floattools.dim { opacity:.4; }
	.floattools.dim:hover { opacity:.85; }
	.tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:6px; color:var(--muted); background:none; border:none; }
	.tool:hover { background:var(--hover); color:var(--text); }
	.tool.on { background:var(--active); color:var(--accent); }
	/* Grouped tool: a button that re-activates the group's last-used tool + a hover fly-out of variants. */
	.grp { position:relative; display:flex; }
	.grp-btn { position:relative; }
	/* corner triangle marking a group (▟), lower-right of the icon */
	.grp-caret { position:absolute; right:3px; bottom:3px; width:0; height:0; border-left:4px solid transparent; border-top:4px solid transparent; border-right:4px solid currentColor; opacity:.55; }
	.flyout { position:absolute; left:100%; top:-4px; margin-left:6px; display:none; flex-direction:row; gap:2px; padding:4px;
		border-radius:8px; background:color-mix(in srgb, var(--panel) 92%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0005; z-index:10; }
	/* invisible bridge over the gap so moving onto the fly-out doesn't drop the hover */
	.flyout::before { content:''; position:absolute; left:-8px; top:0; bottom:0; width:8px; }
	.grp:hover .flyout, .flyout.open { display:flex; }   /* hover (mouse) or tap-open (touch) */
</style>
