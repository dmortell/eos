import { Session } from "$lib";
import { createUploadthing } from "uploadthing/server";
import type { FileRouter } from "uploadthing/server";

// see https://docs.uploadthing.com/getting-started/svelte
// import { UTApi } from "uploadthing/server";
// export const utapi = new UTApi({
//     apiKey: process.env.UPLOADTHING_SECRET, // YOUR UPLOADTHING_SECRET
// });

const f = createUploadthing();

export const ourFileRouter = {
  // add FileRouters here, each with a unique routeSlug (e.g. "imageUploader")
  imageUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 20, }
  })
  .middleware(async ({ req }) => {
    const session = new Session()
    const {user} = session
    console.log({user})
    return {}
  })
  .onUploadComplete(async ({ metadata, file }) => {
    console.log("file url", file.ufsUrl);
  }),

  floorplanUploader: f({
    pdf: { maxFileSize: "32MB", maxFileCount: 10, },
    image: { maxFileSize: "16MB", maxFileCount: 10, }
  })
  .middleware(async ({ req }) => {
    const session = new Session()
    const {user} = session
    return {}
  })
  .onUploadComplete(async ({ metadata, file }) => {
    console.log("floorplan uploaded:", file.ufsUrl);
  }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
