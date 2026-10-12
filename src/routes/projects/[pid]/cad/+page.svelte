<!-- The cad tool (src/lib/cad). Thin route: wait for sign-in, open the project, lay out the panels. It also hosts the
     projects page's Project details dialog (cad's Project › Project details…), as the Sheets tool does. -->
<script lang="ts">
	import { page } from '$app/state'
	import { onAuthStateChanged } from 'firebase/auth'
	import { doc, onSnapshot } from 'firebase/firestore'
	import { auth, firestore } from '$lib/db.svelte'
	import { Titlebar } from '$lib'
	import CadShell from '$lib/cad/ui/CadShell.svelte'
	import ProjectSettingsDialog, { type Project } from '../../ProjectSettingsDialog.svelte'

	const pid = $derived(page.params.pid ?? '')
	let uid = $state<string | null>(null)
	let authChecked = $state(false)
	let projectName = $state(''), ownerId = $state<string | undefined>(), userName = $state('')
	let projectDoc = $state<Project | null>(null), detailsOpen = $state(false)

	$effect(() => onAuthStateChanged(auth, (u) => { uid = u?.uid ?? null; userName = u?.displayName || u?.email || ''; authChecked = true }))
	$effect(() => {
		if (!uid || !pid) return
		return onSnapshot(doc(firestore, 'projects', pid), (s) => {
			const data = s.data()
			projectName = (data?.name as string) ?? pid; ownerId = (data?.ownerId as string) || undefined
			projectDoc = data ? { ...(data as Project), id: pid } : null
		})
	})
</script>

<Titlebar title="{projectName} · CAD" height={28} />   <!-- CadShell fills the rest: 100dvh − 28px -->

{#if !authChecked}
	<p class="p-6 text-sm text-zinc-500">Signing in…</p>
{:else if !uid}
	<p class="p-6 text-sm text-zinc-500">Sign in to open the cad tool.</p>
{:else}
	{#key pid}
		<CadShell {pid} user={uid} {userName} {projectName} {ownerId} details={projectDoc ?? undefined} projectDetails={projectDoc ? () => (detailsOpen = true) : undefined} />
	{/key}
	<ProjectSettingsDialog bind:open={detailsOpen} mode="edit" project={projectDoc} />
{/if}
