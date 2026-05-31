// ============================================
//  InstaBot AI — Telegram Bot + Express Server
//  npm install node-telegram-bot-api express
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

// === CONFIG — shu yerga o'z tokeningizni qo'ying ===
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-server.com'; // deploy qilgandan keyin
const PORT = process.env.PORT || 3000;

// ===================================================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // index.html shu joyda

// === /start command ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Do\'stim';

  bot.sendMessage(chatId,
    `👋 Salom, *${name}*!\n\n🤖 *InstaBot AI* — Instagram DM larini avtomatik boshqaring.\n\n` +
    `Quyidagi tugma orqali ilovani oching 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🚀 InstaBot AI ochish',
            web_app: { url: MINI_APP_URL }
          }
        ]]
      }
    }
  );
});

// === /help command ===
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *Yordam*\n\n` +
    `/start — Botni ishga tushirish\n` +
    `/status — Bot holati\n` +
    `/stop — Botni to'xtatish\n\n` +
    `Barcha sozlamalar Mini App ichida 👆`,
    { parse_mode: 'Markdown' }
  );
});

// === /status command ===
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📊 *Bot holati*\n\n✅ Server ishlayapti\n🕐 Vaqt: ${new Date().toLocaleString('uz')}`,
    { parse_mode: 'Markdown' }
  );
});

// === Express: Mini App serve ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === Health check ===
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// === Start server ===
app.listen(PORT, () => {
  console.log(`✅ Server port ${PORT} da ishlayapti`);
  console.log(`🤖 Telegram bot polling...`);
  console.log(`🌐 Mini App: ${MINI_APP_URL}`);
});
