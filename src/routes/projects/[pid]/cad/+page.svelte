<!-- The cad tool (src/lib/cad). Thin route: wait for sign-in, open the project, lay out the panels. -->
<script lang="ts">
	import { page } from '$app/state'
	import { onAuthStateChanged } from 'firebase/auth'
	import { doc, onSnapshot } from 'firebase/firestore'
	import { auth, firestore } from '$lib/db.svelte'
	import { Titlebar } from '$lib'
	import CadShell from '$lib/cad/ui/CadShell.svelte'

	const pid = $derived(page.params.pid ?? '')
	let uid = $state<string | null>(null)
	let authChecked = $state(false)
	let projectName = $state(''), ownerId = $state<string | undefined>(), userName = $state('')

	$effect(() => onAuthStateChanged(auth, (u) => { uid = u?.uid ?? null; userName = u?.displayName || u?.email || ''; authChecked = true }))
	$effect(() => {
		if (!uid || !pid) return
		return onSnapshot(doc(firestore, 'projects', pid), (s) => { projectName = (s.data()?.name as string) ?? pid; ownerId = (s.data()?.ownerId as string) || undefined })
	})
</script>

<Titlebar title="{projectName} · CAD" />

{#if !authChecked}
	<p class="p-6 text-sm text-zinc-500">Signing in…</p>
{:else if !uid}
	<p class="p-6 text-sm text-zinc-500">Sign in to open the cad tool.</p>
{:else}
	{#key pid}
		<CadShell {pid} user={uid} {userName} {projectName} {ownerId} />
	{/key}
{/if}
