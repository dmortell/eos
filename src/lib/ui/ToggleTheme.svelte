<script lang="ts">
	import { Icon } from "$lib";
	import { ModeWatcher, toggleMode } from "mode-watcher";
</script>

<ModeWatcher />

<button onclick={toggleMode} class="h-6 w-7 rounded bg-gray-800 relative" title="Light/dark mode">
	<Icon name=sun class="h-5 scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-45 absolute"/>
	<Icon name=moon class="h-5 scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"/>
	<span class="sr-only">Toggle theme</span>
</button>