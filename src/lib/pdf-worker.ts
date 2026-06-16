// Entry for the pdfjs web worker. Polyfill URL.parse in the worker's own global FIRST (old
// Safari/iPad lacks it just like the main thread did), then load the stock pdfjs worker, which
// registers its message handler on import. Used via `?worker` in PdfState so Vite bundles this
// (polyfill + worker) into one module worker.
import './url-parse-polyfill'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
