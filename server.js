// InstaBot AI v8 — Instagram izoh → DM → Telegram bot → kanal posti
//
// Voronka:
//   1. Odam Reels ostiga KALIT so'z yozadi (masalan REELS).
//   2. Bot izohga "DM'ga yubordim" deb javob beradi va shaxsiy xabar (private reply) yuboradi.
//   3. DM'da Telegram bot havolasi: t.me/<bot>?start=REELS
//   4. Telegram bot kanalga obunani tekshiradi → obuna bo'lsa post havolasini beradi.
//
// Kalit so'zlar rules.json da. Yangi video = rules.json ga bitta qator.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const files = require('./files');
const { promoState, resetPromoCache, KIND: PROMO_KIND } = require('./promo');

// ───────────────────────── Sozlamalar (Railway → Variables) ─────────────────────────
const env = (k, d = '') => (process.env[k] ?? d).trim();

const BOT_TOKEN = env('BOT_TOKEN');
const hostUrl = (h) => (h ? `https://${h}` : '');
const PUBLIC_URL = (
  env('PUBLIC_URL') ||
  hostUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  hostUrl(process.env.RAILWAY_PUBLIC_DOMAIN) ||
  env('MINI_APP_URL')
).replace(/\/$/, '');
const MINI_APP_URL = env('MINI_APP_URL') || PUBLIC_URL;
const TG_CHANNEL = env('TG_CHANNEL', '@mashrabbekmaxmatkulov');
const TG_BOT_USERNAME = env('TG_BOT_USERNAME', 'mmnchat_bot');
const OWNER_USERNAME = env('OWNER_USERNAME', 'mmn0300').toLowerCase();
const PORT = Number(process.env.PORT) || 3000;
const FREE_QUESTIONS = Number(env('FREE_QUESTIONS', '3'));

// Instagram (Instagram Login API: graph.instagram.com; Facebook sahifa orqali bo'lsa: graph.facebook.com)
const IG_ACCESS_TOKEN = env('IG_ACCESS_TOKEN');
const IG_USER_ID = env('IG_USER_ID');
const IG_USERNAME = env('IG_USERNAME').toLowerCase();
const IG_API = env('IG_API_HOST', 'https://graph.instagram.com') + '/' + env('IG_API_VERSION', 'v21.0');
const VERIFY_TOKEN = env('VERIFY_TOKEN', 'instabot_verify_123');
// Meta → Instagram API setup sahifasidagi "Секрет приложения Instagram". Bo'lsa, soxta webhooklar rad etiladi.
// Bir nechta sir bo'lsa vergul bilan: IG_APP_SECRET=instagram_sir,facebook_sir
const IG_APP_SECRETS = [env('IG_APP_SECRET'), env('FB_APP_SECRET')].join(',').split(',').map((x) => x.trim()).filter(Boolean);
const IG_APP_SECRET = IG_APP_SECRETS.length > 0;
const PUBLIC_REPLY = env('PUBLIC_REPLY', 'on') !== 'off';

// AI: GROQ_API_KEY bo'lsa Groq, bo'lmasa ANTHROPIC_API_KEY
const GROQ_API_KEY = env('GROQ_API_KEY');
const ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY');
const GROQ_MODEL = env('GROQ_MODEL') || env('AI_MODEL') || 'openai/gpt-oss-120b';
const CLAUDE_MODEL = env('CLAUDE_MODEL') || 'claude-haiku-4-5';

const CHANNEL_URL = `https://t.me/${TG_CHANNEL.replace('@', '')}`;
const botLink = (kw) => `https://t.me/${TG_BOT_USERNAME}?start=${encodeURIComponent(kw)}`;

// ───────────────────────── Yordamchilar ─────────────────────────
const log = (...a) => console.log(new Date().toISOString(), ...a);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HTML = { parse_mode: 'HTML', disable_web_page_preview: false };

// Hech bir xato serverni yiqitmasin (avval shu 502 ga sabab bo'lardi)
process.on('unhandledRejection', (e) => log('⚠ unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => log('⚠ uncaughtException:', e?.message || e));

// ───────────────────────── Qoidalar (kalit so'zlar) ─────────────────────────
let RULES = [];
// instagram.com/reel/ABC123/?igsh=... → ABC123
function shortcode(url) {
  const m = String(url || '').match(/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/i);
  return m ? m[1] : String(url || '').trim() || null;
}

function loadRules() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json'), 'utf8'));
    // "active": false — qoida vaqtincha o'chiq (menyuda yo'q, kalit so'z ishlamaydi)
    RULES = (raw.rules || []).filter((r) => r.active !== false).map((r) => ({
      ...r,
      keyword: String(r.keyword).toUpperCase(),
      words: [r.keyword, ...(r.aliases || [])].map((w) => String(w).toUpperCase()),
      // "reels": ["https://www.instagram.com/reel/ABC123/"] — bo'lsa, so'z faqat shu videolarda ishlaydi
      codes: (r.reels || []).map(shortcode).filter(Boolean),
    }));
    log(`📋 ${RULES.length} ta kalit so'z: ${RULES.map((r) => r.keyword).join(', ')}`);
  } catch (e) {
    log('❌ rules.json o\'qilmadi:', e.message);
  }
}
loadRules();

// Ikki so'z orasidagi tahrir masofasi (Levenshtein): "AHMAQONA" ↔ "AHMOQONA" = 1
function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Imloviy xatoga bardoshlik: kalit so'z ≥ 6 harf bo'lsa — 1 ta xato, ≥ 9 harf bo'lsa — 2 ta xato mumkin.
// Qisqa so'zlar (BOT, SAYT, AGENT...) faqat aynan mos kelganda ishlaydi.
const fuzzyMatch = (word, key) => {
  if (word === key) return true;
  if (key.length < 6 || Math.abs(word.length - key.length) > 2) return false;
  return editDistance(word, key) <= (key.length >= 9 ? 2 : 1);
};

// Izohni so'zlarga ajratib, kalit so'z bilan TO'LIQ solishtiradi ("1" yoki "+" hamma izohga mos kelib qolmasin)
function matchRule(text, rules = RULES) {
  const words = String(text || '')
    .toUpperCase()
    .replace(/[’'`ʼ‘]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return rules.find((r) => r.words.some((w) => words.some((x) => fuzzyMatch(x, w))));
}

// media.id → shortcode (Graph API'dan, keshlanadi)
const mediaCache = new Map();
async function mediaShortcode(mediaId) {
  if (!mediaId) return null;
  if (mediaCache.has(mediaId)) return mediaCache.get(mediaId);
  try {
    const r = await fetch(`${IG_API}/${mediaId}?fields=permalink,shortcode`, { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } });
    const d = await r.json();
    const code = d.shortcode || shortcode(d.permalink);
    if (!code) log('⚠ media shortcode topilmadi:', mediaId, JSON.stringify(d.error || d).slice(0, 200));
    mediaCache.set(mediaId, code || null);
    return code || null;
  } catch (e) {
    log('⚠ media shortcode:', e.message);
    return null;
  }
}

// Izoh qaysi Reels ostida ekaniga qarab qoidani tanlash
async function matchCommentRule(text, mediaId) {
  const candidates = RULES.filter((r) => matchRule(text, [r]));
  if (!candidates.length) return null;
  if (candidates.every((r) => !r.codes.length)) return candidates[0];
  const code = await mediaShortcode(mediaId);
  log(`🎬 media ${mediaId} → ${code}`);
  // Instagram video kodini bermasa — bot jim qolmasin: birinchi mos qoidani ishlatamiz
  if (!code) return candidates[0];
  return candidates.find((r) => r.codes.length && r.codes.includes(code)) || candidates.find((r) => !r.codes.length) || null;
}
const ruleByKeyword = (kw) => RULES.find((r) => r.keyword === String(kw || '').toUpperCase());

// Eslatma: odam qaysi kalit so'zni izohga yozishini bilsin. rules.json'da "remind": true bo'lganlar ko'rsatiladi
// (hech biri belgilanmagan bo'lsa — oxirgi 3 ta qo'llanma). Telegram bot ham, Instagram DM ham shuni ishlatadi.
const guideRules = () => RULES.filter((r) => r.file && !r.waitlist);
const featured = () => {
  const g = guideRules();
  const f = g.filter((r) => r.remind);
  return f.length ? f : g.slice(0, 3);
};

// ───────────────────────── Instagram API ─────────────────────────
async function ig(pathname, body) {
  if (!IG_ACCESS_TOKEN) {
    log('❌ IG_ACCESS_TOKEN yo\'q — Instagram\'ga yuborib bo\'lmaydi');
    return null;
  }
  try {
    const r = await fetch(`${IG_API}/${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${IG_ACCESS_TOKEN}` },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) {
      log(`❌ IG ${pathname}:`, r.status, JSON.stringify(d.error || d));
      return null;
    }
    return d;
  } catch (e) {
    log(`❌ IG ${pathname}:`, e.message);
    return null;
  }
}

const IG_PROFILE = (env('IG_USERNAME') || 'mashrabbek.maxmatkulov').replace('@', '');
const PROFILE_URL = `https://www.instagram.com/${IG_PROFILE}/`;
// Obuna tekshiruvi: FOLLOW_CHECK=off — hammaga o'chiq; rules.json'da "follow": false — bitta so'z uchun o'chiq
const needsFollow = (rule) => env('FOLLOW_CHECK', 'on') !== 'off' && rule.follow !== false;

const ready = (rule) => (rule.waitlist ? `"${rule.title}" ochiq.` : `"${rule.title}" tayyor.`);
const dmText = (rule) =>
  `Salom! 👋 ${ready(rule)}\n\n` +
  `Olish uchun Telegram botga o'ting, u darhol yuboradi 👇\n${botLink(rule.keyword)}`;

// Tugmali xabar (Instagram button template, 3 tagacha tugma, sarlavha ≤ 20 belgi)
const buttons = (text, btns) => ({ attachment: { type: 'template', payload: { template_type: 'button', text: text.slice(0, 640), buttons: btns } } });
const followBtns = (rule) => [
  { type: 'web_url', url: PROFILE_URL, title: '👤 Sahifaga o\'tish' },
  { type: 'postback', title: '✅ Obuna bo\'ldim', payload: `FOLLOW:${rule.keyword}` },
];
const gateText = (rule) =>
  `Salom! 👋 ${ready(rule)}\n\n` +
  `${rule.waitlist ? 'Yozilish' : 'Olish'} uchun avval sahifamga obuna bo'ling, keyin "✅ Obuna bo'ldim" tugmasini bosing 👇`;
const notYetText = () =>
  `Hali obuna ko'rinmayapti 🙂\n\n@${IG_PROFILE} sahifasiga obuna bo'ling, keyin tugmani yana bosing 👇`;
const linkMessage = (rule) =>
  buttons(`Rahmat, obuna uchun! 🙌\n\n"${rule.title}" ${rule.waitlist ? 'Telegram botda — tugmani bosing, bir bosishda yozilasiz 👇' : 'Telegram botda kutyapti — tugmani bosing, darhol yuboradi 👇'}`, [
    { type: 'web_url', url: botLink(rule.keyword), title: rule.waitlist ? '✍️ Ro\'yxatga yozilish' : '📥 Qo\'llanmani olish' },
  ]);

const igSend = (recipient, message) => ig(`${IG_USER_ID || 'me'}/messages`, { recipient, message });

