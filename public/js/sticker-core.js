// Sticker exporter core — a browser/Node port of scripts/export_pack.py from
// https://github.com/WoYun520/pixel-gif-sticker-pack (MIT, Copyright (c) 2026 WoYun520).
// Pure RGBA-array image ops so the output keeps the original's hard (1-bit) alpha edges.
// Text is drawn through an injected canvas factory (browser canvas or @napi-rs/canvas in tests).
import { GIFEncoder, quantize, applyPalette } from './gifenc.esm.js';

export const PIXELS = 160, SIZE = 320, TICKS = 24, DELAY = 80;
export const WHITE = [0xff, 0xf8, 0xef]; // '#FFF8EF'

export const ICONS = {
  spark: ['....#....','....#....','...###...','..#####..','#########','..#####..','...###...','....#....','....#....'],
  heart: ['.###.###.','#########','#########','#########','.#######.','..#####..','...###...','....#....'],
  tear: ['....#....','...###...','...###...','..#####..','.#######.','.#######.','..#####..','...###...'],
  check: ['.......##','......##.','.....##..','##..##...','.####....','..##.....'],
  question: ['..####.','.##..##','.....##','....##.','...##..','...##..','.......','...##..'],
  alert: ['##','##','##','##','##','..','##','##'],
  sleep: ['######','....##','...##.','..##..','.##...','######'],
  steam: ['...##....','..####...','.######..','#########','.#######.','..#####..','...#.....','..#......'],
  note: ['....####','....####','....#...','....#...','....#...','.####...','#####...','.###....'],
  cross: ['##...##','.##.##.','..###..','...#...','..###..','.##.##.','##...##'],
  bubble: ['..####..','.##..##.','##....##','##....##','.##..##.','..####..'],
  dots: ['##.##.##','##.##.##'],
  bolt: ['....##.','...##..','..##...','.######','....##.','...##..','..##...'],
  arrow: ['....##.','.....##','#######','#######','.....##','....##.'],
  petal: ['..##..','.####.','######','.####.','..##..'],
};
export const MOTIONS = ['nod','jump','sway','startle','tremble','ponder','breathe','stomp','rush','peek','pulse','pop','offer','lean','droop','dance'];
export const ICON_NAMES = [...Object.keys(ICONS), 'none'];

// Python's round(): half to even
export function pyRound(x) {
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}
export function hex(c) { const s = c.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); }

