// ============================================
//  InstaBot AI — v6.0 FULL SYSTEM
//  Admin panel + AI Chat + Menu + Obuna tekshirish
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-server.com';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'instabot_verify_123';
const TG_CHANNEL = process.env.TG_CHANNEL || '@mashrabbekmaxmatkulov';
const TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || 'mmnchat_bot';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PORT = process.env.PORT || 3000;
const OWNER_USERNAME = 'mmn0300';
const FREE_QUESTIONS = 3;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// === In-memory storage ===
// Users: { userId: { questions: 0, history: [], lang: 'uz', subscribed: bool } }
const users = new Map();

// Menu items (admin qo'shadi)
let menuItems = [
  { id: 1, title: '📚 Darslik #1', type: 'text', content: 'Bu yerda darslik matni...', emoji: '📚' },
  { id: 2, title: '🎥 Video dars', type: 'video', url: 'https://t.me/mashrabbekmaxmatkulov/1', emoji: '🎥' },
  { id: 3, title: '🔗 Foydali havola', type: 'link', url: 'https://t.me/mashrabbekmaxmatkulov', emoji: '🔗' }
];

// Instagram
const pendingIG = new Map();
let igRules = [
  {
    id: 1, name: 'Kanal havolasi',
    keywords: ['1', 'link', 'havola', 'info', '+'],
    tgLink: `https://t.me/${TG_CHANNEL.replace('@','')}`,
    dmFirst: `Assalomu alaykum! 👋\n\nHavolani olish uchun:\n1️⃣ Kanalga obuna bo'ling: https://t.me/${TG_CHANNEL.replace('@','')}\n2️⃣ Botga boring: https://t.me/${TG_BOT_USERNAME}?start=check\n\nBot avtomatik tekshiradi ✅`,
    dmSuccess: `✅ Tasdiqlandi!\nMana havola: https://t.me/${TG_CHANNEL.replace('@','')}`,
    dmFail: `❌ Obuna topilmadi.\nAvval: https://t.me/${TG_CHANNEL.replace('@','')}\nKeyin: https://t.me/${TG_BOT_USERNAME}?start=check`
  }
];

// ===================================================
// HELPERS
// ===================================================

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, { questions: 0, history: [], lang: 'uz', subscribed: false });
  }
  return users.get(userId);
}

async function checkSub(userId) {
  try {
    const member = await bot.getChatMember(TG_CHANNEL, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    return false;
  }
}

function isOwner(username) {
  return (username || '').toLowerCase() === OWNER_USERNAME.toLowerCase();
}

function getLangText(lang) {
  const texts = {
    uz: { sub: "Kanalga obuna bo'ling", subBtn: "📢 Obuna bo'lish", subMsg: "❌ Siz obuna bo'lmagansiz!\n\nAI chatdan foydalanish uchun kanalimizga obuna bo'ling 👇", freeMsg: (n) => `⚠️ Sizda ${FREE_QUESTIONS - n} ta bepul savol qoldi.\nKeyin obuna kerak bo'ladi.`, limitMsg: "🔒 Bepul savollar tugadi!\n\nDavom etish uchun kanalimizga obuna bo'ling 👇", thinking: "🤔 O'ylamoqda...", error: "❌ Xato yuz berdi. Qayta urinib ko'ring." },
    ru: { sub: "Подпишитесь на канал", subBtn: "📢 Подписаться", subMsg: "❌ Вы не подписаны!\n\nДля использования AI чата подпишитесь на наш канал 👇", freeMsg: (n) => `⚠️ Осталось ${FREE_QUESTIONS - n} бесплатных вопросов.\nЗатем нужна подписка.`, limitMsg: "🔒 Бесплатные вопросы закончились!\n\nПодпишитесь на канал для продолжения 👇", thinking: "🤔 Думаю...", error: "❌ Ошибка. Попробуйте ещё раз." },
    en: { sub: "Subscribe to channel", subBtn: "📢 Subscribe", subMsg: "❌ You're not subscribed!\n\nSubscribe to our channel to use AI chat 👇", freeMsg: (n) => `⚠️ ${FREE_QUESTIONS - n} free questions left.\nSubscription required after.`, limitMsg: "🔒 Free questions used up!\n\nSubscribe to continue 👇", thinking: "🤔 Thinking...", error: "❌ Error occurred. Try again." }
  };
  return texts[lang] || texts['uz'];
}

// Claude AI
async function askClaude(history, userLang) {
  if (!ANTHROPIC_API_KEY) return "AI hozir ulangan emas. Admin API key qo'shishi kerak.";
  
  const sysPrompt = {
    uz: "Siz foydali AI yordamchisiz. O'zbek tilida qisqa, aniq va do'stona javob bering.",
    ru: "Вы полезный AI ассистент. Отвечайте кратко, точно и дружелюбно на русском языке.",
    en: "You are a helpful AI assistant. Respond briefly, accurately and friendly in English."
  }[userLang] || "You are a helpful AI assistant.";

  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: sysPrompt,
        messages: history.slice(-10)
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text || "Javob olishda muammo.";
  } catch (e) {
    console.error('Claude xato:', e.message);
    return null;
  }
}