// Tugmali xabar yuboriladi; Instagram rad etsa — tez javob (quick reply), u ham bo'lmasa — oddiy matn
async function sendWithButtons(recipient, text, btns, plainFallback) {
  const r1 = await igSend(recipient, buttons(text, btns));
  if (r1) return r1;
  const qr = btns.filter((b) => b.type === 'postback').map((b) => ({ content_type: 'text', title: b.title, payload: b.payload }));
  const link = btns.find((b) => b.type === 'web_url');
  if (qr.length) {
    const r2 = await igSend(recipient, { text: `${text}${link ? `\n\n${link.url}` : ''}`, quick_replies: qr });
    if (r2) return r2;
  }
  return igSend(recipient, { text: plainFallback || text });
}

// Izoh egasiga shaxsiy xabar. Instagram faqat shu usulga ruxsat beradi: recipient.comment_id (7 kun ichida, 1 marta)
async function privateReply(commentId, rule, fromId) {
  const to = { comment_id: commentId };
  if (!needsFollow(rule)) return igSend(to, { text: dmText(rule) });
  // Obuna bo'lganlarga "Obuna bo'ldim" tugmasi chiqmaydi — havola darhol beriladi
  if (fromId && (await igFollows(fromId)) === true) {
    stats.followOk++;
    return (await igSend(to, linkMessage(rule))) || igSend(to, { text: dmText(rule) });
  }
  return sendWithButtons(to, gateText(rule), followBtns(rule), dmText(rule));
}

// Oddiy DM (odam o'zi yozgan bo'lsa, 24 soat ichida)
const sendDM = (igsid, text) => igSend({ id: igsid }, { text });

// Foydalanuvchi sahifaga obuna bo'lganmi? true / false / null (bilib bo'lmadi)
async function igFollows(igsid) {
  try {
    const r = await fetch(`${IG_API}/${igsid}?fields=username,is_user_follow_business`, { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } });
    const d = await r.json();
    if (typeof d.is_user_follow_business === 'boolean') {
      log(`👤 @${d.username || igsid} obuna: ${d.is_user_follow_business ? 'ha' : 'yo\'q'}`);
      return d.is_user_follow_business;
    }
    log('⚠ obuna tekshiruvi:', JSON.stringify(d.error || d).slice(0, 300));
  } catch (e) {
    log('⚠ obuna tekshiruvi:', e.message);
  }
  return null;
}

// "Obuna bo'ldim" bosilganda: obuna bo'lsa — havola, bo'lmasa — yana so'raymiz.
// Tekshirib bo'lmasa (API xatosi) — odamni qiynamaymiz, havolani beramiz.
async function checkAndDeliver(igsid, rule) {
  const follows = await igFollows(igsid);
  if (follows === false) {
    stats.notFollowing++;
    return sendWithButtons({ id: igsid }, notYetText(), followBtns(rule));
  }
  stats.followOk++;
  const ok = (await igSend({ id: igsid }, linkMessage(rule))) || (await sendDM(igsid, dmText(rule)));
  ok ? stats.dmSent++ : stats.dmFailed++;
  return ok;
}

// DM'ga kalit so'z yozildi: obuna ANIQ tasdiqlansa — havola; aks holda (yo'q yoki noma'lum) — avval obuna bo'ling + tugma
async function gateOrDeliver(igsid, rule) {
  if ((await igFollows(igsid)) === true) {
    stats.followOk++;
    const ok = (await igSend({ id: igsid }, linkMessage(rule))) || (await sendDM(igsid, dmText(rule)));
    ok ? stats.dmSent++ : stats.dmFailed++;
    return ok;
  }
  stats.notFollowing++;
  return sendWithButtons({ id: igsid }, gateText(rule), followBtns(rule), dmText(rule));
}

// Kim qaysi so'z uchun obunani kutyapti (odam tugma o'rniga "obuna bo'ldim" deb yozsa)
const waiting = new Map();

const PUBLIC_REPLIES = ['DM\'ga yubordim 📩', 'Yubordim, DM\'ni tekshiring ✅', 'Direct\'da kutyapti 📩', 'Yuborildi 🚀'];
const publicReply = (commentId) =>
  ig(`${commentId}/replies`, { message: PUBLIC_REPLIES[Math.floor(Math.random() * PUBLIC_REPLIES.length)] });

// Meta bir hodisani qayta yuborishi mumkin — bir izohga bir marta javob
const seen = new Map();
function firstTime(id) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 24 * 3600e3) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

const stats = { comments: 0, matched: 0, dmSent: 0, dmFailed: 0, followOk: 0, notFollowing: 0, tgStarts: 0, delivered: 0 };

async function handleComment(v) {
  const commentId = v.id;
  const fromId = v.from?.id;
  const fromName = (v.from?.username || '').toLowerCase();
  if (!commentId || !fromId) return;
  // O'zimizning izohlarimiz (bot javoblari) — e'tiborsiz
  if ((IG_USER_ID && fromId === IG_USER_ID) || (IG_USERNAME && fromName === IG_USERNAME)) return;
  if (v.parent_id) return; // izohga javoblar emas, faqat asosiy izohlar
  stats.comments++;
  const rule = await matchCommentRule(v.text, v.media?.id);
  if (!rule) return;
  if (!firstTime(`c:${commentId}`)) return;
  stats.matched++;
  log(`💬 @${fromName}: "${v.text}" → ${rule.keyword}`);
  const ok = await privateReply(commentId, rule, fromId);
  if (ok && needsFollow(rule)) waiting.set(fromId, rule.keyword);
  if (ok) stats.dmSent++;
  else stats.dmFailed++;
  if (ok && PUBLIC_REPLY) await publicReply(commentId);
}

const DONE_RE = /obuna|bo'?ldim|boldim|bo‘ldim|tayyor|подписал|done|followed/i;

async function handleMessage(m) {
  const igsid = m.sender?.id;
  if (!igsid || igsid === IG_USER_ID || m.message?.is_echo) return;
  // Tugma bosildi: postback yoki quick reply
  const payload = m.postback?.payload || m.message?.quick_reply?.payload || '';
  const mid = m.postback?.mid || m.message?.mid || `${igsid}:${m.timestamp}`;
  if (payload.startsWith('FOLLOW:')) {
    const rule = ruleByKeyword(payload.slice(7));
    if (!rule || !firstTime(`p:${mid}`)) return;
    log(`🔘 "Obuna bo'ldim" → ${rule.keyword}`);
    waiting.set(igsid, rule.keyword);
    return checkAndDeliver(igsid, rule);
  }
  const text = m.message?.text;
  if (!text || !firstTime(`m:${mid}`)) return;
  const rule = matchRule(text);
  if (rule) {
    stats.matched++;
    log(`📩 DM "${text}" → ${rule.keyword}`);
    if (!needsFollow(rule)) return (await sendDM(igsid, dmText(rule))) ? stats.dmSent++ : stats.dmFailed++;
    waiting.set(igsid, rule.keyword);
    return gateOrDeliver(igsid, rule);
  }
  // Tugma o'rniga "obuna bo'ldim" deb yozdi
  if (DONE_RE.test(text) && waiting.has(igsid)) {
    const r = ruleByKeyword(waiting.get(igsid));
    if (r) return checkAndDeliver(igsid, r);
  }
  // Kalit so'z emas: odamga hech narsa bermaymiz (faqat tartib: kalit so'z → obuna tekshiruvi → havola). Eslatma kerak bo'lsa: DM_REMINDER=on
  if (env('DM_REMINDER', 'off') === 'on' && firstTime(`rem:${igsid}`)) {
    const list = featured();
    if (!list.length) return;
    await sendDM(igsid, `Salom! 👋 Hujjat olish uchun Reels ostiga kalit so'zni izohga yozing:\n\n${list.map((r) => `• ${r.keyword} — ${r.title}`).join('\n')}\n\nYozishingiz bilan DM'ga yuboraman 📩`);
  }
}

// ───────────────────────── Telegram bot ─────────────────────────
const bot = new TelegramBot(BOT_TOKEN || 'no-token', { polling: false, ...(env('TG_API_URL') ? { baseApiUrl: env('TG_API_URL') } : {}) });
const users = new Map();
const getUser = (id) => {
  if (!users.has(id)) users.set(id, { questions: 0, history: [], lang: 'uz', aiMode: false });
  return users.get(id);
};

// Kanal a'zolari soni (haqiqiy, Telegram'dan). 10 daqiqa keshlanadi; olinmasa qator ko'rsatilmaydi
let _cc = { n: 0, t: 0 };

// ───────── Foydalanuvchilar bazasi (Supabase, schema instabot; RPC orqali) ─────────
const SB_URL = env('SUPABASE_URL', 'https://eofojlcuvynelgtoamyn.supabase.co');
const SB_KEY = env('SUPABASE_ANON_KEY', 'sb_publishable_W6c5aLbzCwKSBZDT7iEhQw_l9djI_1K'); // ochiq (publishable) kalit; faqat RPC funksiyalarga ruxsat
async function sb(fn, args) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}), signal: AbortSignal.timeout(4000) });
    if (!r.ok) { log('❌ supabase', fn, r.status); return null; }
    const t = await r.text(); return t ? JSON.parse(t) : true;
  } catch (e) { log('❌ supabase', fn, e.message); return null; }
}
const trackUser = (u, source) => (u && !u.is_bot ? sb('instabot_track', { p_id: u.id, p_username: u.username || null, p_name: u.first_name || null, p_source: source || null }) : null);
const trackEvent = (kind, keyword, id) => sb('instabot_event', { p_kind: kind, p_keyword: keyword || null, p_id: id || null });
let statsCache = { at: 0, v: null };
async function dbStats() {
  if (Date.now() - statsCache.at < 60e3 && statsCache.v) return statsCache.v;
  const v = await sb('instabot_stats'); if (v) statsCache = { at: Date.now(), v }; return v;
}

async function chanCountLine() {
  let line = '';
  try {
    if (!_cc.n || Date.now() - _cc.t > 600e3) _cc = { n: await bot.getChatMemberCount(TG_CHANNEL), t: Date.now() };
    const fmt = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
    const st = await dbStats();
    if (st?.total > 0) line += `🤖 Botdan <b>${fmt(Number(st.total))}</b> kishi foydalanmoqda\n`;
    if (_cc.n > 0) line += `👥 Kanalimizda <b>${fmt(_cc.n)}</b> kishi bilan birga o'rganamiz\n`;
  } catch {}
  return line ? line + '\n' : '';
}
const isOwner = (u) => (u || '').toLowerCase() === OWNER_USERNAME;

// Serverless (Vercel) uchun: handlerlar tugaguncha javobni kutamiz, aks holda funksiya yarim yo'lda to'xtaydi
const pending = [];
const track = (fn) => (...a) => {
  const p = Promise.resolve().then(() => fn(...a)).catch((e) => log('❌ handler:', e.message));
  pending.push(p);
  return p;
};
async function handleTelegram(update) {
  bot.processUpdate(update);
  await Promise.allSettled(pending.splice(0));
}

// Xato bo'lsa ham yiqilmaydigan yuborish
const send = (chatId, text, opts = {}) =>
  bot.sendMessage(chatId, text, { ...HTML, ...opts }).catch((e) => log('❌ TG send:', e.message));

