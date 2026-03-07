<script>
  import { onMount, tick } from "svelte";
	import { Panzoom } from "../Panzoom.svelte"
	import { Button, Input, addToast } from "$lib";
	import { fileStore } from "$lib/fileStore.svelte";
	import { createUploadThing  } from "../../api/uploadthing/uploadthing.ts";
	import { PdfState } from './pdf.svelte'
	import { dragDimension } from './DimensionLine.ts'
	import DimensionLine from './DimensionLine.svelte'
	import SelectFile from './SelectFile.svelte'

	const { startUpload } = createUploadThing("imageUploader", {		// createUploader()
    onClientUploadComplete: (res) => {
      console.log(`onClientUploadComplete`, res);
			res.forEach(file => addToast("Upload Completed " + file.name) )
    },
    onUploadAborted: () => { addToast("Upload Aborted"); },
    onUploadError: (error) => { addToast(`ERROR! ${error.message}`); },
  });

	const path = "/pdfs/";		// pdf uploads path
	const scale = 2;  				// pdf draw scale
	const marker = 'url(#arrowhead)';
	const defaultOrigin = { x: 50, y: 50 };
	const defaultImport = { x: 50, y: 50, width: 100, height: 100 };
	const defaultScale = { x1: 100, y1: 100, x2: 200, y2: 100, offset: 30, units: 'mm', distance: 100, scale: 1 };
	const log = console.log, abs = Math.abs

	let { files, importImage, drawing } = $props();

	let pdf = new PdfState();
	let panzoom = new Panzoom();
	let innerWidth=$state(800), innerHeight=$state(600)
	let handle = 0
	let start = {}						// initial crop rect on mousedown
	let pos = {};							// mouse position on mousedown
	let canvas;								// pdf canvas

  const handles = [    // const handleMasks = [1, 2, 4, 8, 3, 6, 9, 12] // R, B, L, T, BR, BL, TR, TL
		{mask:1,  style:'position:absolute; width:10px; height:100%; right:-5px; top:0;       cursor:ew-resize;'},
		{mask:2,  style:'position:absolute; width:100%; height:10px; left:0; bottom:-5px;     cursor:ns-resize;'},
		{mask:4,  style:'position:absolute; width:10px; height:100%; left:-5px; top:0;        cursor:ew-resize;'},
		{mask:8,  style:'position:absolute; width:100%; height:10px; left:0; top:-5px;        cursor:ns-resize;'},
		{mask:3,  style:'position:absolute; width:10px; height:10px; right:-5px; bottom:-5px; cursor:nwse-resize; border:1px solid red;'},
		{mask:6,  style:'position:absolute; width:10px; height:10px; left:-5px; bottom:-5px;  cursor:nesw-resize; border:1px solid red;'},
		{mask:9,  style:'position:absolute; width:10px; height:10px; right:-5px; top:-5px;    cursor:nesw-resize; border:1px solid red;'},
		{mask:12, style:'position:absolute; width:10px; height:10px; left:-5px; top:-5px;     cursor:nwse-resize; border:1px solid red;'},
  ]

	class Crop {
		files  = $state([]);		// file data from firestore
		file   = $state();			// filename
		page   = $state(0);			// page number
		viewport=$state({})
		step   = $state(4);
		origin = $state(defaultOrigin);
		size   = $state({x1:100,y1:100,x2:200,y2:100,offset:30,units:'mm',distance:100,scale:1});	// scale converts image pixels to millimeters
		import = $state({x:0, y:0, width:100, height:100})
		steps  = $state([
			{ name: 'Select PDF',	enabled:false	},
			{ name: 'Set Origin',	enabled:false	},
			{ name: 'Set Scale',	enabled:false	},
			{ name: 'Crop',				enabled:false	},
		])
	}
	let crop = new Crop()

	onMount(()=>{
		crop.file = "NFLX-SYD-3PAGE_14MAY24.pdf"
	})

	$effect(()=>{
		panzoom.canvas?.addEventListener('wheel', onwheel, { passive: false });
		return () => { panzoom.canvas?.removeEventListener('wheel', onwheel); }
	})
	$effect(async ()=>{
		if (crop.file){
			await pdf.load(path + crop.file);
			renderPage(1);
			crop.steps[0].enabled = true
			crop.steps[1].enabled = true
			crop.steps[2].enabled = true
			crop.steps[3].enabled = true
		}
	})

	$effect(() => {		// subscribe to firestore
		return fileStore.subscribeAll({			// 	{name: '20F-Floor.pdf', size: 1339357, mtime: Mon Nov 01 2021 16:58:44 GMT+0900 (Japan Standard Time)}
			next: data => {
				crop.files = data.map(file => {
						const local = files?.find(f => f.id === file.id || f.name === file.id);		// get file data from upload folder to merge with firestore data
						return { ...file, ...local };
				});
			},
		});
	});

  function getClientPos(e){
		let rect = canvas.getBoundingClientRect(), zoom = panzoom.zoom
		return {x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top)  / zoom}
  }
	function oncontextmenu(e){ e.preventDefault() }

	function onwheel(e){
		const step = (e.deltaY || e.deltaX) > 0 ? -110 : 110;
		if (panzoom.panning || e.ctrlKey || e.altKey || e.metaKey) panzoom.doZoom(e);
		else if ((e.shiftKey || e.deltaX)) panzoom.pan(step, 0);
		else if (!e.ctrlKey) panzoom.pan(0, step);
	}

	function onmousedown(e) {
		e.preventDefault();		// prevent default text selection
		document.addEventListener('mousemove', onmousemove);
		document.addEventListener('mouseup', onmouseup);
		panzoom.panning = e.button === 1 || e.button === 2;    // right-click may be a pan event or a context-menu event
		if (!panzoom.panning){
			pos = getClientPos(e)
			handle = +e.target.dataset.id
			start = {x:crop.import.x, y:crop.import.y, width:crop.import.width, height:crop.import.height,
				x1:crop.size.x1, y1:crop.size.y1, x2:crop.size.x2, y2:crop.size.y2, offset:crop.size.offset,
				units:crop.size.units, distance:crop.size.distance, scale:crop.size.scale,
				sx:pos.x, sy:pos.y,
			}
			if (crop.step==2) crop.origin.x = pos.x, crop.origin.y = pos.y, crop.steps[crop.step].changed = 1
		}
	}

	function onmousemove(e) {
		if (e.movementX == 0 && e.movementY == 0) return;		// bug fires mousemove on first click after reload
		if (panzoom.panning) return panzoom.pan(e.movementX, e.movementY);

		const next = getClientPos(e)
		if (crop.step==2){
			crop.origin.x = next.x, crop.origin.y = next.y, crop.steps[crop.step].changed = 1
		}
		if (crop.step==3){
			// let type = abs(crop.size.x2-crop.size.x1)<abs(crop.size.y2-crop.size.y1)
			// const size = crop.size;
			// if (handle & 1) Object.assign(size, { x1: next.x, y1: next.y });
			// if (handle & 2 || !handle) Object.assign(size, { x2: next.x, y2: next.y });
			// if (handle & 4) {
			// 	const dx = next.x - size.x1, dy = next.y - size.y1;
			// 	size.offset = type ? dx : -dy;
			// }
			// if (handle & 8){
			// 	const dx = next.x - pos.x, dy = next.y - pos.y;
			// 	Object.assign(size, { x1:start.x1+dx, y1:start.y1+dy, x2:start.x2+dx, y2:start.y2+dy });
			// }
			// size.distance = toScale(type ? abs(size.y2 - size.y1) : abs(size.x2 - size.x1));
			dragDimension(crop.size, handle, next)
			crop.steps[crop.step].changed = 1;
		}
		if (crop.step==4){
			let { x, y, width: w, height: h } = start;
			const dx = next.x - pos.x, dy = next.y - pos.y;
			const mx = canvas.width / scale, my = canvas.height / scale;
			if (handle & 1) w += dx;
			if (handle & 2) h += dy;
			if (handle & 4) { x += dx; w -= dx; if (x < 0) { w += x; x = 0; } }
			if (handle & 8) { y += dy; h -= dy; if (y < 0) { h += y; y = 0; } }
			if (w < 0) { w = -w; x -= w; if (x < 0) { w += x; x = 0; } }
			if (h < 0) { h = -h; y -= h; if (y < 0) { h += y; y = 0; } }
			if (x + w >= mx) w = mx - x - 1;
			if (y + h >= my) h = my - y - 1;
			Object.assign(crop.import, { x, y, width: w, height: h });
		}
	}
	function toScale(val){
		let len = (val * (crop.size.scale || 1))
		return len.toFixed(1)
	}


	function onmouseup(e) {
		panzoom.panning = 0;
		document.removeEventListener('mousemove', onmousemove);
		document.removeEventListener('mouseup', onmouseup);
	}

	async function setStep(step){
		let prev = crop.step;
		crop.step = step
		if (prev==1 && step>1){
			await tick();
			renderPage(crop.page);
		}
	}
	async function renderPage(page){
		crop.page = page
		readPage();
		crop.viewport = await pdf.render({ canvas, page, scale });
	}

	function readPage(){
		const { file } = initPage();
		const page = file.pages[crop.page] ?? {};
		Object.assign(crop.origin, page.origin ?? defaultOrigin);
		Object.assign(crop.import, page.crop ?? defaultImport);
		Object.assign(crop.size, page.scale ?? defaultScale);
	}

	function initPage() {
		let file = crop.files.find(f => f.id === crop.file) ?? { id: crop.file, pages: {} };
		crop.files.includes(file) || crop.files.push(file);
		if (!file.pages) file.pages = {};
		file.pages[crop.page] ??= {};
		return { file, pages: file.pages, page: crop.page };
	}
	function savePage(prop, value) {
		const { file, pages, page } = initPage();
		pages[page][prop] = value;
		fileStore.update(file.id, { pages }).catch(err => console.error('Error saving to Firestore:', err));
	}

	function saveOrigin() {
		savePage('origin', { x: crop.origin.x, y: crop.origin.y });
		crop.steps[crop.step++].changed = 0;
	}
	function saveScale() {
		if (!crop.size.distance) return;
		let { distance } = parts();
		crop.size.scale = Math.round(crop.size.distance / distance * 100) / 100
		savePage('scale', crop.size);
		crop.steps[crop.step++].changed = 0;
	}


	async function importCrop(e) {
		const { x, y, width, height } = crop.import;
		const ix = Math.floor(x), iy = Math.floor(y), iw = Math.floor(width), ih = Math.floor(height);

		const cropCanvas = Object.assign(document.createElement('canvas'), { width: Math.floor(iw * scale), height: Math.floor(ih * scale) });
		const ctx = cropCanvas.getContext('2d');
		ctx.drawImage(canvas, ix * scale, iy * scale, iw * scale, ih * scale, 0, 0, cropCanvas.width, cropCanvas.height);

		const cropName = crop.file?.replace(/\.[^/.]+$/, '') || 'crop';
		const filename = `${cropName}_${ix}_${iy}_${iw}x${ih}.png`;
		const blob = await new Promise((resolve, reject) => cropCanvas.toBlob(b => b ? resolve(b) : reject('No blob'), 'image/png') );
		const file = new File([blob], filename, { type: 'image/png' });

		//// Upload cropped image
		let uploadedUrl = null;
		const result = await startUpload([file]);
		uploadedUrl = result?.[0]?.ufsUrl || result?.[0]?.url || null;
		log(ix, iy, iw, ih, filename, uploadedUrl);
		// addToast('Uploaded ' + filename);

		//// Add shape to drawing
		const scaleFactor = crop.size.scale;
		const sx = ix * scaleFactor, sy = iy * scaleFactor;
		const w = iw * scaleFactor, h = ih * scaleFactor;
		const dx = (drawing?.origin?.x || 0) - (crop.origin?.x || 0) * scaleFactor;
		const dy = (drawing?.origin?.y || 0) - (crop.origin?.y || 0) * scaleFactor;
		let x1 = Math.round(sx + dx), y1 = Math.round(sy + dy);
		let x2 = Math.round(x1 + w), y2 = Math.round(y1 + h);
		const shape = { type: 'image', x1, y1, x2, y2, src: uploadedUrl, name: filename };
		log({shape});
		// TODO report firestore errors
		// TODO add image to file list
		drawing.addAndSelectShapes([shape]);
		savePage('crop', { x: ix, y: iy, width: iw, height: ih });
		importImage(); // close import window
	}

	// function parts(){
	// 	let type = abs(crop.size.x2-crop.size.x1)<abs(crop.size.y2-crop.size.y1)
	// 	let ox = type ? crop.size.offset : 0;
	// 	let oy = type ? 0 : -crop.size.offset;
	// 	let x1 = crop.size.x1 + ox, y1 = crop.size.y1 + oy;
	// 	let x2 = crop.size.x2 + ox, y2 = crop.size.y2 + oy;
	// 	let distance = type ? abs(crop.size.y2-crop.size.y1) : abs(crop.size.x2-crop.size.x1)
	// 	return {x1,y1,x2,y2,type,distance}
	// }
	// function dimension(part=0){
	// 	let {x1,y1,x2,y2,type} = parts()
	// 	if (part==0) return {x1:crop.size.x1,y1:crop.size.y1,x2:x1,y2:y1}
	// 	if (type)    return part==1 ? {x1:crop.size.x2,y1:crop.size.y2,x2:x1,y2:y2} : {x1,y1,x2:x1,y2}
	// 	return              part==1 ? {x1:crop.size.x2,y1:crop.size.y2,x2:x2,y2:y1} : {x1,y1,x2,y2:y1}
	// }
	// function text(){
	// 	let {x1,y1,x2,y2,type} = parts()
	// 	return type ? {transform:`translate(${x1-10} ${(y1+y2)/2}) rotate(-90)`} : {x:(x1+x2)/2, y:y1-10}
	// }

	let height = $derived(innerHeight - 64-30);

