<script module lang="ts">
import {
	AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
	ArrowLeft, Box, Cable, Camera, Check, Crosshair, Crop,
	ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Copy, Circle, CirclePile,
	Ellipsis, EllipsisVertical, ExternalLink, Expand, Eye, EyeOff,
	FileDown, FileText, FileUp, FileImage, Folder, FolderOpen,
	Grid3x3, GripHorizontal, GripVertical,
	History, House, Image, Highlighter,
	Layers, List, Link, LoaderCircle, Lock, LockKeyholeOpen,
	Magnet, MapPin, Mic, MicOff, MousePointer2, Move, MoveHorizontal, MoveVertical, Moon, Monitor,
	PanelsTopLeft, PcCase,
	Plus, PanelRight, Pen, Power, Printer,
	RefreshCw, RefreshCcw,
	RotateCcw, RotateCw, Rotate3d, Redo, RectangleHorizontal, RectangleVertical, RouteOff, Route, Ruler,
	Save, ScrollText, Share2, Square, Slash, Search, Server, Sun, SwitchCamera, ScanBarcode,
	Trash2, Triangle, Type, TextAlignStart, TextAlignCenter, TextAlignEnd, TriangleAlert,
	Scaling, Settings, Star, Undo, Rows3, Waypoints, X,
} from '@lucide/svelte';

let lucide: Record<string, any> = {
	arrowLeft: ArrowLeft,
	center: TextAlignCenter, alignCenter: TextAlignCenter,
	alignTop: AlignVerticalJustifyStart, alignBottom: AlignVerticalJustifyEnd,
	alignMiddle: AlignVerticalJustifyCenter,
	box: Box, cable: Cable, camera: Camera, check: Check, close: X,
	chevronRight: ChevronRight, chevronLeft: ChevronLeft,
	chevronDown: ChevronDown, chevronUp: ChevronUp,
	copy: Copy, crop: Crop, crosshair: Crosshair, download: FileDown, edit: Pen, end: TextAlignEnd,
	ellipse: Circle, ellipsis: Ellipsis, ellipsisVertical: EllipsisVertical,
	expand: Expand, eye: Eye, eyeSlash: EyeOff, fileImage: FileImage, fileText: FileText,
	folder: Folder, folderOpen: FolderOpen,
	grid: Grid3x3, vgrip: GripVertical, hgrip: GripHorizontal, grip: GripVertical,
	history: History, home: House, highlighter: Highlighter, image: Image, layers: Layers, line: Slash, link: ExternalLink,
	list: List, lock: Lock, lockOpen: LockKeyholeOpen,
	magnet: Magnet, mapPin: MapPin, mic: Mic, micOff: MicOff, move: Move, moveHorizontal: MoveHorizontal, moveVertical: MoveVertical, moon: Moon, monitor: Monitor, panels: PanelsTopLeft,
	pen: Pen, pile:CirclePile, plus: Plus, power: Power, print: Printer, pcCase: PcCase,
	rect: RectangleHorizontal, rectVertical: RectangleVertical,
	refresh: RefreshCw, refreshCcw: RefreshCcw,
	redo: Redo, rotate3d: Rotate3d, rotateLeft: RotateCcw, rotateRight: RotateCw,
	route: Route, routeOff: RouteOff, ruler: Ruler, save: Save, scale: Scaling, scan: ScanBarcode, search: Search,
	rows: Rows3, scrollText: ScrollText, select: MousePointer2, settings: Settings, share: Share2, sidebar: PanelRight, server: Server, switchCamera: SwitchCamera,
	spinner: LoaderCircle, square: Square, star: Star, start: TextAlignStart,
	sun: Sun, text: Type, trash: Trash2, upload: FileUp, undo: Undo, url: Link,
	polygon: Triangle, warning: TriangleAlert, waypoints: Waypoints, x: X,
}

// Kestrel CAD icon set (kestrel-adoption.md A2): 109 outline glyphs, same visual
// family as Lucide. Lucide wins name collisions so existing icons don't change;
// a `k-` prefix (e.g. "k-move") forces the Kestrel glyph for a shadowed name.
import { KESTREL_ICONS } from './kestrel-icons'

/** All Lucide-mapped names — for the /icons reference page. */
export const LUCIDE_NAMES = Object.keys(lucide)
</script>

<script lang="ts">
let {name, size=14, rotate=0, flip=false, class:className=null, ...props} = $props();

let kpath = $derived.by(() => {
	if (!name) return null
	if (name.startsWith('k-')) return KESTREL_ICONS[name.slice(2)] ?? null
	return lucide[name] ? null : KESTREL_ICONS[name] ?? null
})
</script>

{#if kpath}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
		stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
		class={[className]} {...props}><path d={kpath} /></svg>
{:else if name && lucide[name]}
	{@const LucideIcon = lucide[name]}
	<LucideIcon {size} class={[className]} {...props} />
{:else if name}
	<i class={['inline-block', name, className]} {...props}></i>
{/if}