// ===================================================
// TELEGRAM BOT — /start
// ===================================================

bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const name = msg.from.first_name || 'Do\'stim';
  const param = (match[1] || '').trim();
  const user = getUser(userId);

  // === OWNER ===
  if (isOwner(username)) {
    await bot.sendMessage(chatId,
      `👑 Salom, *${name}!*\n\n🔐 Admin panel`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '🚀 Mini App', web_app: { url: MINI_APP_URL } }],
            [{ text: '📊 Statistika' }, { text: '📚 Menyu' }],
            [{ text: '⚙️ Sozlamalar' }, { text: '👥 Foydalanuvchilar' }]
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // === /start check — Instagram ===
  if (param === 'check') {
    const isSub = await checkSub(userId);
    if (isSub) {
      user.subscribed = true;
      await bot.sendMessage(chatId, `✅ *Rahmat, ${name}!*\nObunangiz tasdiqlandi!\nInstagram DM ga havola yuborildi 📩`, { parse_mode: 'Markdown' });
      const igUserId = [...pendingIG.entries()].find(([, v]) => v.tgUserId === userId)?.[0];
      if (igUserId) {
        const pending = pendingIG.get(igUserId);
        await sendInstaDM(igUserId, pending.rule?.dmSuccess || igRules[0].dmSuccess);
        pendingIG.delete(igUserId);
      } else {
        await bot.sendMessage(chatId, `🎁 Havola:\n👉 ${igRules[0].tgLink}`);
      }
    } else {
      await bot.sendMessage(chatId,
        `❌ Obuna topilmadi!\n\nKanalga obuna bo'ling:`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📢 Obuna bo\'lish', url: `https://t.me/${TG_CHANNEL.replace('@','')}` }
            ],[
              { text: '✅ Tekshirish', callback_data: 'recheck_ig' }
            ]]
          }
        }
      );
    }
    return;
  }

  // === ODDIY FOYDALANUVCHI ===
  const isSub = await checkSub(userId);
  user.subscribed = isSub;
  
  await sendMainMenu(chatId, name, isSub, user.lang);
});

