// Chegirma (promo): "birinchi N kishiga" narx. Hisoblagich Supabase'da (instabot.events, kind='promo_paid').
// Joy faqat admin chekni TASDIQLAGANDA kamayadi. Baza javob bermasa — xavfsiz tomon: to'liq narx.

const KIND = 'promo_paid';
const CACHE_MS = 10e3;
const cache = new Map(); // keyword -> { at, sold }

const digits = (p) => parseInt(String(p).replace(/\D/g, ''), 10) || 0;

// getSold(keyword) -> son yoki null (baza xatosi)
async function promoState(rule, getSold, now = Date.now()) {
  const p = rule && rule.promo;
  if (!p || !p.limit || !p.price) return null;
  try {
    let c = cache.get(rule.keyword);
    if (!c || now - c.at > CACHE_MS) {
      const sold = await getSold(rule.keyword);
      if (sold === null || sold === undefined || Number.isNaN(Number(sold))) return null;
      c = { at: now, sold: Number(sold) };
      cache.set(rule.keyword, c);
    }
    const left = Math.max(0, p.limit - c.sold);
    if (left <= 0) return null;
    return { price: p.price, left, limit: p.limit, sold: c.sold, bonusFile: p.bonusFile || null, bonusText: p.bonusText || null };
  } catch {
    return null;
  }
}
const resetPromoCache = (keyword) => (keyword ? cache.delete(keyword) : cache.clear());

module.exports = { promoState, resetPromoCache, digits, KIND };
