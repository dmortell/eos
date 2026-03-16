<script lang="ts">
  import { Titlebar } from '$lib';
  import Projects from './projects/Projects.svelte';
  import Dashboard from './dashboard/parts/Dashboard.svelte';
</script>

<Titlebar />

<div class="p-3 space-y-3">
  <section class=""><Projects /></section>
  <section class="space-y-1 border rounded-md bg-white p-3"><Dashboard /></section>
</div>