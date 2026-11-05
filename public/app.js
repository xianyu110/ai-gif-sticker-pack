// GIF Sticker Pack AI — browser side. Atlas comes from /api/atlas (TryAllAPI Images 2.6 PNG) or a local file;
// slicing, captions, motion and GIF encoding all run here (port of export_pack.py, see /js/sticker-core.js).
import * as core from '/js/sticker-core.js';
import { TEMPLATES } from '/js/templates.js';

const ZH = document.documentElement.lang.startsWith('zh');
const L = ZH ? {
  pending: '已提交，AI 正在画 16 个动作的透明图集（通常 1–3 分钟，高峰时可能更久，请不要关闭页面）…', poll: '生成中', rendering: '正在浏览器里切图、加字、做动作、编码 GIF…',
  done: (n, s) => `完成：${n} 个 320×320 透明 GIF（浏览器渲染 ${s} 秒）。`, left: (n) => `今日剩余免费次数：${n}`,
  needRef: '请上传角色图，或用文字描述你的角色（至少 8 个字）。', needRights: '请先勾选：我有权使用这个角色形象。',
  net: '网络错误，请重试。', fail: '生成失败，本次不计入次数。', badAtlas: '图集需要是带透明背景的 4×4 PNG。', video: '正在录制预览视频（约 4 秒）…', noVideo: '当前浏览器不支持录制视频预览。',
  pose: '动作（给 AI 的描述）', caption: '文字', motion: '动作效果', icon: '小图标',
} : {
  pending: 'Submitted. The AI is drawing a transparent 16-pose atlas (usually 1–3 minutes, longer at busy times — keep this tab open)…', poll: 'Generating', rendering: 'Slicing, captioning, animating and encoding GIFs in your browser…',
  done: (n, s) => `Done: ${n} transparent 320×320 GIFs (rendered in your browser in ${s}s).`, left: (n) => `Free packs left today: ${n}`,
  needRef: 'Upload a character image or describe your character (8+ characters).', needRights: 'Please confirm you have the rights to use this character.',
  net: 'Network error — please try again.', fail: 'Generation failed. This attempt was not counted.', badAtlas: 'The atlas must be a 4×4 PNG with a transparent background.', video: 'Recording preview video (~4s)…', noVideo: 'This browser cannot record a video preview.',
  pose: 'Pose (sent to the AI)', caption: 'Caption', motion: 'Motion', icon: 'Icon',
};
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC",sans-serif';
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); Object.assign(e, attrs); kids.forEach((k) => e.append(k)); return e; };
const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tplKey = 'replies', rows = [], atlas = null, atlasBlob = null, results = [], refBlob = null, busy = false;

function setMsg(text, err) { const m = $('#msg'); m.textContent = text || ''; m.className = 'msg' + (err ? ' err' : ''); }

function loadTemplate(key) {
  tplKey = key; const t = TEMPLATES[key];
  rows = t.items.map((it) => ({ pose: it.pose, text: ZH ? it.zh : it.en, motion: it.motion, icon: it.icon }));
  document.querySelectorAll('#tpls button').forEach((b) => b.classList.toggle('on', b.dataset.t === key));
  drawRows();
}
function drawRows() {
  const box = $('#rows'); box.textContent = '';
  rows.forEach((r, i) => {
    const sel = (opts, v, k) => { const s = el('select', { 'aria-label': L[k] }); opts.forEach((o) => s.append(el('option', { value: o, textContent: o, selected: o === v }))); s.onchange = () => { r[k] = s.value; }; return s; };
    const cap = el('input', { value: r.text, maxLength: 12, 'aria-label': L.caption }); cap.oninput = () => { r.text = cap.value; };
    const pose = el('input', { value: r.pose, maxLength: 90, className: 'pose', 'aria-label': L.pose }); pose.oninput = () => { r.pose = pose.value; };
    box.append(el('div', { className: 'row' }, [el('span', { className: 'n', textContent: String(i + 1).padStart(2, '0') }), cap, sel(core.MOTIONS, r.motion, 'motion'), sel(core.ICON_NAMES, r.icon, 'icon'), pose]));
  });
}
function posesChanged() { const t = TEMPLATES[tplKey]; return rows.some((r, i) => r.pose.trim() !== t.items[i].pose); }

