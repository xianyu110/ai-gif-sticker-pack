#!/usr/bin/env python3
"""Generate public/index.html (EN), public/zh/index.html (ZH) and public/gallery/index.html from one template."""
import json, html, os
R = os.path.join(os.path.dirname(__file__), '..', 'public')
SITE = 'https://gif-sticker-pack-ai.bgnwd15.workers.dev'
E = html.escape

CSS = """
:root{--bg:#fbf8ff;--fg:#221a33;--mut:#6b6280;--card:#fff;--line:#e7e0f3;--acc:#7c4dff;--acc2:#ff6fa8}
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--acc)}header,main,footer{max-width:1080px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding-top:18px;gap:10px;flex-wrap:wrap}
.brand{display:flex;gap:10px;align-items:center;font-weight:800;font-size:18px;color:var(--fg);text-decoration:none}.brand img{width:30px;height:30px}
nav a{color:var(--mut);margin-left:14px;text-decoration:none;font-size:14px}
h1{font-size:clamp(28px,4.4vw,44px);line-height:1.15;margin:36px 0 10px}h1 span{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--mut);max-width:760px;margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 2px 10px #7c4dff0d}
.app{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}@media(max-width:860px){.app{grid-template-columns:1fr}}
label,.lbl{display:block;font-size:13px;color:var(--mut);margin:12px 0 6px;font-weight:600}
input,select,textarea{width:100%;padding:9px 10px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--fg);font:inherit;font-size:14px}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--fg);font-weight:400}.chk input{width:auto;margin-top:4px}
#refprev{max-width:120px;max-height:120px;border-radius:10px;border:1px solid var(--line);margin-top:8px;background:#fff}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chips button{padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer;font:inherit;font-size:14px}
.chips button.on{border-color:var(--acc);background:#efe8ff;color:#4b23c2;font-weight:700}
.packs{display:flex;gap:8px;flex-wrap:wrap}.packs label{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:0;color:var(--fg);font-weight:500}.packs input{width:auto}.packs .soon{opacity:.55}
.rows{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px}
.row{display:grid;grid-template-columns:26px 1fr 92px 86px;gap:6px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--line)}.row:last-child{border:0}
.row .n{font-size:12px;color:var(--mut)}.row .pose{grid-column:2/5;font-size:12px;color:var(--mut);padding:5px 8px}
.row input,.row select{padding:6px 7px;font-size:13px}
.go{margin-top:16px;width:100%;padding:13px;border:0;border-radius:12px;background:linear-gradient(90deg,var(--acc),var(--acc2));color:#fff;font-weight:800;font-size:16px;cursor:pointer}.go:disabled{opacity:.6;cursor:wait}
.alt{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:14px;align-items:center}.alt button,.alt label,.dl button{padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font:inherit;font-size:14px;margin:0;color:var(--fg);font-weight:500}
.alt input[type=file]{display:none}
.msg{font-size:14px;color:var(--mut);margin:10px 0;min-height:1.2em}.err{color:#c62828}
.spin{width:28px;height:28px;border:4px solid #e2d8ff;border-top-color:var(--acc);border-radius:50%;animation:s 1s linear infinite;display:inline-block;vertical-align:middle}@keyframes s{to{transform:rotate(360deg)}}
.checker{background-color:#fff;background-image:linear-gradient(45deg,#f1edf8 25%,transparent 25%),linear-gradient(-45deg,#f1edf8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1edf8 75%),linear-gradient(-45deg,transparent 75%,#f1edf8 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.gifs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border-radius:12px;padding:8px}@media(max-width:520px){.gifs{grid-template-columns:repeat(3,1fr)}}
.gifs figure{margin:0;text-align:center}.gifs img{width:100%;height:auto;image-rendering:auto}.gifs figcaption{font-size:12px;color:var(--mut)}.gifs .bad figcaption{color:#c62828}
.dl{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.note{font-size:13px;color:var(--mut)}.warn{background:#fff6e5;border:1px solid #f3d9a4;border-radius:12px;padding:10px 14px;font-size:14px;color:#6b4e00;margin:14px 0}
section{margin:52px 0}h2{font-size:26px;margin:0 0 14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:820px){.grid3{grid-template-columns:1fr}}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:10px 0}summary{cursor:pointer;font-weight:700}
.strip{display:flex;gap:8px;overflow:auto;padding:6px;border-radius:12px}.strip img{width:110px;height:110px;flex:none}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;border-radius:12px;padding:8px}.gal figure{margin:0;text-align:center}.gal img{width:100%;height:auto}.gal figcaption{font-size:12px;color:var(--mut)}
footer{border-top:1px solid var(--line);margin-top:60px;padding:26px 20px 40px;color:var(--mut);font-size:14px}footer div{margin:6px 0}
.badges{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:14px 0}.badges img{height:40px;width:auto}
"""

