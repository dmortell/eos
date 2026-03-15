<script lang="ts">
	import { Button, Dropdown, Icon, Row, Session, Spinner } from '$lib'
	import { getContext, type Snippet } from 'svelte';
	import PresenceAvatars from '$lib/presence/PresenceAvatars.svelte'
	import { startPresence, stopPresence } from '$lib/presence/presence.svelte'
  import { updated } from '$app/state';		// For update notifications. Polling interval is set in svelte.config.js
  import ToggleTheme from './ToggleTheme.svelte';

  const menuItems = [
		{ label: 'Racks', href: 'racks' },
		{ label: 'Frames', href: 'frames' },
		{ label: 'Floorplans', href: 'outlets' },
	]
	let {title="EOS 0.2", height=null, children=null, menu=null, saveStatus=''}: {
		title?: string
		height?: number | null
		children?: Snippet | null
		menu?: boolean | null
		saveStatus?: string
	} = $props()
	let session = getContext('session') as Session

	$effect(() => {
		if (session.user) startPresence(session.user)
		else              stopPresence()
	})
</script>

<header style="height:{height}px" class="row print:hidden bg-slate-800 text-white px-4 py-1 justify-between">
	<a href='/' title="Home" class="row"><Icon name=home/> {title}</a>
	<div>{@render children?.()}</div>

	<div class='row'>
		{#if menu}
			{#each menuItems as item}<a href={item.href} class="rounded hover:text-gray-200 px-2">{item.label}</a>{/each}
			&middot;
		{/if}
		{#if session.user}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={session.logout} title='Sign out {session.user.email}'>Sign Out</button>
			{#if updated.current}
				<button onclick={()=>location.reload()} class="bg-blue-500 text-white px-2 py-1 rounded" title="A new version is available. Click to refresh.">Refresh</button>
			{/if}
			<PresenceAvatars />
		{:else if session.user!==undefined}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={e=>session.login('google')} title='Sign in with Google'>Sign In</button>
		{/if}
		<!-- <ToggleTheme /> -->
		<div class="row">{#if saveStatus === 'saved'}o{:else if saveStatus === 'saving'}!{:else if 0 || saveStatus!=''}/{/if}</div>
	</div>
</header>