// ---------- raw image helpers ----------
export function newImg(w, h, rgb, a = 0) {
  const d = new Uint8ClampedArray(w * h * 4);
  if (rgb || a) for (let i = 0; i < d.length; i += 4) { if (rgb) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; } d[i + 3] = a; }
  return { w, h, d };
}
export function crop(img, l, t, r, b) {
  const w = r - l, h = b - t, out = newImg(w, h);
  for (let y = 0; y < h; y++) {
    const sy = y + t; if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + l; if (sx < 0 || sx >= img.w) continue;
      const si = (sy * img.w + sx) * 4, di = (y * w + x) * 4;
      out.d[di] = img.d[si]; out.d[di + 1] = img.d[si + 1]; out.d[di + 2] = img.d[si + 2]; out.d[di + 3] = img.d[si + 3];
    }
  }
  return out;
}
export function resizeNearest(img, nw, nh) {
  const out = newImg(nw, nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y + 0.5) * img.h / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x + 0.5) * img.w / nw));
      const si = (sy * img.w + sx) * 4, di = (y * nw + x) * 4;
      out.d[di] = img.d[si]; out.d[di + 1] = img.d[si + 1]; out.d[di + 2] = img.d[si + 2]; out.d[di + 3] = img.d[si + 3];
    }
  }
  return out;
}
// Area-average downscale (premultiplied) for the optional "smooth" sprite mode.
export function resizeArea(img, nw, nh) {
  const out = newImg(nw, nh), sxr = img.w / nw, syr = img.h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * syr), y1 = Math.max(y0 + 1, Math.floor((y + 1) * syr));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sxr), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sxr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.h; yy++) for (let xx = x0; xx < x1 && xx < img.w; xx++) {
        const i = (yy * img.w + xx) * 4, al = img.d[i + 3];
        r += img.d[i] * al; g += img.d[i + 1] * al; b += img.d[i + 2] * al; a += al; n++;
      }
      const di = (y * nw + x) * 4;
      if (a > 0) { out.d[di] = r / a; out.d[di + 1] = g / a; out.d[di + 2] = b / a; }
      out.d[di + 3] = n ? a / n : 0;
    }
  }
  return out;
}
// Pillow Image.alpha_composite (source-over) at an integer offset
export function composite(dst, src, ox = 0, oy = 0) {
  for (let y = 0; y < src.h; y++) {
    const dy = y + oy; if (dy < 0 || dy >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x + ox; if (dx < 0 || dx >= dst.w) continue;
      const si = (y * src.w + x) * 4, sa = src.d[si + 3]; if (!sa) continue;
      const di = (dy * dst.w + dx) * 4;
      if (sa === 255) { dst.d[di] = src.d[si]; dst.d[di + 1] = src.d[si + 1]; dst.d[di + 2] = src.d[si + 2]; dst.d[di + 3] = 255; continue; }
      const A = sa / 255, B = dst.d[di + 3] / 255 * (1 - A), o = A + B;
      for (let c = 0; c < 3; c++) dst.d[di + c] = (src.d[si + c] * A + dst.d[di + c] * B) / o;
      dst.d[di + 3] = o * 255;
    }
  }
  return dst;
}
// Pillow ImageFilter.MaxFilter(size) on a single channel (square window, separable)
export function maxFilter(ch, w, h, size) {
  const r = size >> 1, tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = ch[y * w + k]; if (v > m) m = v; }
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]; if (v > m) m = v; }
    out[y * w + x] = m;
  }
  return out;
}
const alphaOf = (img) => { const a = new Uint8Array(img.w * img.h); for (let i = 0; i < a.length; i++) a[i] = img.d[i * 4 + 3]; return a; };
function bbox(alpha, w, h) {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  return r < 0 ? null : [l, t, r + 1, b + 1];
}
// outlined(): WHITE border from dilated alpha, original composited on top
export function outlined(layer, radius) {
  const a = maxFilter(alphaOf(layer), layer.w, layer.h, radius * 2 + 1);
  const border = newImg(layer.w, layer.h, WHITE);
  for (let i = 0; i < a.length; i++) border.d[i * 4 + 3] = a[i];
  return composite(border, layer);
}

// ---------- port of export_pack.py ----------
const pulse = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));
export function motion(kind, t) {
  const wave = Math.sin(2 * Math.PI * t), shake = Math.sin(8 * Math.PI * t), hit = pulse(t, .34, .13), cos = Math.cos, PI = Math.PI;
  switch (kind) {
    case 'nod': return [0, 4 * hit, 4 * hit, 1.5 * wave];
    case 'jump': return [0, -13 * hit + 4 * pulse(t, .14, .08), -3 * hit + 4 * pulse(t, .14, .08), 2 * wave];
    case 'sway': return [3 * wave, 0, cos(2 * PI * t), 6 * wave];
    case 'startle': return [2 * wave, -11 * pulse(t, .27, .09) + 3 * pulse(t, .43, .09), -3 * hit, -5 * hit + 2 * wave];
    case 'tremble': return [3 * shake, 1.6 * cos(8 * PI * t), 2 * shake, 2 * cos(8 * PI * t)];
    case 'ponder': return [wave, 0, wave, 8 * pulse(t, .51, .21)];
    case 'breathe': return [0, 1.8 * wave, 3 * wave, 2 * wave];
    case 'stomp': return [6 * shake * hit, 3 * pulse(t, .46, .08), 4 * pulse(t, .46, .08), -5 * shake * hit];
    case 'rush': return [10 * wave, -6 * (.5 - .5 * cos(4 * PI * t)), 1, 5 + 3 * wave];
    case 'peek': return [6 * wave, -2 * hit, 0, -4 * wave];
    case 'pulse': return [0, -4 * hit, 3 * cos(4 * PI * t), 3 * wave];
    case 'pop': return [4 * hit, -6 * hit, -4 * hit, 4 * wave];
    case 'offer': return [2 * wave, -2 * hit, 4 * hit, -3 * wave];
    case 'lean': return [4 * hit, 2 * hit, 1, 8 * hit];
    case 'droop': return [-2 * wave, 5 * hit, 5 * hit, -5 * hit];
    case 'dance': return [4 * wave, -6 * (.5 - .5 * cos(4 * PI * t)), 2 * cos(4 * PI * t), 6 * wave];
  }
  throw new Error(`Unknown motion ${kind}`);
}

