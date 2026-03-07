<script>
import { fileStore, size } from "$lib/fileStore.svelte";
import { UploadDropzone } from "@uploadthing/svelte";
import { createUploader } from "../../api/uploadthing/uploadthing";

let { crop, files, importImage, height, data } = $props();
let msg = $state();

// image preview on upload
// https://svelte.dev/playground/b5333059a2f548809a3ac3f60a17a8a6?version=5.45.5

function formatDateTime(ts) { return ts && new Date(ts).toLocaleString(); }

const uploader = createUploader("imageUploader", {
  onClientUploadComplete: (res) => {
    if (Array.isArray(res)) {
      res.forEach(file => {
        console.log('onClientUploadComplete', file);
        fileStore.createFile(file.name, {
          name: file.name,
          url: file.ufsUrl,
          key: file.key,
          size: file.size,
          type: file.type,
          uploadedAt: Date.now(),
          lastModified: file.lastModified,
        });
      });
    }
    msg = "Upload Completed";
    setTimeout(() => { msg = null; }, 5000);
  },
  onUploadError: (error) => {
    console.log(`ERROR! ${error.message}`);
    msg = `ERROR! ${error.message}`;
    setTimeout(() => { msg = null; }, 5000);
  },
});

export const startUpload = uploader.startUpload;
export const getUploadMsg = () => msg;

</script>


<div class="p-4 overflow-auto" style="height:{height}px">

	<b>Upload Files</b>
	<div class="flex flex-col max-w-160 h-32 mb-4">
		{#if msg}
			{msg}
		{:else}
			<UploadDropzone {uploader} class="h-32"/>
		{/if}
	</div>

	<b>Select PDF to Import</b>
	{#each crop.files.filter(f => !f.type) as file}
		<button onclick={e => { crop.file = file.id; crop.step = 2; }} class="flex gap-4 text-xs px-4 text-left hover:bg-gray-200 cursor-pointer" >
			<div class="w-80"><i class="bi bi-file-pdf"></i> {file.id}</div>
			<div class="w-40 text-left">{formatDateTime(file.mtime)}</div>
			<div class="w-16 text-right">{size(file)}</div>
		</button>
	{:else}
		<p>No PDF files</p>
	{/each}

	<b>Select Image to Import</b>
	{#each crop.files.filter(f => f.type) as file}
		<button onclick={e => { importImage(file) }} class="flex gap-4 text-xs px-4 text-left hover:bg-gray-200 cursor-pointer" >
			<div class="w-80"><i class="bi bi-file-pdf"></i> {file.name}</div>
			<div class="w-40 text-left">{formatDateTime(file.lastModified)}</div>
			<div class="w-16 text-right">{size(file)}</div>
		</button>
	{:else}
		<p>No PDF files</p>
	{/each}
</div>
