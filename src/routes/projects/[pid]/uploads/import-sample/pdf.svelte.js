let pdfjs = null

export class PdfState {
  pdfDoc = $state()
  pageNum = $state(1);  // TODO remember PDF page & view
  totalPages = $state(0);

  destroy(){ if (this.pdfDoc) this.pdfDoc.destroy() }

  async load(url){
    if (!pdfjs) pdfjs = await import('pdfjs-dist/build/pdf');    // Import pdfjs-dist dynamically for client-side rendering.
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.min.mjs";   // see https://www.nutrient.io/blog/how-to-build-a-reactjs-viewer-with-pdfjs/
    this.pdfDoc = await pdfjs.getDocument({cMapUrl:"pdfjs-dist/cmaps/", cMapPacked:true, url}).promise
    this.totalPages = this.pdfDoc.numPages
    if (this.pageNum<1 || this.pageNum>this.totalPages) this.pageNum = 1
    return this.pdfDoc
  }

  async render(options){  // intent:'display' 'print' 'any', annotationMode:AnnotationMode.DISABLE, transform, isEditing:true
    let {canvas, page, scale=1, rotation} = options;
    if (this.rendering==canvas) return;
    this.rendering = canvas;
    let pdfPage = await this.pdfDoc.getPage(page);
    let viewport = pdfPage.getViewport({scale, rotation});
    canvas.width  = Math.floor(viewport.width);      canvas.style.width  = Math.floor(viewport.width / scale) + "px";
    canvas.height = Math.floor(viewport.height);     canvas.style.height = Math.floor(viewport.height / scale) + "px";
    await pdfPage.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    this.rendering = null;
    pdfPage.cleanup();    // Release page resources
    return viewport;
  }
}
