<script lang="ts">
	// Right-sidebar PROPERTIES panel — a DISPATCHER: what's selected picks ONE section component (parts/props/):
	//   a sheet viewport frame   → FrameProps
	//   a section marker         → SectionProps (phase 3)
	//   several model objects    → ModelObjsProps (I4)
	//   one model object         → ModelObjProps
	//   a tree node (a place)    → PlaceProps
	//   nothing                  → PageProps (the page + the project's title block)
	//   2D shapes                → EntProps
	// The shared field styles live in props/props.css (global, scoped under `.pp`); small helpers in props/fields.ts.
	import './props/props.css'
	import FrameProps from './props/FrameProps.svelte'
	import FramesProps from './props/FramesProps.svelte'
	import ModelObjProps from './props/ModelObjProps.svelte'
	import ModelObjsProps from './props/ModelObjsProps.svelte'
	import PlaceProps from './props/PlaceProps.svelte'
	import PageProps from './props/PageProps.svelte'
	import EntProps from './props/EntProps.svelte'
	import AlignBar from './props/AlignBar.svelte'
	import RotateBar from './props/RotateBar.svelte'
	import SectionProps from './props/SectionProps.svelte'
	import type { Ent } from '../ui/geometry'
	import type { Obj, Layer as MLayer, Section } from '../3dview/types'
	import type { SectionLink } from '../ui/sectionLine'
	import type { SheetFrame } from '../types'
	import type { TitleBlockTemplate } from '../titleBlock'
	type HeightKey = 'slabMm' | 'raisedFloorMm' | 'clearHeightMm' | 'plenumMm'

	let { ents = [], onupdate, onarrange, pageTitle = '', pageKind = '', activeLayer = '', node = null, onpagetitle,
		modelObj = null, modelObjs = [], model = null, onmodeladd, outletsFor, allocated, sheets = [], onopenlink, onsaveblock, onwalk, modelNode, modelSeg, onmodelsupdate, modelLayers = [], onmodelupdate, onmodeldelete, onmodelseg,
		frameObj = null, frameObjs = [], onframesupdate, onframeupdate, onframedelete, onframefit, nodeInfo = null, onnodefield, modelList = [], activeFrameId = undefined, scaleN = 1,
		sheetInfo = null, onsheetfield, titleBlock = undefined, ontitleblock, frameStoreys = [], frameConduits = [], heights = null, onheight, onheightall,
		section = null, sectionLinks = [], onsectionupdate, onsectiondrop, onsectiondelete, onsectionopen, frameSection = undefined }:
		{ ents?: Ent[]; onupdate?: (e: Ent | Ent[]) => void; onarrange?: (op: 'front' | 'back' | 'forward' | 'backward') => void;
			pageTitle?: string; pageKind?: string; activeLayer?: string; onpagetitle?: (title: string) => void;
			node?: { id: string; label: string; kind: string; floorNumber?: number; building?: string } | null;
			/** A REAL tree node's properties (projectProps.ts, from Firestore) + the edit callback; null → mock fields. */
			nodeInfo?: import('../projectProps').NodeInfo | null; onnodefield?: (key: string, value: string) => void;
			modelObj?: Obj | null; modelLayers?: MLayer[];
			/** The focused model (a conduit's "Count from outlets"). */ model?: import('../3dview/types').Model | null;
			/** Add an object to the focused model (a rack's "+ Device"), one undo step. */ onmodeladd?: (o: Obj) => void;
			/** E8: the outlets a rack row's panels can serve + every allocated outlet → where. */
			outletsFor?: (rackModelId: string) => (import('../store/allocate').OutletRef & { modelName: string })[]; allocated?: Map<string, string>;
			/** D4: the project's sheets (a symbol's LINK) + open a link (a sheet id or a URL). */
			sheets?: { id: string; title: string; number?: string }[]; onopenlink?: (link: string) => void;
			/** D5: save the selected shapes as a library block. */ onsaveblock?: (name: string) => void;
			/** E3: start a walk renumber from this outlet label. */ onwalk?: (label: string) => void;
			/** F9: the selected wall / conduit node (its id), if any. */ modelNode?: string; /** its selected segment */ modelSeg?: string;
			/** I4: two or more model objects selected, and the per-object patch callback (one undo step). */
			modelObjs?: Obj[]; onmodelsupdate?: (patchOf: (o: Obj) => Record<string, unknown> | null) => void;
			onmodelupdate?: (patch: Record<string, unknown>) => void; onmodeldelete?: () => void; onmodelseg?: (segIdx: number, patch: Record<string, unknown>) => void;
			frameObj?: SheetFrame | null; onframeupdate?: (patch: Partial<SheetFrame>) => void; onframedelete?: () => void;
			/** Two or more frames selected on paper + the patch-them-all callback (one step). */
			frameObjs?: SheetFrame[]; onframesupdate?: (patch: Partial<SheetFrame>) => void;
			/** XP19: fit the frame's scale to its model */ onframefit?: () => void;
			modelList?: { id: string; name: string }[]; activeFrameId?: string;
			/** Scale denominator (the N of 1:N) of the viewport the selection is edited in — sizes the
			 *  annotative text bbox in model mm (B19). */
			scaleN?: number
			/** A STORED Pages sheet's title-block fields (Drawing №, Drawn — `drawnDefault` = the creator's initials). */
			sheetInfo?: { number: string; drawnBy: string; drawnDefault: string; hideTitleBlock: boolean } | null
			onsheetfield?: ((key: 'drawingNumber' | 'drawnBy', value: string) => void) & ((key: 'hideTitleBlock', value: boolean) => void)
			/** The selected frame's model storeys (a building) — its FLOORS checklist in an elevation. */
			frameStoreys?: { id: string; name: string; z?: number }[]
			/** The selected frame's model conduits (F12 fill-rate frame). */
			frameConduits?: { id: string; name: string }[]
			/** A selected BUILDING place's storey heights (top first) + the edit callback. */
			heights?: { placeId: string; rows: { id: string; name: string; z: number; slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }[] } | null
			onheight?: (placeId: string, storeyId: string, key: HeightKey, value: number) => void
			onheightall?: (placeId: string, key: HeightKey, value: number) => void
			/** The PROJECT's title-block template (edited on a sheet page; undefined = the default). The editor shows
			 *  only with `ontitleblock` (a project with Pages data). */
			titleBlock?: TitleBlockTemplate; ontitleblock?: (t: TitleBlockTemplate) => void
			/** A selected SECTION marker (phase 3: a line section's name / depth / flip / z band; a box's name / dir), the
			 *  sheet frames it drives, and its actions. */
			section?: Section | null; sectionLinks?: SectionLink[]
			onsectionupdate?: (patch: Record<string, unknown>, label?: string) => void; onsectiondrop?: () => void; onsectiondelete?: () => void; onsectionopen?: (l: SectionLink) => void
			/** The selected FRAME's linked section, by title ("Section A–A′"), if any. */
			frameSection?: string } = $props()

	// B19: the inputs are uncontrolled (`value=` + `onchange`), so a half-typed value would survive a selection
	// change and land on the NEXT selection's first commit. Keying the panel body on WHAT is selected remounts
	// every input when the selection changes (a value edit keeps the same ids → no remount, focus kept).
	const selKey = $derived([...ents.map((e) => e.id), modelObj?.id ?? '', ...modelObjs.map((o) => o.id ?? ''), frameObj?.id ?? '', ...frameObjs.map((f) => f.id), node?.id ?? '', section?.id ?? ''].join('|'))
	const nObjs = $derived(modelObjs.length > 1 && onmodelsupdate ? modelObjs.length : modelObj ? 1 : 0)
