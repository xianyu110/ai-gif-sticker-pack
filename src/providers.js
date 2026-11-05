// Image provider: TryAllAPI only (OpenAI-compatible, synchronous).
// start({ prompt, ref, env }) -> { png: Uint8Array }
// poll is unused (sync provider) but kept so the Worker task path stays simple.

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const tryallapi = {
  name: 'tryallapi',
  configured: (env) => !!env.TRYALLAPI_API_KEY,
  model: (env) => env.TRYALLAPI_MODEL || 'gpt-image-2.6-flare',
  async start({ prompt, ref, env }) {
    const base = env.TRYALLAPI_BASE || 'https://tryallapi.com';
    const model = tryallapi.model(env); const quality = env.ATLAS_QUALITY || 'medium';
    let resp;
    if (ref) {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', prompt);
      fd.append('image[]', new Blob([ref.buf], { type: ref.mime }), 'reference.' + ref.mime.split('/')[1]);
      fd.append('n', '1'); fd.append('size', '1024x1024'); fd.append('background', 'transparent');
      fd.append('output_format', 'png'); fd.append('quality', quality);
      resp = await fetch(`${base}/v1/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${env.TRYALLAPI_API_KEY}` }, body: fd });
    } else {
      resp = await fetch(`${base}/v1/images/generations`, {
        method: 'POST', headers: { authorization: `Bearer ${env.TRYALLAPI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', background: 'transparent', output_format: 'png', quality }),
      });
    }
    let data = null; try { data = await resp.json(); } catch {}
    const item = data?.data?.[0];
    if (!resp.ok || !item) throw new Error(String(data?.error?.message || `tryallapi http ${resp.status}`).replace(/\(request id:[^)]*\)/, '').slice(0, 200));
    return { png: item.b64_json ? unb64(item.b64_json) : await download(item.url) };
  },
  async poll() { return { state: 'fail', message: 'tryallapi is synchronous' }; },
};

export const PROVIDERS = { tryallapi };
export function pickProvider(env) {
  // Only tryallapi is shipped. env.PROVIDER is accepted for forward-compat but ignored if unknown.
  return PROVIDERS.tryallapi;
}
export { b64 };
