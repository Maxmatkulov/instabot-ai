// InstaBot AI v7.0 — Webhook mode (polling yo'q)

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINI_APP_URL = process.env.MINI_APP_URL || '';
const TG_CHANNEL = process.env.TG_CHANNEL || '@mashrabbekmaxmatkulov';
const TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || 'mmnchat_bot';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PORT = process.env.PORT || 3000;
const OWNER_USERNAME = 'mmn0300';
const FREE_QUESTIONS = 3;

// Webhook mode — polling: false
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const app = express();
app.use(express.json());

// Storage
const users = new Map();
const MENU_FILE = './menu.json';

function loadMenu() {
  try {
    if (fs.existsSync(MENU_FILE)) return JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
  } catch(e) {}
  return [
    { id: 1, title: 'Darslik #1', type: 'text', content: 'Bu yerda darslik matni...', emoji: '📚' },
    { id: 2, title: 'Kanal', type: 'link', url: `https://t.me/${TG_CHANNEL.replace('@','')}`, emoji: '📢' }
  ];
}

function saveMenu(items) {
  try { fs.writeFileSync(MENU_FILE, JSON.stringify(items, null, 2)); } catch(e) {}
}

let menuItems = loadMenu();
let igRules = [{
  id: 1, name: 'Havola',
  keywords: ['1', 'link', 'havola', '+'],
  tgLink: `https://t.me/${TG_CHANNEL.replace('@','')}`,
  dmFirst: `Salom! 👋\nHavolani olish uchun:\n1. Kanalga obuna: https://t.me/${TG_CHANNEL.replace('@','')}\n2. Botga /start yuboring: https://t.me/${TG_BOT_USERNAME}?start=check`,
  dmSuccess: `✅ Tasdiqlandi!\nHavola: https://t.me/${TG_CHANNEL.replace('@','')}`,
  dmFail: `❌ Obuna topilmadi.\nKanalga obuna bo'ling: https://t.me/${TG_CHANNEL.replace('@','')}`
}];
const pendingIG = new Map();

function getUser(id) {
  if (!users.has(id)) users.set(id, { questions: 0, history: [], lang: 'uz', subscribed: false, aiMode: false });
  return users.get(id);
}

function isOwner(u) { return (u||'').toLowerCase() === OWNER_USERNAME; }

async function checkSub(userId) {
  try {
    const m = await bot.getChatMember(TG_CHANNEL, userId);
    return ['member','administrator','creator'].includes(m.status);
  } catch(e) { return false; }
}

async function askClaude(history, lang) {
  if (!ANTHROPIC_API_KEY) return 'AI ulanmagan.';
  const sys = { uz: "O'zbek tilida qisqa va foydali javob ber.", ru: "Отвечай кратко на русском.", en: "Reply briefly in English." }[lang] || "Reply briefly.";
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:800, system:sys, messages:history.slice(-8) })
    });
    const d = await r.json();
    return d.content?.[0]?.text || 'Javob olishda xato.';
  } catch(e) { return 'AI xato: ' + e.message; }
}

async function sendInstaDM(userId, message) {
  const token = process.env.IG_ACCESS_TOKEN;
  const igId = process.env.IG_USER_ID;
  if (!token || !igId) return;
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`https://graph.instagram.com/v21.0/${igId}/messages`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ recipient:{id:userId}, message:{text:message}, access_token:token })
    });
  } catch(e) {}
}

// Telegram webhook endpoint
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set webhook
async function setWebhook() {
  const url = `${MINI_APP_URL}/webhook/${BOT_TOKEN}`;
  try {
    await bot.setWebHook(url);
    console.log('✅ Webhook set:', url);
  } catch(e) {
    console.log('❌ Webhook xato:', e.message);
  }
}