// === ASOSIY MENYU ===
async function sendMainMenu(chatId, name, isSub, lang) {
  const t = getLangText(lang || 'uz');
  await bot.sendMessage(chatId,
    `👋 Salom, *${name}!*\n\n🤖 AI yordamchi botga xush kelibsiz!\n\n${isSub ? '✅ Obuna tasdiqlandi' : '⚠️ Obuna tekshirilmadi'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '🤖 AI Chat' }, { text: '📚 Menyu' }],
          [{ text: '🌐 Til' }, { text: '📊 Mening holatim' }],
          [{ text: '📢 Kanal' }]
        ],
        resize_keyboard: true
      }
    }
  );
}

// ===================================================
// TELEGRAM BOT — Xabarlar
// ===================================================

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const text = msg.text;
  const user = getUser(userId);

  // === OWNER COMMANDS ===
  if (isOwner(username)) {
    if (text === '📊 Statistika') {
      await bot.sendMessage(chatId,
        `📊 *Statistika*\n\n` +
        `👥 Foydalanuvchilar: ${users.size}\n` +
        `📚 Menyu elementlari: ${menuItems.length}\n` +
        `⚡ IG Qoidalar: ${igRules.length}\n` +
        `📸 Instagram: ${process.env.IG_ACCESS_TOKEN ? '✅' : '❌'}\n` +
        `🤖 AI: ${ANTHROPIC_API_KEY ? '✅' : '❌'}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (text === '📚 Menyu') {
      await showAdminMenu(chatId);
      return;
    }

    if (text === '👥 Foydalanuvchilar') {
      await bot.sendMessage(chatId,
        `👥 *Foydalanuvchilar: ${users.size}*\n\nTarix va batafsil — Mini App da!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (text === '⚙️ Sozlamalar') {
      await bot.sendMessage(chatId,
        `⚙️ *Sozlamalar*\n\n` +
        `📢 Kanal: ${TG_CHANNEL}\n` +
        `🤖 Bot: @${TG_BOT_USERNAME}\n` +
        `🆓 Bepul savollar: ${FREE_QUESTIONS}\n\n` +
        `Batafsil sozlamalar Mini App da 👆`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    return;
  }

  // === USER: TIL ===
  if (text === '🌐 Til') {
    await bot.sendMessage(chatId, 'Tilni tanlang / Выберите язык / Choose language:', {
      reply_markup: {
        inline_keyboard: [[
          { text: "🇺🇿 O'zbek", callback_data: 'lang_uz' },
          { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
          { text: '🇬🇧 English', callback_data: 'lang_en' }
        ]]
      }
    });
    return;
  }

  // === USER: MENYU ===
  if (text === '📚 Menyu') {
    await showUserMenu(chatId, userId);
    return;
  }

  // === USER: KANAL ===
  if (text === '📢 Kanal') {
    await bot.sendMessage(chatId, `📢 Kanalimiz:\n👉 https://t.me/${TG_CHANNEL.replace('@','')}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '📢 Kanalga o\'tish', url: `https://t.me/${TG_CHANNEL.replace('@','')}` }]]
      }
    });
    return;
  }

  // === USER: HOLAT ===
  if (text === '📊 Mening holatim') {
    const isSub = await checkSub(userId);
    user.subscribed = isSub;
    const t = getLangText(user.lang);
    await bot.sendMessage(chatId,
      `📊 *Sizning holatim*\n\n` +
      `👤 ID: ${userId}\n` +
      `📢 Obuna: ${isSub ? '✅ Ha' : '❌ Yo\'q'}\n` +
      `🤖 AI savollar: ${user.questions}/${FREE_QUESTIONS} (bepul)\n` +
      `🌐 Til: ${user.lang || 'uz'}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // === USER: AI CHAT ===
  if (text === '🤖 AI Chat') {
    const t = getLangText(user.lang);
    const isSub = await checkSub(userId);
    user.subscribed = isSub;

    if (!isSub && user.questions >= FREE_QUESTIONS) {
      await bot.sendMessage(chatId, t.limitMsg, {
        reply_markup: {
          inline_keyboard: [[{ text: t.subBtn, url: `https://t.me/${TG_CHANNEL.replace('@','')}` }]]
        }
      });
      return;
    }

    await bot.sendMessage(chatId,
      `🤖 *AI Chat* ${isSub ? '✅' : `(${FREE_QUESTIONS - user.questions} ta bepul savol)`}\n\nIstalgan savol yozing — javob beraman!`,
      { parse_mode: 'Markdown' }
    );
    user.aiMode = true;
    return;
  }

  // === AI CHAT MODE ===
  if (user.aiMode) {
    const t = getLangText(user.lang);
    const isSub = user.subscribed || await checkSub(userId);
    user.subscribed = isSub;

    // Limit tekshirish
    if (!isSub && user.questions >= FREE_QUESTIONS) {
      user.aiMode = false;
      await bot.sendMessage(chatId, t.limitMsg, {
        reply_markup: {
          inline_keyboard: [[{ text: t.subBtn, url: `https://t.me/${TG_CHANNEL.replace('@','')}` }]]
        }
      });
      return;
    }

    // Warning
    if (!isSub && user.questions === FREE_QUESTIONS - 1) {
      await bot.sendMessage(chatId, t.freeMsg(user.questions));
    }

    // AI ga yuborish
    const thinking = await bot.sendMessage(chatId, t.thinking);
    
    user.history.push({ role: 'user', content: text });
    const reply = await askClaude(user.history, user.lang);
    
    await bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
    
    if (reply) {
      user.history.push({ role: 'assistant', content: reply });
      user.questions++;
      await bot.sendMessage(chatId, reply);
    } else {
      await bot.sendMessage(chatId, t.error);
    }
    return;
  }
});