def head(lang, title, desc, path, alt_en, alt_zh, extra=''):
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{SITE}{path}">
<link rel="alternate" hreflang="en" href="{SITE}{alt_en}">
<link rel="alternate" hreflang="zh-CN" href="{SITE}{alt_zh}">
<link rel="alternate" hreflang="x-default" href="{SITE}{alt_en}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{SITE}{path}"><meta property="og:image" content="{SITE}/og.png"><meta name="twitter:card" content="summary_large_image">
<style>{CSS}</style>
{extra}</head>
<body>
"""

def header(zh, here):
    if zh:
        return f"""<header><a class="brand" href="/zh/"><img src="/favicon.svg" alt="" width="30" height="30">GIF 表情包 AI</a>
<nav><a href="/zh/#how">怎么用</a><a href="/gallery/">示例画廊</a><a href="/zh/#faq">常见问题</a><a href="{here['en']}" hreflang="en">English</a></nav></header>"""
    return f"""<header><a class="brand" href="/"><img src="/favicon.svg" alt="" width="30" height="30">GIF Sticker Pack AI</a>
<nav><a href="/#how">How it works</a><a href="/gallery/">Gallery</a><a href="/#faq">FAQ</a><a href="{here['zh']}" hreflang="zh-CN">中文</a></nav></header>"""

def footer(zh):
    if zh:
        a = '本站为独立工具。目前由 <a href="https://tryallapi.com/?aff=5A6A" rel="noopener">TryAllAPI</a> 上的 GPT Images 2.6 生成透明图集；切图、加字、动作和 GIF 编码在你的浏览器里完成。与 OpenAI、微信/腾讯无关联。'
        b = '导出器移植自 <a href="https://github.com/WoYun520/pixel-gif-sticker-pack" rel="noopener">pixel-gif-sticker-pack</a>（MIT 许可，© 2026 WoYun520），示例画廊的 GIF 也来自该项目。<a href="/licenses.txt">许可证与第三方声明</a>'
        more = '更多：'
    else:
        a = 'GIF Sticker Pack AI is an independent tool. Atlases are currently drawn by GPT Images 2.6 via <a href="https://tryallapi.com/?aff=5A6A" rel="noopener">TryAllAPI</a>; slicing, captions, motion and GIF encoding run in your browser. Not affiliated with OpenAI, WeChat or Tencent.'
        b = 'Exporter ported from <a href="https://github.com/WoYun520/pixel-gif-sticker-pack" rel="noopener">pixel-gif-sticker-pack</a> (MIT License, © 2026 WoYun520); the gallery GIFs come from that project too. <a href="/licenses.txt">Licenses &amp; notices</a>'
        more = 'More: '
    return f"""<footer>
  <div>{a}</div>
  <div>{b}</div>
  <div>{more}<a href="https://gptimage2.asia/models/gpt-images-2.6" rel="noopener">GPT Images 2.6 model page</a> · <a href="https://maynor996.github.io/images-2-6-svg-gif-guide/" rel="noopener">Images 2.6 SVG &amp; GIF guide</a> · <a href="https://svg-logo-ai.bgnwd15.workers.dev/" rel="noopener">SVG Logo AI</a> · <a href="https://trymodel.chat/" rel="noopener">TryModel Chat</a></div>
  <div class="badges">
    <a href="https://findaifor.me/?utm_source=gif-sticker-pack-ai&amp;utm_medium=badge&amp;utm_campaign=footer" target="_blank" rel="noopener"><img src="https://findaifor.me/badge/featured.svg" alt="Featured on FindAIForMe" loading="lazy" height="40"></a>