// Telegram xabari 4096 belgigacha — uzun javobni bo'lib yuboramiz (oddiy matn, HTML emas)
async function sendLong(chatId, text) {
  const t = String(text || '').trim() || '...';
  for (let i = 0; i < t.length; i += 3900) {
    await bot.sendMessage(chatId, t.slice(i, i + 3900)).catch((e) => log('❌ TG send:', e.message));
  }
}

async function checkSub(userId) {
  try {
    const m = await bot.getChatMember(TG_CHANNEL, userId);
    return ['member', 'administrator', 'creator'].includes(m.status);
  } catch (e) {
    log('⚠ getChatMember:', e.message, '— bot kanalda admin ekanini tekshiring');
    return false;
  }
}

const subscribeKb = (kw) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '📢 Kanalga obuna bo\'lish', url: CHANNEL_URL }],
      [{ text: '✅ Obuna bo\'ldim', callback_data: `get:${kw}` }],
    ],
  },
});

// Egasi Telegram'da /id yozib bilib oladi va Vercel'ga OWNER_CHAT_ID qilib qo'yadi
const OWNER_CHAT_ID = env('OWNER_CHAT_ID');
// ───── Pullik paket: to'lov → chek → admin tasdig'i → fayl ─────
// Vercel → Environment Variables: PAY_CARD (karta raqami), PAY_NAME (karta egasi), PRO_PRICE (masalan "149 000")
const PAY_CARD = env('PAY_CARD');
const PAY_NAME = env('PAY_NAME');
const PRO_PRICE = env('PRO_PRICE', '149 000');
const payRules = () => RULES.filter((r) => r.pay && r.active !== false);
const payPick = new Map(); // userId -> oxirgi tanlangan kurs kalit so'zi (chek qaysi kursga tegishli)
const fmtPrice = (p) => String(p).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') || String(p);
// Chegirma: "birinchi N kishiga". Joy faqat admin chekni tasdiqlaganda kamayadi (promo.js). Baza xato bersa — to'liq narx.
const promoOf = (rule) => promoState(rule, async (kw) => {
  const n = await sb('instabot_promo_count', { p_keyword: kw });
  return typeof n === 'number' ? n : null;
});
const payText = (rule, promo) => {
  const full = fmtPrice(rule.price || PRO_PRICE);
  const price = promo ? fmtPrice(promo.price) : full;
  const per = Math.round(parseInt(price.replace(/\s/g, ''), 10) / 30);
  const priceLine = promo
    ? `💰 <s>${esc(full)} so'm</s> → <b>${esc(price)} so'm</b> (bir marta, obunasiz)\n` +
      `🔥 Faqat birinchi <b>${promo.limit}</b> kishiga. Qolgan joy: <b>${promo.left} / ${promo.limit}</b>\n` +
      (promo.bonusFile ? `🎁 Bonus: ${esc(promo.bonusText || '30 ta viral reels mavzu bazasi')} va PRO yangilanishlari umrbod bepul\n` : '') +
      '\n'
    : `💰 Narx: <b>${esc(price)} so'm</b> (bir marta, obunasiz)\n\n`;
  return (
    `💎 <b>${esc(rule.title)}</b>\n\n` +
    (rule.payDesc ? esc(rule.payDesc) + '\n\n' : '') +
    `<b>Narx haqida ochiq gapiray.</b>\n` +
    `Bitta reelsni montajchiga topshirsangiz, shu pulning o'zi ketadi. Bu esa <b>cheksiz</b> reels uchun: 30 ta qilsangiz, har biri ~${per.toLocaleString('en').replace(/,/g, ' ')} so'm. Pulni bilimga sarflaysiz, o'sha bilim esa har hafta o'zini oqlaydi.\n\n` +
    priceLine +
    `⚠️ Kerak: Claude Code, Node.js, Python va ffmpeg. O'rnatishda qiynalsangiz @${esc(OWNER_USERNAME)} ga yozing, yordam beraman.\n\n` +
    (PAY_CARD
      ? `1️⃣ Shu kartaga to'lang:\n<code>${esc(PAY_CARD)}</code>${PAY_NAME ? `\n👤 ${esc(PAY_NAME)}` : ''}\n\n` +
        `2️⃣ To'lov chekini (skrinshot) <b>shu yerga rasm qilib yuboring</b>.\n\n` +
        `3️⃣ Tasdiqlangach, paket shu chatga keladi ✅`
      : `To'lov ma'lumotlari tez orada shu yerda bo'ladi. Savol bo'lsa: @${esc(OWNER_USERNAME)}`)
  );
};
async function payOffer(chatId, userId, rule) {
  payPick.set(userId, rule.keyword);
  const promo = await promoOf(rule);
  await send(chatId, payText(rule, promo));
  if (OWNER_CHAT_ID) {
    const u = await bot.getChat(userId).catch(() => ({}));
    await send(OWNER_CHAT_ID, `👀 ${esc(rule.keyword)} so'radi: ${u.username ? '@' + esc(u.username) : esc(u.first_name || userId)} (id ${userId})${PAY_CARD ? '' : '\n⚠ PAY_CARD qo\'yilmagan!'}`);
  }
}
// Chek keldi: egasiga yuboramiz, tugmalar bilan
async function handleReceipt(msg) {
  const chatId = msg.chat.id, userId = msg.from.id;
  const rule = ruleByKeyword(payPick.get(userId)) || payRules()[0];
  if (!rule || !rule.pay) return;
  if (!OWNER_CHAT_ID) {
    log('❌ OWNER_CHAT_ID yo\'q — chekni adminga yuborib bo\'lmadi');
    return send(chatId, `Chek qabul qilindi ✅ Admin tez orada ko'rib chiqadi. Savol bo'lsa: @${esc(OWNER_USERNAME)}`);
  }
  await bot.forwardMessage(OWNER_CHAT_ID, chatId, msg.message_id).catch((e) => log('❌ forward:', e.message));
  const who = msg.from.username ? '@' + esc(msg.from.username) : esc(msg.from.first_name || userId);
  const promo = await promoOf(rule);
  const priceTxt = promo ? `${esc(fmtPrice(promo.price))} so'm (chegirma, qolgan joy ${promo.left}/${promo.limit})` : `${esc(fmtPrice(rule.price || PRO_PRICE))} so'm`;
  // oxirgi belgi: 1 = chegirma narxida to'lagan (bonus beriladi va joy kamayadi)
  await send(OWNER_CHAT_ID, `🧾 <b>Chek</b>: ${who} (id ${userId})\nPaket: ${esc(rule.title)} — ${priceTxt}`, {
    reply_markup: { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `pok:${userId}:${rule.keyword}:${promo ? 1 : 0}` }, { text: '❌ Rad etish', callback_data: `pno:${userId}:${rule.keyword}:${promo ? 1 : 0}` }]] },
  });
  return send(chatId, `🧾 Chek qabul qilindi! Admin tekshirib tasdiqlashi bilan paket shu yerga keladi ⏳`);
}
async function sendPaid(userId, rule, withBonus = false) {
  if (!rule.paidFile || !PUBLIC_URL) return false;
  try {
    await bot.sendDocument(userId, `${PUBLIC_URL}/${rule.paidFile}`, {
      caption: `🎉 To'lov tasdiqlandi! Mana <b>${esc(rule.title)}</b>\n\n${rule.caption ? esc(rule.caption) : 'Ichidagi README.md da o\'rnatish tartibi bor.'}`,
      parse_mode: 'HTML',
    });
    for (const f of rule.paidExtra || []) {
      await bot.sendDocument(userId, `${PUBLIC_URL}/${f}`, { caption: '📖 Yo\'riqnoma: avval shuni o\'qing' }).catch((e) => log('❌ paidExtra:', e.message));
    }
    // Chegirma bonusi (faqat birinchi N kishiga). Xato bo'lsa asosiy paket yuborilgani buzilmaydi.
    if (withBonus && rule.promo?.bonusFile) {
      await bot.sendDocument(userId, `${PUBLIC_URL}/${rule.promo.bonusFile}`, {
        caption: `🎁 <b>Bonus:</b> ${esc(rule.promo.bonusText || '30 ta viral reels mavzu bazasi')}\n\nSiz birinchi ${rule.promo.limit} kishidan birisiz, shuning uchun PRO yangilanishlari sizga umrbod bepul ✅`,
        parse_mode: 'HTML',
      }).catch((e) => log('❌ bonus:', e.message));
    }
    return true;
  } catch (e) {
    log('❌ pullik fayl:', e.message);
    return false;
  }
}
const waitlist = new Map();
async function joinWaitlist(chatId, userId, rule) {
  const isNew = !waitlist.has(userId);
  waitlist.set(userId, Date.now());
  stats.waitlist = waitlist.size;
  await send(
    chatId,
    `✅ <b>Siz ro'yxatdasiz!</b>\n\n${esc(rule.waitlistText || `"${rule.title}" tayyor bo'lishi bilan birinchilardan bo'lib sizga shu yerda xabar beramiz.`)}\n\n` +
      `Hozircha AI yordamchini sinab ko'ring — pastdagi <b>🤖 AI Chat</b> tugmasi.`
  );
  if (isNew && OWNER_CHAT_ID) {
    const u = await bot.getChat(userId).catch(() => ({}));
    await send(OWNER_CHAT_ID, `🆕 ${esc(rule.keyword)} ro'yxati: ${u.username ? '@' + esc(u.username) : esc(u.first_name || userId)} (id ${userId})`);
  }
}

async function deliver(chatId, userId, rule) {
  if (rule.pay) return payOffer(chatId, userId, rule);
  if (!(await checkSub(userId))) {
    return send(
      chatId,
      `🎁 <b>${esc(rule.title)}</b>\n\nOlish uchun kanalga obuna bo'ling, keyin "✅ Obuna bo'ldim" ni bosing 👇`,
      subscribeKb(rule.keyword)
    );
  }
  stats.delivered++; trackEvent('delivered', rule.keyword, userId);
  // Kutish ro'yxati (masalan XABARNOMA): fayl yo'q — ro'yxatga yozamiz va egasiga xabar beramiz
  if (rule.waitlist) return joinWaitlist(chatId, userId, rule);
  const url = rule.postUrl || CHANNEL_URL;
  const kb = { reply_markup: { inline_keyboard: [[{ text: rule.postUrl ? '📖 Postni ochish' : '📢 Kanal', url }]] } };
  // PDF bo'lsa — faylni o'zini yuboramiz (Telegram URL'dan o'zi yuklab oladi)
  if (rule.file && PUBLIC_URL) {
    try {
      await bot.sendDocument(chatId, `${PUBLIC_URL}/${rule.file}`, {
        caption: `✅ Rahmat! Mana <b>${esc(rule.title)}</b> 📘\n\n${rule.caption ? esc(rule.caption) : "Saqlab qo'ying — qadamma-qadam qaytib ko'rasiz."}`,
        parse_mode: 'HTML',
        ...kb,
      });
      await sendExtras(chatId, rule);
      return;
    } catch (e) {
      log('❌ sendDocument:', e.message);
    }
  }
  return send(chatId, `✅ Rahmat! Mana <b>${esc(rule.title)}</b> 👇`, {
    reply_markup: { inline_keyboard: [[{ text: '📖 Ochish', url: rule.file && PUBLIC_URL ? `${PUBLIC_URL}/${rule.file}` : url }]] },
  });
}

