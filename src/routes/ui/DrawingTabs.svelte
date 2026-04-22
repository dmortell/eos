
<script>
let tabs = ["Floor 3", "Rack Row A", "Fill Rate"]
</script>

<div class="border-t flex">
  {#each tabs as t}
    <div class="px-3 py-2 border-r bg-slate-100">{t}</div>
  {/each}
</div>
