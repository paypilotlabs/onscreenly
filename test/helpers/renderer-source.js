// The renderer is split into ES modules under renderer/js/. Tests that check
// its source by inspection read one module, or all of them joined.
const fs = require('node:fs');
const path = require('node:path');

const RENDERER_JS = path.join(__dirname, '..', '..', 'renderer', 'js');

function rendererModule(name) {
  return fs.readFileSync(path.join(RENDERER_JS, name), 'utf8');
}

function rendererModuleFiles() {
  return fs
    .readdirSync(RENDERER_JS)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => `renderer/js/${f}`);
}

function rendererSource() {
  return rendererModuleFiles()
    .map((f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'))
    .join('\n');
}

module.exports = { rendererModule, rendererModuleFiles, rendererSource };