// Qo'shimcha fayllar (rule.extra) va pullik taklif (rule.upsell)
async function sendExtras(chatId, rule) {
  for (const x of rule.extra || []) {
    const f = typeof x === 'string' ? { file: x } : x;
    await bot.sendDocument(chatId, `${PUBLIC_URL}/${f.file}`, { caption: f.caption ? esc(f.caption) : undefined, parse_mode: 'HTML' }).catch((e) => log('❌ extra:', e.message));
  }
  const up = rule.upsell && ruleByKeyword(rule.upsell);
  if (up) {
    await send(chatId, `💎 <b>To'liq versiya ham bor:</b> ${esc(up.title)}
${up.payDesc ? esc(up.payDesc) : ''}`, {
      reply_markup: { inline_keyboard: [[{ text: `💎 ${up.keyword} — batafsil`, callback_data: `get:${up.keyword}` }]] },
    });
  }
}

// Telegram: "qaysi kalit so'zni yozdingiz?" eslatmasi (tugmalar bilan — bosish yetarli)
const reminderText = () =>
  `🔑 <b>Hujjat olish uchun</b> Reels ostiga kalit so'zni <b>izohga yozing</b>.\n\n` +
  `${featured().map((r) => `• <b>${esc(r.keyword)}</b> — ${esc(r.title)}`).join('\n')}\n\n` +
  `Qaysi so'zni yozgandingiz? Shu yerga yozing yoki pastdan tanlang 👇`;
const reminderKb = () => ({
  reply_markup: {
    inline_keyboard: [
      ...featured().map((r) => [{ text: `🎁 ${r.keyword}`, callback_data: `get:${r.keyword}` }]),
      [{ text: '📚 Barcha qo\'llanmalar', callback_data: 'guides' }],
      ...(payRules().length ? [[{ text: '💎 Kurslar', callback_data: 'courses' }]] : []),
    ],
  },
});
const coursesText = () =>
  `💎 <b>Kurslar</b>\n\nPullik, to'liq paketlar. Birini tanlang, batafsil ma'lumot va to'lov shu yerda 👇` +
  (payRules().length ? '' : '\n\nHozircha kurs yo\'q, tez orada.');
const coursesKb = async () => ({
  reply_markup: {
    inline_keyboard: await Promise.all(payRules().map(async (r) => {
      const promo = await promoOf(r);
      return [{ text: `💎 ${r.title} · ${promo ? '🔥 ' + fmtPrice(promo.price) : fmtPrice(r.price || PRO_PRICE)} so'm`, callback_data: `get:${r.keyword}` }];
    })),
  },
});
const guidesKb = () => ({ reply_markup: { inline_keyboard: guideRules().map((r) => [{ text: `🎁 ${r.title}`, callback_data: `get:${r.keyword}` }]) } });

const userKb = {
  reply_markup: {
    keyboard: [[{ text: '🤖 AI Chat' }, { text: '📚 Menyu' }], [{ text: '💎 Kurslar' }, { text: '📢 Kanal' }], [{ text: '🌐 Til' }]],
    resize_keyboard: true,
  },
};

bot.onText(/^\/id$/, track(async (msg) => send(msg.chat.id, `Chat ID: <code>${msg.chat.id}</code>`)));

bot.onText(/^\/start(?:\s+(.+))?$/, track(async (msg, match) => {
  if (msg.chat.type === 'private') await trackUser(msg.from, match?.[1] ? `start:${match[1]}` : 'start');
  const chatId = msg.chat.id;
  const name = esc(msg.from.first_name || 'do\'stim');
  const param = (match[1] || '').trim();
  stats.tgStarts++;

  const rule = ruleByKeyword(param);
  if (rule) {
    await send(chatId, `${await chanCountLine()}Salom, <b>${name}</b>! 👋`, userKb);
    return deliver(chatId, msg.from.id, rule);
  }

  if (isOwner(msg.from.username)) {
    return send(chatId, `👑 Salom, <b>${name}</b>!\n🔐 Admin panel`, {
      reply_markup: {
        keyboard: [
          ...(MINI_APP_URL ? [[{ text: '🚀 Mini App', web_app: { url: MINI_APP_URL } }]] : []),
          [{ text: '📊 Statistika' }, { text: '📚 Menyu' }],
          [{ text: '⚙️ Sozlamalar' }],
        ],
        resize_keyboard: true,
      },
    });
  }
  await send(chatId, `${await chanCountLine()}👋 Salom, <b>${name}</b>!\n\n🤖 AI yordamchi botga xush kelibsiz!`, userKb);
  return send(chatId, reminderText(), reminderKb());
}));

// ───────────── Menyu (Mini App orqali boshqariladi) ─────────────
let menuItems = [
  { id: 1, title: 'Kanal', type: 'link', url: CHANNEL_URL, emoji: '📢' },
];

// Botning "miyasi": ssenariy formulasi, viral qoidalar, fayl protokoli — knowledge.md
let KNOWLEDGE = '';
try {
  KNOWLEDGE = fs.readFileSync(path.join(__dirname, 'knowledge.md'), 'utf8');
} catch (e) {
  log('⚠ knowledge.md o\'qilmadi:', e.message);
}

async function askAI(history, lang) {
  const langLine =
    { uz: "Javob tili: o'zbek (lotin).", ru: 'Язык ответа: русский.', en: 'Reply language: English.' }[lang] || '';
  const sys = `${KNOWLEDGE}\n\n${langLine}\nTelegram'da o'qiladi: sarlavha uchun **qalin** ishlat, jadval chizma.`;
  const msgs = history.slice(-10);
  // 1) Groq (bepul). Model eskirsa yoki xato bersa — 2) Claude'ga o'tamiz
  if (GROQ_API_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 2500, messages: [{ role: 'system', content: sys }, ...msgs] }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text) return text;
      log('❌ Groq:', JSON.stringify(d.error || d).slice(0, 300));
    } catch (e) {
      log('❌ Groq:', e.message);
    }
  }
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2500, system: sys, messages: msgs }),
      });
      const d = await r.json();
      const text = d.content?.[0]?.text;
      if (text) return text;
      log('❌ Anthropic:', JSON.stringify(d.error || d).slice(0, 300));
    } catch (e) {
      log('❌ Anthropic:', e.message);
    }
  }
  return GROQ_API_KEY || ANTHROPIC_API_KEY ? 'AI vaqtincha ishlamayapti, keyinroq urinib ko\'ring.' : 'AI ulanmagan.';
}


// Guruhda kalit so'z yozilsa: xabarga javob sifatida qo'llanma (obuna bo'lsa), bo'lmasa obuna tugmasi.
const groupSeen = new Set();
async function groupKeyword(msg) {
  if (!msg.from || msg.from.is_bot || msg.is_automatic_forward || msg.sender_chat) return;
  const text = String(msg.text || '').trim();
  if (text.startsWith('/') || text.split(/\s+/).length > 2) return;
  const rule = matchRule(text);
  if (!rule) return;
  const dk = `${msg.chat.id}:${msg.message_id}`;
  if (groupSeen.has(dk)) return;
  groupSeen.add(dk); if (groupSeen.size > 500) groupSeen.clear();
  const chatId = msg.chat.id, userId = msg.from.id, reply = { reply_to_message_id: msg.message_id, allow_sending_without_reply: true };
  const dm = { reply_markup: { inline_keyboard: [[{ text: '📩 Botda olish', url: `https://t.me/${TG_BOT_USERNAME}?start=${rule.keyword}` }]] } };
  log(`👥 guruh kalit so'z: ${rule.keyword}`);
  if (rule.pay || rule.waitlist || !rule.file || !PUBLIC_URL) return send(chatId, `📩 <b>${esc(rule.title)}</b> botda beriladi. Tugmani bosing 👇`, { ...reply, ...dm });
  if (!(await checkSub(userId))) {
    return send(chatId, `🎁 <b>${esc(rule.title)}</b>\n\nOlish uchun kanalga obuna bo'ling, keyin "✅ Obuna bo'ldim" ni bosing 👇`, { ...reply, ...subscribeKb(rule.keyword) });
  }
  stats.delivered++; trackEvent('delivered', rule.keyword, userId);
  try {
    await bot.sendDocument(chatId, `${PUBLIC_URL}/${rule.file}`, { caption: `✅ Mana <b>${esc(rule.title)}</b> 📘\n\n💾 Saqlab qo'ying.`, parse_mode: 'HTML', ...reply });
  } catch (e) { log('❌ guruh sendDocument:', e.message); await send(chatId, `📩 Fayl botda: tugmani bosing 👇`, { ...reply, ...dm }); }
}

