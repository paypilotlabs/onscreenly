const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseDocumentFile, standardFontDataUrl } = require('../../src/context/resume');

// A minimal one-page PDF using the built-in Helvetica font, with each line
// drawn by its own text operator.
function buildPdf(lines) {
  const body = ['BT /F1 18 Tf 72 720 Td'];
  lines.forEach((line, i) => {
    if (i) body.push('0 -28 Td');
    body.push(`(${line.replace(/[()\\]/g, (c) => '\\' + c)}) Tj`);
  });
  body.push('ET');
  const stream = body.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function tempFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-resume-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

test('extracts the text layer of a PDF résumé', async () => {
  const file = tempFile('resume.pdf', buildPdf(['Jane Doe', 'Senior Software Engineer', 'Skills: Node.js (8 years)']));
  const text = await parseDocumentFile(file);
  assert.match(text, /Jane Doe/);
  assert.match(text, /Senior Software Engineer/);
  assert.match(text, /Skills: Node\.js \(8 years\)/);
});

test('rejects a file that is not a PDF', async () => {
  const file = tempFile('broken.pdf', 'this is not a pdf');
  await assert.rejects(parseDocumentFile(file));
});

test('rejects unsupported file types', async () => {
  const file = tempFile('resume.rtf', '{\\rtf1 plain text}');
  await assert.rejects(parseDocumentFile(file), /Unsupported file type: \.rtf/);
});

test('reads Markdown and plain-text résumés as they are', async () => {
  const md = tempFile('resume.md', '﻿# Jane Doe\n\n## Experience\n- Built the payments ledger\n');
  assert.equal(await parseDocumentFile(md), '# Jane Doe\n\n## Experience\n- Built the payments ledger');
  const txt = tempFile('RESUME.TXT', 'Jane Doe\nEngineer\n');
  assert.equal(await parseDocumentFile(txt), 'Jane Doe\nEngineer');
});

test('the font folder handed to pdf.js ends in a forward slash on every OS', () => {
  assert.equal(
    standardFontDataUrl('C:\\Users\\Leo\\AppData\\Local\\Programs\\Onscreenly\\node_modules\\pdfjs-dist', path.win32),
    'C:/Users/Leo/AppData/Local/Programs/Onscreenly/node_modules/pdfjs-dist/standard_fonts/'
  );
  assert.equal(
    standardFontDataUrl('/Applications/Onscreenly.app/node_modules/pdfjs-dist', path.posix),
    '/Applications/Onscreenly.app/node_modules/pdfjs-dist/standard_fonts/'
  );
});
