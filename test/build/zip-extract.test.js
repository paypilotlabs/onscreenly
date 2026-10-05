const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { extractZipWithMaterializedLinks } = require('../../scripts/prepare-whisper-runtime');

// Builds a stored (uncompressed) zip whose entries carry Unix modes, so the
// tests can include directories, executables and symbolic links.
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data = '', mode } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(data, 'utf8');
    const crc = zlib.crc32(dataBuf);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the mode bits are honoured
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + dataBuf.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const FILE = 0o100644;
const EXEC = 0o100755;
const DIR = 0o040755;
const LINK = 0o120777;

function setup(entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-unzip-'));
  const archive = path.join(root, 'archive.zip');
  const out = path.join(root, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(archive, buildZip(entries));
  return { root, archive, out };
}

test('extracts files and directories, keeps the executable bit and skips __MACOSX', async () => {
  const { archive, out } = setup([
    { name: 'bin/', mode: DIR },
    { name: 'bin/whisper-server', data: 'binary', mode: EXEC },
    { name: 'bin/readme.txt', data: 'hello', mode: FILE },
    { name: '__MACOSX/bin/._readme.txt', data: 'resource fork', mode: FILE }
  ]);
  await extractZipWithMaterializedLinks(archive, out);
  assert.equal(fs.readFileSync(path.join(out, 'bin/whisper-server'), 'utf8'), 'binary');
  assert.equal(fs.readFileSync(path.join(out, 'bin/readme.txt'), 'utf8'), 'hello');
  assert.equal(fs.existsSync(path.join(out, '__MACOSX')), false);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(out, 'bin/whisper-server')).mode & 0o111, 0o111);
  }
});

test('writes an in-archive symbolic link as a copy of its target, never as a link', async () => {
  const { archive, out } = setup([
    { name: 'lib/libwhisper.so.1', data: 'library', mode: FILE },
    { name: 'lib/libwhisper.so', data: 'libwhisper.so.1', mode: LINK }
  ]);
  await extractZipWithMaterializedLinks(archive, out);
  const linkPath = path.join(out, 'lib/libwhisper.so');
  assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(linkPath, 'utf8'), 'library');
});

test('refuses a symbolic link that points outside the extraction root', async () => {
  const { root, archive, out } = setup([{ name: 'escape', data: '../../secret.txt', mode: LINK }]);
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside');
  await assert.rejects(extractZipWithMaterializedLinks(archive, out), /Unsafe archive path|escaped/);
  assert.equal(fs.existsSync(path.join(out, 'escape')), false);
});

test('refuses entry names that climb out of the extraction root', async () => {
  const { root, archive, out } = setup([{ name: '../escape.txt', data: 'x', mode: FILE }]);
  await assert.rejects(extractZipWithMaterializedLinks(archive, out));
  assert.equal(fs.existsSync(path.join(root, 'escape.txt')), false);
});

test('refuses absolute entry names', async () => {
  const { archive, out } = setup([{ name: '/tmp/onscreenly-absolute.txt', data: 'x', mode: FILE }]);
  await assert.rejects(extractZipWithMaterializedLinks(archive, out));
});

test('refuses cyclic links', async () => {
  const { archive, out } = setup([
    { name: 'a', data: 'b', mode: LINK },
    { name: 'b', data: 'a', mode: LINK }
  ]);
  await assert.rejects(extractZipWithMaterializedLinks(archive, out), /Cyclic archive link/);
});
