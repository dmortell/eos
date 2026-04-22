
<script>
let floors = [
  { name: "Floor 1" },
  { name: "Floor 2" },
  { name: "Floor 3" }
]
</script>

<div class="w-64 border-r overflow-auto">
  <div class="p-2 font-bold">Drawings</div>
  {#each floors as f}
    <div class="px-2 py-1 hover:bg-slate-100 cursor-pointer">
      {f.name}
    </div>
  {/each}
</div>
