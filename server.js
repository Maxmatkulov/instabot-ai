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
const IG_APP_SECRET = env('IG_APP_SECRET');
const PUBLIC_REPLY = env('PUBLIC_REPLY', 'on') !== 'off';

// AI: GROQ_API_KEY bo'lsa Groq, bo'lmasa ANTHROPIC_API_KEY
const GROQ_API_KEY = env('GROQ_API_KEY');
const ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY');
const AI_MODEL = env('AI_MODEL') || (GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-5');

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
function loadRules() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json'), 'utf8'));
    RULES = (raw.rules || []).map((r) => ({
      ...r,
      keyword: String(r.keyword).toUpperCase(),
      words: [r.keyword, ...(r.aliases || [])].map((w) => String(w).toUpperCase()),
    }));
    log(`📋 ${RULES.length} ta kalit so'z: ${RULES.map((r) => r.keyword).join(', ')}`);
  } catch (e) {
    log('❌ rules.json o\'qilmadi:', e.message);
  }
}
loadRules();

// Izohni so'zlarga ajratib, kalit so'z bilan TO'LIQ solishtiradi ("1" yoki "+" hamma izohga mos kelib qolmasin)
function matchRule(text) {
  const words = String(text || '')
    .toUpperCase()
    .replace(/[’'`ʼ‘]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return RULES.find((r) => r.words.some((w) => words.includes(w)));
}
const ruleByKeyword = (kw) => RULES.find((r) => r.keyword === String(kw || '').toUpperCase());

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

const dmText = (rule) =>
  `Salom! 👋 "${rule.title}" tayyor.\n\n` +
  `Olish uchun Telegram botga o'ting, u darhol yuboradi 👇\n${botLink(rule.keyword)}`;

// Izoh egasiga shaxsiy xabar. Instagram faqat shu usulga ruxsat beradi: recipient.comment_id (7 kun ichida, 1 marta)
const privateReply = (commentId, rule) =>
  ig(`${IG_USER_ID || 'me'}/messages`, { recipient: { comment_id: commentId }, message: { text: dmText(rule) } });

// Oddiy DM (odam o'zi yozgan bo'lsa, 24 soat ichida)
const sendDM = (igsid, text) => ig(`${IG_USER_ID || 'me'}/messages`, { recipient: { id: igsid }, message: { text } });

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

const stats = { comments: 0, matched: 0, dmSent: 0, dmFailed: 0, tgStarts: 0, delivered: 0 };

async function handleComment(v) {
  const commentId = v.id;
  const fromId = v.from?.id;
  const fromName = (v.from?.username || '').toLowerCase();
  if (!commentId || !fromId) return;
  // O'zimizning izohlarimiz (bot javoblari) — e'tiborsiz
  if ((IG_USER_ID && fromId === IG_USER_ID) || (IG_USERNAME && fromName === IG_USERNAME)) return;
  if (v.parent_id) return; // izohga javoblar emas, faqat asosiy izohlar
  stats.comments++;
  const rule = matchRule(v.text);
  if (!rule) return;
  if (!firstTime(`c:${commentId}`)) return;
  stats.matched++;
  log(`💬 @${fromName}: "${v.text}" → ${rule.keyword}`);
  const ok = await privateReply(commentId, rule);
  if (ok) stats.dmSent++;
  else stats.dmFailed++;
  if (ok && PUBLIC_REPLY) await publicReply(commentId);
}

async function handleMessage(m) {
  if (m.message?.is_echo || !m.message?.text) return;
  const igsid = m.sender?.id;
  if (!igsid || igsid === IG_USER_ID) return;
  const rule = matchRule(m.message.text);
  if (!rule || !firstTime(`m:${m.message.mid}`)) return;
  stats.matched++;
  log(`📩 DM "${m.message.text}" → ${rule.keyword}`);
  (await sendDM(igsid, dmText(rule))) ? stats.dmSent++ : stats.dmFailed++;
}

// ───────────────────────── Telegram bot ─────────────────────────
const bot = new TelegramBot(BOT_TOKEN || 'no-token', { polling: false, ...(env('TG_API_URL') ? { baseApiUrl: env('TG_API_URL') } : {}) });
const users = new Map();
const getUser = (id) => {
  if (!users.has(id)) users.set(id, { questions: 0, history: [], lang: 'uz', aiMode: false });
  return users.get(id);
};
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

async function deliver(chatId, userId, rule) {
  if (!(await checkSub(userId))) {
    return send(
      chatId,
      `🎁 <b>${esc(rule.title)}</b>\n\nOlish uchun kanalga obuna bo'ling, keyin "✅ Obuna bo'ldim" ni bosing 👇`,
      subscribeKb(rule.keyword)
    );
  }
  stats.delivered++;
  const url = rule.postUrl || CHANNEL_URL;
  const kb = { reply_markup: { inline_keyboard: [[{ text: rule.postUrl ? '📖 Postni ochish' : '📢 Kanal', url }]] } };
  // PDF bo'lsa — faylni o'zini yuboramiz (Telegram URL'dan o'zi yuklab oladi)
  if (rule.file && PUBLIC_URL) {
    try {
      await bot.sendDocument(chatId, `${PUBLIC_URL}/${rule.file}`, {
        caption: `✅ Rahmat! Mana <b>${esc(rule.title)}</b> 📘\n\nSaqlab qo'ying — qadamma-qadam qaytib ko'rasiz.`,
        parse_mode: 'HTML',
        ...kb,
      });
      return;
    } catch (e) {
      log('❌ sendDocument:', e.message);
    }
  }
  return send(chatId, `✅ Rahmat! Mana <b>${esc(rule.title)}</b> 👇`, {
    reply_markup: { inline_keyboard: [[{ text: '📖 Ochish', url: rule.file && PUBLIC_URL ? `${PUBLIC_URL}/${rule.file}` : url }]] },
  });
}

const userKb = {
  reply_markup: {
    keyboard: [[{ text: '🤖 AI Chat' }, { text: '📚 Menyu' }], [{ text: '🌐 Til' }, { text: '📢 Kanal' }]],
    resize_keyboard: true,
  },
};

bot.onText(/^\/start(?:\s+(.+))?$/, track(async (msg, match) => {
  const chatId = msg.chat.id;
  const name = esc(msg.from.first_name || 'do\'stim');
  const param = (match[1] || '').trim();
  stats.tgStarts++;

  const rule = ruleByKeyword(param);
  if (rule) {
    await send(chatId, `Salom, <b>${name}</b>! 👋`, userKb);
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
  return send(chatId, `👋 Salom, <b>${name}</b>!\n\n🤖 AI yordamchi botga xush kelibsiz!`, userKb);
}));

// ───────────── Menyu (Mini App orqali boshqariladi) ─────────────
let menuItems = [
  { id: 1, title: 'Kanal', type: 'link', url: CHANNEL_URL, emoji: '📢' },
];

async function askAI(history, lang) {
  const sys =
    { uz: "O'zbek tilida qisqa va foydali javob ber.", ru: 'Отвечай кратко на русском.', en: 'Reply briefly in English.' }[lang] ||
    'Reply briefly.';
  const msgs = history.slice(-8);
  try {
    if (GROQ_API_KEY) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 800, messages: [{ role: 'system', content: sys }, ...msgs] }),
      });
      const d = await r.json();
      if (d.error) log('❌ Groq:', JSON.stringify(d.error));
      return d.choices?.[0]?.message?.content || 'Javob olishda xato.';
    }
    if (ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 800, system: sys, messages: msgs }),
      });
      const d = await r.json();
      if (d.error) log('❌ Anthropic:', JSON.stringify(d.error));
      return d.content?.[0]?.text || 'Javob olishda xato.';
    }
    return 'AI ulanmagan.';
  } catch (e) {
    log('❌ AI:', e.message);
    return 'AI vaqtincha ishlamayapti, keyinroq urinib ko\'ring.';
  }
}