// downscale the reference to ≤1024px PNG before upload (keeps alpha)
async function prepRef(file) {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = createCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function atlasFromBlob(blob) {
  const bmp = await createImageBitmap(blob); const c = createCanvas(bmp.width, bmp.height); const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0); const d = new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data);
  let clear = 0; for (let i = 3; i < d.length; i += 64) if (d[i] < 16) clear++;
  if (clear < d.length / 64 * 0.2) throw new Error(L.badAtlas);
  return { w: c.width, h: c.height, d };
}

async function render() {
  if (!atlas) return; const t = TEMPLATES[tplKey]; const smooth = $('#smooth').checked;
  setMsg(L.rendering); results.forEach((r) => URL.revokeObjectURL(r.url)); results = [];
  const grid = $('#gifs'); grid.textContent = ''; $('#out').hidden = false;
  const t0 = performance.now(); const cuts = core.detectGrid(atlas, 4, 4);
  for (let i = 0; i < 16; i++) {
    const r = rows[i];
    const job = { number: i + 1, grid: [4, 4], cell: [i % 4, Math.floor(i / 4)], text: r.text.trim(), motion: r.motion, icon: r.icon, ink: t.ink, tint: t.tint };
    try {
      const frames = core.renderSticker(atlas, job, createCanvas, { cuts, smooth, fontFamily: FONT });
      const bytes = core.encodeGif(frames); const name = `${String(i + 1).padStart(3, '0')}-${core.cleanFilename(job.text || 'sticker')}.gif`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
      results.push({ name, bytes, url, frames });
      const a = el('a', { href: url, download: name, title: name }, [el('img', { src: url, alt: job.text || `sticker ${i + 1}`, width: 160, height: 160 })]);
      grid.append(el('figure', {}, [a, el('figcaption', { textContent: job.text || '—' })]));
    } catch (e) { grid.append(el('figure', { className: 'bad' }, [el('figcaption', { textContent: `#${i + 1}: ${e.message}` })])); }
    await sleep(0);
  }
  setMsg(L.done(results.length, ((performance.now() - t0) / 1000).toFixed(1)));
}

async function generate(ev) {
  ev.preventDefault(); if (busy) return;
  const character = $('#character').value.trim();
  if (!refBlob && character.length < 8) return setMsg(L.needRef, true);
  if (!$('#rights').checked) return setMsg(L.needRights, true);
  const fd = new FormData(); fd.set('template', tplKey); fd.set('style', $('#style').value); fd.set('character', character); fd.set('rights', 'yes');
  if (posesChanged()) fd.set('poses', JSON.stringify(rows.map((r) => r.pose)));
  if (refBlob) fd.set('image', refBlob, 'reference.png');
  busy = true; $('#go').disabled = true; $('#spin').hidden = false; setMsg(L.pending);
  try {
    let res = await fetch('/api/atlas', { method: 'POST', body: fd }); let j = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) throw new Error(j.message || L.fail);
    if (j.remaining != null) $('#left').textContent = L.left(j.remaining);
    const t0 = Date.now();
    while (j.state === 'pending') {
      await sleep(4000); setMsg(`${L.pending} ${L.poll} ${Math.round((Date.now() - t0) / 1000)}s`);
      try { res = await fetch('/api/task?id=' + encodeURIComponent(j.taskId)); const k = await res.json(); if (k.state !== 'pending') j = { ...k, taskId: j.taskId }; else if (!res.ok) throw new Error(k.message || L.fail); }
      catch (e) { if (Date.now() - t0 > 12 * 60e3) throw e; }
    }
    if (j.state !== 'success' || !j.atlas) throw new Error(j.message || L.fail);
    atlasBlob = await (await fetch(j.atlas)).blob(); atlas = await atlasFromBlob(atlasBlob);
    await render();
  } catch (e) { setMsg(e.message || L.net, true); }
  finally { busy = false; $('#go').disabled = false; $('#spin').hidden = true; }
}

