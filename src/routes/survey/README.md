# photo-survey-app

Photo surveys is a mobile web app to take photos during site surveys, enter titles (via keyboard or voice), and generate an album that can be shared with your team.

Features include:
* geo-tagging & timestamps
* mark photo location and direction on floorplans
* upload and scale floorplans
* annotations/markup
* cloud sync, google photos or apple photos
* project oragnization - album name and date
* scan text labels for entry into descriptions/title
* ability to read barcodes for tracking devices

Tech Stack:
* Svelte PWA
* Camera API
* Web Speech API
* ZXing barcode scanner
* Canvas annotations
* Firebase storage


## Testing on development

Run the dev server with --host to expose it on your local network:

```
pnpm dev --host
```

It'll show something like http://192.168.x.x:5173. Open that on your phone (same WiFi network).
http://192.168.0.116:5173/

Important: Camera and voice APIs require HTTPS or localhost. Since your phone hits it via IP (not localhost), the browser will block getUserMedia.

Options:

* Option A: Use the file input fallback

The Camera component already has a <input type="file" accept="image/*" capture="environment"> fallback that appears when getUserMedia fails. This opens the native phone camera app directly — works fine over HTTP.

* Option B: HTTPS via tunnel (full camera UI)

Use a tunnel to get an HTTPS URL:

```
npx localtunnel --port 5173
```

This will give you a one-time random url on domain loca.lt
When you open the given url on mobile, it will want your public IP address as the password. Get it by running:

```
curl -s ifconfig.me
```

You'll also need to add the localtunnel URL domain (e.g. loca.lt) to Firebase's Authorized domains list, same as before — otherwise login will still flicker.

or if you have ngrok:

```
ngrok http 5173
```

This gives you an https:// URL that works from any device with full camera/voice API access.


* Option C: Chrome flag (Android only)

On Android Chrome, go to chrome://flags, search for unsafely-treat-insecure-origin-as-secure, add your http://192.168.x.x:5173 URL, and restart Chrome.

I'd recommend Option A to start — it lets you test the full flow (capture, voice, upload, save) using the phone's native camera, which is actually a better UX on mobile anyway.