function drawIcon(layer, name, x, y, size, color, ink) {
  if (size < 1) return;
  const rows = ICONS[name], w = rows[0].length * size, h = rows.length * size, mw = w + 4, mh = h + 4;
  const mask = new Uint8Array(mw * mh);
  rows.forEach((row, j) => [...row].forEach((cell, k) => {
    if (cell !== '#') return;
    for (let yy = 2 + j * size; yy <= 1 + (j + 1) * size; yy++) for (let xx = 2 + k * size; xx <= 1 + (k + 1) * size; xx++) mask[yy * mw + xx] = 255;
  }));
  const ba = maxFilter(mask, mw, mh, 3), badge = newImg(mw, mh, ink), face = newImg(mw, mh, color);
  for (let i = 0; i < mask.length; i++) { badge.d[i * 4 + 3] = ba[i]; face.d[i * 4 + 3] = mask[i]; }
  composite(badge, face);
  composite(layer, badge, pyRound(x - mw / 2), pyRound(y - mh / 2));
}
// Pillow ImageDraw.line(width=2) approximation for the short accent stroke
function drawLine(layer, x0, y0, x1, y1, color) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    for (const yy of [y, y + 1]) if (x >= 0 && x < layer.w && yy >= 0 && yy < layer.h) {
      const di = (yy * layer.w + x) * 4; layer.d[di] = color[0]; layer.d[di + 1] = color[1]; layer.d[di + 2] = color[2]; layer.d[di + 3] = 255;
    }
  }
}
function effects(layer, icon, t, tint, ink, seed) {
  if (icon === 'none' || !icon) return;
  const polarity = seed % 2 ? 1 : -1, wave = Math.sin(2 * Math.PI * t), hit = pulse(t, .33, .15);
  const center = polarity > 0 ? 124 : 36, other = 160 - center, I = (b) => (b ? 1 : 0);
  if (['heart', 'petal', 'bubble', 'note', 'sleep'].includes(icon)) {
    for (let j = 0; j < 3; j++) {
      const phase = (t + j / 3) % 1;
      const size = 1 + I(.12 < phase && phase < .86) + I(.44 < phase && phase < .68 && j === 0);
      drawIcon(layer, icon, center + polarity * (phase * 10 - j * 5), 81 - 44 * phase - j * 5, size, tint, ink);
    }
    drawIcon(layer, 'spark', other, 53 + 3 * wave, 1, tint, ink);
  } else if (icon === 'tear') {
    for (let j = 0; j < 4; j++) {
      const phase = (2 * t + j * .23) % 1, sign = j % 2 ? 1 : -1;
      drawIcon(layer, icon, 80 + sign * (42 + phase * 10), 76 + phase * 37 + Math.floor(j / 2) * 8, 1 + I(.16 < phase && phase < .74), tint, ink);
    }
  } else {
    drawIcon(layer, icon, center + 2 * wave, 38 - 6 * hit, 2 + I(hit > .57), tint, ink);
    drawIcon(layer, ['check', 'spark', 'question'].includes(icon) ? 'spark' : 'dots', other, 65 + 4 * wave, 1 + I(icon === 'spark' && hit > .5), tint, ink);
    drawLine(layer, other - 4, 82, other + 2, 79, tint);
  }
}

// Find gutters near the equal-grid lines (a small, optional improvement over a fixed grid):
// picks the least-occupied column/row within ±10% of a cell around each nominal boundary.
export function detectGrid(atlas, cols, rows) {
  const colSum = new Float64Array(atlas.w), rowSum = new Float64Array(atlas.h);
  for (let y = 0; y < atlas.h; y++) for (let x = 0; x < atlas.w; x++) { const a = atlas.d[(y * atlas.w + x) * 4 + 3] >= 144 ? 1 : 0; colSum[x] += a; rowSum[y] += a; }
  const cuts = (sum, n, len) => {
    const out = [0];
    for (let k = 1; k < n; k++) {
      const nom = Math.floor(k * len / n), win = Math.floor(len / n * 0.1);
      let best = nom, bv = Infinity;
      for (let p = nom - win; p <= nom + win; p++) { const v = sum[p] + Math.abs(p - nom) * 1e-3; if (v < bv) { bv = v; best = p; } }
      out.push(best);
    }
    out.push(len); return out;
  };
  return { xs: cuts(colSum, cols, atlas.w), ys: cuts(rowSum, rows, atlas.h) };
}