</script>

{#key selKey}
<div class="pp">
	{#if frameObjs.length > 1}
		<FramesProps frames={frameObjs} onupdate={onframesupdate} />
	{:else if frameObj}
		<FrameProps frame={frameObj} {modelList} storeys={frameStoreys} conduits={frameConduits} section={frameSection} onupdate={onframeupdate} ondelete={onframedelete} onfit={onframefit} />
	{:else if section}
		<SectionProps sec={section} links={sectionLinks} onupdate={onsectionupdate} ondrop={onsectiondrop} ondelete={onsectiondelete} onopen={onsectionopen} />
	{:else if ents.length === 0 && !nObjs && node}
		<PlaceProps {node} info={nodeInfo} onfield={onnodefield} {heights} {onheight} {onheightall} />
	{:else if ents.length === 0 && !nObjs}
		<PageProps title={pageTitle} kind={pageKind} {activeLayer} ontitle={onpagetitle} {sheetInfo} {onsheetfield} {titleBlock} {ontitleblock} />
	{:else}
		<!-- shapes and / or 3D objects — a MIXED selection shows both parts, each editing its own kind -->
		{#if ents.length && nObjs}<div class="pp-mixed">{ents.length} shape{ents.length > 1 ? 's' : ''} + {nObjs} 3D object{nObjs > 1 ? 's' : ''} — each part below edits its own kind</div>{/if}
		{#if ents.length}<EntProps {ents} {onupdate} {onarrange} layers={modelLayers} {activeFrameId} {scaleN} {sheets} {onopenlink} {onsaveblock} {onwalk} />{/if}
		{#if modelObjs.length > 1 && onmodelsupdate}
			<ModelObjsProps objs={modelObjs} layers={modelLayers} onpatch={onmodelsupdate} />
		{:else if modelObj}
			<ModelObjProps obj={modelObj} layers={modelLayers} {model} onadd={onmodeladd} {outletsFor} {allocated} onupdate={onmodelupdate} ondelete={onmodeldelete} onseg={onmodelseg} nodeId={modelNode} segId={modelSeg} />
		{/if}
	{/if}
	<!-- any drawing items: ⟲ / ⟳ (props/RotateBar); 2+ (shapes and / or 3D objects): align / distribute them as drawn (props/AlignBar) -->
	{#if !frameObj && !frameObjs.length && !section && ents.length + Math.max(modelObjs.length, modelObj ? 1 : 0) >= 1}<RotateBar />{/if}
	{#if !frameObj && !frameObjs.length && ents.length + Math.max(modelObjs.length, modelObj ? 1 : 0) >= 2}<AlignBar />{/if}
</div>
{/key}
