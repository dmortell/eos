<!-- One CHANGE of the design log (picked in Tables › Log, or by its number in an item's Changes): every field —
     when, what, why, who asked, where it came from, its status — what it's about (a click selects that), where it went
     out, and who logged it. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { DesignChange, ChangeRefKind } from '../domain/drawing'
	import { askedNames, STATUSES, REF_KINDS } from '../domain/changes'
	import PropGroup from './PropGroup.svelte'

	let { project, ws, c }: { project: CadProject; ws: Workspace; c: DesignChange } = $props()

	const put = (label: string, patch: Partial<DesignChange>) => project.store.transact(`Change ${c.n}: ${label}`, (tx) => tx.put({ ...c, ...patch }))
	const names = $derived(askedNames(project.index.ofType('change') as DesignChange[]))
	const name = (id: string) => { const e = project.index.get(id); return e?.type === 'sheet' ? `${e.number} ${e.title}` : e ? `${project.index.nameOf(id) || e.type}` : '(deleted)' }
	const kindOf = (id: string) => project.index.get(id)?.type ?? ''
	const setRef = (kind: ChangeRefKind | '', text: string) => put('reference', { ref: kind || text.trim() ? { kind: (kind || 'other') as ChangeRefKind, text: text.trim() } : undefined })
</script>

<PropGroup kind="change" title="Change {c.n}">
	<label class="row"><span>Date</span><input class="inp" type="date" value={c.date} onchange={(e) => e.currentTarget.value && put('date', { date: e.currentTarget.value })} /></label>
	<label class="row"><span>What</span><input class="inp" value={c.what} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) put('what', { what: v }) }} /></label>
	<label class="row top"><span>Why</span><textarea class="inp" rows="3" value={c.why ?? ''} placeholder="the reason (optional)" onchange={(e) => put('why', { why: e.currentTarget.value.trim() || undefined })}></textarea></label>
	<datalist id="cad-chgp-asked">{#each names as n (n)}<option value={n}></option>{/each}</datalist>
	<label class="row"><span>Asked by</span><input class="inp" list="cad-chgp-asked" value={c.asked ?? ''} onchange={(e) => put('asked by', { asked: e.currentTarget.value.trim() || undefined })} /></label>
	<div class="row"><span>Reference</span>
		<div class="ref">
			<select class="inp" value={c.ref?.kind ?? ''} title="Where it came from" onchange={(e) => setRef(e.currentTarget.value as ChangeRefKind, c.ref?.text ?? '')}>
				<option value="">—</option>{#each REF_KINDS as [k, label] (k)}<option value={k}>{label}</option>{/each}
			</select>
			<input class="inp" value={c.ref?.text ?? ''} placeholder="email subject, RFI no. …" onchange={(e) => setRef(c.ref?.kind ?? '', e.currentTarget.value)} />
		</div></div>
	<label class="row"><span>Status</span><select class="inp" value={c.status} onchange={(e) => put(e.currentTarget.value, { status: e.currentTarget.value as DesignChange['status'] })}>
		{#each STATUSES as [s, label] (s)}<option value={s}>{label}</option>{/each}</select></label>
</PropGroup>
<PropGroup kind="change" title="About ({c.links.length})">
	{#each c.links as id (id)}
		<div class="lnk"><button class="go" disabled={!project.index.get(id)} title="Select it" onclick={() => ws.selectAndReveal([id])}><span class="k">{kindOf(id)}</span> {name(id)}</button>
			<button class="btn del" title="Unlink it" aria-label="Unlink {name(id)}" onclick={() => put('unlink', { links: c.links.filter((l) => l !== id) })}>×</button></div>
	{:else}
		<p class="muted">Not linked to anything — select items or a sheet, then in their Properties › Changes, Link a logged change….</p>
	{/each}
</PropGroup>
<PropGroup kind="change" title="Record">
	{#if c.released?.length}<p>Released: {c.released.map((r) => `${name(r.sheetId)} rev ${r.code}`).join(' · ')}</p>{:else}<p class="muted">Not released yet</p>{/if}
	<p class="muted">Round {c.cycle} · logged {new Date(c.at).toLocaleString()}{c.by ? ` by ${c.by.name || c.by.uid}` : ''}</p>
	<div class="acts"><button class="btn" onclick={() => ws.openLog()}>Log ›</button></div>
</PropGroup>

<style>
	.row { display: grid; grid-template-columns: 5rem 1fr; align-items: center; gap: 4px; margin-bottom: 3px; }
	.row.top { align-items: start; }
	.ref { display: grid; grid-template-columns: 5.5rem 1fr; gap: 4px; }
	.lnk { display: flex; align-items: center; gap: 4px; }
	.go { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.go:not(:disabled):hover { text-decoration: underline; }
	.k { color: var(--cad-faint); font-size: 11px; }
	.acts { display: flex; gap: 4px; margin-top: 4px; }
</style>
