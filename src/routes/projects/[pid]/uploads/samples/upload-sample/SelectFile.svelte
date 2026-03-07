<script>
// // import { fileStore, size } from "$lib/fileStore.svelte";
import { UploadDropzone, UploadButton } from "@uploadthing/svelte";
import { createUploader, createUploadThing } from "../uploader";

// let { crop, files, importImage, height, data } = $props();
let msg = $state();

// // image preview on upload
// // https://svelte.dev/playground/b5333059a2f548809a3ac3f60a17a8a6?version=5.45.5

// function formatDateTime(ts) { return ts && new Date(ts).toLocaleString(); }

const uploader = createUploader("imageUploader", {
  onClientUploadComplete: (res) => {
    if (Array.isArray(res)) {
      res.forEach(file => {
        console.log('onClientUploadComplete', file);
				// TODO save file details to Firestore, including URL, name, size, type, lastModified, and any other metadata we want to track

        // fileStore.createFile(file.name, {
        //   name: file.name,
        //   url: file.ufsUrl,
        //   key: file.key,
        //   size: file.size,
        //   type: file.type,
        //   uploadedAt: Date.now(),
        //   lastModified: file.lastModified,
        // });
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

  // const { startUpload } = createUploadThing("imageUploader", {
  //   onClientUploadComplete: () => {
  //     alert("Upload Completed");
  //   },
  // });

	// function onFilesSelected(e){
	// 	const file = e.currentTarget.files?.[0];
	// 	if (!file) return;					// Do something with files. then start the upload
	// 	await startUpload([file]);
	// }

// export const startUpload = uploader.startUpload;
// export const getUploadMsg = () => msg;

</script>


<!-- <div class="p-4 overflow-auto" style="height:{height}px"> -->
<div class="p-4 overflow-auto" >

	<b>Upload Files</b>
	<div class="flex flex-col max-w-160 h-32xx mb-4">
		{#if msg}
			{msg}
		{:else}
			<UploadDropzone {uploader} class="h-32x w-64" appearance={{
    		// button: "ut-ready:bg-green-500 ut-uploading:cursor-not-allowed xxrounded-r-none bg-blue-600/90 hover:bg-blue-700 xxbg-none after:bg-orange-400 py-0 px-4 m-4 cursor-pointer",
    		// button: "ut-ready:bg-green-500 ut-uploading:cursor-not-allowed rounded-r-none bg-red-500 bg-none after:bg-orange-400",
    		button: "text-gray-100 ut-ready:bg-green-500 ut-uploading:cursor-not-allowed bg-slate-500/50 px-4 m-4",
    		// container: "w-max flex-row rounded-md border-cyan-300 bg-slate-800",
				container:"border-blue-500 bg-slate-100 shadow-md rounded-sm",
    		// allowedContent: "flex h-8 flex-col items-center justify-center px-2 text-white",
  		}}>
				<span slot="label" let:state> {state.ready ? "Browse files or drag and drop here." : "Loading..."} </span>
  			<!-- <span slot="allowed-content" let:state> You can choose between {state.fileTypes.join(", ")} files </span> -->
				<span slot="button-content" let:state> {state.isUploading ? "Uploading..." : "Upload"} </span>
			</UploadDropzone>
			<!-- <UploadDropzone {uploader} class="h-32x w-64 text-white ut-button:bg-blue-500 bg-slate-200 ut-label:text-lg ut-allowed-content:ut-uploading:text-red-300"/> -->
			<!-- <UploadButton {uploader} /> -->
			<!-- <input type="file" onchange={async (e) => onFilesSelected(e)}/> -->
		{/if}
	</div>

	<!-- <b>Select PDF to Import</b>
	{#each crop.files.filter(f => !f.type) as file}
		<button onclick={e => { crop.file = file.id; crop.step = 2; }} class="flex gap-4 text-xs px-4 text-left hover:bg-gray-200 cursor-pointer" >
			<div class="w-80"><i class="bi bi-file-pdf"></i> {file.id}</div>
			<div class="w-40 text-left">{formatDateTime(file.mtime)}</div>
			<div class="w-16 text-right">{size(file)}</div>
		</button>
	{:else}
		<p>No PDF files</p>
	{/each} -->

	<!-- <b>Select Image to Import</b>
	{#each crop.files.filter(f => f.type) as file}
		<button onclick={e => { importImage(file) }} class="flex gap-4 text-xs px-4 text-left hover:bg-gray-200 cursor-pointer" >
			<div class="w-80"><i class="bi bi-file-pdf"></i> {file.name}</div>
			<div class="w-40 text-left">{formatDateTime(file.lastModified)}</div>
			<div class="w-16 text-right">{size(file)}</div>
		</button>
	{:else}
		<p>No PDF files</p>
	{/each} -->
</div>