export function cropSprite(atlas, grid, cell, opts = {}) {
  const [cols, rows] = grid, [col, row] = cell, { w, h } = atlas;
  let bounds = opts.crop;
  if (!bounds && opts.cuts) bounds = [opts.cuts.xs[col], opts.cuts.ys[row], opts.cuts.xs[col + 1], opts.cuts.ys[row + 1]];
  if (!bounds) bounds = [Math.floor(col * w / cols), Math.floor(row * h / rows), Math.floor((col + 1) * w / cols), Math.floor((row + 1) * h / rows)];
  let art = crop(atlas, ...bounds);
  const alpha = new Uint8Array(art.w * art.h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = art.d[i * 4 + 3] >= 144 ? 255 : 0;
  const box = bbox(alpha, art.w, art.h);
  if (!box) throw new Error(`No transparent sprite in cell ${cell}`);
  const ratioOf = (a) => Math.min(106 / a.h, 118 / a.w);
  if (opts.smooth) { // area-average then hard alpha
    art = crop(art, ...box);
    const r = ratioOf(art);
    art = resizeArea(art, Math.max(1, pyRound(art.w * r)), Math.max(1, pyRound(art.h * r)));
    for (let i = 3; i < art.d.length; i += 4) art.d[i] = art.d[i] >= 128 ? 255 : 0;
    return art;
  }
  for (let i = 0; i < alpha.length; i++) art.d[i * 4 + 3] = alpha[i];
  art = crop(art, ...box);
  const r = ratioOf(art);
  return resizeNearest(art, Math.max(1, pyRound(art.w * r)), Math.max(1, pyRound(art.h * r)));
}

export function makeCaption(text, inkHex, createCanvas, fontFamily) {
  text = text.replace(/！/g, '!').replace(/？/g, '?').replace(/～/g, '~');
  const cv = createCanvas(SIZE, SIZE), ctx = cv.getContext('2d');
  let size = [...text].length <= 4 ? 43 : 38;
  const setFont = () => { ctx.font = `bold ${size}px ${fontFamily}`; };
  setFont();
  while (ctx.measureText(text).width > 275 && size > 8) { size--; setFont(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = inkHex; ctx.strokeStyle = inkHex; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.strokeText(text, 160, 278); ctx.fillText(text, 160, 278);
  const id = ctx.getImageData(0, 0, SIZE, SIZE), ink = hex(inkHex);
  const face = { w: SIZE, h: SIZE, d: new Uint8ClampedArray(id.data) };
  for (let i = 0; i < face.d.length; i += 4) {
    const on = face.d[i + 3] >= 112;
    face.d[i] = ink[0]; face.d[i + 1] = ink[1]; face.d[i + 2] = ink[2]; face.d[i + 3] = on ? 255 : 0;
  }
  return outlined(face, 4);
}

export function drawFrame(sprite, label, job, t) {
  const [dx, dy, squash, sway] = motion(job.motion, t);
  const layer = newImg(PIXELS, PIXELS);
  const art = resizeNearest(sprite, Math.max(1, sprite.w + pyRound(squash)), Math.max(1, sprite.h - pyRound(squash)));
  const x = pyRound((PIXELS - art.w) / 2 + dx), y = Math.max(4, pyRound(122 - art.h + dy));
  for (let top = 0; top < art.h; top += 3) {
    const bottom = Math.min(art.h, top + 3), shear = pyRound((1 - top / art.h) ** 1.7 * sway);
    composite(layer, crop(art, 0, top, art.w, bottom), x + shear, y + top);
  }
  effects(layer, job.icon, t, hex(job.tint), hex(job.ink), job.number);
  const out = resizeNearest(outlined(layer, 2), SIZE, SIZE);
  return composite(out, label);
}

export function renderSticker(atlas, job, createCanvas, opts = {}) {
  const sprite = cropSprite(atlas, job.grid, job.cell, { cuts: opts.cuts, smooth: opts.smooth, crop: job.crop });
  const label = job.text ? makeCaption(job.text, job.ink, createCanvas, opts.fontFamily || 'sans-serif') : newImg(SIZE, SIZE);
  const frames = [];
  for (let k = 0; k < TICKS; k++) frames.push(drawFrame(sprite, label, job, k / TICKS));
  return frames;
}

// save_gif(): one shared palette (250 colors) from a 4x6 montage on WHITE, no dithering,
// fully transparent pixels → extra transparent index, disposal 2, loop forever, 80 ms/frame.
export function encodeGif(frames) {
  const cols = 4, rows = Math.ceil(frames.length / cols), mw = SIZE * cols;
  const montage = new Uint8ClampedArray(mw * SIZE * rows * 4);
  for (let i = 0; i < montage.length; i += 4) { montage[i] = WHITE[0]; montage[i + 1] = WHITE[1]; montage[i + 2] = WHITE[2]; montage[i + 3] = 255; }
  frames.forEach((im, j) => {
    const ox = SIZE * (j % cols), oy = SIZE * Math.floor(j / cols);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const si = (y * SIZE + x) * 4; if (im.d[si + 3] < 128) continue;
      const di = ((oy + y) * mw + ox + x) * 4; montage[di] = im.d[si]; montage[di + 1] = im.d[si + 1]; montage[di + 2] = im.d[si + 2];
    }
  });
  const palette = quantize(montage, 250, { format: 'rgb565' }).slice(0, 255);
  const tIdx = palette.length; palette.push([...WHITE]);
  const gif = GIFEncoder();
  const matte = new Uint8ClampedArray(SIZE * SIZE * 4);
  frames.forEach((im, j) => {
    for (let i = 0; i < matte.length; i += 4) {
      const on = im.d[i + 3] >= 128;
      matte[i] = on ? im.d[i] : WHITE[0]; matte[i + 1] = on ? im.d[i + 1] : WHITE[1]; matte[i + 2] = on ? im.d[i + 2] : WHITE[2]; matte[i + 3] = 255;
    }
    const index = applyPalette(matte, palette.slice(0, tIdx), 'rgb565');
    for (let p = 0; p < index.length; p++) if (im.d[p * 4 + 3] < 128) index[p] = tIdx;
    gif.writeFrame(index, SIZE, SIZE, j === 0
      ? { palette, delay: DELAY, transparent: true, transparentIndex: tIdx, dispose: 2, repeat: 0 }
      : { delay: DELAY, transparent: true, transparentIndex: tIdx, dispose: 2 });
  });
  gif.finish();
  return gif.bytes();
}

export function uniqueFrames(frames) {
  const seen = new Set();
  for (const f of frames) { let h = 2166136261; for (let i = 0; i < f.d.length; i += 3) { h ^= f.d[i]; h = Math.imul(h, 16777619); } seen.add(h >>> 0); }
  return seen.size;
}

export function cleanFilename(text) { return text.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_'); }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// gallery(): offline 动图浏览.html that travels inside the ZIP (port of the original)
export function galleryHtml(title, groups) {
  const tabs = [], content = [];
  groups.forEach((g, n) => {
    tabs.push(`<button type="button" data-section="${n}">${esc(g.name)} · ${g.files.length}</button>`);
    const items = g.files.map((p) => { const src = p.split('/').map(encodeURIComponent).join('/'); const cap = esc(p.split('/').pop().replace(/\.gif$/, ''));
      return `<a href="${src}"><img loading="lazy" alt="${cap}" data-src="${src}" width="160" height="160"><span>${cap}</span></a>`; });
    content.push(`<section id="s${n}" hidden><h2>${esc(g.name)}</h2><div class="grid">${items.join('')}</div></section>`);
  });
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:auto;max-width:1100px;padding:30px 20px;background:#f3edf8;color:#2e253d;font:16px system-ui,sans-serif}
h1{font-size:clamp(24px,5vw,43px);margin:0}p{color:#5d4b70}nav{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}
button{font:inherit;border:1px solid #cbbcd7;border-radius:10px;padding:9px 12px;background:#fff9f4;color:inherit;cursor:pointer}button[aria-pressed="true"]{background:#372946;color:white}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:12px}a{display:grid;justify-items:center;background:#fffaf6;border:1px solid #dccde4;border-radius:12px;padding:8px;text-decoration:none;color:inherit}img{width:100%;height:auto;max-width:180px;image-rendering:pixelated}span{padding-bottom:4px;font-size:13px}
</style>
<header><h1>${esc(title)}</h1><p>选择分类播放 GIF。点击任意一张可单独打开。 / Pick a category to play the GIFs.</p></header>
<nav>${tabs.join('')}</nav>${content.join('')}
<script>
function show(i){document.querySelectorAll('section').forEach((s,n)=>{s.hidden=n!==i;if(n===i)s.querySelectorAll('img[data-src]').forEach(img=>{img.src=img.dataset.src;delete img.dataset.src})});document.querySelectorAll('button').forEach((b,n)=>b.setAttribute('aria-pressed',n===i))}
document.querySelectorAll('button').forEach((b,n)=>b.addEventListener('click',()=>show(n)));show(0);
</script>
</html>`;
}
