# ELIZA (1966, Joseph Weizenbaum, MIT) — o'zbekcha mini-versiya
# Ishga tushirish:  python eliza.py     (chiqish: "xayr" deb yozing)
# U hech narsani tushunmaydi: kalit so'zni topadi va gapingizni savol qilib qaytaradi.
import random, re

# gapdagi olmoshlarni "ko'zguga" aylantirish: men -> siz
MIRROR = {"men": "siz", "menga": "sizga", "mening": "sizning", "meni": "sizni", "menda": "sizda",
          "siz": "men", "sizga": "menga", "sizning": "mening", "sizni": "meni", "sizda": "menda"}

# (andoza, javoblar). {0} = gapning andozadan keyingi qismi
RULES = [
    (r"men (.*?)\s*xafaman", ["Nega {0} xafasiz?", "Xafalik qachondan beri bor?"]),
    (r"men (.*?)\s*charchadim", ["Nimadan charchadingiz?", "Qachondan beri charchagansiz?"]),
    (r"men (.*?)\s*qo'rqaman", ["Nimadan qo'rqasiz?", "Bu qo'rquv qachon boshlandi?"]),
    (r"men (.*?)\s*xohlayman", ["Nega {0} xohlaysiz?", "Agar {0} bo'lsa, nima o'zgaradi?"]),
    (r"men (.*?)\s*bilmayman", ["Nega bilmaysiz deb o'ylaysiz?", "Agar bilsangiz, nima qilardingiz?"]),
    (r"(.*) onam (.*)", ["Onangiz haqida ko'proq gapiring.", "Onangiz bilan munosabatingiz qanday?"]),
    (r"(.*) otam (.*)", ["Otangiz haqida ko'proq gapiring."]),
    (r"(.*) ish (.*)", ["Ishingiz haqida ko'proq gapirib bering.", "Ish sizga nima beradi?"]),
    (r"(.*) pul (.*)", ["Pul siz uchun nimani anglatadi?"]),
    (r"(.*) hech kim (.*)", ["Aniq kimdir yodingizga tushyaptimi?"]),
    (r"(.*) doim (.*)", ["Aniq bir misol keltira olasizmi?"]),
    (r"(.*)\?", ["O'zingiz nima deb o'ylaysiz?", "Nega bu savolni berdingiz?"]),
]
FALLBACK = ["Tushundim. Davom eting.", "Buni ko'proq tushuntirib bering.", "Bu siz uchun nima anglatadi?", "Mm. Keyin-chi?"]

def mirror(text):
    return " ".join(MIRROR.get(w, w) for w in text.split())

def reply(text):
    t = text.lower().strip().rstrip(".!")
    for pattern, answers in RULES:
        m = re.match(pattern, t)
        if m:
            tail = mirror(m.group(1)) if m.groups() else ""
            tail = tail.strip()
            pool = [a for a in answers if tail or "{0}" not in a] or answers
            return random.choice(pool).format(tail).replace("  ", " ")
    return random.choice(FALLBACK)

if __name__ == "__main__":
    print("ELIZA: Salom. Sizni nima bezovta qilyapti?")
    while True:
        s = input("siz: ")
        if s.lower().strip() in ("xayr", "chiq", "exit"):
            print("ELIZA: Xayr. Yana gaplashamiz."); break
        print("ELIZA:", reply(s))
