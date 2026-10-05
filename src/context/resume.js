// @ts-check
// Extracts plain text from a resume/job-description file (PDF or DOCX) so it can be
// dropped into the existing Settings textareas. No OCR — text layer only.
const fs = require('fs');
const path = require('path');

// pdf.js requires this location to end in '/', and a Windows path joined with
// path.sep ends in '\\', which it rejects. Forward slashes work for fs on every OS.
function standardFontDataUrl(packageDir, pathImpl = path) {
  return pathImpl.join(packageDir, 'standard_fonts').split(pathImpl.sep).join('/') + '/';
}

// pdf.js parses untrusted files here. Current pdf.js has no eval code path
// (CVE-2024-4367 was code execution through font programs evaluated with
// eval in pdf.js before 4.2.67, which the old pdf-parse still bundled), and
// fonts are never loaded into a page: only the text layer is read.
async function extractPdfText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const packageDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: standardFontDataUrl(packageDir),
    verbosity: pdfjs.VerbosityLevel.ERRORS
  });
  const doc = await loadingTask.promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        if (item.hasEOL) text += '\n';
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await loadingTask.destroy();
  }
}

async function parseDocumentFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  if (ext === '.pdf') {
    return (await extractPdfText(buf)).trim();
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const res = await mammoth.extractRawText({ buffer: buf });
    return (res.value || '').trim();
  }
  throw new Error('Unsupported file type: ' + (ext || '(none)') + '. Use a PDF or DOCX file.');
}

module.exports = { parseDocumentFile, standardFontDataUrl };
