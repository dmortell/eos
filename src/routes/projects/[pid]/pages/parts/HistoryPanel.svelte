<script lang="ts">
	// Right-sidebar HISTORY panel: undo / redo + the change log, and (drawings-plan §3, phase 7) for the active tab —
	//   a stored MODEL: its versions (the first save is 1.0; a major keeps a full copy you can restore, a minor is
	//     a dated note) and "Save minor / major";
	//   a stored SHEET: its revisions and "Issue". Issuing needs every model the sheet shows at an unedited MAJOR
	//     version — each one that isn't is listed with what to do (a model edited since its major can overwrite
	//     that version here; otherwise open the model and save one). A sheet already issued offers "Issue rev N+1"
	//     or "Overwrite rev N".
	// Data + actions come from the parent (+page → pagesProject.svelte.ts).
	import { Icon } from '$lib'
	import { nextVersion, isMajor, nextRevisionCode, type ModelVersionState, type ModelVersionDoc, type IssueProblem } from '../store/versions'
	import type { ChangeLogRow } from '../history.svelte'
	import type { RevisionDoc } from '$lib/types/versioning'

	type ModelInfo = { id: string; name: string; version?: string; state: ModelVersionState }
	type SheetInfo = { title: string; code?: string; issuedAt?: string; edited: boolean }
	let { log = [], onjump, onundo, onredo,
		model = null, versions = [], onsaveversion, onrestoreversion,
		sheet = null, problems = [], revisions = [], onissue, onopenmodel, onoverwritemodel, onrevedit, onrevdelete, onrevcurrent }: {
		log?: ChangeLogRow[]; onjump?: (i: number) => void; onundo?: () => void; onredo?: () => void
		model?: ModelInfo | null; versions?: ModelVersionDoc[]
		onsaveversion?: (a: { major: boolean; note: string }) => void; onrestoreversion?: (version: string) => void
		sheet?: SheetInfo | null; problems?: IssueProblem[]; revisions?: RevisionDoc[]
		onissue?: (a: { note: string; overwrite: boolean; code?: string }) => void; onopenmodel?: (id: string) => void
		/** B6: edit a revision's description / date, delete it, make it the current one. */
		onrevedit?: (code: string, patch: { description?: string; issuedAt?: string }) => void
		onrevdelete?: (code: string) => void; onrevcurrent?: (code: string, issuedAt: string) => void
		/** Re-save a model's current MAJOR version (it was edited since). */ onoverwritemodel?: (id: string) => void
	} = $props()

	let note = $state('')
	function ago(t: number) {
		const s = Math.round((Date.now() - t) / 1000)
		if (s < 60) return s + 's ago'
		if (s < 3600) return Math.round(s / 60) + 'm ago'
		return Math.round(s / 3600) + 'h ago'
	}
	const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
	const stateText: Record<ModelVersionState | 'missing', string> = {
		unversioned: 'not versioned yet', edited: 'edited since', minor: 'at a minor version', ready: 'saved', missing: 'missing (archived or deleted)',
	}
	function save(major: boolean) { onsaveversion?.({ major, note: note.trim() }); note = '' }
	function issue(overwrite: boolean) { onissue?.({ note: note.trim(), overwrite, code: overwrite ? undefined : issueCode.trim() }); note = ''; codeEdit = null }
	// B6: the code to issue (editable), whether it's taken, and the revision rows' edit / delete
	let codeEdit = $state<string | null>(null)
	const issueCode = $derived(codeEdit ?? nextRevisionCode(sheet?.code))
	const codeTaken = $derived(revisions.some((r) => r.code === issueCode.trim()))
	let editing = $state<string | null>(null), confirmDel = $state<string | null>(null)
	function delRev(code: string) {
		if (confirmDel !== code) { confirmDel = code; setTimeout(() => { if (confirmDel === code) confirmDel = null }, 3000); return }
		confirmDel = null; onrevdelete?.(code)
	}
	let confirmRestore = $state<string | null>(null)
	function restore(v: string) {
		if (confirmRestore !== v) { confirmRestore = v; setTimeout(() => { if (confirmRestore === v) confirmRestore = null }, 3000); return }
		confirmRestore = null; onrestoreversion?.(v)
	}
</script>