// ===================================================
// CALLBACK QUERIES
// ===================================================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const username = query.from.username || '';
  const data = query.data;
  const user = getUser(userId);

  // Til tanlash
  if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');
    user.lang = lang;
    const flags = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' };
    await bot.answerCallbackQuery(query.id, { text: `${flags[lang]} Til o'zgartirildi!` });
    await bot.sendMessage(chatId, `${flags[lang]} Til saqlandi!`);
    return;
  }

  // Menyu elementi
  if (data.startsWith('menu_')) {
    const itemId = parseInt(data.replace('menu_', ''));
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return bot.answerCallbackQuery(query.id);

    await bot.answerCallbackQuery(query.id);

    if (item.type === 'text') {
      await bot.sendMessage(chatId, `${item.emoji} *${item.title}*\n\n${item.content}`, { parse_mode: 'Markdown' });
    } else if (item.type === 'video' || item.type === 'link') {
      await bot.sendMessage(chatId, `${item.emoji} *${item.title}*\n\n👉 ${item.url}`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: `${item.emoji} Ochish`, url: item.url }]] }
      });
    }
    return;
  }

  // Admin menyu o'chirish
  if (data.startsWith('del_menu_') && isOwner(username)) {
    const itemId = parseInt(data.replace('del_menu_', ''));
    menuItems = menuItems.filter(i => i.id !== itemId);
    await bot.answerCallbackQuery(query.id, { text: '🗑 O\'chirildi!' });
    await bot.editMessageText('✅ Element o\'chirildi', { chat_id: chatId, message_id: query.message.message_id });
    return;
  }

  // Instagram recheck
  if (data === 'recheck_ig') {
    await bot.answerCallbackQuery(query.id, { text: 'Tekshirilmoqda...' });
    const isSub = await checkSub(userId);
    if (isSub) {
      await bot.sendMessage(chatId, `✅ Tasdiqlandi!\nHavola: ${igRules[0].tgLink}`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Hali obuna bo\'lmagansiz!', show_alert: true });
    }
    return;
  }

  // Obuna tekshirish
  if (data === 'check_sub') {
    const isSub = await checkSub(userId);
    user.subscribed = isSub;
    if (isSub) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Tasdiqlandi!' });
      const name = query.from.first_name || 'Do\'stim';
      await sendMainMenu(chatId, name, true, user.lang);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Hali obuna bo\'lmagansiz!', show_alert: true });
    }
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// ===================================================
// MENYU SHOW
// ===================================================

