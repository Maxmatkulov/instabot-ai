// ============================================
//  InstaBot AI — v5.0
//  Instagram Comment → DM → Telegram Bot → Obuna tekshirish → Havola
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-server.com';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'instabot_verify_123';
const TG_CHANNEL = process.env.TG_CHANNEL || '@mashrabbekmaxmatkulov';
const TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || 'mmnchat_bot';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// pending: instagram_user_id → { rule, igUsername }
const pendingIG = new Map();

// Telegram user_id → instagram_user_id (bog'lash)
const tgToIG = new Map();

// Qoidalar
let rules = [
  {
    id: 1,
    name: 'Kanal havolasi',
    keywords: ['1', 'link', 'havola', 'info', '+'],
    tgChannel: TG_CHANNEL,
    tgLink: 'https://t.me/mashrabbekmaxmatkulov',
    dmFirst: `Assalomu alaykum! 👋\n\nHavolani olish uchun:\n\n1️⃣ Telegram kanalimizga obuna bo'ling:\n👉 https://t.me/mashrabbekmaxmatkulov\n\n2️⃣ Keyin botimizga boring va /start bosing:\n👉 https://t.me/${TG_BOT_USERNAME}?start=check\n\nBot avtomatik tekshiradi va havolani yuboradi! ✅`,
    dmSuccess: `✅ Obunangiz tasdiqlandi!\n\nMana havola:\n👉 https://t.me/mashrabbekmaxmatkulov\n\nSavolingiz bo'lsa yozing! 😊`,
    dmFail: `❌ Siz hali kanalga obuna bo'lmagansiz.\n\nAvval obuna bo'ling:\n👉 https://t.me/mashrabbekmaxmatkulov\n\nKeyin botga /start yuboring:\n👉 https://t.me/${TG_BOT_USERNAME}?start=check`
  }
];

// ===================================================
// TELEGRAM BOT — Asosiy tekshirish
// ===================================================

bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name || 'Do\'stim';
  const param = (match[1] || '').trim().replace('_', '');

  // /start check — Instagram dan kelgan foydalanuvchi
  if (param === 'check' || param.startsWith('check')) {
    // Kanal obunasini tekshirish
    const isSubscribed = await checkSub(userId, TG_CHANNEL);

    if (isSubscribed) {
      await bot.sendMessage(chatId,
        `✅ *Rahmat, ${name}!*\n\nObunangiz tasdiqlandi!\n\nInstagram DM ingizga havola yuborildi 📩`,
        { parse_mode: 'Markdown' }
      );

      // Instagram ga DM yuborish
      const igUserId = tgToIG.get(userId.toString());
      if (igUserId) {
        const pending = pendingIG.get(igUserId);
        const rule = pending?.rule || rules[0];
        await sendInstaDM(igUserId, rule.dmSuccess);
        pendingIG.delete(igUserId);
        tgToIG.delete(userId.toString());
      } else {
        // Instagram ID yo'q — havola shu yerda berish
        await bot.sendMessage(chatId,
          `🎁 *Mana havola:*\n\n👉 ${rules[0].tgLink}\n\nSavolingiz bo'lsa yozing!`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await bot.sendMessage(chatId,
        `❌ *Siz hali obuna bo'lmagansiz!*\n\nAvval kanalga obuna bo'ling:\n👉 ${TG_CHANNEL}\n\nKeyin /start yuboring!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📢 Kanalga obuna bo\'lish', url: `https://t.me/${TG_CHANNEL.replace('@', '')}` }
            ], [
              { text: '✅ Obuna bo\'ldim, tekshir', callback_data: 'recheck' }
            ]]
          }
        }
      );
    }
  } else {
    // Oddiy /start
    await bot.sendMessage(chatId,
      `👋 Salom, *${name}*!\n\n🤖 *InstaBot AI*\n\nInstagram postlaridagi kommentlarga avtomatik javob berish tizimi.\n\nIlovani oching 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 InstaBot AI ochish', web_app: { url: MINI_APP_URL } }
          ]]
        }
      }
    );
  }
});

// "Obuna bo'ldim, tekshir" tugmasi
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'recheck') {
    await bot.answerCallbackQuery(query.id, { text: 'Tekshirilmoqda...' });
    const isSubscribed = await checkSub(userId, TG_CHANNEL);

    if (isSubscribed) {
      await bot.sendMessage(chatId,
        `✅ *Tasdiqlandi!*\n\nMana havola:\n👉 ${rules[0].tgLink}`,
        { parse_mode: 'Markdown' }
      );

      // Instagram DM
      const igUserId = tgToIG.get(userId.toString());
      if (igUserId) {
        const pending = pendingIG.get(igUserId);
        const rule = pending?.rule || rules[0];
        await sendInstaDM(igUserId, rule.dmSuccess);
        pendingIG.delete(igUserId);
        tgToIG.delete(userId.toString());
      }
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Hali obuna bo\'lmagansiz!',
        show_alert: true
      });
    }
  }
});

// Kanal obunasini tekshirish (user ID bilan — ishonchli)
async function checkSub(userId, channel) {
  try {
    const member = await bot.getChatMember(channel, userId);
    const status = member.status;
    console.log(`📊 User ${userId} status: ${status}`);
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (err) {
    console.log(`⚠️ checkSub xato: ${err.message}`);
    return false;
  }
}

// ===================================================
// INSTAGRAM WEBHOOK
// ===================================================

app.get('/webhook/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook/instagram', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;
  if (!body.entry) return;

  for (const entry of body.entry) {
    if (!entry.changes) continue;
    for (const change of entry.changes) {

      // KOMMENT
      if (change.field === 'comments') {
        const commentText = (change.value?.text || '').toLowerCase().trim();
        const senderId = change.value?.from?.id;
        const senderName = change.value?.from?.username || '';
        console.log(`💬 Komment: "${commentText}" @${senderName}`);

        const rule = findRule(commentText);
        if (rule && senderId) {
          pendingIG.set(senderId, { rule, username: senderName });
          await sendInstaDM(senderId, rule.dmFirst);
        }
      }

      // DM
      if (change.field === 'messages') {
        const senderId = change.value?.sender?.id;
        const senderName = change.value?.sender?.username || '';
        const msgText = (change.value?.message?.text || '').toLowerCase().trim();
        console.log(`📩 DM: "${msgText}" @${senderName}`);

        const rule = findRule(msgText);
        if (rule && senderId) {
          pendingIG.set(senderId, { rule, username: senderName });
          await sendInstaDM(senderId, rule.dmFirst);
        }
      }
    }
  }
});

function findRule(text) {
  return rules.find(r =>
    r.keywords.some(kw => text.includes(kw.toLowerCase()))
  ) || null;
}

async function sendInstaDM(userId, message) {
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  if (!token || !igUserId) {
    console.log('⚠️ IG token yo\'q');
    return;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: userId },
          message: { text: message },
          access_token: token
        })
      }
    );
    const data = await res.json();
    if (data.error) console.error('❌ IG DM xato:', data.error.message);
    else console.log('✅ DM yuborildi');
  } catch (err) {
    console.error('❌ DM xato:', err.message);
  }
}

// ===================================================
// TEST ENDPOINTS
// ===================================================

// Telegram obuna test (user ID bilan)
app.get('/test/sub/:userId', async (req, res) => {
  const userId = req.params.userId;
  const channel = req.query.channel || TG_CHANNEL;
  const result = await checkSub(userId, channel);
  res.json({
    userId, channel,
    subscribed: result,
    message: result ? '✅ Obuna bor' : '❌ Obuna yo\'q'
  });
});

// Botga /start bosish simulation
app.get('/test/tg-link', (req, res) => {
  res.json({
    botLink: `https://t.me/${TG_BOT_USERNAME}?start=check`,
    channel: TG_CHANNEL,
    message: 'Foydalanuvchi shu linkni bosadi → bot tekshiradi'
  });
});

// ===================================================
// API
// ===================================================

app.get('/api/rules', (req, res) => res.json(rules));

app.post('/api/rules', (req, res) => {
  const { name, keywords, tgChannel, tgLink, dmFirst, dmSuccess, dmFail } = req.body;
  if (!name || !keywords) return res.status(400).json({ error: 'name va keywords kerak' });
  const rule = {
    id: Date.now(), name, keywords,
    tgChannel: tgChannel || TG_CHANNEL,
    tgLink: tgLink || rules[0].tgLink,
    dmFirst: dmFirst || rules[0].dmFirst,
    dmSuccess: dmSuccess || rules[0].dmSuccess,
    dmFail: dmFail || rules[0].dmFail
  };
  rules.push(rule);
  res.json(rule);
});

app.delete('/api/rules/:id', (req, res) => {
  rules = rules.filter(r => r.id != req.params.id);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  res.json({
    rules: rules.length,
    pendingIG: pendingIG.size,
    igConnected: !!process.env.IG_ACCESS_TOKEN,
    tgChannel: TG_CHANNEL,
    botUsername: TG_BOT_USERNAME
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Server port ${PORT}`);
  console.log(`📢 Kanal: ${TG_CHANNEL}`);
  console.log(`🤖 Bot: @${TG_BOT_USERNAME}`);
});
