import { env } from "$env/dynamic/private";
import { createRouteHandler } from "uploadthing/server";
import { ourFileRouter } from "./uploadthing";

const handlers = createRouteHandler({
  router: ourFileRouter,
  config: { token: env.UPLOADTHING_TOKEN },
});

export { handlers as GET, handlers as POST };
