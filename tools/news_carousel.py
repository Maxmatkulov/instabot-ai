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

def main(path):
    data = json.load(open(path)); items = data['items'][:8]; date = data['date']
    y_, m_, d_ = map(int, date.split('-')); label = f"{d_} {MONTHS[m_ - 1]}"
    out = os.path.join(ROOT, 'public', 'news', date); os.makedirs(out, exist_ok=True)
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
        y = block(d, 80, 280, it['title'], f(B, 68), IV, W - 160, 84)
        d.rectangle([80, y + 24, 200, y + 30], fill=TG)
        y = block(d, 80, y + 80, it['body'], f(R, 46), (205, 214, 228), W - 160, 66)
        d.text((80, H - 190), 'Manba: ' + it['source'], font=f(B, 34), fill=TG)
        d.text((80, H - 130), '@mashrabbekmaxmatkulov', font=f(R, 30), fill=MUT)
        im.save(f'{out}/{n}.png'); n += 1
    im, d = base(); d.text((80, 380), 'Har kuni', font=f(B, 110), fill=IV); d.text((80, 510), 'shu yerda', font=f(B, 110), fill=TG)
    block(d, 80, 700, "Kanalga obuna bo'ling: ertalab yangiliklar, kechqurun video va tayyor PDF yo'riqnoma.", f(R, 46), (205, 214, 228), W - 160, 66)
    d.text((80, 1000), '@mashrabbekmaxmatkulov', font=f(B, 44), fill=AMB)
    d.text((80, 1080), "Qo'llanmalar: @mmnchat_bot", font=f(R, 40), fill=MUT)
    im.save(f'{out}/{n}.png'); print('tayyor', n, 'ta rasm ->', out)
main(sys.argv[1])
