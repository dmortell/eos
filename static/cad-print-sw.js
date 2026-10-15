// cad's print tab (Dave 2026-10-15: Chrome's PDF viewer saved a blob: URL as "852c7d55-….pdf"): the page puts the PDF in
// the "cad-print" cache under /cad-print/<id>/<file name>.pdf and opens that path; this worker answers it from the
// cache, so the viewer's Download offers the file's own name. Scope: /cad-print/ only — it touches nothing else.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url)
	if (!url.pathname.startsWith('/cad-print/')) return
	e.respondWith(
		caches.open('cad-print')
			.then((c) => c.match(url.pathname))
			.then((r) => r ?? new Response('This PDF is no longer here — print it again from cad (Ctrl+P).', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })),
	)
})
