import { env } from "$env/dynamic/private";
import { json } from "@sveltejs/kit";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi({ token: env.UPLOADTHING_TOKEN });

export async function POST({ request }) {
    const { key } = await request.json();
    if (!key) return json({ error: "Missing key" }, { status: 400 });

    try {
        await utapi.deleteFiles(key);
        return json({ ok: true });
    } catch (e: any) {
        console.error("UploadThing delete error:", e);
        return json({ error: e.message }, { status: 500 });
    }
}
