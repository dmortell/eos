<script lang="ts">
  import SharedAlbum from './SharedAlbum.svelte';
	let { data } = $props()
</script>

<SharedAlbum {data} />
