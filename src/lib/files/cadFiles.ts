// CAD drawings (DXF / DWG) the Uploads tool accepts, and their size limit (MB) for now — checked before uploading.
// (Moved out of pages/constants in cad Phase 7.1 so Uploads doesn't depend on the Pages folder; Pages keeps its own
// copy until it's retired. The server ceiling is in routes/api/uploadthing.)
export const CAD_FILE = /\.(dxf|dwg)$/i
export const CAD_UPLOAD_MAX_MB = 8