async function useAtlas(blob, key) {
  try { if (key) loadTemplate(key); atlasBlob = blob; atlas = await atlasFromBlob(blob); await render(); } catch (e) { setMsg(e.message, true); }
}

async function downloadZip() {
  if (!results.length) return; const zip = new window.JSZip(); const t = TEMPLATES[tplKey];
  const group = `01-${core.cleanFilename(ZH ? t.zh : t.en)}`; const files = [];
  results.forEach((r) => { zip.file(`${group}/${r.name}`, r.bytes); files.push(`${group}/${r.name}`); });
  zip.file(ZH ? '动图浏览.html' : 'preview.html', core.galleryHtml(ZH ? 'GIF 表情包' : 'GIF sticker pack', [{ name: ZH ? t.zh : t.en, files }]));
  if (atlasBlob) zip.file('atlas.png', atlasBlob);
  zip.file('README.txt', 'Made with GIF Sticker Pack AI (https://gif-sticker-pack-ai.bgnwd15.workers.dev). Exporter ported from pixel-gif-sticker-pack (MIT, (c) WoYun520).\nOnly use characters you have the rights to use.\n');
  save(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `gif-sticker-pack-${tplKey}-16.zip`);
}
function save(blob, name) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

// optional MP4/WebM preview: 4×4 montage of the rendered frames, two loops, recorded from a canvas
async function recordPreview() {
  if (!results.length) return;
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!type) return setMsg(L.noVideo, true);
  setMsg(L.video); const c = createCanvas(640, 640), ctx = c.getContext('2d'); const cell = createCanvas(320, 320), cx = cell.getContext('2d');
  const draw = (k) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 640, 640);
    results.forEach((r, i) => { const f = r.frames[k % r.frames.length]; cx.putImageData(new ImageData(new Uint8ClampedArray(f.d), 320, 320), 0, 0); ctx.drawImage(cell, (i % 4) * 160, Math.floor(i / 4) * 160, 160, 160); });
  };
  draw(0); const rec = new MediaRecorder(c.captureStream(25), { mimeType: type, videoBitsPerSecond: 2.5e6 }); const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(); for (let k = 0; k < core.TICKS * 2; k++) { draw(k); await sleep(core.DELAY); } rec.stop(); await stopped;
  save(new Blob(chunks, { type }), `sticker-preview.${type.includes('mp4') ? 'mp4' : 'webm'}`); setMsg('');
}

// wire up
const tb = $('#tpls');
Object.entries(TEMPLATES).forEach(([k, t]) => { const b = el('button', { type: 'button', textContent: ZH ? t.zh : t.en }); b.dataset.t = k; b.onclick = () => loadTemplate(k); tb.append(b); });
loadTemplate('replies');
$('#ref').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; refBlob = await prepRef(f); $('#refprev').src = URL.createObjectURL(refBlob); $('#refprev').hidden = false; };
$('#f').onsubmit = generate;
$('#demo').onclick = async () => useAtlas(await (await fetch('/demo/atlas-replies.png')).blob(), 'replies');
$('#own').onchange = (e) => e.target.files[0] && useAtlas(e.target.files[0]);
$('#rerender').onclick = render;
$('#zip').onclick = downloadZip;
$('#atlasdl').onclick = () => atlasBlob && save(atlasBlob, 'atlas.png');
$('#video').onclick = recordPreview;
fetch('/api/health').then((r) => r.json()).then((h) => { if (!h.configured) setMsg(ZH ? 'AI 生成暂未开启，可先用示例图集或上传自己的图集体验。' : 'AI generation is not configured right now — try the demo atlas or your own atlas.', true); }).catch(() => {});