bot.on('message', track(async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  const user = getUser(userId);

  // Telegram'da ham kalit so'z yozsa — beramiz
  const rule = matchRule(text);
  if (rule && text.split(/\s+/).length <= 2) return deliver(chatId, userId, rule);

  if (isOwner(msg.from.username)) {
    if (text === '📊 Statistika') {
      return send(
        chatId,
        `📊 <b>Statistika</b> (server qayta ishga tushgandan beri)\n` +
          `💬 Izohlar: ${stats.comments}\n🎯 Kalit so'z: ${stats.matched}\n📩 DM yuborildi: ${stats.dmSent}\n` +
          `❌ DM xato: ${stats.dmFailed}\n▶️ /start: ${stats.tgStarts}\n🎁 Berildi: ${stats.delivered}\n👥 Users: ${users.size}`
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
  if (text === '📚 Menyu') {
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
    // AI javobi ichida < > bo'lishi mumkin — oddiy matn sifatida
    return bot.sendMessage(chatId, reply).catch((e) => log('❌ TG send:', e.message));
  }
}));

bot.on('callback_query', track(async (q) => {
  const chatId = q.message?.chat.id;
  const userId = q.from.id;
  const data = q.data || '';
  const user = getUser(userId);
  const answer = (opts) => bot.answerCallbackQuery(q.id, opts).catch(() => {});

  if (data.startsWith('get:')) {
    const rule = ruleByKeyword(data.slice(4));
    if (!rule) return answer();
    if (!(await checkSub(userId))) return answer({ text: '❌ Hali obuna bo\'lmagansiz!', show_alert: true });
    await answer({ text: '✅ Tasdiqlandi!' });
    return deliver(chatId, userId, rule);
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
  const expected = 'sha256=' + crypto.createHmac('sha256', IG_APP_SECRET).update(req.rawBody || '').digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
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

// Instagram webhook — hodisalar. Serverless'da ish tugaguncha kutib, keyin 200 qaytaramiz (Meta 20 s kutadi).
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
    version: '8.0',
    publicUrl: PUBLIC_URL || '❌ PUBLIC_URL yo\'q',
    telegram: BOT_TOKEN ? '✅' : '❌ BOT_TOKEN yo\'q',
    instagramToken: IG_ACCESS_TOKEN ? '✅' : '❌ IG_ACCESS_TOKEN yo\'q',
    instagramUserId: IG_USER_ID ? '✅' : '⚠ IG_USER_ID yo\'q (me ishlatiladi)',
    webhookSignature: IG_APP_SECRET ? '✅ tekshiriladi' : '⚠ IG_APP_SECRET yo\'q — imzo tekshirilmaydi',
    ai: GROQ_API_KEY ? `Groq (${AI_MODEL})` : ANTHROPIC_API_KEY ? `Anthropic (${AI_MODEL})` : '❌',
    keywords: RULES.map((r) => r.keyword),
  })
);
// Telegram webhook'ni o'rnatish: brauzerda /setup?key=VERIFY_TOKEN ni bir marta oching (Vercel'da shart)
async function setTelegramWebhook() {
  if (!BOT_TOKEN) return '❌ BOT_TOKEN yo\'q';
  if (!PUBLIC_URL) return '❌ PUBLIC_URL yo\'q';
  try {
    await bot.setWebHook(`${PUBLIC_URL}/webhook/tg/${BOT_TOKEN}`, { drop_pending_updates: true });
    return `✅ Telegram webhook: ${PUBLIC_URL}/webhook/tg/***`;
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
