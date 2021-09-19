<script>
	import { Page, BlockTitle, Block, List, ListItem, Link } from 'framework7-svelte';
	import {session, } from '$js/stores'
	export let f7router, f7route
</script>

<Page>
	<BlockTitle>Main Menu</BlockTitle>
	<List>
	  <ListItem link="/action-sheet/" title="Settings" panelClose />
	  <ListItem link="/contacts-list/" title="Admin" panelClose />
	  <ListItem link="/data-table/" title="History" panelClose />
	  <ListItem link="/data-table/" title="Help" panelClose />
	  {#if $session.user}
	  	<ListItem link="/" title="Logout" panelClose onClick={session.signout} />
	  {/if}
	</List>
</Page>