bot.on('message', track(async (msg) => {
  if ((msg.photo || msg.document) && msg.chat.type === 'private' && !isOwner(msg.from.username)) return handleReceipt(msg);
  if (!msg.text || msg.text.startsWith('/start')) return;
  if (msg.chat.type === 'private') trackUser(msg.from, null);
  // Guruh (kanal muhokama guruhi): faqat kalit so'zga javob beramiz, boshqa gapga aralashmaymiz (AI chat, menyu yo'q)
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') return groupKeyword(msg);
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  // /menu va /ai buyruqlari — pastdagi tugmalar bilan bir xil ishlaydi
  const cmd = { '/menu': '📚 Menyu', '/ai': '🤖 AI Chat' }[msg.text.trim().split(/[\s@]/)[0].toLowerCase()];
  if (msg.text.startsWith('/') && !cmd) return;
  const text = cmd ?? msg.text.trim();
  const user = getUser(userId);

  // Telegram'da ham kalit so'z yozsa — beramiz
  const rule = matchRule(text);
  if (rule && text.split(/\s+/).length <= 2) return deliver(chatId, userId, rule);

  if (isOwner(msg.from.username)) {
    if (text === '📊 Statistika') {
      const db = await dbStats();
      return send(
        chatId,
        `📊 <b>Statistika</b> (server qayta ishga tushgandan beri)\n` +
          `💬 Izohlar: ${stats.comments}\n🎯 Kalit so'z: ${stats.matched}\n📩 DM yuborildi: ${stats.dmSent}\n` +
          `❌ DM xato: ${stats.dmFailed}\n▶️ /start: ${stats.tgStarts}\n🎁 Berildi: ${stats.delivered}\n👥 Users: ${users.size}` + (db ? `\n\n🗄 <b>Doimiy baza</b>\n👥 Jami foydalanuvchi: <b>${db.total}</b>\n🆕 Bugun: ${db.today} · 7 kun: ${db.week}\n🔥 7 kunda faol: ${db.active_week}\n🎁 Berilgan qo'llanma: ${db.delivered_total} (bugun ${db.delivered_today})\n🏆 Top: ${(db.top_keywords || []).map((k) => k.keyword + ' ' + k.n).join(', ') || '-'}` : '')
      );
    }
    if (text === '⚙️ Sozlamalar') {
      return send(
        chatId,
        `⚙️ <b>Sozlamalar</b>\n📢 Kanal: ${esc(TG_CHANNEL)}\n🔑 Kalit so'zlar: ${RULES.map((r) => r.keyword).join(', ')}\n` +
          `📸 IG token: ${IG_ACCESS_TOKEN ? '✅' : '❌'}  IG ID: ${IG_USER_ID ? '✅' : '❌'}\n🤖 AI: ${GROQ_API_KEY ? 'Groq' : ANTHROPIC_API_KEY ? 'Anthropic' : '❌'}`
      );
    }
  }

  if (text === '🌐 Til') {
    return send(chatId, 'Tilni tanlang:', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🇺🇿 O\'zbek', callback_data: 'lang_uz' },
          { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
          { text: '🇬🇧 English', callback_data: 'lang_en' },
        ]],
      },
    });
  }
  if (text === '💎 Kurslar') return send(chatId, coursesText(), await coursesKb());
  if (text === '📚 Menyu') {
    if (RULES.some((r) => r.file)) {
      return send(chatId, '📚 <b>Qo\'llanmalar</b>\nKeraklisini tanlang 👇', {
        reply_markup: { inline_keyboard: RULES.filter((r) => r.file).map((r) => [{ text: `🎁 ${r.title}`, callback_data: `get:${r.keyword}` }]) },
      });
    }
    if (!menuItems.length) return send(chatId, '📚 Menyu hozircha bo\'sh.');
    return send(chatId, '📚 <b>Menyu</b>', {
      reply_markup: { inline_keyboard: menuItems.map((i) => [{ text: `${i.emoji} ${i.title}`, callback_data: `menu_${i.id}` }]) },
    });
  }
  if (text === '📢 Kanal') {
    return send(chatId, '📢 Kanalimiz:', { reply_markup: { inline_keyboard: [[{ text: '📢 Kanalga o\'tish', url: CHANNEL_URL }]] } });
  }
  if (text === '🤖 AI Chat') {
    user.aiMode = true;
    const sub = await checkSub(userId);
    return send(chatId, `🤖 <b>AI Chat</b>\n${sub ? 'Cheksiz savol ✅' : `Bepul: ${Math.max(0, FREE_QUESTIONS - user.questions)} ta savol`}\n\nSavolingizni yozing!`);
  }

  // Kalit so'z ham, AI rejimi ham emas — qaysi so'zni yozishini eslatamiz
  if (!user.aiMode) return send(chatId, reminderText(), reminderKb());

  if (user.aiMode) {
    const sub = await checkSub(userId);
    if (!sub && user.questions >= FREE_QUESTIONS) {
      return send(chatId, '🔒 <b>Bepul savollar tugadi.</b>\nDavom etish uchun kanalga obuna bo\'ling 👇', {
        reply_markup: {
          inline_keyboard: [[{ text: '📢 Obuna bo\'lish', url: CHANNEL_URL }], [{ text: '✅ Tekshirish', callback_data: 'check_sub_ai' }]],
        },
      });
    }
    const thinking = await send(chatId, '🤔 ...');
    user.history.push({ role: 'user', content: text });
    const reply = await askAI(user.history, user.lang);
    if (thinking) bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
    user.history.push({ role: 'assistant', content: reply });
    user.questions++;

    // Fayl so'ralganmi? AI "[FAYL:docx]" belgisini qo'ygan yoki foydalanuvchi aniq "Word/PDF" degan
    const file = files.extractFile(reply, files.wantedFormat(text));
    if (file) {
      try {
        bot.sendChatAction(chatId, 'upload_document').catch(() => {});
        const f = await files.build(file);
        await bot.sendDocument(chatId, f.buffer, { caption: `📄 ${file.title}` }, { filename: f.filename, contentType: f.contentType });
        return;
      } catch (e) {
        log('❌ fayl yasash:', e.message);
        // fayl chiqmasa — matnning o'zini yuboramiz
        return sendLong(chatId, file.body);
      }
    }
    return sendLong(chatId, reply);
  }
}));

bot.on('callback_query', track(async (q) => {
  const chatId = q.message?.chat.id;
  const userId = q.from.id;
  if (q.message?.chat.type === 'private') trackUser(q.from, 'callback');
  const data = q.data || '';
  const user = getUser(userId);
  const answer = (opts) => bot.answerCallbackQuery(q.id, opts).catch(() => {});

  if (data.startsWith('pok:') || data.startsWith('pno:')) {
    if (!isOwner(q.from.username)) return answer({ text: 'Faqat admin uchun', show_alert: true });
    const [, uid, kw, pf] = data.split(':');
    const rule = ruleByKeyword(kw);
    if (data.startsWith('pok:')) {
      const bonus = pf === '1' && !!rule?.promo;
      const ok = rule && (await sendPaid(Number(uid), rule, bonus));
      await answer({ text: ok ? '✅ Paket yuborildi' : '❌ Fayl yuborilmadi', show_alert: !ok });
      if (ok) stats.sold = (stats.sold || 0) + 1;
      if (ok && bonus) {
        // Joyni kamaytirish: tasdiqlangan xarid bazaga yoziladi (bitta odam ikki marta sanalmaydi)
        const wrote = await sb('instabot_event', { p_kind: PROMO_KIND, p_keyword: rule.keyword, p_id: Number(uid) });
        resetPromoCache(rule.keyword);
        const n = await sb('instabot_promo_count', { p_keyword: rule.keyword });
        if (wrote === null || typeof n !== 'number') {
          await send(chatId, `⚠ Chegirma hisoblagichi yangilanmadi (baza xatosi). Qolgan joyni qo'lda tekshiring.`);
        } else {
          const left = Math.max(0, rule.promo.limit - n);
          await send(chatId, left > 0 ? `🔥 ${esc(rule.keyword)} chegirmasi: qolgan joy <b>${left} / ${rule.promo.limit}</b>` : `🏁 ${rule.promo.limit}/${rule.promo.limit} sotildi. ${esc(rule.keyword)} narxi endi ${esc(fmtPrice(rule.price || PRO_PRICE))} so'm.`);
        }
      }
      return bot.editMessageText(`${q.message.text}

${ok ? '✅ TASDIQLANDI, paket yuborildi' : '❌ Fayl yuborilmadi, logni tekshiring'}`, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    }
    await send(Number(uid), `❌ Chek tasdiqlanmadi. To'lovni tekshirib, qayta yuboring yoki @${esc(OWNER_USERNAME)} ga yozing.`);
    await answer({ text: 'Rad etildi' });
    return bot.editMessageText(`${q.message.text}

❌ RAD ETILDI`, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
  }
  if (data.startsWith('get:')) {
    const rule = ruleByKeyword(data.slice(4));
    if (!rule) return answer();
    if (rule.pay) { await answer(); return payOffer(chatId, userId, rule); }
    if (!(await checkSub(userId))) return answer({ text: '❌ Hali obuna bo\'lmagansiz!', show_alert: true });
    await answer({ text: '✅ Tasdiqlandi!' });
    return deliver(chatId, userId, rule);
  }
  if (data === 'courses') {
    await answer();
    return send(chatId, coursesText(), await coursesKb());
  }
  if (data === 'guides') {
    await answer();
    return send(chatId, '📚 <b>Qo\'llanmalar</b>\nKeraklisini tanlang 👇', guidesKb());
  }
  if (data.startsWith('lang_')) {
    user.lang = data.slice(5);
    return answer({ text: '✅ Til saqlandi!' });
  }
  if (data.startsWith('menu_')) {
    await answer();
    const item = menuItems.find((i) => i.id === Number(data.slice(5)));
    if (!item) return;
    if (item.type === 'text') return send(chatId, `${item.emoji} <b>${esc(item.title)}</b>\n\n${esc(item.content)}`);
    return send(chatId, `${item.emoji} <b>${esc(item.title)}</b>`, {
      reply_markup: { inline_keyboard: [[{ text: `${item.emoji} Ochish`, url: item.url }]] },
    });
  }
  if (data === 'check_sub_ai') {
    if (!(await checkSub(userId))) return answer({ text: '❌ Hali obuna bo\'lmagansiz!', show_alert: true });
    await answer({ text: '✅ Tasdiqlandi!' });
    return send(chatId, '✅ <b>Obuna tasdiqlandi!</b>\nEndi cheksiz savol bera olasiz. Savolingizni yozing 👇');
  }
  return answer();
}));

// ───────────────────────── HTTP ─────────────────────────
const app = express();
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// ── Xavfsizlik ──
// 1) Instagram webhook haqiqatan Meta'dan kelganini tekshirish (X-Hub-Signature-256)
function validMetaSignature(req) {
  if (!IG_APP_SECRET) return true; // sekret qo'yilmagan bo'lsa — tekshiruvsiz (health'da ogohlantirish)
  const sig = req.get('x-hub-signature-256') || '';
  // Asl matn (rawBody) bo'lmasa — Meta formatida qayta tiklab ko'ramiz (unicode \uXXXX, "/" → "\/")
  const json = JSON.stringify(req.body || {});
  const metaJson = json.replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).replace(/\//g, '\\/');
  const bodies = [
    ['raw', req.rawBody],
    ['json', Buffer.from(json)],
    ['meta-json', Buffer.from(metaJson)],
  ].filter(([, b]) => b && b.length);
  for (const [kind, body] of bodies) {
    for (let i = 0; i < IG_APP_SECRETS.length; i++) {
      const expected = 'sha256=' + crypto.createHmac('sha256', IG_APP_SECRETS[i]).update(body).digest('hex');
      if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        log(`🔐 IG imzo mos: ${i + 1}-sir, ${kind}`);
        return true;
      }
    }
  }
  log(`⛔ IG imzo mos kelmadi (header: ${sig ? 'bor' : 'YO\'Q'}, rawBody: ${req.rawBody ? req.rawBody.length : 'YO\'Q'}, sirlar: ${IG_APP_SECRETS.length}, sir uzunliklari: ${IG_APP_SECRETS.map((x) => x.length).join('/')}, hex: ${IG_APP_SECRETS.map((x) => (/^[0-9a-f]+$/.test(x) ? 'ha' : 'YO\'Q')).join('/')})`);
  // STRICT_SIGNATURE=on bo'lmaguncha rad etmaymiz — bot ishlashda davom etadi
  return env('STRICT_SIGNATURE') !== 'on';
}

// 2) Mini App so'rovi haqiqatan Telegram'dan va aynan admin'dan kelganini tekshirish (initData imzosi)
function telegramAdmin(req) {
  try {
    const initData = req.get('x-tg-init') || '';
    if (!initData || !BOT_TOKEN) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    if (!hash || calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
    if (Date.now() / 1000 - Number(params.get('auth_date') || 0) > 24 * 3600) return null;
    const user = JSON.parse(params.get('user') || '{}');
    return isOwner(user.username) ? user : null;
  } catch {
    return null;
  }
}
const adminOnly = (req, res, next) => (telegramAdmin(req) ? next() : res.status(403).json({ error: 'Ruxsat yo\'q' }));

// Telegram webhook
const tgWebhook = async (req, res) => {
  try {
    await handleTelegram(req.body);
  } catch (e) {
    log('❌ TG update:', e.message);
  }
  res.sendStatus(200);
};
app.post(`/webhook/tg/${BOT_TOKEN}`, tgWebhook);
app.post(`/webhook/${BOT_TOKEN}`, tgWebhook); // eski v7 manzil

// Instagram webhook — tasdiqlash
app.get('/webhook/instagram', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    log('✅ Instagram webhook tasdiqlandi');
    return res.send(challenge);
  }
  log('❌ Instagram webhook: verify token mos emas');
  res.sendStatus(403);
});

