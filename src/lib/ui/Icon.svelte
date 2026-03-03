<script lang="ts">
import {
	AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
	Box, Cable, Check,
	ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Copy, Circle,
	Ellipsis, EllipsisVertical, ExternalLink, Expand, Eye, EyeOff,
	FileDown, FileText, FileUp, FileImage, Folder, FolderOpen,
	Grid3x3, GripHorizontal, GripVertical,
	House, Image,
	Layers, LoaderCircle, Lock, LockKeyholeOpen,
	Magnet, MousePointer2, Move, Moon,
	PanelsTopLeft,
	Plus, PanelRight, Pen, Power, Printer,
	RotateCcw, RotateCw, Rotate3d, Redo, RectangleHorizontal, RectangleVertical, RouteOff, Route, Ruler,
	Square, Slash, Search, Server, Sun,
	Trash2, Triangle, Type, TextAlignStart, TextAlignCenter, TextAlignEnd, TriangleAlert,
	Scaling, Star, Undo, Waypoints, X,
} from '@lucide/svelte';

let lucide: Record<string, any> = {
	center: TextAlignCenter, alignCenter: TextAlignCenter,
	alignTop: AlignVerticalJustifyStart, alignBottom: AlignVerticalJustifyEnd,
	alignMiddle: AlignVerticalJustifyCenter,
	box: Box, cable: Cable, check: Check, close: X,
	chevronRight: ChevronRight, chevronLeft: ChevronLeft,
	chevronDown: ChevronDown, chevronUp: ChevronUp,
	copy: Copy, download: FileDown, edit: Pen, end: TextAlignEnd,
	ellipse: Circle, ellipsis: Ellipsis, ellipsisVertical: EllipsisVertical,
	expand: Expand, eye: Eye, eyeSlash: EyeOff, fileImage: FileImage, fileText: FileText,
	folder: Folder, folderOpen: FolderOpen,
	grid: Grid3x3, vgrip: GripVertical, hgrip: GripHorizontal, grip: GripVertical,
	home: House, image: Image, layers: Layers, line: Slash, link: ExternalLink,
	lock: Lock, lockOpen: LockKeyholeOpen,
	magnet: Magnet, move: Move, moon: Moon, panels: PanelsTopLeft,
	pen: Pen, plus: Plus, power: Power, print: Printer,
	rect: RectangleHorizontal, rectVertical: RectangleVertical,
	redo: Redo, rotate3d: Rotate3d, rotateLeft: RotateCcw, rotateRight: RotateCw,
	route: Route, routeOff: RouteOff, ruler: Ruler, scale: Scaling, search: Search,
	select: MousePointer2, sidebar: PanelRight, server: Server,
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