// BOT HANDLERS
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const name = msg.from.first_name || 'Do\'stim';
  const param = (match[1]||'').trim();
  const user = getUser(userId);

  if (isOwner(username)) {
    return bot.sendMessage(chatId, `👑 Salom, *${name}!*\n🔐 Admin panel`, {
      parse_mode: 'Markdown',
      reply_markup: { keyboard: [
        [{ text: '🚀 Mini App', web_app: { url: MINI_APP_URL } }],
        [{ text: '📊 Statistika' }, { text: '📚 Menyu' }],
        [{ text: '⚙️ Sozlamalar' }]
      ], resize_keyboard: true }
    });
  }

  if (param === 'check') {
    const isSub = await checkSub(userId);
    if (isSub) {
      user.subscribed = true;
      await bot.sendMessage(chatId, `✅ *Rahmat, ${name}!*\nObuna tasdiqlandi!\nDM ga havola yuborildi 📩`, { parse_mode: 'Markdown' });
      const igId = [...pendingIG.entries()].find(([,v]) => v.tgUserId === userId)?.[0];
      if (igId) {
        await sendInstaDM(igId, igRules[0].dmSuccess);
        pendingIG.delete(igId);
      } else {
        await bot.sendMessage(chatId, `🎁 Havola:\n👉 ${igRules[0].tgLink}`);
      }
    } else {
      await bot.sendMessage(chatId, `❌ Obuna topilmadi!\n\nKanalga obuna bo'ling:`, {
        reply_markup: { inline_keyboard: [
          [{ text: '📢 Obuna bo\'lish', url: `https://t.me/${TG_CHANNEL.replace('@','')}` }],
          [{ text: '✅ Tekshirish', callback_data: 'recheck' }]
        ]}
      });
    }
    return;
  }

  const isSub = await checkSub(userId);
  user.subscribed = isSub;
  bot.sendMessage(chatId, `👋 Salom, *${name}!*\n\n🤖 AI yordamchi botga xush kelibsiz!\n${isSub ? '✅ Obuna tasdiqlandi' : ''}`, {
    parse_mode: 'Markdown',
    reply_markup: { keyboard: [
      [{ text: '🤖 AI Chat' }, { text: '📚 Menyu' }],
      [{ text: '🌐 Til' }, { text: '📊 Holatim' }],
      [{ text: '📢 Kanal' }]
    ], resize_keyboard: true }
  });
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const text = msg.text;
  const user = getUser(userId);

  // OWNER
  if (isOwner(username)) {
    if (text === '📊 Statistika') {
      return bot.sendMessage(chatId, `📊 *Statistika*\n👥 Users: ${users.size}\n📚 Menyu: ${menuItems.length}\n🤖 AI: ${ANTHROPIC_API_KEY?'✅':'❌'}\n📸 IG: ${process.env.IG_ACCESS_TOKEN?'✅':'❌'}`, { parse_mode:'Markdown' });
    }
    if (text === '📚 Menyu') {
      if (!menuItems.length) return bot.sendMessage(chatId, 'Menyu bo\'sh!');
      for (const item of menuItems) {
        await bot.sendMessage(chatId, `${item.emoji} *${item.title}* (${item.type})`, {
          parse_mode:'Markdown',
          reply_markup: { inline_keyboard: [[{ text:'🗑 O\'chirish', callback_data:`del_${item.id}` }]] }
        });
      }
      return bot.sendMessage(chatId, '➕ Yangi element qo\'shish:', {
        reply_markup: { inline_keyboard: [[{ text:'➕ Qo\'shish', web_app:{ url: MINI_APP_URL } }]] }
      });
    }
    if (text === '⚙️ Sozlamalar') {
      return bot.sendMessage(chatId, `⚙️ *Sozlamalar*\n📢 Kanal: ${TG_CHANNEL}\n🆓 Bepul: ${FREE_QUESTIONS} savol`, { parse_mode:'Markdown' });
    }
    return;
  }

  // USER
  if (text === '🌐 Til') {
    return bot.sendMessage(chatId, 'Tilni tanlang:', { reply_markup: { inline_keyboard: [[
      { text:'🇺🇿 O\'zbek', callback_data:'lang_uz' },
      { text:'🇷🇺 Русский', callback_data:'lang_ru' },
      { text:'🇬🇧 English', callback_data:'lang_en' }
    ]]}});
  }

  if (text === '📚 Menyu') {
    if (!menuItems.length) return bot.sendMessage(chatId, '📚 Menyu hozircha bo\'sh.');
    const buttons = menuItems.map(i => [{ text:`${i.emoji} ${i.title}`, callback_data:`menu_${i.id}` }]);
    return bot.sendMessage(chatId, '📚 *Menyu*', { parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }});
  }

  if (text === '📢 Kanal') {
    return bot.sendMessage(chatId, `📢 Kanalimiz:`, { reply_markup:{ inline_keyboard:[[
      { text:'📢 Kanalga o\'tish', url:`https://t.me/${TG_CHANNEL.replace('@','')}` }
    ]]}});
  }

  if (text === '📊 Holatim') {
    const isSub = await checkSub(userId);
    user.subscribed = isSub;
    return bot.sendMessage(chatId, `📊 *Holatim*\n📢 Obuna: ${isSub?'✅':'❌'}\n🤖 AI savollar: ${user.questions}/${FREE_QUESTIONS}\n🌐 Til: ${user.lang}`, { parse_mode:'Markdown' });
  }

  if (text === '🤖 AI Chat') {
    const isSub = await checkSub(userId);
    user.subscribed = isSub;
    if (!isSub && user.questions >= FREE_QUESTIONS) {
      return bot.sendMessage(chatId, `🔒 Bepul savollar tugadi!\n\nDavom etish uchun kanalga obuna bo'ling:`, {
        reply_markup:{ inline_keyboard:[[{ text:'📢 Obuna bo\'lish', url:`https://t.me/${TG_CHANNEL.replace('@','')}` }]]}
      });
    }
    user.aiMode = true;
    const left = isSub ? '∞' : (FREE_QUESTIONS - user.questions);
    return bot.sendMessage(chatId, `🤖 *AI Chat* ${isSub?'✅':'⚠️'}\n${isSub?'Cheksiz':'Qolgan: '+left+' ta'} savol\n\nSavolingizni yozing!`, { parse_mode:'Markdown' });
  }

  // AI MODE
  if (user.aiMode) {
    const isSub = user.subscribed || await checkSub(userId);
    user.subscribed = isSub;

    if (!isSub && user.questions >= FREE_QUESTIONS) {
      user.aiMode = false;
      return bot.sendMessage(chatId, `🔒 Limit tugadi! Obuna bo'ling:`, {
        reply_markup:{ inline_keyboard:[[{ text:'📢 Obuna bo\'lish', url:`https://t.me/${TG_CHANNEL.replace('@','')}` }]]}
      });
    }

    if (!isSub && user.questions === FREE_QUESTIONS - 1) {
      await bot.sendMessage(chatId, `⚠️ Bu oxirgi bepul savolingiz!`);
    }

    const thinking = await bot.sendMessage(chatId, '🤔 ...');
    user.history.push({ role:'user', content: text });
    const reply = await askClaude(user.history, user.lang);
    await bot.deleteMessage(chatId, thinking.message_id).catch(()=>{});
    user.history.push({ role:'assistant', content: reply });
    user.questions++;
    return bot.sendMessage(chatId, reply);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const username = query.from.username || '';
  const data = query.data;
  const user = getUser(userId);

  if (data.startsWith('lang_')) {
    user.lang = data.replace('lang_','');
    await bot.answerCallbackQuery(query.id, { text:'✅ Til saqlandi!' });
    return;
  }

  if (data.startsWith('menu_')) {
    const item = menuItems.find(i => i.id === parseInt(data.replace('menu_','')));
    await bot.answerCallbackQuery(query.id);
    if (!item) return;
    if (item.type === 'text') {
      await bot.sendMessage(chatId, `${item.emoji} *${item.title}*\n\n${item.content}`, { parse_mode:'Markdown' });
    } else if (item.type === 'video') {
      await bot.sendMessage(chatId, `${item.emoji} *${item.title}*\n\n🎬 Video:`, {
        parse_mode:'Markdown',
        reply_markup:{ inline_keyboard:[[{ text:`▶️ Videoni ko'rish`, url: item.url }]]}
      });
    } else {
      await bot.sendMessage(chatId, `${item.emoji} *${item.title}*`, {
        parse_mode:'Markdown',
        reply_markup:{ inline_keyboard:[[{ text:`${item.emoji} Ochish`, url: item.url }]]}
      });
    }
    return;
  }

  if (data.startsWith('del_') && isOwner(username)) {
    menuItems = menuItems.filter(i => i.id !== parseInt(data.replace('del_','')));
    await bot.answerCallbackQuery(query.id, { text:'🗑 O\'chirildi!' });
    return;
  }

  if (data === 'recheck') {
    const isSub = await checkSub(userId);
    if (isSub) {
      user.subscribed = true;
      await bot.answerCallbackQuery(query.id, { text:'✅ Tasdiqlandi!' });
      await bot.sendMessage(chatId, `✅ Tasdiqlandi!\nHavola: ${igRules[0].tgLink}`);
    } else {
      await bot.answerCallbackQuery(query.id, { text:'❌ Hali obuna bo\'lmagansiz!', show_alert:true });
    }
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// Instagram Webhook
app.get('/webhook/instagram', (req, res) => {
  const { 'hub.mode':mode, 'hub.verify_token':token, 'hub.challenge':challenge } = req.query;
  if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN||'instabot_verify_123')) res.send(challenge);
  else res.sendStatus(403);
});

