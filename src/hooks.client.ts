// Polyfill URL.parse on the main thread for older Safari/WebKit (iPad). The pdfjs worker is
// polyfilled separately (see src/lib/pdf-worker.ts). See url-parse-polyfill.ts for the why.
import '$lib/url-parse-polyfill'
