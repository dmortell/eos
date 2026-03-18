<script lang="ts">
import {
	AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
	ArrowLeft, Box, Cable, Camera, Check, Crosshair, Crop,
	ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Copy, Circle,
	Ellipsis, EllipsisVertical, ExternalLink, Expand, Eye, EyeOff,
	FileDown, FileText, FileUp, FileImage, Folder, FolderOpen,
	Grid3x3, GripHorizontal, GripVertical,
	House, Image,
	Layers, LoaderCircle, Lock, LockKeyholeOpen,
	Magnet, MapPin, Mic, MicOff, MousePointer2, Move, Moon, Monitor,
	PanelsTopLeft, PcCase,
	Plus, PanelRight, Pen, Power, Printer,
	RotateCcw, RotateCw, Rotate3d, Redo, RectangleHorizontal, RectangleVertical, RouteOff, Route, Ruler,
	ScrollText, Share2, Square, Slash, Search, Server, Sun, SwitchCamera, ScanBarcode,
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
	home: House, image: Image, layers: Layers, line: Slash, link: ExternalLink,
	lock: Lock, lockOpen: LockKeyholeOpen,
	magnet: Magnet, mapPin: MapPin, mic: Mic, micOff: MicOff, move: Move, moon: Moon, monitor: Monitor, panels: PanelsTopLeft,
	pen: Pen, plus: Plus, power: Power, print: Printer, pcCase: PcCase,
	rect: RectangleHorizontal, rectVertical: RectangleVertical,
	redo: Redo, rotate3d: Rotate3d, rotateLeft: RotateCcw, rotateRight: RotateCw,
	route: Route, routeOff: RouteOff, ruler: Ruler, scale: Scaling, scan: ScanBarcode, search: Search,
	rows: Rows3, scrollText: ScrollText, select: MousePointer2, settings: Settings, share: Share2, sidebar: PanelRight, server: Server, switchCamera: SwitchCamera,
	spinner: LoaderCircle, square: Square, star: Star, start: TextAlignStart,
	sun: Sun, text: Type, trash: Trash2, upload: FileUp, undo: Undo,
	polygon: Triangle, warning: TriangleAlert, waypoints: Waypoints,
}

let {name, size=14, rotate=0, flip=false, class:className=null, ...props} = $props();
</script>

{#if name && lucide[name]}
	{@const LucideIcon = lucide[name]}
	<LucideIcon {size} class={[className]} {...props} />
{:else if name}
	<i class={['inline-block', name, className]} {...props}></i>
{/if}
