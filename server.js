// ============================================
//  InstaBot AI — v4.0
//  Instagram Comment → DM → Telegram obuna tekshirish → Havola
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-server.com';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'instabot_verify_123';
const TG_CHANNEL = process.env.TG_CHANNEL || '@mashrabbekmaxmatkulov';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Pending users: instagram_user_id → { tgUsername, rule, tries }
const pendingUsers = new Map();

// Qoidalar
let rules = [
  {
    id: 1,
    name: 'Kanal havolasi',
    keywords: ['1', 'link', 'havola', 'info', '+'],
    tgChannel: TG_CHANNEL,
    tgLink: 'https://t.me/mashrabbekmaxmatkulov',
    dmFirst: `Assalomu alaykum! 👋\n\nHavolani olish uchun avval Telegram kanalimizga obuna bo'ling:\n👉 https://t.me/mashrabbekmaxmatkulov\n\nObuna bo'lgach pastdagi tugmani bosing 👇`,
    dmSuccess: `✅ Rahmat! Obunangiz tasdiqlandi!\n\nMana havola:\n👉 https://t.me/mashrabbekmaxmatkulov\n\nSavolingiz bo'lsa yozing! 😊`,
    dmFail: `❌ Siz hali kanalga obuna bo'lmagansiz.\n\nAvval obuna bo'ling:\n👉 https://t.me/mashrabbekmaxmatkulov\n\nKeyin "✅ Obuna bo'ldim" tugmasini bosing!`
  }
];

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

      // === KOMMENT ===
      if (change.field === 'comments') {
        const commentText = (change.value?.text || '').toLowerCase().trim();
        const senderId = change.value?.from?.id;
        const senderName = change.value?.from?.username || '';
        console.log(`💬 Komment: "${commentText}" @${senderName}`);

        const rule = findRule(commentText);
        if (rule && senderId) {
          pendingUsers.set(senderId, { rule, username: senderName, tgUsername: null });
          await sendInstaDM(senderId, rule.dmFirst, [
            { title: '✅ Obuna bo\'ldim', payload: `SUBSCRIBED_${rule.id}` }
          ]);
        }
      }

      // === DM ===
      if (change.field === 'messages') {
        const senderId = change.value?.sender?.id;
        const senderName = change.value?.sender?.username || '';
        const payload = change.value?.message?.quick_reply?.payload || '';
        const msgText = (change.value?.message?.text || '').toLowerCase().trim();

        // "Obuna bo'ldim" tugmasi
        if (payload.startsWith('SUBSCRIBED_')) {
          const ruleId = parseInt(payload.split('_')[1]);
          const rule = rules.find(r => r.id === ruleId)
            || pendingUsers.get(senderId)?.rule
            || rules[0];

          console.log(`🔍 Obuna tekshirish: @${senderName}`);

          // Telegram username so'rash
          await sendInstaDM(senderId,
            `📱 Telegram usernamingizni yuboring\n(masalan: @username)\n\nBu orqali obunangizni tekshiramiz.`,
            []
          );
          pendingUsers.set(senderId, {
            ...pendingUsers.get(senderId),
            rule,
            waitingTg: true
          });
        }

        // Telegram username keldi
        else if (msgText && pendingUsers.get(senderId)?.waitingTg) {
          const pending = pendingUsers.get(senderId);
          const rule = pending.rule || rules[0];

          let tgUsername = msgText.replace('@', '').trim();
          console.log(`📱 Telegram username: @${tgUsername}`);

          // Telegram obunani tekshirish
          const isSubscribed = await checkTelegramSub(tgUsername, rule.tgChannel);

          if (isSubscribed) {
            await sendInstaDM(senderId, rule.dmSuccess, []);
            pendingUsers.delete(senderId);
            console.log(`✅ @${senderName} obuna tasdiqlandi`);
          } else {
            await sendInstaDM(senderId, rule.dmFail, [
              { title: '✅ Obuna bo\'ldim', payload: `SUBSCRIBED_${rule.id}` }
            ]);
            console.log(`❌ @${senderName} obuna yo'q`);
          }
        }

        // Oddiy kalit so'z
        else if (msgText && !pendingUsers.get(senderId)?.waitingTg) {
          const rule = findRule(msgText);
          if (rule) {
            pendingUsers.set(senderId, { rule, username: senderName, waitingTg: false });
            await sendInstaDM(senderId, rule.dmFirst, [
              { title: '✅ Obuna bo\'ldim', payload: `SUBSCRIBED_${rule.id}` }
            ]);
          }
        }
      }
    }
  }
});

// ===================================================
// HELPERS
// ===================================================

function findRule(text) {
  return rules.find(r =>
    r.keywords.some(kw => text.includes(kw.toLowerCase()))
  ) || null;
}

