// Shared IMAGE-EDIT MODE signal — a small reactive singleton (like layerUI / modelSel) so the Properties
// panel can put a selected image into an editing mode and the Viewport can render the matching overlay:
//  • 'crop'   — drag the crop window's corner handles (the visible sub-rect of the source).
//  • 'scale'  — draw a 2-point dimension line + enter its real-world distance → the image is resized so
//               that measurement is correct in model mm (the Uploads tool's calibration model).
//  • 'origin' — click a point inside the image; stored (normalized) as the anchor, so re-importing a
//               differently-cropped new version can be aligned by its origin.
// `id` is the target image entity's id. null mode = normal editing (resize grips, move).
export type ImgMode = 'crop' | 'scale' | 'origin' | null
export const imgEdit = $state<{ mode: ImgMode; id: string | null }>({ mode: null, id: null })
export function setImgMode(mode: ImgMode, id: string | null) {
	// toggle off if the same mode+id is re-clicked
	if (imgEdit.mode === mode && imgEdit.id === id) { imgEdit.mode = null; imgEdit.id = null; return }
	imgEdit.mode = mode; imgEdit.id = id
}
export function clearImgMode() { imgEdit.mode = null; imgEdit.id = null }
