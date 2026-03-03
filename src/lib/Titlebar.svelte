<script>
	import { Dropdown, Icon, Row, Session, Spinner } from '$lib'
	// import { ModeWatcher, toggleMode } from "mode-watcher";
	let {title="EOS", height=null, children=null} = $props()
	let session = new Session()
</script>

<!-- <ModeWatcher /> -->

<header style="height:{height}px" class="header print:hidden bg-gray-800 text-white text-sm px-4 py-1 flex justify-between items-center">
	<a href='/' title="Back to Dashboard" class="flex gap-2 items-center"><Icon name=home/> {title}</a>
	<div>{@render children?.()}</div>

	<Row class="flex items-center gap-1">
		{#if session.user}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={session.logout} title='Sign out {session.user.email}'>Sign Out</button>
		{:else if session.user!==undefined}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={e=>session.login('google')} title='Sign in with Google'>Sign In</button>
		{/if}

		<!-- <button onclick={toggleMode} class="h-6 w-7 rounded bg-gray-800 relative" title="Light/dark mode">
			<Icon name=sun class="h-5 scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-45 absolute"/>
			<Icon name=moon class="h-5 scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"/>
			<span class="sr-only">Toggle theme</span>
		</button> -->
	</Row>
</header>
