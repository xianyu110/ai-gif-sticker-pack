# AI GIF Sticker Pack

Open-source Cloudflare Worker that turns one character into a **16-sticker transparent GIF pack**.

**Live demo:** https://gif-sticker-pack-ai.bgnwd15.workers.dev · [/zh/](https://gif-sticker-pack-ai.bgnwd15.workers.dev/zh/) · [/gallery/](https://gif-sticker-pack-ai.bgnwd15.workers.dev/gallery/)

## What it is

1. The Worker calls **TryAllAPI only** (`https://tryallapi.com`) with `gpt-image-2.6-flare` (or `gpt-image-2.6-sunburst` if you change `TRYALLAPI_MODEL`).
2. One call produces a **4×4 transparent PNG atlas** (no text on the sheet).
3. The browser slices the atlas, adds outlined captions / icons / motion presets, and encodes **320×320** looping transparent GIFs (+ ZIP + optional video preview).

This product stays on the **atlas PNG → browser GIF pack** pipeline. It does **not** switch to 16× native GIF API calls.

Bring your own key. No other image relays are included.

## Models

| Role | Default |
|------|---------|
| Atlas model | `gpt-image-2.6-flare` (`TRYALLAPI_MODEL`) |
| Optional HQ | `gpt-image-2.6-sunburst` |

API base default: `https://tryallapi.com` (`TRYALLAPI_BASE`).

## Secrets

```bash
npx wrangler secret put TRYALLAPI_API_KEY
# paste your TryAllAPI key that can call gpt-image-2.6-*
```

## Deploy (Cloudflare Workers)

```bash
npm i
# edit wrangler.jsonc → replace YOUR_ACCOUNT_ID
npx wrangler secret put TRYALLAPI_API_KEY
npm run deploy
curl -s https://<your-worker>.workers.dev/api/health
# expect: "provider":"tryallapi"
```

## Layout

- `src/worker.js` — `POST /api/atlas`, `GET /api/task?id=`, `GET /api/health`, Quota Durable Object
- `src/providers.js` — TryAllAPI adapter only
- `public/js/sticker-core.js` — browser GIF pack pipeline
- `public/js/templates.js` — chat-scene templates × 16 poses
- `public/samples/` — sample GIFs from [pixel-gif-sticker-pack](https://github.com/WoYun520/pixel-gif-sticker-pack) (MIT)
- `scripts/build_pages.py` — regenerates EN/ZH/gallery HTML

## Notes / limits

- Native Images 2.6 GIF (one sticker per call) is **not** the product path here; the atlas keeps character consistency and editable captions for one model call.
- 48 / 100-sticker packs are listed as coming soon; no payments in this version.
- Daily caps: `DAILY_PER_IP` / `DAILY_GLOBAL` via Durable Object `Quota`.

## License

MIT — see [LICENSE](./LICENSE). Sample GIFs retain their upstream MIT notice under `public/samples/`.

---

## 中文摘要

上传角色 → TryAllAPI（仅此一家）用 `gpt-image-2.6-flare` 画一张 4×4 透明 PNG 图集 → 浏览器切图、加字、加动作并编码 16 个透明 GIF。自备 `TRYALLAPI_API_KEY`，`wrangler secret put` 后部署到 Cloudflare Workers。不走 16 次原生 GIF 调用。
