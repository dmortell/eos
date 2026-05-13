<script lang="ts">
	import { Icon } from '$lib'
	let { icon = '', title = '', size=12, onclick = null as (() => void) | null } = $props()
</script>

<button class="p-0.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors" {title} {onclick}>
	<Icon name={icon} {size} />
</button>
