<script lang="ts">
	// Right-sidebar PROPERTIES panel — a DISPATCHER: what's selected picks ONE section component (parts/props/):
	//   a sheet viewport frame   → FrameProps
	//   several model objects    → ModelObjsProps (I4)
	//   one model object         → ModelObjProps
	//   a tree node (a place)    → PlaceProps
	//   nothing                  → PageProps (the page + the project's title block)
	//   2D shapes                → EntProps
	// The shared field styles live in props/props.css (global, scoped under `.pp`); small helpers in props/fields.ts.
	import './props/props.css'
	import FrameProps from './props/FrameProps.svelte'
	import ModelObjProps from './props/ModelObjProps.svelte'
	import ModelObjsProps from './props/ModelObjsProps.svelte'
	import PlaceProps from './props/PlaceProps.svelte'
	import PageProps from './props/PageProps.svelte'
	import EntProps from './props/EntProps.svelte'
	import type { Ent } from '../ui/geometry'
	import type { Obj, Layer as MLayer } from '../3dview/types'
	import type { SheetFrame } from '../types'
	import type { TitleBlockTemplate } from '../titleBlock'
	type HeightKey = 'slabMm' | 'raisedFloorMm' | 'clearHeightMm' | 'plenumMm'

	let { ents = [], onupdate, onarrange, pageTitle = '', pageKind = '', activeLayer = '', node = null, onpagetitle,
		modelObj = null, modelObjs = [], onmodelsupdate, modelLayers = [], onmodelupdate, onmodeldelete, onmodelseg,
		frameObj = null, onframeupdate, onframedelete, onframefit, nodeInfo = null, onnodefield, modelList = [], activeFrameId = undefined, scaleN = 1,
		sheetInfo = null, onsheetfield, titleBlock = undefined, ontitleblock, frameStoreys = [], heights = null, onheight, onheightall }:
		{ ents?: Ent[]; onupdate?: (e: Ent) => void; onarrange?: (op: 'front' | 'back' | 'forward' | 'backward') => void;
			pageTitle?: string; pageKind?: string; activeLayer?: string; onpagetitle?: (title: string) => void;
			node?: { id: string; label: string; kind: string; floorNumber?: number; building?: string } | null;
			/** A REAL tree node's properties (projectProps.ts, from Firestore) + the edit callback; null → mock fields. */
			nodeInfo?: import('../projectProps').NodeInfo | null; onnodefield?: (key: string, value: string) => void;
			modelObj?: Obj | null; modelLayers?: MLayer[];
			/** I4: two or more model objects selected, and the per-object patch callback (one undo step). */
			modelObjs?: Obj[]; onmodelsupdate?: (patchOf: (o: Obj) => Record<string, unknown> | null) => void;
			onmodelupdate?: (patch: Record<string, unknown>) => void; onmodeldelete?: () => void; onmodelseg?: (segIdx: number, patch: Record<string, unknown>) => void;
			frameObj?: SheetFrame | null; onframeupdate?: (patch: Partial<SheetFrame>) => void; onframedelete?: () => void;
			/** XP19: fit the frame's scale to its model */ onframefit?: () => void;
			modelList?: { id: string; name: string }[]; activeFrameId?: string;
			/** Scale denominator (the N of 1:N) of the viewport the selection is edited in — sizes the
			 *  annotative text bbox in model mm (B19). */
			scaleN?: number
			/** A STORED Pages sheet's title-block fields (Drawing №, Drawn — `drawnDefault` = the creator's initials). */
			sheetInfo?: { number: string; drawnBy: string; drawnDefault: string; hideTitleBlock: boolean } | null
			onsheetfield?: ((key: 'drawingNumber' | 'drawnBy', value: string) => void) & ((key: 'hideTitleBlock', value: boolean) => void)
			/** The selected frame's model storeys (a building) — its FLOORS checklist in an elevation. */
			frameStoreys?: { id: string; name: string }[]
			/** A selected BUILDING place's storey heights (top first) + the edit callback. */
			heights?: { placeId: string; rows: { id: string; name: string; z: number; slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }[] } | null
			onheight?: (placeId: string, storeyId: string, key: HeightKey, value: number) => void
			onheightall?: (placeId: string, key: HeightKey, value: number) => void
			/** The PROJECT's title-block template (edited on a sheet page; undefined = the default). The editor shows
			 *  only with `ontitleblock` (a project with Pages data). */
			titleBlock?: TitleBlockTemplate; ontitleblock?: (t: TitleBlockTemplate) => void } = $props()

	// B19: the inputs are uncontrolled (`value=` + `onchange`), so a half-typed value would survive a selection
	// change and land on the NEXT selection's first commit. Keying the panel body on WHAT is selected remounts
	// every input when the selection changes (a value edit keeps the same ids → no remount, focus kept).
	const selKey = $derived([...ents.map((e) => e.id), modelObj?.id ?? '', ...modelObjs.map((o) => o.id ?? ''), frameObj?.id ?? '', node?.id ?? ''].join('|'))
</script>

{#key selKey}
<div class="pp">
	{#if frameObj}
		<FrameProps frame={frameObj} {modelList} storeys={frameStoreys} onupdate={onframeupdate} ondelete={onframedelete} onfit={onframefit} />
	{:else if modelObjs.length > 1 && onmodelsupdate}
		<ModelObjsProps objs={modelObjs} layers={modelLayers} onpatch={onmodelsupdate} />
	{:else if modelObj}
		<ModelObjProps obj={modelObj} layers={modelLayers} onupdate={onmodelupdate} ondelete={onmodeldelete} onseg={onmodelseg} />
	{:else if ents.length === 0 && node}
		<PlaceProps {node} info={nodeInfo} onfield={onnodefield} {heights} {onheight} {onheightall} />
	{:else if ents.length === 0}
		<PageProps title={pageTitle} kind={pageKind} {activeLayer} ontitle={onpagetitle} {sheetInfo} {onsheetfield} {titleBlock} {ontitleblock} />
	{:else}
		<EntProps {ents} {onupdate} {onarrange} layers={modelLayers} {activeFrameId} {scaleN} />
	{/if}
</div>
{/key}
