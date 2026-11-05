// AI GIF Sticker Pack Generator — Cloudflare Worker
// POST /api/atlas → TryAllAPI (src/providers.js; gpt-image-2.6-flare by default)
//   makes a 4x4 transparent sprite atlas (PNG, no text). Sync PNG returned immediately; /api/task kept for compatibility.
// Slicing, captions, motion presets, GIF/ZIP/video export run in the browser (public/js/sticker-core.js).
import { TEMPLATES } from '../public/js/templates.js';
import { pickProvider, b64 } from './providers.js';

const SITE = 'GIF Sticker Pack AI';
const MAX_UPLOAD = 4 * 1024 * 1024;
const BAD = /[<>{}\\`]/;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
function dayKey() { return new Date().toISOString().slice(0, 10); }

// Daily counters in one SQLite-backed Durable Object (same approach as svg-logo-ai; token has no KV/D1 permission).
export class Quota {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const { key, limit, op, value } = await req.json();
    // task ownership records: which ip/day started a task (for poll auth + refund on failure)
    if (op === 'task_put') { await this.state.storage.put(key, { ...value, t: Date.now() }); return Response.json({ ok: true }); }
    if (op === 'task_get') return Response.json({ ok: true, value: (await this.state.storage.get(key)) || null });
    if (op === 'task_del') { await this.state.storage.delete(key); return Response.json({ ok: true }); }
    const day = key.split(':')[1];
    const n = (await this.state.storage.get(key)) || 0;
    if (op === 'refund') { if (n > 0) await this.state.storage.put(key, n - 1); return Response.json({ ok: true, n: Math.max(0, n - 1) }); }
    if (op === 'peek') return Response.json({ ok: n < limit, n });
    if (n >= limit) return Response.json({ ok: false, n });
    await this.state.storage.put(key, n + 1);
    const last = await this.state.storage.get('_day');
    if (last !== day) {
      const all = await this.state.storage.list();
      const stale = [...all.keys()].filter((k) => k !== '_day' && !k.includes(`:${day}`));
      while (stale.length) await this.state.storage.delete(stale.splice(0, 128));
      await this.state.storage.put('_day', day);
    }
    return Response.json({ ok: true, n: n + 1 });
  }
}
async function quota(env, key, limit, op, value) {
  if (!env.QUOTA) return { ok: true, n: 0 };
  const stub = env.QUOTA.get(env.QUOTA.idFromName('daily'));
  const r = await stub.fetch('https://quota/', { method: 'POST', body: JSON.stringify({ key, limit, op, value }) });
  return r.json();
}

const STYLE = {
  keep: 'Match the art style of the reference character exactly (same line weight, shading and palette).',
  pixel: 'Render in a crisp chibi pixel-art style with clean dark outlines and limited flat colors.',
  cartoon: 'Render in a flat cel-shaded chibi cartoon style with bold dark outlines.',
};

export function buildPrompt({ poses, character, style, hasRef }) {
  const list = poses.map((p, i) => `${i + 1} ${p}`).join('; ');
  return [
    hasRef
      ? 'Using the character in the reference image (keep the identical face, hair, colors, outfit, accessories and proportions),'
      : `Original character: ${character}.`,
    'draw a 4x4 sprite sheet of 16 different chat-sticker poses on a fully transparent background.',
    'Exactly 4 columns and 4 rows of equal square cells, one full-body character per cell, centered, with wide empty transparent gutters between cells; nothing crosses a cell border; consistent scale and framing.',
    `Reading order left-to-right, top-to-bottom: ${list}.`,
    STYLE[style] || STYLE.keep,
    hasRef && character ? `Character notes: ${character}.` : '',
    'Strong readable facial expressions for tiny chat previews. Absolutely no text, letters, numbers, speech bubbles, grid lines, borders or background.',
  ].filter(Boolean).join(' ');
}

function isImage(bytes) {
  const b = bytes;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45;
  return png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : null;
}

function limits(env) {
  return { perIp: parseInt(env.DAILY_PER_IP || '3', 10), global: parseInt(env.DAILY_GLOBAL || '150', 10) };
}
async function refundFor(env, ip, d) {
  const { perIp, global } = limits(env);
  await quota(env, `ip:${d}:${ip}`, perIp, 'refund');
  await quota(env, `g:${d}:all`, global, 'refund');
}
function pngOut(png, extra) {
  return json({ state: 'success', atlas: `data:image/png;base64,${b64(png)}`, ...extra });
}

async function atlas(request, env) {
  const provider = pickProvider(env);
  if (!provider.configured(env)) return json({ error: 'not_configured', message: 'Generation is not configured yet.' }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'bad_form', message: 'Bad request.' }, 400); }

  const style = STYLE[form.get('style')] ? form.get('style') : 'keep';
  const character = String(form.get('character') || '').trim().slice(0, 200);
  let poses;
  const tpl = TEMPLATES[form.get('template')];
  if (form.get('poses')) {
    try { poses = JSON.parse(String(form.get('poses'))); } catch { poses = null; }
    if (!Array.isArray(poses) || poses.length !== 16) return json({ error: 'bad_poses', message: 'Need exactly 16 poses.' }, 400);
    poses = poses.map((p) => String(p || '').trim().slice(0, 90));
    if (poses.some((p) => !p)) return json({ error: 'bad_poses', message: 'Every pose needs a short description.' }, 400);
  } else if (tpl) poses = tpl.items.map((i) => i.pose);
  else return json({ error: 'bad_template', message: 'Pick a sticker template.' }, 400);
  if (BAD.test(character + poses.join(' '))) return json({ error: 'bad_input', message: 'Please avoid < > { } \\ ` characters.' }, 400);

  const file = form.get('image');
  let ref = null;
  if (file && typeof file === 'object' && file.size) {
    if (file.size > MAX_UPLOAD) return json({ error: 'too_large', message: 'Reference image must be under 4 MB.' }, 413);
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = isImage(buf);
    if (!mime) return json({ error: 'bad_image', message: 'Upload a PNG, JPEG or WebP image.' }, 400);
    ref = { buf, mime };
  }
  if (!ref && character.length < 8) return json({ error: 'need_character', message: 'Upload a character image or describe your character.' }, 400);
  if (form.get('rights') !== 'yes') return json({ error: 'rights', message: 'Please confirm you have the rights to use this character.' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const d = dayKey();
  const { perIp, global } = limits(env);
  const g = await quota(env, `g:${d}:all`, global);
  if (!g.ok) return json({ error: 'daily_global_limit', message: "Today's free generation budget is used up. Please come back tomorrow." }, 429);
  const u = await quota(env, `ip:${d}:${ip}`, perIp);
  if (!u.ok) { await quota(env, `g:${d}:all`, global, 'refund'); return json({ error: 'daily_ip_limit', message: `Free limit reached (${perIp} sticker atlases per day). Please come back tomorrow.` }, 429); }

  const prompt = buildPrompt({ poses, character, style, hasRef: !!ref });
  const meta = { provider: provider.name, model: provider.model(env, !!ref), mode: ref ? 'reference' : 'text', remaining: Math.max(0, perIp - u.n) };
  let out;
  try { out = await provider.start({ prompt, ref, env }); }
  catch (e) {
    await refundFor(env, ip, d);
    console.log('provider_start_error', provider.name, String(e.message || e));
    return json({ error: 'upstream_error', message: 'The image service could not start this job. Your free credit was not used — please retry.' }, 502);
  }
  if (out.png) return pngOut(out.png, meta);
  await quota(env, `task:${d}:${out.taskId}`, 0, 'task_put', { ip, d, provider: provider.name });
  return json({ state: 'pending', taskId: out.taskId, ...meta }, 202);
}

async function task(request, env, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return json({ error: 'bad_id' }, 400);
  let rec = null, key;
  for (const d of [dayKey(), new Date(Date.now() - 864e5).toISOString().slice(0, 10)]) {
    key = `task:${d}:${id}`; rec = (await quota(env, key, 0, 'task_get')).value;
    if (rec) break;
  }
  if (!rec) return json({ error: 'unknown_task', message: 'Task not found or already collected.' }, 404);
  // no IP binding: dual-stack/mobile clients change IP mid-poll; ids are unguessable and must exist in our task table
  const provider = pickProvider({ ...env, PROVIDER: rec.provider });
  let r;
  try { r = await provider.poll(id, env); }
  catch (e) { console.log('poll_error', String(e.message || e)); return json({ state: 'pending', stage: 'retrying' }); }
  if (r.state === 'pending') {
    if (Date.now() - rec.t > 10 * 60e3) { await quota(env, key, 0, 'task_del'); await refundFor(env, rec.ip, rec.d); return json({ state: 'fail', message: 'Timed out. Your free credit was refunded — please retry.' }); }
    return json({ state: 'pending', stage: r.stage });
  }
  await quota(env, key, 0, 'task_del');
  if (r.state === 'fail') {
    await refundFor(env, rec.ip, rec.d);
    console.log('task_fail', id, r.message);
    return json({ state: 'fail', message: 'Generation failed (the credit was refunded). Try a clearer character image or simpler poses.' });
  }
  return pngOut(r.png, { provider: provider.name });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden_origin' }, 403);
    }
    if (url.pathname === '/api/atlas') {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      return atlas(request, env);
    }
    if (url.pathname === '/api/task') return task(request, env, url);
    if (url.pathname === '/api/health') { const p = pickProvider(env); return json({ ok: true, site: SITE, provider: p.name, configured: p.configured(env) }); }
    return env.ASSETS.fetch(request);
  },
};
