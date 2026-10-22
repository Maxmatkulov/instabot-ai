#!/usr/bin/env python3
"""Kunlik yangilik karuseli. Ishlatish: python3 tools/news_carousel.py news.json
news.json: {"date":"2026-10-23","items":[{"title":"...","body":"...","source":"theverge.com"},...]}  (3-8 ta)
Chiqish: public/news/<date>/1.png ... N.png (1080x1350). caption.txt ni alohida yozing."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
B = ImageFont.truetype(os.path.join(ROOT, 'fonts/Montserrat-Bold.ttf'), 10).path
R = os.path.join(ROOT, 'fonts/Montserrat-Regular.ttf')
f = lambda p, s: ImageFont.truetype(p, s)
W, H = 1080, 1350
import re
def uzc(t):  # ö ğ ç ş qoidasi (kanal va video matnlari); @handle va havolalar o'zgarmaydi
    parts = re.split(r'(@\S+|https?://\S+|\S+\.(?:com|uz|org|io)\S*)', t)
    return ''.join(x if i % 2 else _uzc(x) for i, x in enumerate(parts))
def _uzc(t):
    for a, b in (("o'", 'ö'), ('o‘', 'ö'), ('oʻ', 'ö'), ("O'", 'Ö'), ('O‘', 'Ö'), ("g'", 'ğ'), ('g‘', 'ğ'), ('gʻ', 'ğ'), ("G'", 'Ğ')):
        t = t.replace(a, b)
    return re.sub(r'ch', 'ç', re.sub(r'Ch', 'Ç', re.sub(r'sh', 'ş', re.sub(r'Sh', 'Ş', t))))
_t, _l = ImageDraw.ImageDraw.text, ImageDraw.ImageDraw.textlength
ImageDraw.ImageDraw.text = lambda self, xy, text, *a, **k: _t(self, xy, uzc(text), *a, **k)
ImageDraw.ImageDraw.textlength = lambda self, text, *a, **k: _l(self, uzc(text), *a, **k)
BG, TG, IV, MUT, AMB = (6, 10, 18), (62, 166, 234), (242, 245, 250), (138, 151, 174), (255, 201, 77)
MONTHS = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr']

def base():
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    for y in range(H):  # yumshoq yuqori nur
        t = max(0, 1 - y / 700); d.line([(0, y), (W, y)], fill=(int(6 + 14 * t), int(10 + 28 * t), int(18 + 52 * t)))
    return im, ImageDraw.Draw(im)

def wrap(d, text, font, maxw):
    out, line = [], ''
    for w in text.split():
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw: line = t
        else: out.append(line); line = w
    if line: out.append(line)
    return out

def block(d, x, y, text, font, fill, maxw, lh):
    for ln in wrap(d, text, font, maxw):
        d.text((x, y), ln, font=font, fill=fill); y += lh
    return y

def chip(d, x, y, text, col=TG):
    ft = f(B, 30); w = d.textlength(text, font=ft) + 44
    d.rounded_rectangle([x, y, x + w, y + 60], radius=30, fill=col); d.text((x + 22, y + 11), text, font=ft, fill=(255, 255, 255) if col == TG else (26, 18, 0))

def panel(d, it, y0=230, h=400):
    x0, x1 = 80, W - 80
    d.rounded_rectangle([x0, y0, x1, y0 + h], radius=36, fill=(14, 24, 44), outline=(40, 62, 100), width=3)
    for gx in range(x0 + 40, x1, 60): d.line([(gx, y0 + 20), (gx, y0 + h - 20)], fill=(20, 34, 60), width=1)
    for gy in range(y0 + 40, y0 + h, 60): d.line([(x0 + 20, gy), (x1 - 20, gy)], fill=(20, 34, 60), width=1)
    kind = it.get('viz', 'stat'); cx, cy = W // 2, y0 + h // 2
    if kind == 'stat':
        d.text((cx - d.textlength(it['big'], font=f(B, 190)) / 2, cy - 140), it['big'], font=f(B, 190), fill=TG)
        d.text((cx - d.textlength(it['cap'], font=f(R, 38)) / 2, cy + 80), it['cap'], font=f(R, 38), fill=MUT)
    elif kind == 'chat':
        yy = y0 + 50
        for i, ln in enumerate(it['lines']):
            mine = i % 2 == 1; ft = f(B if not mine else R, 34); w = d.textlength(ln, font=ft) + 60
            xx = x1 - 40 - w if mine else x0 + 40
            d.rounded_rectangle([xx, yy, xx + w, yy + 76], radius=38, fill=(62, 166, 234) if not mine else (34, 48, 76))
            d.text((xx + 30, yy + 18), ln, font=ft, fill=(255, 255, 255) if not mine else IV); yy += 100

def main(path):
    data = json.load(open(path)); items = data['items'][:8]; date = data['date']
    y_, m_, d_ = map(int, date.split('-')); label = f"{d_} {MONTHS[m_ - 1]}"
    out = os.environ.get('NEWS_OUT') or os.path.join(ROOT, 'public', 'news', date); os.makedirs(out, exist_ok=True)
    n = 1
    im, d = base(); chip(d, 80, 110, 'AI VA TEXNOLOGIYA')
    d.text((80, 360), 'Bugungi', font=f(B, 120), fill=IV); d.text((80, 500), 'yangiliklar', font=f(B, 120), fill=TG)
    d.text((80, 700), label, font=f(B, 64), fill=AMB)
    d.text((80, 800), f"{len(items)} ta muhim xabar. Surib ko'ring ›", font=f(R, 44), fill=MUT)
    d.text((80, H - 130), '@mashrabbekmaxmatkulov', font=f(B, 34), fill=MUT)
    im.save(f'{out}/{n}.png'); n += 1
    for i, it in enumerate(items, 1):
        im, d = base(); chip(d, 80, 110, f'{i} / {len(items)}', AMB)
        d.text((W - 80 - d.textlength(label, font=f(B, 32)), 126), label, font=f(B, 32), fill=MUT)
        panel(d, it)
        y = block(d, 80, 670, it['title'], f(B, 54), IV, W - 160, 68)
        d.rectangle([80, y + 10, 200, y + 15], fill=TG)
        y = block(d, 80, y + 44, it['body'], f(R, 38), (205, 214, 228), W - 160, 54)
        d.text((80, H - 170), 'Manba: ' + it['source'], font=f(B, 34), fill=TG)
        d.text((80, H - 110), '@mashrabbekmaxmatkulov', font=f(R, 30), fill=MUT)
        im.save(f'{out}/{n}.png'); n += 1
    im, d = base(); d.text((80, 380), 'Kanalga', font=f(B, 110), fill=IV); d.text((80, 510), "obuna bo'ling", font=f(B, 110), fill=TG)
    block(d, 80, 700, "Yangiliklarni biz bilan kuzatib boring va obuna bo'lib qo'ying.", f(R, 46), (205, 214, 228), W - 160, 66)
    d.text((80, 1000), '@mashrabbekmaxmatkulov', font=f(B, 44), fill=AMB)
    d.text((80, 1080), "Qo'llanmalar: @mmnchat_bot", font=f(R, 40), fill=MUT)
    im.save(f'{out}/{n}.png'); print('tayyor', n, 'ta rasm ->', out)
main(sys.argv[1])
