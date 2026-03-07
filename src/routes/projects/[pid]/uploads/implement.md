# Uploads Tool

This tool allows uploads of PDF floorplans to UploadThing, and management of those floorplans.
The floorplans can then be used as underlays in the outlet and cable route tools to trace cable routes and place devices.

Details of uploaded files are stored in the `files` collection in Firestore, with fields for the file URL, scale, margin, and any other metadata we want to track.

See the schema for the files collection in src\routes\projects\[pid]\racks\firestore-collections.md

After uploading a floorplan, the user should specify an origin (for positioning the floorplan on the drawing), use a dimension line tool to mark two points on the drawing and enter the real-world distance which is used to calculate the correct scaling of the image in drawings.

The user can also crop the image to remove extraneous details.

In the list of uploaded floorplans, indicate which floorplans do not yet have origin/scaling setup complete, and allow the user to click into those floorplans to complete the setup. Restrict or warn the user if they try to use a floorplan in other tools before completing the setup.


Here's a summary of what was created:

  src/lib/db.svelte.ts — Added where import and subscribeWhere() method for querying collections by field value.

  src/routes/projects/[pid]/uploads/+page.svelte — Rewrote to subscribe to the files collection filtered by projectId, and the project doc for the project name. Passes files, projectName, and   ondelete to Uploads.svelte.

  src/routes/projects/[pid]/uploads/Uploads.svelte — Clean file list interface with:
  - Titlebar showing "ProjectName — Uploads"
  - Toolbar with file count and search filter (appears when >5 files)
  - Empty state with upload icon and hint text
  - File rows in a grid layout: name (linked to URL), size, page setup status, upload date, delete button
  - Page setup status: green check when all pages have origin+scale configured, amber warning with X/Y pg when incomplete, dash when no pages
  - Delete confirmation inline (Yes/No)
  - Files sorted alphabetically, filterable by name

  UI fixes:
  - Delete button now always visible (removed opacity-0 group-hover:opacity-100)
  - Tighter rows: py-1 instead of py-2, space-y-0.5 gap, smaller icons/text

  Upload functionality:
  - Added floorplanUploader route to uploadthing.ts accepting PDFs (32MB) and images (16MB), up to 10 files
  - Upload button in toolbar triggers hidden file input (accepts .pdf and images)
  - Drag and drop — full-page drop zone with blue overlay
  - Upload progress — blue status bar shown during upload with spinner
  - Error handling — red banner with auto-dismiss after 5s
  - Firestore save — on upload complete, saves file metadata (name, url, key, size, projectId, uploadedAt) to files collection
  - Empty state updated to say "Drop PDF floorplans here or click Upload"


  1. UploadThing deletion — Created /api/uploadthing/delete endpoint using UTApi.deleteFiles(). The +page.svelte deleteFile function now calls this endpoint with the file's UT   key before deleting from Firestore.
  2. Status indicators — Replaced the page count column with distinct setup states:
    - "No origin" (amber badge) — origin not yet set
    - "No scale" (amber badge) — origin set but scale missing
    - "Ready" (green check) — both origin and scale configured
  3. Delete button — Already made permanently visible in previous edit.


Create a standalone PDF viewer that:

1. Uses PdfState directly to render pages to a canvas
2. Reuses the same pan/zoom pattern from Canvas.svelte
  3. Has a toolbar with page navigation, zoom controls, and close button
  4. Opens as a full-screen overlay when a filename is clicked

  - tick() instead of requestAnimationFrame for waiting on DOM updates
  - Renders to object URL images instead of directly to a canvas — the <img> element stays stable while CSS transform handles smooth pan/zoom without any re-rendering
  - Quantized scale levels (0.5, 1, 2, 3, 4, 6, 8) — only re-renders when zoom crosses a threshold, not on every scroll tick
  - Cache with Map<key, objectUrl> keyed by url|page|scale — revisiting a scale level is instant, no re-render needed. 256MB eviction limit.
  - Debounced re-render (200ms) — when the quantized scale changes, waits for zooming to settle before rendering at the new quality level
  - will-change-transform on the transform div for GPU-accelerated compositing
  - No flicker — the old image stays displayed at the current quality while the new one renders in the background, then swaps in


● The PdfViewer has been rewritten to the simple canvas approach based on import-sample/Viewer.svelte. It renders the PDF once at RENDER_SCALE = 2 and uses CSS transform: translate() scale() for all pan/zoom — no re-rendering on zoom, so no flickering
  or blurriness.


 ## Implemented:

  Three tools in the PDF viewer toolbar:

  - Origin — Click anywhere on the drawing to place a crosshair marker. Shows coordinates in the toolbar. Red when active, blue when saved.
  - Scale — Click and drag to draw a dimension line between two points. Drag handles to adjust endpoints and offset. Enter the real-world distance (mm) in the toolbar input, then Save computes the scale factor.
  - Crop — Click and drag to define a crop rectangle. Resize via corner/edge handles. Dimmed overlay shows the excluded area. Reset button restores full page.

  UX details:
  - Tool buttons toggle on/off; only one active at a time
  - Left-click interacts with the active tool; right/middle-click always pans
  - Green dot indicators on toolbar buttons show which tools have saved data
  - Save button highlights green when there are unsaved changes
  - Escape deactivates the current tool (second Escape closes the viewer)
  - All data persists per-page to Firestore (files/{id}.pages[pageNum].origin/scale/crop)