app.post('/webhook/instagram', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (!body.entry) return;
  for (const entry of body.entry) {
    for (const change of (entry.changes||[])) {
      const text = (change.value?.text || change.value?.message?.text || '').toLowerCase();
      const senderId = change.value?.from?.id || change.value?.sender?.id;
      const rule = igRules.find(r => r.keywords.some(k => text.includes(k)));
      if (rule && senderId) {
        pendingIG.set(senderId, { rule });
        await sendInstaDM(senderId, rule.dmFirst);
      }
    }
  }
});

// API
app.get('/api/menu', (req, res) => res.json(menuItems));
app.post('/api/menu', (req, res) => {
  const { title, type, content, url, emoji } = req.body;
  if (!title||!type) return res.status(400).json({ error:'title va type kerak' });
  const item = { id:Date.now(), title, type, content:content||'', url:url||'', emoji:emoji||'📌' };
  menuItems.push(item);
  saveMenu(menuItems);
  res.json(item);
});
app.delete('/api/menu/:id', (req, res) => {
  menuItems = menuItems.filter(i => i.id != req.params.id);
  saveMenu(menuItems);
  res.json({ok:true});
});
app.get('/api/stats', (req, res) => res.json({ users:users.size, menuItems:menuItems.length, igConnected:!!process.env.IG_ACCESS_TOKEN, aiConnected:!!ANTHROPIC_API_KEY }));
app.get('/health', (req, res) => res.json({ ok:true, version:'7.0' }));

// Static fayllar — eng oxirida
app.use(express.static(__dirname));

app.listen(PORT, async () => {
  console.log(`✅ Server port ${PORT}`);
  await setWebhook();
});