</script>

<svelte:window bind:innerHeight bind:innerWidth />

<!-- Toolbar -->
<div style="height:32px" class="flex text-xs items-center gap-1 px-2 justify-between border-b-1 border-gray-300 bg-gray-50">
	<div class="flex items-center gap-1 px-2">
		{#each crop.steps as step, idx}
			<Button disabled={!step.enabled} onclick={e=>setStep(idx+1)} variant={crop.step==idx+1 ? "primary" : "outline"}>{step.name}</Button>
		{/each}
	</div>
	{#if crop.step==2}
		<div class="flex items-center	gap-2">
			<div>Origin: {crop.origin.x|0} {crop.origin.y|0}</div>
			<Button onclick={saveOrigin} variant={crop.steps[2].changed ? "primary" : "outline"}>Save Origin</Button>
		</div>
	{:else if crop.step==4}
		<Button onclick={importCrop} variant=primary>Import Crop</Button>
	{:else if crop.step==3}
		<div class="flex gap-2 items-center">
			Distance:
			<input bind:value={crop.size.distance} class="rounded border border-gray-400 px-2 w-16 h-6 text-right" />
			<div>mm</div>
			<Button onclick={saveScale} variant="outline">Save Scale</Button>
			<div>{crop.scale}</div>
		</div>
	{/if}
	<Button onclick={e=>importImage()} variant="outline" class="mr-4">Cancel</Button>
</div>

{#snippet Handle(type, x, y, w=0, h=0, rx=5, opacity=0.8, size=10, cursor="move")}
	{@const half=size/2}
	<rect data-id={type} x={x-half} y={y-half} width={w+size} height={h+size} {rx} {opacity} stroke-width=1 fill=transparent stroke=red {cursor}></rect>
{/snippet}

{#if crop.step==1}

	<SelectFile {crop} {files} {importImage} {height} />

{:else}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="flex" style="--o-color:{crop.step==2 ? 'red':'black'};">
		<div bind:this={panzoom.canvas} {oncontextmenu} {onmousedown} style:width={innerWidth+'px'} style:height={height+'px'} class="border border-gray-300 overflow-hidden">
			<div class="canvas" style="transform-origin:top left; transform:translate({panzoom.x}px, {panzoom.y}px) scale({panzoom.zoom});">
				<canvas bind:this={canvas}></canvas>

				<!-- Dimension Line -->
				<svg class="absolute" style="top:0; left:0;" width={crop.viewport?.width} height={crop.viewport?.height}>

					<!-- <g class="dimension hover-line no-panzoom" stroke={crop.step==3 ? 'red':'black'} fill={crop.step==3 ? 'red':'black'} stroke-width=1>
						<marker id="arrowhead" fill="inherit" stroke="none" refX="20.4" refY="9" markerWidth="40.8" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 21 9 L 1 16.8 L 6 9 z"></path></marker>
						<line {...dimension(0)}></line>
						<line {...dimension(1)}></line>
						<line {...dimension(2)} marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"></line>
						<text {...text()} data-id=8 text-anchor=middle dominant-baseline=middle>{crop.size.distance}mm</text>
						{#if crop.step==3}
							{@const line=parts()}
							{@render Handle(1, crop.size.x1, crop.size.y1)}
							{@render Handle(2, crop.size.x2, crop.size.y2)}
							{@render Handle(4, line.x1, line.y1)}
						{/if}
					</g> -->

					<DimensionLine size={crop.size} selected={crop.step==3} stroke={crop.step==3 ? 'red':'black'}/>
				</svg>

				<!-- Origin point -->
				<div class="origin" style="left:{crop.origin.x}px; top:{crop.origin.y}px"><div class="origin-cross"></div></div>

				<!-- Crop -->
				{#if crop.step==4}
					<div data-id=15  class="crop" style="left:{crop.import.x}px; top:{crop.import.y}px; width:{crop.import.width}px; height:{crop.import.height}px;">
						{#each handles as {mask, style}}
							<div {style} data-id={mask}></div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

{/if}

<!-- Status bar -->
<div class="flex text-xs items-center px-2 gap-4 bg-gray-50 border-gray-300 border-t-1" style='height:31px'>
	<b>{crop.file || "No file selected"}</b>
	<div>Page
		{#each Array(pdf.totalPages).fill(0) as _, idx}
		<Button onclick={e=>renderPage(idx+1)} variant={crop.page==idx+1 ? "primary" : "outline"}>{idx+1}</Button>
		{/each}
	</div>
</div>

<style>
	.crop { position: absolute; border: 1px dashed red; box-shadow:0 0 0 9999em rgba(0,0,100,0.2); }
  .origin { position: absolute; top: 0; left: 0; }
  .origin-cross {
		position: absolute; width: 40px; height: 40px;
		border: 2px solid var(--o-color); border-radius: 50%;
		transform: translate(-50%, -50%);
  }
  .origin-cross::before, .origin-cross::after { content: ''; position: absolute; background-color: var(--o-color); }
  .origin-cross::before { top: 50%; left: -10px; right: -10px; height: 1px; transform: translateY(-50%); }
  .origin-cross::after { left: 50%; top: -10px; bottom: -10px; width: 1px; transform: translateX(-50%); }
	text { cursor:move; fill:red; user-select:none;}
</style>