// Telegram kanal obunasini tekshirish
async function checkTelegramSub(tgUsername, channel) {
  try {
    const member = await bot.getChatMember(channel, '@' + tgUsername);
    const status = member.status;
    console.log(`📊 @${tgUsername} status: ${status}`);
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (err) {
    console.log(`⚠️ Telegram tekshirish xato: ${err.message}`);
    // Username topilmasa yoki xato bo'lsa
    return false;
  }
}

// Instagram DM yuborish
async function sendInstaDM(userId, message, quickReplies = []) {
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  if (!token || !igUserId) {
    console.log('⚠️ IG token yo\'q — demo mode');
    return;
  }

  const body = {
    recipient: { id: userId },
    message: { text: message },
    access_token: token
  };

  if (quickReplies.length > 0) {
    body.message.quick_replies = quickReplies.map(q => ({
      content_type: 'text',
      title: q.title,
      payload: q.payload
    }));
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
// TEST ENDPOINT — O'zimiz sinab ko'rish uchun
// ===================================================

// Telegram obunani test qilish
app.get('/test/sub/:username', async (req, res) => {
  const username = req.params.username;
  const channel = req.query.channel || TG_CHANNEL;
  const result = await checkTelegramSub(username, channel);
  res.json({
    username,
    channel,
    subscribed: result,
    message: result ? '✅ Obuna bor' : '❌ Obuna yo\'q'
  });
});

// Fake komment — test uchun
app.post('/test/comment', async (req, res) => {
  const { text, userId, username } = req.body;
  const rule = findRule((text || '1').toLowerCase());
  if (!rule) return res.json({ ok: false, message: 'Qoida topilmadi' });

  pendingUsers.set(userId || 'test123', { rule, username: username || 'test_user', waitingTg: false });
  res.json({
    ok: true,
    message: 'Komment qabul qilindi',
    dmWillSend: rule.dmFirst,
    rule: rule.name
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
    tgLink: tgLink || 'https://t.me/mashrabbekmaxmatkulov',
    dmFirst: dmFirst || `Kanalga obuna bo'ling: ${tgLink || 'https://t.me/mashrabbekmaxmatkulov'}`,
    dmSuccess: dmSuccess || `✅ Tasdiqlandi! Havola: ${tgLink || 'https://t.me/mashrabbekmaxmatkulov'}`,
    dmFail: dmFail || `❌ Obuna topilmadi. Avval obuna bo'ling.`
  };
  rules.push(rule);
  res.json(rule);
});

app.delete('/api/rules/:id', (req, res) => {
  rules = rules.filter(r => r.id != req.params.id);
  res.json({ ok: true });
});

app.post('/api/instagram/connect', (req, res) => {
  const { accessToken, userId, username } = req.body;
  process.env.IG_ACCESS_TOKEN = accessToken;
  process.env.IG_USER_ID = userId;
  console.log(`📸 Instagram ulandi: @${username}`);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  res.json({
    rules: rules.length,
    pending: pendingUsers.size,
    igConnected: !!process.env.IG_ACCESS_TOKEN,
    tgChannel: TG_CHANNEL
  });
});

// ===================================================
// TELEGRAM BOT
// ===================================================

bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'Do\'stim';
  bot.sendMessage(msg.chat.id,
    `👋 Salom, *${name}*!\n\n🤖 *InstaBot AI v4.0*\n\n` +
    `📌 *Tizim:*\n` +
    `1️⃣ Postga "1 yozing" daysiz\n` +
    `2️⃣ Kimdir "1" yozsa → DM boradi\n` +
    `3️⃣ Telegram username so'raldi\n` +
    `4️⃣ Bot kanal obunasini tekshiradi ✅\n` +
    `5️⃣ Obuna bo'lsa → Havola beradi 🎯`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 InstaBot AI ochish', web_app: { url: MINI_APP_URL } }
        ]]
      }
    }
  );
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📊 *Holat*\n\n` +
    `✅ Server: Ishlayapti\n` +
    `📸 Instagram: ${process.env.IG_ACCESS_TOKEN ? '✅ Ulangan' : '❌ Ulanmagan'}\n` +
    `📢 Kanal: ${TG_CHANNEL}\n` +
    `⚡ Qoidalar: ${rules.length} ta\n` +
    `⏳ Kutayotganlar: ${pendingUsers.size} ta`,
    { parse_mode: 'Markdown' }
  );
});

// ===================================================
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Server port ${PORT}`);
  console.log(`📢 Kanal: ${TG_CHANNEL}`);
  console.log(`📡 Webhook: ${MINI_APP_URL}/webhook/instagram`);
});