// Eski izohlarga DM: oxirgi 7 kun ichidagi izohlarni o'qib, kalit so'zi borlarga javob yuboradi.
// Ishlatish: /admin/backfill?key=VERIFY_TOKEN  → ko'rish (hech narsa yubormaydi)
//            /admin/backfill?key=VERIFY_TOKEN&send=1 → yuboradi. Bir izohga Instagram faqat 1 marta ruxsat beradi.
app.get('/admin/backfill', async (req, res) => {
  if (req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'key noto\'g\'ri' });
  const send = req.query.send === '1';
  const t0 = Date.now();
  const out = { send, found: [], sent: 0, failed: 0, note: '' };
  const get = async (p) => {
    const r = await fetch(`${IG_API}/${p}`, { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } });
    const d = await r.json().catch(() => ({}));
    if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 300));
    return d;
  };
  try {
    const media = (await get(`${IG_USER_ID || 'me'}/media?fields=id,timestamp&limit=8`)).data || [];
    const since = Date.now() - 7 * 24 * 3600e3;
    for (const m of media) {
      if (new Date(m.timestamp).getTime() < since - 24 * 3600e3 * 7) continue;
      const cs = (await get(`${m.id}/comments?fields=id,text,timestamp,username,from&limit=50`)).data || [];
      for (const c of cs) {
        if (Date.now() - t0 > 7500) { out.note = 'vaqt tugadi — yana bir marta oching'; break; }
        if (new Date(c.timestamp).getTime() < since) continue;
        const uname = (c.username || c.from?.username || '').toLowerCase();
        if (uname && uname === IG_USERNAME) continue;
        const rule = await matchCommentRule(c.text, m.id);
        if (!rule) continue;
        if (req.query.only && rule.keyword !== String(req.query.only).toUpperCase()) continue;
        if (String(req.query.skip || '').toLowerCase().split(',').includes(uname)) continue;
        const row = { user: uname, text: c.text, keyword: rule.keyword };
        if (send && (firstTime(`c:${c.id}`) || req.query.force === '1')) {
          const fromId = c.from?.id;
          const ok = await privateReply(c.id, rule, fromId);
          row.sent = !!ok;
          if (ok) { out.sent++; if (fromId && needsFollow(rule)) waiting.set(fromId, rule.keyword); } else out.failed++;
          if (ok && PUBLIC_REPLY) await publicReply(c.id);
        }
        out.found.push(row);
      }
    }
  } catch (e) {
    out.error = e.message;
  }
  res.json(out);
});

// Kanalga qo'llanma PDF + chiroyli izoh. /admin/channel?key=KEY&kw=XOTIRA,SKILL  (ko'rish) ... &send=1 (yuboradi)
app.get('/admin/channel', async (req, res) => {
  if (req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'key noto\'g\'ri' });
  const kws = String(req.query.kw || '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
  const send = req.query.send === '1';
  const out = [];
  for (const kw of kws) {
    const rule = ruleByKeyword(kw);
    if (!rule || !rule.file) { out.push({ kw, error: 'qoida yoki fayl yo\'q' }); continue; }
    const caption =
      `📘 <b>${esc(rule.title)}</b>\n\n` +
      (rule.caption ? `${esc(rule.caption)}\n\n` : '') +
      `💾 Saqlab qo'ying — kerak bo'lganda qaytib ko'rasiz.\n\n` +
      `📩 Yana shunaqa qo'llanmalar: @${TG_BOT_USERNAME}\n` +
      `📸 Instagram: Reels izohiga <code>${esc(rule.keyword)}</code> deb yozing, DM'ga yuboriladi.`;
    const row = { kw, file: rule.file, caption };
    if (send) {
      try {
        const m = await bot.sendDocument(TG_CHANNEL, `${PUBLIC_URL}/${rule.file}`, { caption: caption.slice(0, 1024), parse_mode: 'HTML' });
        row.sent = true; row.message_id = m.message_id;
      } catch (e) { row.sent = false; row.error = e.message; }
    }
    out.push(row);
  }
  res.json({ send, channel: TG_CHANNEL, out });
});


// Kanalga video + izoh. /admin/channel-video?key=KEY&name=sayt (ko'rish) ... &send=1 (video), &pdf=1 (PDF ham)
const CHAN_VIDEOS = {
  tikla: { video: 'reels/tikla.mp4', kw: 'TIKLA', text: "🖼 <b>Buvingizning eski surati: 10 soniyada tiklash</b>\n\nXira, chizilgan, dog' tushgan suratni telefondagi AI bilan tiklash mumkin. Fotograf shart emas.\n\n1️⃣ Suratni yorug'da, soyasiz, telefon bilan to'g'ri tushiring\n2️⃣ AI'ga yuklab shu promptni yozing: <i>«Bu eski suratni tikla. Chiziqlarni va dog'larni olib tashla, yuzlarni aniqlashtir. Kiyim va yuzlarni o'zgartirma.»</i>\n3️⃣ Natijani asl nusxa bilan solishtiring. Yuz o'zgargan bo'lsa, qayta so'rang\n\n⚠️ Asl suratni hech qachon tashlamang: AI taxmin qiladi, asl nusxa esa tarix.\n\n📘 5 ta tayyor prompt PDF'da, pastda. Instagramda izohga <code>TIKLA</code> deb yozsangiz, DM'ga ham keladi." },
  yurak: { video: 'reels/yurak.mp4', kw: 'YURAK', text: "❤️ <b>Yuragingiz bugun 100 mingdan ko'p marta uradi</b>\n\nSiz uni sezmaysiz, lekin pulsni 30 soniyada o'lchash mumkin:\n\n1️⃣ Ikki barmoqni (bosh barmoqsiz) bilak ustiga qo'ying\n2️⃣ 30 soniya urishni sanang va ikkiga ko'paytiring\n3️⃣ Natijani yozib qo'ying\n\nKattalar uchun tinch holatdagi me'yor taxminan 60 dan 100 gacha. Sportchilarda pastroq bo'lishi mumkin. Puls doim juda tez yoki sekin bo'lsa, ayniqsa bosh aylansa yoki holsizlik bo'lsa, shifokorga ko'ring.\n\n⚠️ Bu tibbiy maslahat emas.\n\n📘 Puls jadvali PDF'da, pastda. Instagramda izohga <code>YURAK</code> deb yozsangiz, DM'ga ham keladi." },
  obuna: { video: 'reels/obuna.mp4', kw: 'OBUNA', text: "💸 <b>Kartangizdan har oy pul yechilyaptimi?</b>\n\nKo'pchilik sinov muddatini unutadi va obuna o'zi uzayib ketadi. 3 qadamda tekshiring:\n\n1️⃣ Bank ilovasida oxirgi 3 oylik to'lovlarni oching va takrorlanadiganlarini toping\n2️⃣ iPhone: Sozlamalar → ismingiz → Obunalar. Android: Google Play → profil → To'lovlar va obunalar\n3️⃣ Ishlatmayotganingizni shu bo'limning o'zidan bekor qiling\n\n📘 iPhone/Android yo'llari va to'ldiriladigan jadval PDF'da, pastda." },
  band: { video: 'reels/band.mp4', kw: 'BAND', text: "📄 <b>Shartnomani imzolashdan oldin shu 1 narsani tekshiring</b>\n\nKo'pchilik shartnomani o'qimay imzolaydi. Imzolashdan oldin AI'ga tekshirtiring va xavfli bandlarni oldindan toping.\n\n📘 Tekshiruv varag'i PDF'da, pastda. Instagramda izohga <code>BAND</code> deb yozsangiz, DM'ga ham keladi." },
  firib: { video: 'reels/firib.mp4', kw: 'FIRIB', text: "⚠️ <b>Bu faylni ochmang: Telegramdagi 4 ta firibgarlik usuli</b>\n\n1️⃣ «Rasmingiz topildi» deb kelgan .apk fayl\n2️⃣ Do'stingiz nomidan qarz so'rash: avval qo'ng'iroq qiling\n3️⃣ Kodni so'rash: Telegram kodini hech kimga aytmang\n4️⃣ «Yutuq» havolasi\n\n🛡 Himoya: ikki bosqichli tekshiruvni yoqing va qurilmalarni tekshiring. Qadamma-qadam yo'riqnoma PDF'da, pastda.\n\n📱 Android uchun APK Qo'riqchi: https://play.google.com/store/apps/details?id=com.baxtiyorov.security" },
  hook: { video: 'reels/hook.mp4', kw: 'HOOK', text: "🎯 <b>Reelsing yurmayaptimi? Muammo videoda emas, birinchi 3 soniyada</b>\n\nMening reelsimni 25 mingta odam ko'rdi, yarmi 3 soniyada tashlab ketdi. Ko'proq ko'rilishi uchun 4 ta qoida:\n\n1️⃣ Nol kadrda harakat\n2️⃣ Haqiqiy ilova, haqiqiy ekran\n3️⃣ Gapni tomoshabinning akkaunti haqida qil\n4️⃣ Har gapda tasvir o'zgarsin\n\n🎁 Bepul skill va qo'llanma PDF'da, pastda. Instagramda izohga <code>HOOK</code> deb yozsangiz, DM'ga ham keladi." },
  haqiqat: { video: 'reels/haqiqat.mp4', kw: 'HAQIQAT', text: "🪞 <b>AI sizga har doim \"ha\" deydi. Bu xavfli</b>\n\nStanford olimlari 11 ta mashhur AI ni sinadi (Science, 2026). AI odamlarga qaraganda foydalanuvchi tomonini o'rtacha 49% ko'proq oladi. Odamlar esa aynan shunday AI ga ko'proq ishonadi.\n\n✅ Yechim: maqtovni emas, tanqidni so'rang.\n\n🎁 4 ta tayyor \"Tanqidchi prompt\" PDF'da, pastda. Instagramda izohga <code>HAQIQAT</code> deb yozsangiz, DM'ga ham keladi." },
  plagin: { video: 'reels/plagin.mp4', kw: 'PLAGIN', text: "🔌 <b>Claude'ga reels qildirishdan oldin shu 3 plaginni o'rnating</b>\n\n1️⃣ Virality skill: hookni tekshiradi\n2️⃣ Content Skills: 54 ta bepul skill\n3️⃣ Remotion skills: kod yozib video qiladi\n\n📘 Havolalar va o'rnatish buyruqlari PDF'da, pastda." },
  sayt: { video: 'reels/sayt.mp4', kw: 'DEPLOY', text: "🌐 <b>AI bilan sayt yozdirib, internetga chiqarish</b>\n\n90 soniyada hammasi: Claude Code'da sayt yozdirasan, Vercel'ga chiqarasan, keyin o'zgartirasan. Havola o'sha-o'sha qoladi.\n\n📘 Qadamlar va tayyor promptlar PDF'da, pastda." },
};
app.get('/admin/channel-video', async (req, res) => {
  if (req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'key noto\'g\'ri' });
  const v = CHAN_VIDEOS[String(req.query.name || '')];
  if (!v) return res.json({ error: 'video nomi yo\'q', have: Object.keys(CHAN_VIDEOS) });
  const row = { name: req.query.name, video: `${PUBLIC_URL}/${v.video}`, send: req.query.send === '1' };
  if (row.send) {
    try {
      const m = await bot.sendVideo(TG_CHANNEL, row.video, { caption: v.text.slice(0, 1024), parse_mode: 'HTML', supports_streaming: true });
      row.sent = true; row.message_id = m.message_id;
      if (req.query.pdf === '1') row.pdf = await postChannelPdf(v.kw);
    } catch (e) { row.sent = false; row.error = e.message; }
  }
  res.json(row);
});

