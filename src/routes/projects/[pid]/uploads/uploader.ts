// Generating the createUploadThing helper function lets you create your own components, with full type safety
import { generateSvelteHelpers } from "@uploadthing/svelte";
import type { OurFileRouter } from "../../../api/uploadthing/uploadthing";
export const { createUploader, createUploadThing } = generateSvelteHelpers<OurFileRouter>();

/*
see multer packege if you want file uploads to this server using node.js (used in cad-windsurf)

<SelectPdf/>

src/lib/uploadthing.ts
src/lib/server/uploadthing.ts             router, middleware, onUploadComplete
src/routes/api/uploadthing/+server.ts     GET and POST handlers
svelte.config.js

src/routes/cad/+layout.server.js          getImages() from $lib/server/db

uploaded file urls are tracked in sqlite
  src/lib/server/db/index.js
*/