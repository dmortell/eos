<!-- CHANGES in Properties (the design log, docs/plan/design-log.md): the changes about the selected items — or, on a
     sheet, the ones that go out with its next release — each numbered, what / asked by editable in place; + Note logs
     a new one linked to them; "Link…" ties an existing change to them too; × unlinks (the change stays in the Log). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { DesignChange, Sheet } from '../domain/drawing'
	import type { Id } from '../domain/types'
	import { newChange, changesAbout, pendingChanges, askedNames, currentCycle, today } from '../domain/changes'
	import { newId } from '../domain/ids'
	import { enterKey } from './keyGuards'
	import PropGroup from './PropGroup.svelte'

	/** `sheet`: its changes since its last release (else the changes about `ids`). */
	let { project, ws, ids, sheet, kind = 'item' }: { project: CadProject; ws: Workspace; ids: Id[]; sheet?: Sheet; kind?: string } = $props()

	const all = $derived(project.index.ofType('change') as DesignChange[])
	const list = $derived(sheet ? pendingChanges(sheet, all) : changesAbout(all, ids))
	const names = $derived(askedNames(all))
	/** Open changes of this round not yet linked here: for Link… */
	const others = $derived(all.filter((c) => c.cycle === currentCycle(all) && c.status === 'open' && !ids.every((id) => c.links.includes(id))).sort((a, b) => a.n - b.n))
	const many = $derived(ids.length > 1 ? ` (${ids.length} items)` : '')

	let what = $state(''), asked = $state('')
	$effect(() => { void ids.join(); what = '' })   // another selection: start empty
	const put = (c: DesignChange, label: string, patch: Partial<DesignChange>) => project.store.transact(label, (tx) => tx.put({ ...c, ...patch }))
	function add() {
		if (!what.trim()) return
		const c = newChange(all, newId(), { what, asked, links: ids, by: project.user ? { uid: project.user, name: project.userName } : undefined })
		project.store.transact(`Change ${c.n}`, (tx) => tx.put(c))
		ws.say(`Change ${c.n} logged${many}${sheet ? ' — its next release records it' : ''} · Tables › Log lists every change`)
		what = ''
	}
	function link(id: string) {
		const c = all.find((x) => x.id === id)
		if (c) put(c, `Link change ${c.n}`, { links: [...new Set([...c.links, ...ids])] })
	}
	const unlink = (c: DesignChange) => put(c, `Unlink change ${c.n}`, { links: c.links.filter((l) => !ids.includes(l)) })
</script>

<PropGroup {kind} title={`${sheet ? (sheet.revisions?.length ? 'Changes since last release' : 'Changes') : 'Changes'}${list.length ? ` (${list.length})` : ''}`} id="changes">
	<datalist id="cad-chg-asked">{#each names as n (n)}<option value={n}></option>{/each}</datalist>
	{#each list as c (c.id)}
		<div class="chg" class:gone={c.status === 'rejected' || c.status === 'superseded'}>
			<button class="no" title="Change {c.n} · {c.date}{c.status !== 'open' ? ` · ${c.status}` : ''} — open it (all its fields)" onclick={() => ws.select([c.id])}>{c.n}</button>
			<input class="inp" value={c.what} aria-label="Change {c.n}: what" onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) put(c, `Change ${c.n}: what`, { what: v }) }} />
			<input class="inp" list="cad-chg-asked" value={c.asked ?? ''} placeholder="asked by" title="Who asked for it" aria-label="Change {c.n}: asked by" onchange={(e) => put(c, `Change ${c.n}: asked by`, { asked: e.currentTarget.value.trim() || undefined })} />
			<button class="btn del" title="Unlink it from {sheet ? 'this sheet' : ids.length > 1 ? 'these' : 'this'} (it stays in the Log)" aria-label="Unlink change {c.n}" onclick={() => unlink(c)}>×</button>
		</div>
	{/each}
	<div class="chg"><span class="no faint" title={today()}>+</span>
		<input class="inp" bind:value={what} placeholder={sheet ? 'what changed' : `note a change${many}`} aria-label="New change: what" onkeydown={(e) => enterKey(e) && add()} />
		<input class="inp" list="cad-chg-asked" bind:value={asked} placeholder="asked by" title="Who asked for it" aria-label="New change: asked by" onkeydown={(e) => enterKey(e) && add()} />
		<button class="btn" disabled={!what.trim()} title={sheet ? 'Log this change, linked to this sheet: its next release records it on the new revision' : `Log this change, linked to ${ids.length > 1 ? 'these items' : 'this'} (Tables › Log)`} onclick={add}>+ Note</button></div>
	<div class="acts">
		{#if others.length}
			<select class="inp link" value="" title="Link a change already in the Log to {sheet ? 'this sheet' : ids.length > 1 ? 'these items' : 'this'}" onchange={(e) => { link(e.currentTarget.value); e.currentTarget.value = '' }}>
				<option value="">Link a logged change…</option>
				{#each others as c (c.id)}<option value={c.id}>{c.n}. {c.what}</option>{/each}
			</select>
		{/if}
		<button class="btn" title="Every change, with why, where it came from and where it went out (Tables › Log)" onclick={() => ws.openLog()}>Log ›</button>
	</div>
</PropGroup>

<style>
	.chg { display: grid; grid-template-columns: 1.8rem 1fr 4.5rem auto; align-items: center; gap: 4px; margin-bottom: 2px; }
	.no { font-family: ui-monospace, monospace; text-align: center; color: var(--cad-link, #1d4ed8); }
	.gone input { color: var(--cad-faint); text-decoration: line-through; }
	.acts { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
	.link { flex: 1; min-width: 0; }
</style>
