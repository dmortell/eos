
<script>
let layers = ["Outlets High", "Outlets Low", "Trunk Routes"]
</script>

<div class="w-64 border-l">
  <div class="p-2 font-bold">Layers</div>
  {#each layers as l}
    <div class="px-2 py-1">
      <input type="checkbox" checked /> {l}
    </div>
  {/each}
</div>
