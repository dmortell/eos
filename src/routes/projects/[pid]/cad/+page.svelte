<!-- The cad tool (src/lib/cad). Thin route: wait for sign-in, open the project, lay out the panels. It also hands cad
     the projects page's details form (ProjectDetailsForm): Project settings shows it as its Details · Company · Members
     tabs (User 2026-10-16, "Project settings vs details" option A). -->
<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { onAuthStateChanged } from 'firebase/auth'
	import { doc, onSnapshot } from 'firebase/firestore'
	import { auth, firestore } from '$lib/db.svelte'
	import { Titlebar } from '$lib'
	import CadShell from '$lib/cad/ui/CadShell.svelte'
	import type { DetailsPart, DetailsTabs } from '$lib/cad/ui/SettingsDialog.svelte'
	import type { Project } from '../../ProjectSettingsDialog.svelte'
	import ProjectDetailsForm from '../../ProjectDetailsForm.svelte'

	const pid = $derived(page.params.pid ?? '')
	let uid = $state<string | null>(null)
	let authChecked = $state(false)
	let projectName = $state(''), fullTitle = $state(''), ownerId = $state<string | undefined>(), userName = $state('')
	let projectDoc = $state<Project | null>(null)
	let form: ReturnType<typeof ProjectDetailsForm> | undefined = $state()
	let detailsDirty = $state(false), dirtyParts = $state<DetailsPart[]>([])
	const detailsTabs: DetailsTabs = {
		panel: detailsPanel,
		get dirty() { return detailsDirty },
		get dirtyParts() { return dirtyParts },
		save: () => form?.save(),
		discard: () => form?.discard(),
	}

	$effect(() => onAuthStateChanged(auth, (u) => { uid = u?.uid ?? null; userName = u?.displayName || u?.email || ''; authChecked = true }))
	$effect(() => {
		if (!uid || !pid) return
		return onSnapshot(doc(firestore, 'projects', pid), (s) => {
			const data = s.data()
			// a building of a project group (User 2026-10-16): {PROJECT} is the group's name, the title bar its full one
			projectName = ((data?.groupName ?? data?.name) as string) ?? pid; fullTitle = (data?.name as string) ?? pid; ownerId = (data?.ownerId as string) || undefined
			projectDoc = data ? { ...(data as Project), id: pid } : null
		})
	})
</script>

{#snippet detailsPanel(part: DetailsPart | null)}
	<ProjectDetailsForm bind:this={form} project={projectDoc} {part} bind:dirty={detailsDirty} bind:dirtyParts onarchived={() => goto('/projects')} />
{/snippet}

<Titlebar title="{fullTitle} · CAD" height={28} />   <!-- CadShell fills the rest: 100dvh − 28px -->

{#if !authChecked}
	<p class="p-6 text-sm text-zinc-500">Signing in…</p>
{:else if !uid}
	<p class="p-6 text-sm text-zinc-500">Sign in to open the cad tool.</p>
{:else}
	{#key pid}
		<CadShell {pid} user={uid} {userName} {projectName} {ownerId} details={projectDoc ?? undefined} detailsTabs={projectDoc ? detailsTabs : undefined} />
	{/key}
{/if}
