// Node harness: run the browser exporter core on an atlas PNG → GIFs + ZIP (same code the site runs).
import fs from 'node:fs'; import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import JSZip from 'jszip';
import * as core from '../public/js/sticker-core.js';
import { TEMPLATES } from '../public/js/templates.js';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 'NotoCJK');
const [atlasPath, outDir, tpl = 'replies', lang = 'zh', smooth = ''] = process.argv.slice(2);
const img = await loadImage(fs.readFileSync(atlasPath));
const cv = createCanvas(img.width, img.height); const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
const atlas = { w: img.width, h: img.height, d: new Uint8ClampedArray(ctx.getImageData(0, 0, img.width, img.height).data) };
const t = TEMPLATES[tpl]; const cuts = core.detectGrid(atlas, 4, 4);
fs.mkdirSync(outDir, { recursive: true });
const zip = new JSZip(); const files = []; const group = `01-${core.cleanFilename(t[lang])}`;
const t0 = Date.now(); let minU = 99;
t.items.forEach((it, i) => {
  const job = { number: i + 1, grid: [4, 4], cell: [i % 4, Math.floor(i / 4)], text: it[lang], motion: it.motion, icon: it.icon, ink: t.ink, tint: t.tint };
  const frames = core.renderSticker(atlas, job, createCanvas, { cuts, smooth: !!smooth, fontFamily: 'NotoCJK' });
  minU = Math.min(minU, core.uniqueFrames(frames));
  const gif = core.encodeGif(frames);
  const name = `${String(i + 1).padStart(3, '0')}-${core.cleanFilename(job.text)}.gif`;
  fs.writeFileSync(path.join(outDir, name), gif); zip.file(`${group}/${name}`, gif); files.push(`${group}/${name}`);
});
zip.file('动图浏览.html', core.galleryHtml('Test pack', [{ name: t[lang], files }]));
fs.writeFileSync(path.join(outDir, `pack-${tpl}-16.zip`), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(JSON.stringify({ gifs: files.length, ms: Date.now() - t0, unique_frame_min: minU, cuts }));