</div>
  <div>© 2026 GIF Sticker Pack AI · <a href="/sitemap.xml">Sitemap</a></div>
</footer>
"""

T = {
 'en': dict(
  title='AI Sticker Maker — GIF Sticker Pack Generator (transparent, 16 per pack)',
  desc='Upload your character and get a pack of 16 transparent animated GIF stickers with captions and motion — free daily tries. AI draws one 4×4 pose atlas; your browser slices, captions and animates it.',
  h1='AI sticker maker: a <span>GIF sticker pack</span> from one character',
  lead='Upload a character you own, pick a chat-scene template and edit the captions. The AI draws 16 poses on one transparent sheet with no text; your browser slices it, adds outlined captions and motion, and exports 320×320 looping transparent GIFs — as single files or one ZIP.',
  s1='1 · Your character', ref='Character image (PNG/JPG/WebP — transparent PNG works best)', desc_l='…or describe it (optional with an image)', desc_ph='e.g. a chubby orange cat girl with a green leaf hair clip',
  rights='I own this character or have permission to use it. I will not upload other people\'s copyrighted or trademarked characters, or real people without consent.',
  style='Art style', st=['Keep the reference style', 'Chibi pixel art', 'Flat cartoon'],
  s2='2 · Template, captions & motion', tpl='Chat-scene template', capnote='Captions are added by your browser, not by the AI, so you can change them and re-render for free.',
  pack='Pack size', p16='16 stickers — free', p48='48 — coming soon', p100='100 — coming soon', smooth='Smooth scaling (for non-pixel art)',
  go='Generate my 16-sticker pack', left='Free packs per day are limited; failed runs are refunded.',
  alt='No upload? ', demo='Try the demo atlas', own='Use my own 4×4 atlas PNG',
  s3='3 · Your stickers', rerender='Re-render captions', zip='Download ZIP', atlas='Download atlas PNG', video='Preview video (MP4/WebM)',
  wx='Exports are 320×320 transparent GIFs, about 2 seconds per loop. Many chat apps accept these sizes, but each platform reviews submissions under its own rules — we cannot promise a pack will be approved anywhere.',
  how_h='How it works', how=[('One sheet, 16 poses','The model gets your character and the 16 pose descriptions from the template and draws a 4×4 transparent sprite atlas with no text — one call keeps the character consistent across the pack.'),('Captions & motion in your browser','The sheet is sliced on detected gutters, each sprite gets an outlined caption, a small icon and one of 16 motion presets (nod, jump, sway, tremble…), 24 frames at 80 ms.'),('Export the whole pack','Download each GIF, the full ZIP (GIF folder + offline preview page + atlas), or a short montage video to share the pack.')],
  gal_h='Sample packs', gal_p='Two packs made with the original open-source exporter (MIT). <a href="/gallery/">See all 200 GIFs →</a>',
  faq=[('Is it free?','Yes — 16-sticker packs are free with a small daily limit per visitor. Bigger 48 and 100-sticker packs are coming soon.'),('Which characters can I upload?','Only characters you created or have permission to use. Do not upload others\' copyrighted or trademarked characters, or photos of real people without their consent.'),('Why does the AI not write the text?','Image models often misspell text. Drawing poses without text and adding captions in the browser keeps the text sharp and lets you edit it without regenerating.'),('Do the GIFs have a transparent background?','Yes. Each GIF uses one shared palette plus a transparent index, frame disposal “restore to background” and infinite loop, so it looks clean on light and dark chat themes.'),('Can I use them as WeChat stickers?','The format (320×320 animated GIF, ~2 s loop) is a common sticker size, but WeChat and other platforms review packs under their own rules. We make no claim that a pack will be approved.'),('How long does it take?','The AI atlas usually takes 1–3 minutes (5+ minutes when the provider queue is busy). Rendering the 16 GIFs in your browser takes a few seconds.'),('What model draws the poses?','Currently GPT Images 2.6 Flare (image-to-image or text-to-image, transparent PNG atlas) via TryAllAPI. Your browser then slices the atlas into captioned GIFs.')]),
 'zh': dict(
  title='微信表情包生成 · AI 表情包制作器 — 一张角色图生成 16 个透明 GIF 动图',
  desc='上传你的角色形象，选聊天场景模板、改文字，AI 画出 4×4 透明动作图集，浏览器自动切图、加描边文字和动作，导出 320×320 透明循环 GIF 表情包和整包 ZIP。每天免费试用。',
  h1='微信表情包生成：一张角色图做出 <span>一整套 GIF 表情包</span>',
  lead='上传你有权使用的角色，选择聊天场景模板并修改配字。AI 在一张透明图上画出 16 个不带文字的动作；你的浏览器负责切图、加描边文字和动作效果，导出 320×320、约 2 秒循环的透明 GIF，可单张下载或整包 ZIP。',
  s1='1 · 你的角色', ref='角色图（PNG/JPG/WebP，透明背景 PNG 效果最好）', desc_l='…或用文字描述（有图时可不填）', desc_ph='例如：胖乎乎的橘猫少女，头上别着绿叶发卡',
  rights='我是这个角色的作者或已获授权使用。我不会上传他人受版权/商标保护的角色，也不会未经同意上传真人照片。',
  style='画风', st=['保持参考图画风', 'Q 版像素风', '扁平卡通'],
  s2='2 · 模板、配字与动作', tpl='聊天场景模板', capnote='文字由浏览器添加，不是 AI 画的，可随时修改并免费重新渲染。',
  pack='表情包数量', p16='16 个 — 免费', p48='48 个 — 即将推出', p100='100 个 — 即将推出', smooth='平滑缩放（非像素画风建议勾选）',
  go='生成我的 16 个表情包', left='每天免费次数有限，生成失败会自动退回次数。',
  alt='不想上传？', demo='试试示例图集', own='上传我自己的 4×4 图集 PNG',
  s3='3 · 你的表情包', rerender='按新文字重新渲染', zip='下载整包 ZIP', atlas='下载图集 PNG', video='预览视频（MP4/WebM）',
  wx='导出为 320×320 透明 GIF，每次循环约 2 秒，是常见的表情尺寸；但微信等各平台都会按自身规则审核投稿，我们不承诺任何表情包能通过审核。',
  how_h='怎么用', how=[('一张图集，16 个动作','模型拿到你的角色图和模板里的 16 个动作描述，一次画出 4×4 透明精灵图集，不含文字——一次生成，角色更一致。'),('浏览器里加字和动作','自动识别网格缝隙切图，每张加描边文字、小图标和 16 种动作预设之一（点头、跳跃、摇摆、发抖……），24 帧 × 80 毫秒。'),('整包导出','单张下载 GIF，或下载整包 ZIP（GIF 文件夹 + 离线浏览页 + 图集），也可以录一段预览视频分享。')],
  gal_h='示例表情包', gal_p='用原开源导出器（MIT）制作的两套表情：大肥鱼和像素小秘书。<a href="/gallery/">查看全部 200 个 GIF →</a>',
  faq=[('免费吗？','16 个一套的表情包免费，每位访客每天有少量次数。48 个和 100 个的大包即将推出。'),('可以上传什么角色？','只能上传你自己创作或已获授权的角色。不要上传他人受版权或商标保护的角色，也不要未经同意上传真人照片。'),('为什么文字不让 AI 画？','图像模型经常写错字。先画无字动作、再由浏览器加字，文字清晰，而且改字不用重新生成。'),('GIF 是透明背景吗？','是的。每个 GIF 使用一套共享调色板加透明色，帧处置为“恢复背景”，无限循环，在深色和浅色聊天背景上都干净。'),('能直接上传微信表情开放平台吗？','320×320、约 2 秒循环的 GIF 是常见表情规格，但微信等平台会按自己的规则审核，我们不保证能通过审核。'),('需要多久？','AI 画图集通常 1–3 分钟（排队高峰可能 5 分钟以上），浏览器渲染 16 个 GIF 只要几秒。'),('用的是什么模型？','目前通过 TryAllAPI 使用 GPT Images 2.6 Flare（图生图或文生图、透明 PNG 图集），浏览器再切成带字的 GIF。')]),
}

samples = json.load(open(os.path.join(R, 'samples', 'index.json')))

def page(lang):
    t = T[lang]; zh = lang == 'zh'; path = '/zh/' if zh else '/'
    faq_ld = json.dumps({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in t['faq']]}, ensure_ascii=False)
    app_ld = json.dumps({'@context': 'https://schema.org', '@type': 'WebApplication', 'name': 'GIF 表情包 AI' if zh else 'GIF Sticker Pack AI', 'url': SITE + path, 'applicationCategory': 'MultimediaApplication', 'operatingSystem': 'Web', 'inLanguage': 'zh-CN' if zh else 'en', 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}}, ensure_ascii=False)
    extra = f'<script type="application/ld+json">{app_ld}</script>\n<script type="application/ld+json">{faq_ld}</script>\n'
    strip = ''.join(f'<img src="{it[0]}" alt="{E(it[2])}" loading="lazy" width="110" height="110">' for s in samples for it in s['groups'][0]['items'][:8])
    how = ''.join(f'<div class="card"><h3>{E(a)}</h3><p class="note">{E(b)}</p></div>' for a, b in t['how'])
    faq = ''.join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in t['faq'])
    st = ''.join(f'<option value="{v}">{E(n)}</option>' for v, n in zip(['keep', 'pixel', 'cartoon'], t['st']))
    return head('zh-CN' if zh else 'en', t['title'], t['desc'], path, '/', '/zh/', extra) + header(zh, {'en': '/', 'zh': '/zh/'}) + f"""
