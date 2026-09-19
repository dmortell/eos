<script lang="ts">
	// Right-sidebar HISTORY panel (Pages mockup): undo/redo, a change log, and named
	// revision snapshots you can restore (basis for clouding diffs later). Data + actions
	// come from the parent (+page owns the undo/redo stacks and the doc entities).
	import { Icon } from '$lib'
	type Snap = Record<string, unknown>
	let { history = [], revisions = [], rev = '', revOptions = [], onrev, onnote, onundo, onredo, onnewrevision, onrestore }:
		{ history?: { label: string; t: number }[]; revisions?: { name: string; note: string; snap: Snap; t: number }[];
			rev?: string; revOptions?: string[]; onrev?: (r: string) => void; onnote?: (i: number, note: string) => void;
			onundo?: () => void; onredo?: () => void; onnewrevision?: () => void; onrestore?: (s: Snap) => void } = $props()

	function ago(t: number) {
		const s = Math.round((Date.now() - t) / 1000)
		if (s < 60) return s + 's ago'
		if (s < 3600) return Math.round(s / 60) + 'm ago'
		return Math.round(s / 3600) + 'h ago'
	}
	// Absolute issue date (shown in the row; also feeds the titleblock revision listing).
	const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
</script>

<div class="hp">
	<!-- Current issue revision of this drawing (moved here from the titlebar). -->
	<div class="hp-rev-head-row">
		<span>REVISION</span>
		<select value={rev} onchange={(e) => onrev?.((e.currentTarget as HTMLSelectElement).value)}>
			{#each revOptions as r (r)}<option value={r}>{r}</option>{/each}
		</select>
	</div>
	<div class="hp-tools">
		<button onclick={() => onundo?.()} title="Undo (Ctrl+Z)"><Icon name="chevronLeft" size={14} /> Undo</button>
		<button onclick={() => onredo?.()} title="Redo (Ctrl+Y)">Redo <Icon name="chevronRight" size={14} /></button>
	</div>

	<div class="hp-sec">
		<span>REVISIONS</span>
		<button class="hp-add" onclick={() => onnewrevision?.()} title="Snapshot the drawing as a new revision"><Icon name="plus" size={12} /> New</button>
	</div>
	{#if revisions.length}
		<div class="hp-list">
			{#each revisions as r, i (r.name + r.t)}
				<div class="hp-rev">
					<div class="hp-rev-head">
						<Icon name="fileText" size={13} />
						<span class="hp-name">{r.name}</span>
						<span class="hp-when" title={ago(r.t)}>{fmtDate(r.t)}</span>
						<button class="hp-restore" onclick={() => onrestore?.(r.snap)} title="Restore this revision">Restore</button>
					</div>
					<input class="hp-note" placeholder="Add a description note…" value={r.note} oninput={(e) => onnote?.(i, (e.currentTarget as HTMLInputElement).value)} />
				</div>
			{/each}
		</div>
	{:else}
		<div class="hp-empty">No revisions yet — “New” snapshots the current drawing.</div>
	{/if}

	<div class="hp-sec"><span>CHANGE LOG</span></div>
	{#if history.length}
		<div class="hp-list">
			{#each history as h, i (i)}
				<div class="hp-row log">
					<span class="hp-dot"></span>
					<span class="hp-name">{h.label}</span>
					<span class="hp-when">{ago(h.t)}</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="hp-empty">Edits will appear here.</div>
	{/if}
</div>

<style>
	.hp { flex:1; overflow-y:auto; min-height:0; padding:6px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.hp-rev-head-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 4px 8px; }
	.hp-rev-head-row span { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); }
	.hp-rev-head-row select { background:var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:2px 8px; font-size:12px; font-weight:600; }
	.hp-rev-head-row select:focus { outline:none; border-color:var(--accent); }
	.hp-tools { display:flex; gap:5px; padding:2px 2px 6px; }
	.hp-tools button { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:6px; font-size:11px;
		border-radius:5px; color:var(--text); background:var(--panel2); border:1px solid var(--line); }
	.hp-tools button:hover { background:var(--hover); }
	.hp-sec { display:flex; align-items:center; justify-content:space-between; font-size:9px; text-transform:uppercase;
		letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.hp-add { display:inline-flex; align-items:center; gap:3px; font-size:10px; color:var(--accent); background:none; border:none; text-transform:none; letter-spacing:0; }
	.hp-add:hover { color:var(--text); }
	.hp-list { display:flex; flex-direction:column; gap:1px; }
	.hp-row { display:flex; align-items:center; gap:7px; width:100%; padding:5px 6px; border-radius:5px; color:var(--text); background:none; border:none; text-align:left; }
	.hp-row.rev:hover { background:var(--hover); }
	.hp-row :global(svg) { color:var(--muted); flex:0 0 auto; }
	.hp-rev { padding:5px 6px; border-radius:5px; }
	.hp-rev:hover { background:var(--hover); }
	.hp-rev-head { display:flex; align-items:center; gap:7px; }
	.hp-rev-head :global(svg) { color:var(--muted); flex:0 0 auto; }
	.hp-restore { flex:0 0 auto; font-size:10px; color:var(--accent); background:none; border:1px solid var(--line); border-radius:4px; padding:1px 7px; }
	.hp-restore:hover { background:var(--active); }
	.hp-note { width:100%; margin-top:4px; background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; padding:3px 6px; font-size:11px; }
	.hp-note:focus { outline:none; border-color:var(--accent); }
	.hp-name { flex:1; min-width:0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.hp-when { font-size:10px; color:var(--faint); flex:0 0 auto; }
	.hp-dot { width:6px; height:6px; border-radius:50%; background:var(--line); flex:0 0 auto; margin:0 3px; }
	.hp-empty { font-size:10px; color:var(--faint); padding:8px 6px; line-height:1.4; }
</style>
