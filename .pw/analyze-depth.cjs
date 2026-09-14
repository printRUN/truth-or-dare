// 像素取证：参照物可见性（idle 亮像素计数）+ 扫视运动量（idle vs mid 差异）
// 用法: node analyze-depth.cjs
const fs = require('fs'); const zlib = require('zlib');
let T = null;
function crc32(buf) { if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } } let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ -1; }
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); const ct = data[9]; bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('ct ' + ct); })(); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride), prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = ft === 0 ? v : ft === 1 ? (v + a) & 255 : ft === 2 ? (v + b) & 255
        : ft === 3 ? (v + ((a + b) >> 1)) & 255
        : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; })();
    }
  }
  return { w, h, bpp, data: out };
}
const lit = (img, y0, y1, thr = 12) => {   // 区间内比背景(#0a0a1a)亮的像素数
  let n = 0;
  for (let y = Math.floor(img.h * y0); y < Math.floor(img.h * y1); y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * img.bpp;
    if (img.data[i] > 10 + thr || img.data[i + 1] > 10 + thr || img.data[i + 2] > 26 + thr) n++;
  }
  return n;
};
const diffCount = (A, B) => {
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h); let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * A.w + x) * A.bpp, j = (y * B.w + x) * B.bpp;
    if (Math.abs(A.data[i] - B.data[j]) > 6 || Math.abs(A.data[i + 1] - B.data[j + 1]) > 6 || Math.abs(A.data[i + 2] - B.data[j + 2]) > 6) n++;
  }
  return n;
};
const S = 'shots/';
for (const tag of ['desktop', 'narrow']) {
  const idle = decodePNG(fs.readFileSync(S + `depth-${tag}-idle.png`));
  console.log(`[depth] ${tag}: 天区亮像素(上40%)=${lit(idle, 0, 0.4)}  地板亮像素(下22%)=${lit(idle, 0.78, 1)}  总像素=${idle.w * idle.h}`);
  const midF = S + `depth-${tag}-mid.png`;
  if (fs.existsSync(midF)) {
    const mid = decodePNG(fs.readFileSync(midF));
    console.log(`[depth] ${tag}: idle→mid 差异像素=${diffCount(idle, mid)} (${(diffCount(idle, mid) / (idle.w * idle.h) * 100).toFixed(1)}%)`);
  }
}