// Kanalga rasm + izoh (yoki faqat matn). Fayllar: public/posts/<nom>.png (ixtiyoriy) va <nom>.txt
// /admin/channel-post?key=KEY&name=seriya (ko'rish) ... &send=1 (kanalga yuboradi)
app.get('/admin/channel-post', async (req, res) => {
  if (req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'key noto\'g\'ri' });
  const name = String(req.query.name || '').replace(/[^a-z0-9_-]/gi, '');
  const dir = path.join(__dirname, 'public', 'posts');
  const txtFile = path.join(dir, `${name}.txt`);
  if (!name || !fs.existsSync(txtFile)) {
    const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)) : [];
    return res.json({ error: 'post nomi yo\'q', have });
  }
  const text = fs.readFileSync(txtFile, 'utf8').trim();
  const hasImg = fs.existsSync(path.join(dir, `${name}.png`));
  const row = { name, channel: TG_CHANNEL, image: hasImg, chars: text.length, send: req.query.send === '1', preview: text.slice(0, 120) };
  if (row.send) {
    try {
      const m = hasImg
        ? await bot.sendPhoto(TG_CHANNEL, `${PUBLIC_URL}/posts/${name}.png`, { caption: text.slice(0, 1024) })
        : await bot.sendMessage(TG_CHANNEL, text, { disable_web_page_preview: true });
      row.sent = true; row.message_id = m.message_id;
    } catch (e) { row.sent = false; row.error = e.message; }
  }
  res.json(row);
});

// ───────────────────────── Reels avto-post ─────────────────────────
const REELS = {
  skill60: {
    video: 'reels/skill60.mp4',
    cover: 'reels/skill60.jpg',
    channelKw: 'SKILL',
    caption:
      "Skill haqida ko'p eshitdingmi? Endi o'zing yozib ko'r — atigi 60 soniya ⏱\n\n" +
      "1️⃣ .claude/skills/ ichida yangi papka och\n" +
      "2️⃣ SKILL.md fayl yoz: nom, tavsif, yo'riqnoma\n" +
      "3️⃣ Claude Code'da /salomlash deb yoz — tayyor!\n\n" +
      "Tayyor skill shabloni kerakmi? Izohga SKILL deb yozing, DM'ga yuboraman 📩\n\n" +
      '#claudecode #skills #ai #dasturlash #aitools',
  },
};
const igGet = async (p) => {
  const r = await fetch(`${IG_API}/${p}`, { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } });
  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 300));
  return d;
};
// Reel konteyneri yaratiladi, tayyor bo'lishi kutiladi; publish=true bo'lsa e'lon qilinadi
async function runReel(name, publish) {
  const cfg = REELS[name];
  if (!cfg) return { error: 'reel topilmadi' };
  const res = { name, publish };
  try {
    // Takror post bo'lmasin: oxirgi 24 soatda shu izoh bilan post bor bo'lsa — o'tkazib yuboramiz
    if (publish) {
      const recent = (await igGet(`${IG_USER_ID || 'me'}/media?fields=caption,timestamp&limit=5`)).data || [];
      if (recent.some((m) => (m.caption || '').slice(0, 30) === cfg.caption.slice(0, 30) && Date.now() - new Date(m.timestamp).getTime() < 24 * 3600e3)) {
        return { ...res, skipped: 'allaqachon e\'lon qilingan' };
      }
    }
    const c = await ig(`${IG_USER_ID || 'me'}/media`, {
      media_type: 'REELS', video_url: `${PUBLIC_URL}/${cfg.video}`, cover_url: `${PUBLIC_URL}/${cfg.cover}`, caption: cfg.caption, share_to_feed: true,
    });
    if (!c?.id) return { ...res, error: 'konteyner yaratilmadi (Logs\'da "❌ IG" qatoriga qarang)' };
    res.container = c.id;
    let st = '';
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await igGet(`${c.id}?fields=status_code,status`);
      st = s.status_code;
      res.status = s.status_code + (s.status ? ` (${s.status})` : '');
      if (st === 'FINISHED' || st === 'ERROR' || st === 'EXPIRED') break;
    }
    if (st !== 'FINISHED') return { ...res, error: 'video tayyor bo\'lmadi' };
    if (!publish) return { ...res, ok: true, note: 'tayyor, e\'lon qilinmadi (check)' };
    const p = await ig(`${IG_USER_ID || 'me'}/media_publish`, { creation_id: c.id });
    return p?.id ? { ...res, ok: true, published: p.id } : { ...res, error: 'e\'lon qilinmadi' };
  } catch (e) {
    return { ...res, error: e.message };
  }
}
async function postChannelPdf(kw, opts = {}) {
  const rule = ruleByKeyword(kw);
  if (!rule?.file) return { error: 'fayl yo\'q' };
  const caption =
    `📘 <b>${esc(rule.title)}</b>\n\n` + (rule.caption ? `${esc(rule.caption)}\n\n` : '') +
    `💾 Saqlab qo'ying — kerak bo'lganda qaytib ko'rasiz.\n\n📩 Yana shunaqa qo'llanmalar: @${TG_BOT_USERNAME}\n` +
    `📸 Instagram: Reels izohiga <code>${esc(rule.keyword)}</code> deb yozing, DM'ga yuboriladi.`;
  const finalCap = opts.slot ? uzc(`📘 <b>${esc(rule.title)}</b>\n\n` + (rule.caption ? `${esc(rule.caption)}\n\n` : '') + `💾 Saqlab qo'ying, kerak bo'lganda qaytib ko'rasiz.\n\n👉 Yangi qo'llanmalarni biz bilan kuzatib boring va obuna bo'lib qo'ying.\n\n`) + `${CHAN_LINKS}\n🤖 @${TG_BOT_USERNAME}` : caption;
  try {
    const m = await bot.sendDocument(TG_CHANNEL, `${PUBLIC_URL}/${rule.file}`, { caption: finalCap.slice(0, 1024), parse_mode: 'HTML' });
    return { sent: true, message_id: m.message_id };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
// Qo'lda: /admin/ig-reel?key=KEY&name=skill60&mode=check (e'lon qilmaydi) | mode=publish (e'lon + kanalga PDF)
app.get('/admin/ig-reel', async (req, res) => {
  if (req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'key noto\'g\'ri' });
  const publish = req.query.mode === 'publish';
  const out = await runReel(String(req.query.name || 'skill60'), publish);
  if (publish && out.published && req.query.channel !== '0') out.channel = await postChannelPdf(REELS[out.name].channelKw);
  res.json(out);
});
// Vercel Cron: faqat ?date=YYYY-MM-DD (Toshkent sanasi) mos kelganda ishlaydi
app.get('/api/cron/daily', async (req, res) => {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua.includes('vercel-cron') && req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'ruxsat yo\'q' });
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  if (req.query.date !== today) return res.json({ skipped: `bugun ${today}, reja ${req.query.date}` });
  const out = await runReel(String(req.query.name || 'skill60'), true);
  if (out.published) out.channel = await postChannelPdf(REELS[out.name].channelKw);
  log('🕗 cron:', JSON.stringify(out));
  res.json(out);
});

// Vercel Cron: kanalga video + PDF. ?date=YYYY-MM-DD (Toshkent sanasi) mos kelganda va faqat bir marta ishlaydi
let chanCronDone = '';
app.get('/api/cron/channel-video', async (req, res) => {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua.includes('vercel-cron') && req.query.key !== (env('BACKFILL_KEY') || VERIFY_TOKEN)) return res.status(403).json({ error: 'ruxsat yo\'q' });
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  if (req.query.date !== today) return res.json({ skipped: `bugun ${today}, reja ${req.query.date}` });
  const name = String(req.query.name || '');
  const v = CHAN_VIDEOS[name];
  if (!v) return res.json({ error: 'video nomi yo\'q' });
  if (chanCronDone === `${today}:${name}`) return res.json({ skipped: 'allaqachon yuborilgan' });
  chanCronDone = `${today}:${name}`;
  const out = { name, channel: TG_CHANNEL };
  try {
    const m = await bot.sendVideo(TG_CHANNEL, `${PUBLIC_URL}/${v.video}`, { caption: v.text.slice(0, 1024), parse_mode: 'HTML', supports_streaming: true });
    out.sent = true; out.message_id = m.message_id;
    out.pdf = await postChannelPdf(v.kw);
  } catch (e) { out.sent = false; out.error = e.message; chanCronDone = ''; }
  log('📢 cron kanal:', JSON.stringify(out));
  res.json(out);
});

// Instagram webhook — hodisalar. Serverless'da ish tugaguncha kutib, keyin 200 qaytaramiz (Meta 20 s kutadi).

// ───────── Kanal avto-joylash (Vercel Cron, Toshkent vaqti) ─────────
// Kechqurun 21:00: public/schedule.json → {"2026-10-23": ["band","firib"]} — shu kunning video(lar)i + PDF.
// Ertalab 08:00: public/news/YYYY-MM-DD/{caption.txt, 1.png..10.png} bor bo'lsa — salom + yangilik karuseli. Fayl yo'q bo'lsa hech narsa uydirilmaydi.
const tashkentToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const cronAuth = (req) => String(req.headers['user-agent'] || '').includes('vercel-cron') || req.query.key === (env('BACKFILL_KEY') || VERIFY_TOKEN);
const cronDone = new Set();
app.get('/api/cron/evening', async (req, res) => {
  if (!cronAuth(req)) return res.status(403).json({ error: 'ruxsat yo\'q' });
  const today = req.query.date || tashkentToday();
  let sched = {};
  try { sched = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'schedule.json'), 'utf8')); } catch {}
  const names = sched[today] || [];
  const out = { today, names, results: [] };
  for (const name of names) {
    const v = CHAN_VIDEOS[name];
    const k = `e:${today}:${name}`;
    if (!v) { out.results.push({ name, error: 'video nomi yo\'q' }); continue; }
    if (cronDone.has(k)) { out.results.push({ name, skipped: 'allaqachon' }); continue; }
    cronDone.add(k);
    try {
      const m = await bot.sendVideo(TG_CHANNEL, `${PUBLIC_URL}/${v.video}`, { caption: v.text.slice(0, 1024), parse_mode: 'HTML', supports_streaming: true });
      out.results.push({ name, sent: true, message_id: m.message_id, pdf: await postChannelPdf(v.kw) });
    } catch (e) { cronDone.delete(k); out.results.push({ name, sent: false, error: e.message }); }
  }
  log('📢 kechki cron:', JSON.stringify(out));
  res.json(out);
});
app.get('/api/cron/morning', async (req, res) => {
  if (!cronAuth(req)) return res.status(403).json({ error: 'ruxsat yo\'q' });
  const today = req.query.date || tashkentToday();
  const dir = path.join(__dirname, 'public', 'news', today);
  const out = { today };
  if (!fs.existsSync(path.join(dir, 'caption.txt'))) { out.skipped = 'bugungi yangilik papkasi yo\'q'; return res.json(out); }
  const k = `m:${today}`;
  if (cronDone.has(k)) return res.json({ ...out, skipped: 'allaqachon' });
  cronDone.add(k);
  const caption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8').trim();
  const slides = fs.readdirSync(dir).filter((f) => /^\d+\.(png|jpg)$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b)).slice(0, 10);
  try {
    if (slides.length >= 2) {
      const media = slides.map((f, i) => ({ type: 'photo', media: `${PUBLIC_URL}/news/${today}/${f}`, ...(i === 0 ? { caption: caption.slice(0, 1024), parse_mode: 'HTML' } : {}) }));
      const m = await bot.sendMediaGroup(TG_CHANNEL, media);
      out.sent = true; out.count = m.length;
    } else if (slides.length === 1) {
      const m = await bot.sendPhoto(TG_CHANNEL, `${PUBLIC_URL}/news/${today}/${slides[0]}`, { caption: caption.slice(0, 1024), parse_mode: 'HTML' });
      out.sent = true; out.message_id = m.message_id;
    } else {
      const m = await bot.sendMessage(TG_CHANNEL, caption, { parse_mode: 'HTML', disable_web_page_preview: true });
      out.sent = true; out.message_id = m.message_id;
    }
  } catch (e) { cronDone.delete(k); out.sent = false; out.error = e.message; }
  log('☀️ ertalabki cron:', JSON.stringify(out));
  res.json(out);
});