<main>
  <h1>{t['h1']}</h1>
  <p class="lead">{E(t['lead'])}</p>
  <div class="app">
    <form class="card" id="f" autocomplete="off">
      <h2 style="font-size:18px;margin:0">{E(t['s1'])}</h2>
      <label for="ref">{E(t['ref'])}</label>
      <input type="file" id="ref" accept="image/png,image/jpeg,image/webp">
      <img id="refprev" alt="" hidden>
      <label for="character">{E(t['desc_l'])}</label>
      <input id="character" maxlength="200" placeholder="{E(t['desc_ph'])}">
      <label for="style">{E(t['style'])}</label>
      <select id="style">{st}</select>
      <label class="chk"><input type="checkbox" id="rights"><span>{E(t['rights'])}</span></label>
      <h2 style="font-size:18px;margin:22px 0 0">{E(t['s2'])}</h2>
      <span class="lbl">{E(t['tpl'])}</span>
      <div class="chips" id="tpls"></div>
      <p class="note">{E(t['capnote'])}</p>
      <div class="rows" id="rows"></div>
      <span class="lbl">{E(t['pack'])}</span>
      <div class="packs"><label><input type="radio" name="pack" value="16" checked>{E(t['p16'])}</label><label class="soon"><input type="radio" name="pack" value="48" disabled>{E(t['p48'])}</label><label class="soon"><input type="radio" name="pack" value="100" disabled>{E(t['p100'])}</label></div>
      <label class="chk"><input type="checkbox" id="smooth"><span>{E(t['smooth'])}</span></label>
      <button class="go" id="go">{E(t['go'])}</button>
      <p class="note">{E(t['left'])} <span id="left"></span></p>
      <div class="alt">{E(t['alt'])}<button type="button" id="demo">{E(t['demo'])}</button><label>{E(t['own'])}<input type="file" id="own" accept="image/png"></label></div>
    </form>
    <div class="card">
      <h2 style="font-size:18px;margin:0">{E(t['s3'])}</h2>
      <p class="msg" id="msg" aria-live="polite"></p><span class="spin" id="spin" hidden></span>
      <div id="out" hidden>
        <div class="gifs checker" id="gifs"></div>
        <div class="dl"><button type="button" id="rerender">{E(t['rerender'])}</button><button type="button" id="zip">{E(t['zip'])}</button><button type="button" id="atlasdl">{E(t['atlas'])}</button><button type="button" id="video">{E(t['video'])}</button></div>
      </div>
      <div class="warn">{E(t['wx'])}</div>
      <div class="strip checker" aria-label="samples">{strip}</div>
    </div>
  </div>
  <section id="how"><h2>{E(t['how_h'])}</h2><div class="grid3">{how}</div></section>
  <section id="samples"><h2>{E(t['gal_h'])}</h2><p>{t['gal_p']}</p></section>
  <section id="faq"><h2>FAQ</h2>{faq}</section>