<div class="hp">
	<div class="hp-tools">
		<button onclick={() => onundo?.()} title="Undo (Ctrl+Z)"><Icon name="chevronLeft" size={14} /> Undo</button>
		<button onclick={() => onredo?.()} title="Redo (Ctrl+Y)">Redo <Icon name="chevronRight" size={14} /></button>
	</div>

	{#if model}
		<div class="hp-sec"><span>MODEL VERSIONS · {model.name}</span></div>
		<div class="hp-status" class:warn={model.state === 'edited' || model.state === 'unversioned'}>
			{#if model.version}<b>{model.version}</b>{' · '}{/if}{model.state === 'edited' ? 'edited since this version' : stateText[model.state]}
		</div>
		<textarea class="hp-note" rows="3" placeholder="What changed (saved with the version)…" bind:value={note}></textarea>
		<div class="hp-acts">
			{#if !model.version}
				<button class="primary" onclick={() => save(true)}>Save version 1.0</button>
			{:else}
				<button onclick={() => save(false)} title="A dated note (no copy)">Save minor {nextVersion(model.version, false)}</button>
				<button class="primary" onclick={() => save(true)} title="Keeps a full copy — needed to issue sheets">Save major {nextVersion(model.version, true)}</button>
			{/if}
		</div>
		{#if versions.length}
			<div class="hp-list">
				{#each versions as v (v.id)}
					<div class="hp-rev" class:major={v.major}>
						<div class="hp-rev-head">
							<span class="hp-ver">{v.version}</span>
							<span class="hp-name" title={v.note}>{v.note || (v.major ? 'Major version' : 'Minor version')}</span>
							<span class="hp-when" title={v.createdBy}>{fmtDate(v.createdAt)}</span>
							{#if v.major && v.snapshot}
								<button class="hp-restore" class:confirm={confirmRestore === v.version} onclick={() => restore(v.version)}
									title="Put this version's content back (one undo step)">{confirmRestore === v.version ? 'Restore?' : 'Restore'}</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if sheet}
		<div class="hp-sec"><span>SHEET REVISIONS · {sheet.title}</span></div>
		<div class="hp-status" class:warn={sheet.edited}>
			{#if sheet.code}Rev <b>{sheet.code}</b>{` · issued ${fmtDate(sheet.issuedAt)}${sheet.edited ? ' · edited since' : ''}`}{:else}Not issued yet{/if}
		</div>
		{#if problems.length}
			<div class="hp-probs">
				<div class="hp-probs-head">Issuing needs each model at a saved MAJOR version:</div>
				{#each problems as p (p.modelId)}
					<div class="hp-prob">
						<span class="hp-name">{p.name}</span>
						<em>{p.state === 'edited' ? `edited since ${p.version}` : p.state === 'minor' ? `at ${p.version}` : stateText[p.state]}</em>
						{#if p.state === 'edited' && isMajor(p.version)}
							<button onclick={() => onoverwritemodel?.(p.modelId)} title="Re-save {p.version} with the model as it is now">Overwrite {p.version}</button>
						{/if}
						{#if p.state !== 'missing'}<button onclick={() => onopenmodel?.(p.modelId)} title="Open the model to save a new version">Open</button>{/if}
					</div>
				{/each}
			</div>
		{/if}
		<textarea class="hp-note" rows="3" placeholder="Revision description…" bind:value={note}></textarea>
		<div class="hp-acts">
			<!-- B6: any code (P1, C1 …) — prefilled with the next in sequence -->
			<label class="hp-code-l">Code</label>
			<input class="hp-code" value={issueCode} title="Revision code — any text (A, B … / P1, P2 … / C1 …)" oninput={(e) => (codeEdit = (e.currentTarget as HTMLInputElement).value)} />
			<button class="primary" disabled={problems.length > 0 || !issueCode.trim() || codeTaken} title={codeTaken ? `Revision ${issueCode} exists — Overwrite it, or pick another code` : ''} onclick={() => issue(false)}>Issue rev {issueCode}</button>
			{#if sheet.code}<button disabled={problems.length > 0} onclick={() => issue(true)} title="Replace revision {sheet.code} with the sheet as it is now">Overwrite {sheet.code}</button>{/if}
		</div>
		{#if revisions.length}
			<div class="hp-list">
				{#each revisions as r (r.id)}
					<div class="hp-rev major" class:editing={editing === r.code}>
						<div class="hp-rev-head">
							<input type="radio" name="hp-cur" checked={sheet.code === r.code} title="Make this the CURRENT revision (the title block's Rev + Date)" onchange={() => onrevcurrent?.(r.code, r.issuedAt)} />
							<span class="hp-ver">{r.code}</span>
							<span class="hp-name" title={r.description}>{r.description || 'Issued'}</span>
							<span class="hp-when" title={r.issuedBy}>{fmtDate(r.issuedAt)}</span>
							<button class="hp-ico" class:on={editing === r.code} title="Edit description / date" onclick={() => (editing = editing === r.code ? null : r.code)}><Icon name="edit" size={12} /></button>
							<button class="hp-ico del" class:confirm={confirmDel === r.code} title={confirmDel === r.code ? 'Click again to delete' : 'Delete this revision'} onclick={() => delRev(r.code)}><Icon name="trash" size={12} /></button>
						</div>
						{#if editing === r.code}
							<!-- the editor opens BELOW the row, full width (no squeezing inputs into one line) -->
							<div class="hp-rev-edit">
								<input class="hp-edit" value={r.description ?? ''} placeholder="Description" onchange={(e) => onrevedit?.(r.code, { description: (e.currentTarget as HTMLInputElement).value.trim() })} />
								<div class="hp-rev-edit-row">
									<input class="hp-date" type="date" value={r.issuedAt?.slice(0, 10)} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) onrevedit?.(r.code, { issuedAt: new Date(v + 'T12:00:00').toISOString() }) }} />
									<button class="hp-done" onclick={() => (editing = null)}>Done</button>
								</div>
							</div>
						{/if}
						{#if confirmDel === r.code}<div class="hp-del-note">Delete revision {r.code}? Click the bin again.</div>{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<div class="hp-sec"><span>CHANGE LOG</span><span class="hp-hint">click a step to jump</span></div>
	{#if log.length}
		<div class="hp-list">
			{#each log as h (h.i)}
				<button class="hp-row log" class:current={h.kind === 'current'} class:future={h.kind === 'future'}
					title={h.kind === 'current' ? 'Current state' : h.kind === 'future' ? 'Redo to here' : 'Undo to here'}
					onclick={() => onjump?.(h.i)}>
					<span class="hp-dot"></span>
					<span class="hp-name">{h.label}</span>
					<span class="hp-when">{ago(h.t)}</span>
				</button>
			{/each}
		</div>
	{:else}
		<div class="hp-empty">Edits will appear here.</div>
	{/if}
</div>

<style>
	.hp { flex:1; overflow-y:auto; overflow-x:hidden; min-height:0; padding:6px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.hp-tools { display:flex; gap:5px; padding:2px 2px 6px; }
	.hp-tools button { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:6px; font-size:11px;
		border-radius:5px; color:var(--text); background:var(--panel2); border:1px solid var(--line); }
	.hp-tools button:hover { background:var(--hover); }
	.hp-sec { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:9px; text-transform:uppercase;
		letter-spacing:.1em; color:var(--faint); padding:10px 4px 4px; }
	.hp-sec span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.hp-status { font-size:11px; color:var(--muted); padding:2px 5px 5px; }
	.hp-status.warn { color:#f59e0b; }
	.hp-status b { color:var(--text); font-family:Consolas,monospace; }
	.hp-note { width:100%; min-height:44px; resize:vertical; background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; padding:4px 6px; font-size:11px; font-family:inherit; line-height:1.35; display:block; }
	.hp-note:focus { outline:none; border-color:var(--accent); }
	.hp-acts { display:flex; flex-wrap:wrap; align-items:center; gap:5px; padding:5px 0 4px; }
	.hp-code-l { font-size:10px; color:var(--faint); }
	.hp-acts button { flex:1 1 90px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; padding:5px 6px; border-radius:5px; color:var(--text); background:var(--panel2); border:1px solid var(--line); cursor:pointer; }
	.hp-acts button.primary { border-color:var(--accent); color:var(--accent); }
	.hp-acts button:hover:not(:disabled) { background:var(--hover); }
	.hp-acts button:disabled { opacity:.4; cursor:default; }
	.hp-probs { margin:2px 0 5px; padding:5px 6px; border:1px solid #f59e0b55; border-radius:5px; background:#f59e0b12; }
	.hp-probs-head { font-size:10px; color:#f59e0b; padding-bottom:3px; }
	.hp-prob { display:flex; align-items:center; gap:5px; font-size:11px; padding:2px 0; }
	.hp-prob em { font-style:normal; font-size:10px; color:var(--muted); flex:0 0 auto; }
	.hp-prob button { flex:0 0 auto; font-size:10px; padding:1px 6px; border-radius:4px; color:var(--accent); background:none; border:1px solid var(--line); cursor:pointer; }
	.hp-prob button:hover { background:var(--active); }
	.hp-list { display:flex; flex-direction:column; gap:1px; }
	.hp-row { display:flex; align-items:center; gap:7px; width:100%; padding:5px 6px; border-radius:5px; color:var(--text); background:none; border:none; text-align:left; }
	.hp-row.log { cursor:pointer; }
	.hp-row.log:hover { background:var(--hover); }
	.hp-row.log.current { background:var(--active); }
	.hp-row.log.current .hp-name { color:var(--accent); font-weight:600; }
	.hp-row.log.current .hp-dot { background:var(--accent); }
	.hp-row.log.future { opacity:.45; }              /* undone steps you can redo to */
	.hp-row.log.future .hp-name { text-decoration:line-through; }
	.hp-hint { font-size:9px; color:var(--faint); text-transform:none; letter-spacing:0; }
	.hp-rev { padding:4px 6px; border-radius:5px; }
	.hp-rev:hover { background:var(--hover); }
	.hp-rev-head { display:flex; align-items:center; gap:7px; }
	.hp-ver { flex:0 0 auto; min-width:26px; font-size:11px; font-family:Consolas,monospace; color:var(--muted); }
	.hp-rev.major .hp-ver { color:var(--text); font-weight:700; }
	.hp-code { width:52px; flex:none; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 5px; font-size:11px; font-family:Consolas,monospace; }
	.hp-rev.editing { background:var(--hover); }
	.hp-rev-edit { display:flex; flex-direction:column; gap:5px; padding:6px 0 2px 20px; }
	.hp-rev-edit-row { display:flex; align-items:center; gap:6px; }
	.hp-edit { width:100%; box-sizing:border-box; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:4px 6px; font-size:12px; }
	.hp-date { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 5px; font-size:11px; color-scheme:dark; }
	.hp-edit:focus, .hp-date:focus { outline:none; border-color:var(--accent); }
	.hp-done { flex:none; font-size:11px; font-weight:600; padding:4px 14px; border-radius:4px; border:none; background:var(--accent); color:#fff; color:contrast-color(var(--accent)); cursor:pointer; }
	.hp-ico { flex:none; width:22px; height:22px; display:grid; place-items:center; padding:0; border:1px solid var(--line); border-radius:4px; background:none; color:var(--muted); cursor:pointer; }
	.hp-ico:hover, .hp-ico.on { color:var(--text); background:var(--active); }
	.hp-ico.del:hover { color:#f87171; }
	.hp-ico.confirm { color:#fff; background:#dc2626; border-color:#dc2626; }
	.hp-del-note { font-size:10px; color:#f87171; padding:3px 0 0 20px; }
	.hp-mini { flex:0 0 auto; font-size:10px; color:var(--muted); background:none; border:1px solid transparent; border-radius:4px; padding:1px 4px; cursor:pointer; }
	.hp-rev:hover .hp-mini { border-color:var(--line); }
	.hp-mini.confirm { color:#fff; background:#dc2626; border-color:#dc2626; }
	.hp-rev-head input[type=radio] { accent-color:var(--accent); margin:0; }
	.hp-restore { flex:0 0 auto; font-size:10px; color:var(--accent); background:none; border:1px solid var(--line); border-radius:4px; padding:1px 7px; cursor:pointer; }
	.hp-restore:hover { background:var(--active); }
	.hp-restore.confirm { color:#fff; background:#d97706; border-color:#d97706; }
	.hp-name { flex:1; min-width:0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.hp-when { font-size:10px; color:var(--faint); flex:0 0 auto; }
	.hp-dot { width:6px; height:6px; border-radius:50%; background:var(--line); flex:0 0 auto; margin:0 3px; }
	.hp-empty { font-size:10px; color:var(--faint); padding:8px 6px; line-height:1.4; }
</style>