// Kun davomidagi slotlar: 12:00 PDF qo'llanma (aylanma), 15:00 kunlik maslahat, 18:00 Kompyuter savodxonligi darsi (+ kechki video teaseri).
// Tashqi trigger (GitHub Actions) chaqiradi: /api/cron/slot?slot=12|15|18  (UA: vercel-cron). Kontent: public/content/{tips,polls}.json
const uzc = (t) => String(t).split(/(@\S+|https?:\/\/\S+|\S*\+\S*|\b(?:Shift|Compress|Heading|References|Data|Sort|Zip|Windows|Word|Excel)\b)/).map((x, i) => (i % 2 ? x : x
  .replace(/o['‘ʻ]/g, 'ö').replace(/O['‘ʻ]/g, 'Ö').replace(/g['‘ʻ]/g, 'ğ').replace(/G['‘ʻ]/g, 'Ğ')
  .replace(/sh/g, 'ş').replace(/Sh/g, 'Ş').replace(/ch/g, 'ç').replace(/Ch/g, 'Ç'))).join('');
const CHAN_LINKS = '📢 Telegram: https://t.me/mashrabbekmaxmatkulov\n📸 Instagram: https://instagram.com/mashrab.axi';
const SLOT_PDFS = ['PROMPT', 'XAVF', 'EXCEL', 'CV', 'AHMOQONA', 'SKILL', 'CLAUDE', 'BOT', 'SAYT', 'REELS', 'HAQIQAT', 'PLAGIN', 'RUXSAT', 'XOTIRA'];
const dayIndex = (d) => Math.floor((Date.parse(d + 'T00:00:00Z') - Date.parse('2026-10-24T00:00:00Z')) / 864e5);
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', f), 'utf8')); } catch { return def; } };
app.get('/api/cron/slot', async (req, res) => {
  if (!cronAuth(req)) return res.status(403).json({ error: 'ruxsat yo\'q' });
  const today = req.query.date || tashkentToday();
  const slot = String(req.query.slot || '');
  const out = { today, slot };
  if (!['12', '15', '18'].includes(slot)) return res.status(400).json({ ...out, error: 'slot 12|15|18' });
  const k = `s:${today}:${slot}`;
  if (cronDone.has(k)) return res.json({ ...out, skipped: 'allaqachon' });
  cronDone.add(k);
  const i = dayIndex(today);
  try {
    if (slot === '12') {
      out.kw = pick(SLOT_PDFS, i);
      out.result = await postChannelPdf(out.kw, { slot: true });
    } else if (slot === '15') {
      const tips = readJson('content/tips.json', []);
      if (!tips.length) throw new Error('tips.json bo\'sh');
      const ti = ((i % tips.length) + tips.length) % tips.length;
      const cap = uzc(`💡 <b>Kun maslahati</b>\n\n${esc(tips[ti])}\n\n👉 Maslahatlarni biz bilan kuzatib boring va obuna bo'lib qo'ying.`) + `\n\n${CHAN_LINKS}`;
      const img = path.join(__dirname, 'public', 'content', 'tips', `${ti}.png`);
      const m = fs.existsSync(img) && cap.length <= 1024
        ? await bot.sendPhoto(TG_CHANNEL, `${PUBLIC_URL}/content/tips/${ti}.png`, { caption: cap, parse_mode: 'HTML' })
        : await bot.sendMessage(TG_CHANNEL, cap, { parse_mode: 'HTML', disable_web_page_preview: true });
      out.message_id = m.message_id;
    } else {
      const sched = readJson('schedule.json', {});
      const lit = readJson('content/literacy.json', []);
      if (!lit.length) throw new Error('literacy.json bo\'sh');
      const li = ((i % lit.length) + lit.length) % lit.length;
      const tonight = (sched[today] || []).length ? `\n\n🎬 Bugun soat <b>21:00</b> da yangi video va uning PDF qo'llanmasi chiqadi.` : '';
      const cap = uzc(`🖥 <b>Kompyuter savodxonligi</b>\n\n<b>${esc(lit[li][0])}</b>\n\n${esc(lit[li][1])}${tonight}\n\n👉 Yangi darslarni biz bilan kuzatib boring va obuna bo'lib qo'ying.`) + `\n\n${CHAN_LINKS}`;
      const img = path.join(__dirname, 'public', 'content', 'literacy', `${li}.png`);
      const m = fs.existsSync(img) && cap.length <= 1024
        ? await bot.sendPhoto(TG_CHANNEL, `${PUBLIC_URL}/content/literacy/${li}.png`, { caption: cap, parse_mode: 'HTML' })
        : await bot.sendMessage(TG_CHANNEL, cap, { parse_mode: 'HTML', disable_web_page_preview: true });
      out.message_id = m.message_id;
      const qz = lit[li][2];
      if (qz) {
        await new Promise((r) => setTimeout(r, 1500));
        const m2 = await bot.sendPoll(TG_CHANNEL, uzc(`📝 Quiz: ${qz.q}`).slice(0, 300), qz.o.map((x) => uzc(x).slice(0, 100)), { type: 'quiz', correct_option_id: qz.c, explanation: uzc(qz.e).slice(0, 200), is_anonymous: true });
        out.quiz = m2.message_id;
      }
    }
    out.sent = true;
  } catch (e) { cronDone.delete(k); out.sent = false; out.error = e.message; }
  log('⏰ slot cron:', JSON.stringify(out));
  res.json(out);
});

app.post('/webhook/instagram', async (req, res) => {
  if (!validMetaSignature(req)) {
    log('⛔ IG webhook: imzo noto\'g\'ri — rad etildi');
    return res.sendStatus(403);
  }
  const body = req.body || {};
  if (env('DEBUG') === 'on') log('📥 IG:', JSON.stringify(body).slice(0, 1500));
  try {
    for (const entry of body.entry || []) {
      for (const ch of entry.changes || []) {
        if (ch.field === 'comments' || ch.field === 'live_comments') await handleComment(ch.value || {});
      }
      for (const m of entry.messaging || []) await handleMessage(m);
      // Ba'zan postback'lar "changes" ichida keladi
      for (const ch of entry.changes || []) if (ch.field === 'messaging_postbacks' && ch.value) await handleMessage(ch.value);
    }
  } catch (e) {
    log('❌ IG webhook:', e.message);
  }
  res.sendStatus(200);
});

// Mini App API
app.get('/api/menu', (req, res) => res.json(menuItems));
app.post('/api/menu', adminOnly, (req, res) => {
  const { title, type, content, url, emoji } = req.body || {};
  if (!title || !type) return res.status(400).json({ error: 'title va type kerak' });
  const item = { id: Date.now(), title, type, content: content || '', url: url || '', emoji: emoji || '📌' };
  menuItems.push(item);
  res.json(item);
});
app.delete('/api/menu/:id', adminOnly, (req, res) => {
  menuItems = menuItems.filter((i) => String(i.id) !== req.params.id);
  res.json({ ok: true });
});
app.get('/api/stats', adminOnly, (req, res) => res.json({ users: users.size, ...stats }));

// Tekshiruv: brauzerda /health ni oching — nima yetishmasligini ko'rsatadi
app.get('/health', (req, res) =>
  res.json({
    ok: true,
    version: '8.3',
    publicUrl: PUBLIC_URL || '❌ PUBLIC_URL yo\'q',
    telegram: BOT_TOKEN ? '✅' : '❌ BOT_TOKEN yo\'q',
    instagramToken: IG_ACCESS_TOKEN ? '✅' : '❌ IG_ACCESS_TOKEN yo\'q',
    instagramUserId: IG_USER_ID ? '✅' : '⚠ IG_USER_ID yo\'q (me ishlatiladi)',
    webhookSignature: IG_APP_SECRET ? `✅ tekshiriladi (${IG_APP_SECRETS.length} ta sir)` : '⚠ IG_APP_SECRET yo\'q — imzo tekshirilmaydi',
    ai: [GROQ_API_KEY && `Groq (${GROQ_MODEL})`, ANTHROPIC_API_KEY && `Claude (${CLAUDE_MODEL})`].filter(Boolean).join(' → ') || '❌',
    keywords: RULES.map((r) => r.keyword),
    reminder: featured().map((r) => r.keyword),
    followCheck: env('FOLLOW_CHECK', 'on') !== 'off' ? `✅ @${IG_PROFILE}` : 'o\'chiq',
    payment: { ownerChat: OWNER_CHAT_ID ? '✅' : '❌ OWNER_CHAT_ID yo\'q (botga /id yozing)', card: PAY_CARD ? '✅' : '❌ PAY_CARD yo\'q', price: PRO_PRICE, paid: payRules().map((r) => r.keyword) },
  })
);
// Telegram webhook'ni o'rnatish: brauzerda /setup?key=VERIFY_TOKEN ni bir marta oching (Vercel'da shart)
async function setTelegramWebhook() {
  if (!BOT_TOKEN) return '❌ BOT_TOKEN yo\'q';
  if (!PUBLIC_URL) return '❌ PUBLIC_URL yo\'q';
  try {
    await bot.setWebHook(`${PUBLIC_URL}/webhook/tg/${BOT_TOKEN}`, { drop_pending_updates: true });
    // Chat pastidagi "InstaBot AI" tugmasi ham yangi manzilga
    let menu = '';
    try {
      await bot.setChatMenuButton({ menu_button: JSON.stringify({ type: 'web_app', text: 'InstaBot AI', web_app: { url: MINI_APP_URL } }) });
      menu = `\n✅ Menyu tugmasi: ${MINI_APP_URL}`;
    } catch (e) {
      menu = '\n⚠ Menyu tugmasi: ' + e.message;
    }
    return `✅ Telegram webhook: ${PUBLIC_URL}/webhook/tg/***${menu}`;
  } catch (e) {
    return '❌ Telegram webhook: ' + e.message;
  }
}
app.get('/setup', async (req, res) => {
  if (req.query.key !== VERIFY_TOKEN) return res.status(403).send('key noto\'g\'ri');
  res.send(await setTelegramWebhook());
});

// Mini App sahifasi (public/index.html). Vercel'da public/ papkani o'zi beradi.
app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;

// Oddiy serverda (Railway, VPS, kompyuter) — o'zi ishga tushadi va webhookni o'rnatadi
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', async () => {
    log(`✅ Server port ${PORT}`);
    log(await setTelegramWebhook());
  });
}
