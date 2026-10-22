#!/usr/bin/env python3
"""Kun maslahati kartalari: public/content/tips/<i>.png (1080x1350) tips.json dan. Teaser/12:00 namunalari uchun ham chaqiriladi."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import news_carousel as nc
from PIL import Image, ImageDraw
W, H = nc.W, nc.H
f, B, R = nc.f, nc.B, nc.R

def card(kicker, title, body, out, label=None, accent=nc.AMB):
    im, d = nc.base(); nc.chip(d, 80, 110, kicker, accent)
    if label: d.text((W - 80 - d.textlength(label, font=f(B, 32)), 126), label, font=f(B, 32), fill=nc.MUT)
    d.rounded_rectangle([80, 260, W - 80, 262 + 8], radius=4, fill=nc.TG)
    y = nc.block(d, 80, 330, title, f(B, 72), nc.IV, W - 160, 90) if title else 330
    if body: nc.block(d, 80, y + 40, body, f(R, 46 if title else 52), (205, 214, 228), W - 160, 70)
    d.text((80, H - 190), 'Telegram: @mashrabbekmaxmatkulov', font=f(B, 34), fill=nc.TG)
    d.text((80, H - 130), 'Instagram: @mashrab.axi', font=f(R, 32), fill=nc.MUT)
    im.save(out)

def tips():
    tips = json.load(open(os.path.join(nc.ROOT, 'public/content/tips.json')))
    d = os.path.join(nc.ROOT, 'public/content/tips'); os.makedirs(d, exist_ok=True)
    for i, t in enumerate(tips):
        head, _, rest = t.partition('. ')
        card('KUN MASLAHATI', head + '.', rest, f'{d}/{i}.png', label=f'{i + 1} / {len(tips)}')
    print(len(tips), 'ta karta ->', d)

def literacy():
    items = json.load(open(os.path.join(nc.ROOT, 'public/content/literacy.json')))
    d = os.path.join(nc.ROOT, 'public/content/literacy'); os.makedirs(d, exist_ok=True)
    for i, (t, b, *_) in enumerate(items):
        card('KOMPYUTER SAVODXONLIGI', t, b, f'{d}/{i}.png', label=f'{i + 1} / {len(items)}', accent=nc.TG)
    print(len(items), 'ta karta ->', d)

if __name__ == '__main__': tips(); literacy()
