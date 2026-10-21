# ELIZA (1966, Joseph Weizenbaum, MIT) — o'zbekcha mini-versiya
# Ishga tushirish:  python eliza.py     (chiqish: "xayr" deb yoz)
# U hech narsani tushunmaydi: kalit so'zni topadi va gapingni savol qilib qaytaradi.
import random, re

# gapdagi olmoshlarni "ko'zguga" aylantirish: men -> sen
MIRROR = {"men": "sen", "menga": "senga", "mening": "sening", "meni": "seni", "menda": "sende",
          "sen": "men", "senga": "menga", "sening": "mening", "seni": "meni"}

# (andoza, javoblar). {0} = gapning andozadan keyingi qismi
RULES = [
    (r"men (.*?)\s*xafaman", ["Nega {0} xafasan?", "Xafalik qachondan beri bor?"]),
    (r"men (.*?)\s*charchadim", ["Nimadan charchading?", "Qachondan beri charchagansan?"]),
    (r"men (.*?)\s*qo'rqaman", ["Nimadan qo'rqasan?", "Bu qo'rquv qachon boshlandi?"]),
    (r"men (.*?)\s*xohlayman", ["Nega {0} xohlaysan?", "Agar {0} bo'lsa, nima o'zgaradi?"]),
    (r"men (.*?)\s*bilmayman", ["Nega bilmaysan deb o'ylaysan?", "Agar bilsang, nima qilarding?"]),
    (r"(.*) onam (.*)", ["Onang haqida ko'proq gapir.", "Onang bilan munosabating qanday?"]),
    (r"(.*) otam (.*)", ["Otang haqida ko'proq gapir."]),
    (r"(.*) ish (.*)", ["Ishing haqida ko'proq gapirib ber.", "Ish seni nima qiladi?"]),
    (r"(.*) pul (.*)", ["Pul sen uchun nimani anglatadi?"]),
    (r"(.*) hech kim (.*)", ["Aniq kimdir yodingga tushyaptimi?"]),
    (r"(.*) doim (.*)", ["Aniq bir misol keltira olasanmi?"]),
    (r"(.*)\?", ["Sen o'zing nima deb o'ylaysan?", "Nega bu savolni berding?"]),
]
FALLBACK = ["Tushundim. Davom et.", "Buni ko'proq tushuntirib ber.", "Bu sen uchun nima anglatadi?", "Mm. Keyin-chi?"]

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
    print("ELIZA: Salom. Nima bezovta qilyapti?")
    while True:
        s = input("sen: ")
        if s.lower().strip() in ("xayr", "chiq", "exit"):
            print("ELIZA: Xayr. Yana gaplashamiz."); break
        print("ELIZA:", reply(s))
