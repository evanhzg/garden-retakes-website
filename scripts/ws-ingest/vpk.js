// A minimal VPK directory reader.
//
// Listing what is *inside* a VPK does not require decompiling anything: the
// archive begins with a plain directory tree of nul-terminated strings, and
// only the file *bodies* are Source 2 compiled blobs. So we can pull every
// `.vmat_c` path out natively and skip the ValveResourceFormat/.NET dependency
// entirely — that toolchain is only needed if you later want the texture data.
//
// Format (v1 and v2 share the tree layout):
//
//   header   uint32 signature = 0x55AA1234
//            uint32 version   (1 or 2)
//            uint32 treeSize
//            [v2 only] uint32 fileDataSectionSize, archiveMD5SectionSize,
//                      otherMD5SectionSize, signatureSectionSize
//
//   tree     extension\0
//              path\0
//                filename\0
//                  uint32 crc, uint16 preloadBytes, uint16 archiveIndex,
//                  uint32 entryOffset, uint32 entryLength, uint16 0xFFFF
//                  <preloadBytes of inline data>
//                \0            end of this path's files
//              \0              end of this extension's paths
//            \0                end of tree
//
// A path of " " means the archive root. Extension " " means no extension.

const fs = require("node:fs");

const SIGNATURE = 0x55aa1234;
const TERMINATOR = 0xffff;

class VpkError extends Error {}

/** Sequential reader over the directory buffer. */
class Cursor {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }

  u16() {
    this._need(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  u32() {
    this._need(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  /** Nul-terminated ASCII. */
  str() {
    const end = this.buf.indexOf(0, this.pos);
    if (end === -1) throw new VpkError("unterminated string in VPK tree");
    const s = this.buf.toString("utf8", this.pos, end);
    this.pos = end + 1;
    return s;
  }

  skip(n) {
    this._need(n);
    this.pos += n;
  }

  _need(n) {
    if (this.pos + n > this.buf.length) throw new VpkError("VPK tree ended unexpectedly");
  }
}

/**
 * Read a VPK's directory.
 *
 * @param {Buffer} buf  the whole `.vpk` (or just its header + tree)
 * @returns {{ version: number, entries: Array<{path: string, crc: number,
 *            archiveIndex: number, offset: number, length: number,
 *            preloadBytes: number}> }}
 */
function readVpkBuffer(buf) {
  if (buf.length < 12) throw new VpkError("file is too small to be a VPK");

  const signature = buf.readUInt32LE(0);
  if (signature !== SIGNATURE) {
    throw new VpkError(`not a VPK (signature 0x${signature.toString(16)}, expected 0x55aa1234)`);
  }

  const version = buf.readUInt32LE(4);
  const treeSize = buf.readUInt32LE(8);
  if (version !== 1 && version !== 2) throw new VpkError(`unsupported VPK version ${version}`);

  const headerSize = version === 1 ? 12 : 28;
  const tree = buf.subarray(headerSize, headerSize + treeSize);
  const cursor = new Cursor(tree);

  const entries = [];

  for (;;) {
    const extension = cursor.str();
    if (extension === "") break;

    for (;;) {
      const directory = cursor.str();
      if (directory === "") break;

      for (;;) {
        const filename = cursor.str();
        if (filename === "") break;

        const crc = cursor.u32();
        const preloadBytes = cursor.u16();
        const archiveIndex = cursor.u16();
        const offset = cursor.u32();
        const length = cursor.u32();
        const terminator = cursor.u16();
        if (terminator !== TERMINATOR) {
          throw new VpkError(`bad entry terminator 0x${terminator.toString(16)} for ${filename}`);
        }
        // Small files are stored inline right here; step over them.
        if (preloadBytes) cursor.skip(preloadBytes);

        // " " is how the format spells "no directory" / "no extension".
        const dir = directory === " " ? "" : `${directory}/`;
        const ext = extension === " " ? "" : `.${extension}`;
        entries.push({
          path: `${dir}${filename}${ext}`,
          crc,
          archiveIndex,
          offset,
          length,
          preloadBytes,
        });
      }
    }
  }

  return { version, entries };
}

/** Same, straight from a path on disk. */
function readVpkFile(file) {
  return readVpkBuffer(fs.readFileSync(file));
}

/**
 * Every entry whose path ends in one of `extensions` (case-insensitive).
 * Defaults to compiled materials, which is what the !ws plugin needs.
 */
function findByExtension(entries, extensions = [".vmat_c"]) {
  const wanted = extensions.map((e) => e.toLowerCase());
  return entries.filter((e) => wanted.some((ext) => e.path.toLowerCase().endsWith(ext)));
}

module.exports = { readVpkBuffer, readVpkFile, findByExtension, VpkError, SIGNATURE };
