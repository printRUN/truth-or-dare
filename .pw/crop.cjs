// 裁切 + 整数放大 PNG（最近邻），用于把一处细节放大到能看清。
// 用法: node crop.cjs <in.png> <out.png> <x> <y> <w> <h> [zoom]
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bpp = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); const ct = data[9]; bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('ct ' + ct); })(); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = ft === 0 ? v : ft === 1 ? (v + a) & 255 : ft === 2 ? (v + b) & 255
        : ft === 3 ? (v + ((a + b) >> 1)) & 255
        : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; })();
    }
  }
  return { w, h, bpp, data: out };
}

function encodePNG(img) {
  const { w, h, bpp, data } = img;
  const stride = w * bpp;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, body) => {
    const b = Buffer.alloc(8 + body.length + 4);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, 'ascii'); body.copy(b, 8);
    const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    b.writeUInt32BE(crc32(crcBuf) >>> 0, 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = bpp === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let T = null;
function crc32(buf) {
  if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
  let c = -1; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const [, , inF, outF, X, Y, W, H, Z] = process.argv;
const src = decodePNG(fs.readFileSync(inF));
const x0 = Math.max(0, +X | 0), y0 = Math.max(0, +Y | 0);
const w = Math.min(+W | 0, src.w - x0), h = Math.min(+H | 0, src.h - y0), z = Math.max(1, +(Z || 1) | 0);
const dst = { w: w * z, h: h * z, bpp: src.bpp, data: Buffer.alloc(w * z * h * z * src.bpp) };
for (let y = 0; y < h * z; y++) for (let x = 0; x < w * z; x++) {
  const si = ((y0 + (y / z | 0)) * src.w + (x0 + (x / z | 0))) * src.bpp;
  const di = (y * w * z + x) * src.bpp;
  for (let k = 0; k < src.bpp; k++) dst.data[di + k] = src.data[si + k];
}
fs.writeFileSync(outF, encodePNG(dst));
console.log(`${inF} (${src.w}x${src.h}) → ${outF} (${dst.w}x${dst.h})  裁自 ${x0},${y0} ${w}x${h} zoom=${z}`);