</main>
""" + footer(zh) + """<script src="/js/jszip.min.js" defer></script>
<script type="module" src="/app.js"></script>
</body>
</html>
"""

def gallery():
    body = ''
    for s in samples:
        body += f'<section><h2>{E(s["en"])} · {E(s["zh"])}</h2>'
        for g in s['groups']:
            items = ''.join(f'<figure><img src="{it[0]}" alt="{E(it[2])}" loading="lazy" width="120" height="120"><figcaption>{E(it[2])}</figcaption></figure>' for it in g['items'])
            body += f'<h3>{E(g["name"])} · {len(g["items"])}</h3><div class="gal checker">{items}</div>'
        body += '</section>'
    n = sum(len(g['items']) for s in samples for g in s['groups'])
    return head('en', f'GIF Sticker Pack Gallery — {n} transparent sample stickers (大肥鱼 & 像素小秘书)', f'{n} transparent animated GIF stickers made with the open-source pixel-gif-sticker-pack exporter (MIT): Big Fat Fish and Pixel Secretary packs, 320×320, captions and motion.', '/gallery/', '/gallery/', '/gallery/') + header(False, {'en': '/gallery/', 'zh': '/zh/'}) + f"""
<main>
  <h1>GIF sticker pack <span>gallery</span></h1>
  <p class="lead">{n} transparent 320×320 GIF stickers from the open-source <a href="https://github.com/WoYun520/pixel-gif-sticker-pack" rel="noopener">pixel-gif-sticker-pack</a> project by WoYun520, shown here under its MIT License (<a href="/samples/LICENSE.txt">license text</a>). These are sample packs from that project, not user uploads. <a href="/">Make your own pack →</a> · <a href="/zh/">中文制作页 →</a></p>
  {body}
</main>
""" + footer(False) + '</body>\n</html>\n'

os.makedirs(os.path.join(R, 'zh'), exist_ok=True); os.makedirs(os.path.join(R, 'gallery'), exist_ok=True)
open(os.path.join(R, 'index.html'), 'w').write(page('en'))
open(os.path.join(R, 'zh', 'index.html'), 'w').write(page('zh'))
open(os.path.join(R, 'gallery', 'index.html'), 'w').write(gallery())
print('ok')
