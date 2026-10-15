<!-- Settings › SHEETS: the project's CONTACTS (review of D8, Dave 2026-10-14: "Project contacts") — who issues go to:
     name, organisation, email. A package picks its recipients from them (Tables › Sheets › Packages › Edit); a change
     here shows on every package that has the contact. Deleting one leaves packages with its name as it was. The
     packages' typed recipients from before can be turned into contacts in one go. Project data: Undo works. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Contact, ProjectSettings } from '../domain/types'
	import type { SheetPackage } from '../domain/drawing'
	import { contactsFromPackages } from '../domain/packages'
	import { newId } from '../domain/ids'
	import { enterKey } from './keyGuards'

	let { project }: { project: CadProject } = $props()

	const st = $derived.by(() => { void project.rev; return project.settings })
	const list = $derived(st?.contacts ?? [])
	const pkgs = $derived.by(() => { void project.rev; return project.store.ofType('package') as SheetPackage[] })
	const typed = $derived(pkgs.reduce((n, p) => n + (p.recipients ?? []).filter((r) => !r.contactId).length, 0))
	const uses = (id: string) => pkgs.filter((p) => p.recipients?.some((r) => r.contactId === id)).length

	const put = (label: string, contacts: Contact[]) => { if (st) project.store.transact(label, (tx) => tx.put({ ...st, contacts: contacts.length ? contacts : undefined } as ProjectSettings)) }
	const set = (c: Contact, patch: Partial<Contact>) => put(`Contact ${c.name}`, list.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))
	let name = $state(''), org = $state(''), email = $state('')
	function add() {
		if (!name.trim()) return
		put(`Contact ${name.trim()}`, [...list, { id: newId(), name: name.trim(), ...(org.trim() ? { org: org.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) }])
		name = ''; org = ''; email = ''
	}
	/** The packages' typed recipients → contacts, and the packages point at them: one undo step. */
	function fromPackages() {
		if (!st) return
		const r = contactsFromPackages(pkgs, list, newId)
		project.store.transact('Contacts from packages', (tx) => { tx.put({ ...st, contacts: [...list, ...r.contacts] } as ProjectSettings); for (const p of r.packages) tx.put(p) })
	}
	const opt = (v: string) => v.trim() || undefined
</script>

<p class="note">Who releases go to: a package picks its recipients from these (Tables › Sheets › Packages › Edit).</p>
<table>
	<thead><tr><th>Name</th><th>Organisation</th><th>Email</th><th title="Packages that send to them">Packages</th><th></th></tr></thead>
	<tbody>
		{#each list as c (c.id)}
			<tr>
				<td><input class="inp" value={c.name} onchange={(e) => e.currentTarget.value.trim() && set(c, { name: e.currentTarget.value.trim() })} /></td>
				<td><input class="inp" value={c.org ?? ''} placeholder="—" onchange={(e) => set(c, { org: opt(e.currentTarget.value) })} /></td>
				<td><input class="inp" type="email" value={c.email ?? ''} placeholder="—" onchange={(e) => set(c, { email: opt(e.currentTarget.value) })} /></td>
				<td class="n">{uses(c.id) || '—'}</td>
				<td><button class="del" title="Delete this contact (packages keep the name as it is now) — Undo brings it back" onclick={() => put(`Delete contact ${c.name}`, list.filter((x) => x.id !== c.id))}>✕</button></td>
			</tr>
		{/each}
	</tbody>
</table>
<div class="foot">
	<input class="inp w" placeholder="Name" bind:value={name} onkeydown={(e) => enterKey(e) && add()} />
	<input class="inp w" placeholder="Organisation" bind:value={org} onkeydown={(e) => enterKey(e) && add()} />
	<input class="inp w" placeholder="Email" bind:value={email} onkeydown={(e) => enterKey(e) && add()} />
	<button class="btn" disabled={!name.trim() || !st} onclick={add}>+ Add contact</button>
</div>
{#if typed}
	<p class="note">{typed} recipient{typed === 1 ? '' : 's'} typed on packages, not contacts yet:
		<button class="btn" title="Make each name + organisation a contact (once), and point the packages at them" onclick={fromPackages}>Add them as contacts</button></p>
{/if}

<style>
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted); padding: 2px 6px; }
	td { padding: 1px 6px; }
	.n { color: var(--cad-muted); }
	.note { padding: 4px 6px; color: var(--cad-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.inp.w { width: 11rem; }
	.del { color: var(--cad-faint); padding: 0 4px; }
	.del:hover { color: #dc2626; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.foot { display: flex; gap: 6px; align-items: center; padding: 6px; }
</style>
