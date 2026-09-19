// Shared constants for the Pages tool — kept in one place so the viewport scale, the
// on-screen handle size, and the fixed A3 sheet size can't drift between components.

/** Screen px per model unit at viewport zoom 1 (the viewport's fixed scale). */
export const BASE = 1.84

/** On-screen size of an editing handle (entity grips AND viewport-frame grips). */
export const HANDLE_PX = 9

/** Fixed on-screen size of the A3-landscape sheet (px). Print overrides to true A3 mm. */
export const PAPER_W = 960
export const PAPER_H = 679