async function showUserMenu(chatId, userId) {
  if (!menuItems.length) {
    await bot.sendMessage(chatId, '📚 Menyu hozircha bo\'sh.');
    return;
  }
  const buttons = menuItems.map(item => ([{
    text: `${item.emoji} ${item.title}`,
    callback_data: `menu_${item.id}`
  }]));
  await bot.sendMessage(chatId, '📚 *Menyu*\nKerakli bo\'limni tanlang:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showAdminMenu(chatId) {
  if (!menuItems.length) {
    await bot.sendMessage(chatId, '📚 Menyu bo\'sh. Mini App da qo\'shing!', {
      reply_markup: { inline_keyboard: [[{ text: '➕ Qo\'shish', web_app: { url: MINI_APP_URL } }]] }
    });
    return;
  }
  for (const item of menuItems) {
    await bot.sendMessage(chatId,
      `${item.emoji} *${item.title}*\nTuri: ${item.type}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🗑 O\'chirish', callback_data: `del_menu_${item.id}` }]] }
      }
    );
  }
  await bot.sendMessage(chatId, '➕ Yangi element qo\'shish:', {
    reply_markup: { inline_keyboard: [[{ text: '➕ Qo\'shish', web_app: { url: MINI_APP_URL } }]] }
  });
}

// ===================================================
// INSTAGRAM WEBHOOK
// ===================================================

app.get('/webhook/instagram', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
});

app.post('/webhook/instagram', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;
  if (!body.entry) return;
  for (const entry of body.entry) {
    if (!entry.changes) continue;
    for (const change of entry.changes) {
      if (change.field === 'comments') {
        const text = (change.value?.text || '').toLowerCase().trim();
        const senderId = change.value?.from?.id;
        const rule = igRules.find(r => r.keywords.some(k => text.includes(k)));
        if (rule && senderId) {
          pendingIG.set(senderId, { rule });
          await sendInstaDM(senderId, rule.dmFirst);
        }
      }
      if (change.field === 'messages') {
        const senderId = change.value?.sender?.id;
        const text = (change.value?.message?.text || '').toLowerCase().trim();
        const rule = igRules.find(r => r.keywords.some(k => text.includes(k)));
        if (rule && senderId) {
          pendingIG.set(senderId, { rule });
          await sendInstaDM(senderId, rule.dmFirst);
        }
      }
    }
  }
});

async function sendInstaDM(userId, message) {
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  if (!token || !igUserId) return;
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`https://graph.instagram.com/v21.0/${igUserId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: userId }, message: { text: message }, access_token: token })
    });
  } catch (e) { console.error('IG DM xato:', e.message); }
}

// ===================================================
// API (Mini App uchun)
// ===================================================

app.get('/api/menu', (req, res) => res.json(menuItems));

app.post('/api/menu', (req, res) => {
  const { title, type, content, url, emoji } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'title va type kerak' });
  const item = { id: Date.now(), title, type, content: content || '', url: url || '', emoji: emoji || '📌' };
  menuItems.push(item);
  res.json(item);
});

app.delete('/api/menu/:id', (req, res) => {
  menuItems = menuItems.filter(i => i.id != req.params.id);
  res.json({ ok: true });
});

app.get('/api/igrules', (req, res) => res.json(igRules));
app.post('/api/igrules', (req, res) => {
  const rule = { id: Date.now(), ...req.body };
  igRules.push(rule);
  res.json(rule);
});
app.delete('/api/igrules/:id', (req, res) => { igRules = igRules.filter(r => r.id != req.params.id); res.json({ ok: true }); });

app.get('/api/stats', (req, res) => res.json({
  users: users.size,
  menuItems: menuItems.length,
  igRules: igRules.length,
  igConnected: !!process.env.IG_ACCESS_TOKEN,
  aiConnected: !!ANTHROPIC_API_KEY
}));

app.get('/test/sub/:userId', async (req, res) => {
  const result = await checkSub(req.params.userId);
  res.json({ userId: req.params.userId, subscribed: result });
});

app.get('/health', (req, res) => res.json({ ok: true, version: '6.0' }));

app.listen(PORT, () => {
  console.log(`✅ InstaBot AI v6.0 — port ${PORT}`);
  console.log(`👑 Owner: @${OWNER_USERNAME}`);
  console.log(`📢 Kanal: ${TG_CHANNEL}`);
  console.log(`🤖 AI: ${ANTHROPIC_API_KEY ? 'ulangan' : 'ulanmagan'}`);
});
