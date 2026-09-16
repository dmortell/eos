<script lang="ts">
	import { Button, Dropdown, Icon, MetalButton, Row, Session, Spinner } from '$lib'
	import { getContext, type Snippet } from 'svelte';
	import { page } from '$app/state'
	import { startPresence, stopPresence } from '$lib/presence/presence.svelte'
  import { updated } from '$app/state';		// For update notifications. Polling interval is set in svelte.config.js
	import PresenceAvatars from '$lib/presence/PresenceAvatars.svelte'
  import ToggleTheme from './ToggleTheme.svelte';
  import { theme, THEMES } from '$lib/theme/theme.svelte'
  import { palette } from '$lib/palette/palette.svelte'

  const menuItems = [
		{ label: 'Racks', href: 'racks' },
		{ label: 'Frames', href: 'frames' },
		{ label: 'Floorplans', href: 'outlets' },
	]
	// Absolute per-project links — relative hrefs break from nested tool routes
	// like /projects/{pid}/elevations/patching (they'd resolve against the
	// parent segment, not the project root).
	const toolHref = (h: string) => page.params.pid ? `/projects/${page.params.pid}/${h}` : h
	let {title="EOS 0.3", height=null, children=null, menu=null, saveStatus=''}: {
		title?: string
		height?: number | null
		children?: Snippet | null
		menu?: boolean | null
		saveStatus?: string
	} = $props()
	let session = getContext('session') as Session

	// Carry forward floor/room/row/rack params so tool switches keep context
	let menuQs = $derived.by(() => {
		const sp = page.url.searchParams
		const out = new URLSearchParams()
		for (const key of ['floor', 'room', 'row', 'rack']) {
			const v = sp.get(key)
			if (v != null) out.set(key, v)
		}
		const qs = out.toString()
		return qs ? `?${qs}` : ''
	})

	$effect(() => {
		if (session.user) startPresence(session.user)
		else              stopPresence()
	})
</script>

<header style="height:{height}px" class="row print:hidden bg-slate-800 text-white px-4 py-1 justify-between">
	<div class="row">
		{#if page.url.pathname !== '/'}
			<button onclick={() => history.back()} title="Back" aria-label="Back" class="row rounded hover:text-gray-200">
				<Icon name="chevronLeft" />
			</button>
		{/if}
		<a href='/' title="Home" class="row"><Icon name=home/> {title}</a>
	</div>
	<div>{@render children?.()}</div>

	<div class='row'>
		{#if menu}
			{#each menuItems as item}<a href={`${toolHref(item.href)}${menuQs}`} class="rounded hover:text-gray-200 px-2">{item.label}</a>{/each}
			&middot;
		{/if}
		<button class="rounded px-1 hover:text-gray-200" onclick={() => (palette.open = true)} title="Find a sheet, tool or project (Ctrl+K)" aria-label="Find">
			<Icon name="search" size={15} />
		</button>
		<!-- Theme switcher (Kestrel trial themes) — cycles EOS / Kestrel Dark / Kestrel Light -->
		<button class="rounded px-1 hover:text-gray-200" title="Theme: {THEMES.find(t => t.id === theme.current)?.label} — click to switch"
			aria-label="Switch theme"
			onclick={() => { const i = THEMES.findIndex(t => t.id === theme.current); theme.set(THEMES[(i + 1) % THEMES.length].id) }}>
			<Icon name={theme.current === 'kestrel-dark' ? 'moon' : theme.current === 'kestrel-light' ? 'sun' : 'monitor'} size={15} />
		</button>
		{#if session.user}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={session.logout} title='Sign out {session.user.email}'>Sign Out</button>
			{#if updated.current}<MetalButton onclick={()=>location.reload()} variant="green" title="A new version is available. Click to refresh.">Refresh</MetalButton>{/if}
			<PresenceAvatars />
		{:else if session.user!==undefined}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={e=>session.login('google')} title='Sign in with Google'>Sign In</button>
		{/if}
		<!-- <ToggleTheme /> -->
		<div class="row">{#if saveStatus === 'saved'}o{:else if saveStatus === 'saving'}!{:else if 0 || saveStatus!=''}/{/if}</div>
	</div>
</header>
