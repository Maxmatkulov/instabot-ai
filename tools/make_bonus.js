// PRO bonusi: "30 ta viral reels mavzu bazasi" PDF. Ishga tushirish: node tools/make_bonus.js
const fs = require('fs');
const path = require('path');
const PDF = require('pdfkit');

const OUT = path.join(__dirname, '..', 'public', 'p', '9987536685696bbb0d142f89', 'viral-mavzu-30.pdf');
const F = path.join(__dirname, '..', 'fonts');
const INK = '#14213D', MUTED = '#5B6472', ACC = '#C8892B', CARD = '#F4F1EA', LINE = '#DDD6C8';

// [mavzu, hook (ekranda), nega yuradi, kalit so'z (namuna)]
const T = [
  ['Shartnoma imzolashdan oldin AI tekshiradi', 'Imzo qo\'yma. Avval buni 30 soniyada tekshir', 'foyda + qo\'rquv, hamma shartnoma imzolaydi', 'BAND'],
  ['Telefon kamerasi bilan har qanday yozuvni tarjima', 'Menyu, dori yo\'riqnomasi, hujjat: kamerani tut', 'kam kuch, yuqori foyda', 'LENS'],
  ['Uzun video, ma\'ruza yoki PDF dan 1 daqiqada konspekt', '2 soatlik darsni 1 daqiqada o\'qi', 'talaba, ishchi, hamma uchun', 'KONSPEKT'],
  ['Eski xira oilaviy suratni tiklash', 'Buvingizning eski surati. 10 soniyadan keyin', 'his-tuyg\'u, oldin/keyin', 'TIKLA'],
  ['AI ga hech qachon yozmaslik kerak bo\'lgan 5 narsa', 'ChatGPT ga buni yozdingmi? Xato qilding', 'qo\'rquv + shaxsiy xavfsizlik', 'MAXFIY'],
  ['AI bilan kuniga 10 daqiqada chet tili', 'Til kursiga pul to\'lama: shu prompt', 'doimiy talab', 'SUHBAT'],
  ['Xona rasmidan AI interyer (mebel, rang)', 'Xonangiz 10 soniyada boshqacha bo\'ladi', 'vizual wow', 'XONA'],
  ['Haftalik 3 ta bepul AI vosita (seriya)', 'Bu 3 vosita bepul. Pul to\'lama', 'seriya formati, qaytib kelishga undaydi', 'ASBOB'],
  ['Telegram va Instagramda 5 firibgarlik sxemasi', 'Sizga "tanishing" deb yozdimi? Bu firibgar', 'oilaga yuboriladi', 'FIRIB'],
  ['Parolingiz necha soniyada buziladi', 'Sanagich yuguradi: "3 soniya"', 'vizual + qo\'rquv', 'PAROL'],
  ['Ilovalar sizni tinglayaptimi: ruxsatlarni tekshir', 'Telefoningda buni hozir o\'chir', 'amaliy, 60 soniyada bajariladi', 'RUXSAT'],
  ['Soxta sayt yoki SMS to\'lov havolasi: 4 belgi', 'Bu havolani bosma. Sababi:', 'oilaga yuboriladi', 'SOXTA'],
  ['Har oy bilmasdan to\'layotgan obunalar', 'Har oy pulingiz ketyapti. Topamiz', 'pul mavzusi, hamma uchun', 'OBUNA'],
  ['Rassrochkaning haqiqiy narxi (misol hisob)', '100 so\'mlik narsa aslida necha so\'m', 'pul, hayratlanish. Raqamlarni tekshiring', 'FOIZ'],
  ['AI bilan boshlanadigan 3 ta xizmat kasbi', 'Boshlang\'ich kapitalsiz: 3 ta kasb', 'daromadga qiziqish. Da\'volarni tekshiring', 'DAROMAD'],
  ['Oylik byudjet 50/30/20: tayyor jadval', 'Maosh qayerga ketadi? 1 jadval', 'pul + tayyor sovg\'a', 'BYUDJET'],
  ['AI intervyu trener: savollarga mashq', 'Intervyuga 1 kun qoldimi? Buni qil', 'ish qidiruvchilar uchun', 'INTERVYU'],
  ['Ingliz tilida rasmiy xat 1 promptda', 'Xatni 30 soniyada ingliz tilida yoz', 'ish va o\'qish uchun', 'XAT'],
  ['IT kasbga 0 dan yo\'l xaritasi (bepul manbalar)', '0 dan dasturchi: aniq reja', 'yoshlar uchun', 'YO\'L'],
  ['Dasturlashsiz o\'z saytingni AI bilan qur', 'Sayt qurish uchun kod bilish shart emas', 'wow + foyda', 'SAYT'],
  ['Telefondagi yashirin 5 funksiya', 'Telefoningda bu bor edi, bilmaysan', 'klassik viral format', 'YASHIRIN'],
  ['Batareya tez tushyaptimi: 4 sabab', 'Zaryad shu sababli tushadi', 'hamma uchun', 'BATAREYA'],
  ['Wi-Fi sekinmi: 60 soniyada tezlashtir', 'Router shu joyda turibdimi? Xato', 'hamma uchun', 'WIFI'],
  ['Xotira to\'ldi: hech narsa o\'chirmay joy och', 'Xotira to\'ldimi? Buni o\'chirma', 'hamma uchun', 'XOTIRA'],
  ['Klaviatura 5 qisqa yo\'l (Windows va Mac)', 'Bularni bilsang, 2 barobar tez ishlaysan', 'ofis ishchilari', 'TEZ'],
  ['Telefonni 7 kunda kamaytirish (diqqatni qaytar)', 'Kuniga necha soat telefondasan?', 'hamma uchun', 'DIQQAT'],
  ['O\'qiganni unutmaslik: takrorlash + AI kartochkalar', 'O\'qiganingning katta qismini unutasan', 'talaba. Raqamning manbasini tekshiring', 'ESLASH'],
  ['AI ni "shaytonning advokati" qilib qaror qabul', 'Katta qaror oldidamisan? AI ga buni ayt', 'qaror og\'rig\'i', 'QAROR'],
  ['Instagram DM ga 24/7 javob (kichik biznes)', 'Mijozlar yozyapti, siz uxlayapsiz', 'sotuvchilar uchun', 'JAVOB'],
  ['Kichik xonaga mebel tanlash: 3 qoida', 'Xona kichikmi? Mebelni shunday tanla', 'uy va interyer', 'METR'],
];

const doc = new PDF({ size: 'A4', margin: 48, info: { Title: '30 ta viral reels mavzu bazasi', Author: 'Mashrabbek' } });
doc.registerFont('R', path.join(F, 'Montserrat-Regular.ttf'));
doc.registerFont('B', path.join(F, 'Montserrat-Bold.ttf'));
doc.pipe(fs.createWriteStream(OUT));
const W = doc.page.width - 96;

// Muqova
doc.rect(0, 0, doc.page.width, 250).fill(INK);
doc.fillColor('#F4F1EA').font('B').fontSize(30).text('30 ta viral reels mavzu bazasi', 48, 80, { width: W });
doc.fillColor(ACC).font('R').fontSize(14).text('Rejissyor studiyasi PRO · bonus', 48, 160, { width: W });
doc.fillColor('#BFC7D5').font('R').fontSize(11).text('Har mavzuda: hook, nega ishlashi va kalit so\'z namunasi', 48, 190, { width: W });

doc.fillColor(INK).font('B').fontSize(14).text('Qanday ishlatiladi', 48, 280);
doc.font('R').fontSize(11).fillColor(MUTED).text(
  '1. Mavzuni tanlang va hook ni videoning birinchi 1-2 soniyasiga qo\'ying.\n' +
  '2. Videoni foydali qiling: tomoshabin "buni dugonamga/otamga yuboraman" desin. Yuborishlar eng kuchli signallardan biri.\n' +
  '3. Har videoda BITTA kalit so\'z bo\'lsin va u avval ishlatilmagan bo\'lsin.\n' +
  '4. Videodan oldin faktlarni tekshiring. "Tekshiring" deb belgilangan mavzularda raqam va da\'volarning manbasini toping.\n' +
  '5. Shartnoma va pul mavzularida "bu yuridik/moliyaviy maslahat emas" deb ayting.',
  48, 305, { width: W, lineGap: 4 });
doc.font('B').fontSize(12).fillColor(INK).text('Birinchi nimadan boshlash', 48, 440);
doc.font('R').fontSize(11).fillColor(MUTED).text('Eng kuchli beshtasi: 1 (Shartnoma), 9 (Firibgarlik), 13 (Obunalar), 4 (Eski surat), 8 (Haftalik 3 bepul vosita).', 48, 462, { width: W, lineGap: 3 });
doc.font('R').fontSize(9.5).fillColor(MUTED).text('Bu g\'oyalar ro\'yxati. Hech qaysi mavzu ko\'rishlar sonini kafolatlamaydi: natija sifatga, hookga va davomiylikka bog\'liq.', 48, 520, { width: W, lineGap: 3 });

// Mavzular
let y = 0;
const BLOCK = 92;
T.forEach((t, i) => {
  if (i % 7 === 0) { doc.addPage(); y = 48; }
  doc.roundedRect(48, y, W, BLOCK - 10, 8).fill(CARD);
  doc.fillColor(ACC).font('B').fontSize(20).text(String(i + 1).padStart(2, '0'), 62, y + 14, { width: 40 });
  doc.fillColor(INK).font('B').fontSize(11.5).text(t[0], 112, y + 12, { width: W - 190, height: 30 });
  doc.fillColor(MUTED).font('R').fontSize(9.5).text('Hook: ', 112, y + 40, { continued: true, width: W - 190 }).fillColor(INK).text('"' + t[1] + '"', { width: W - 190 });
  doc.fillColor(MUTED).font('R').fontSize(9).text('Nega ishlaydi: ' + t[2], 112, y + 62, { width: W - 190, height: 14 });
  doc.roundedRect(48 + W - 92, y + 14, 80, 24, 12).lineWidth(1).stroke(LINE);
  doc.fillColor(INK).font('B').fontSize(9.5).text(t[3], 48 + W - 92, y + 21, { width: 80, align: 'center' });
  doc.fillColor(MUTED).font('R').fontSize(7).text('kalit so\'z (namuna)', 48 + W - 92, y + 42, { width: 80, align: 'center' });
  y += BLOCK;
});
doc.end();
console.log('OK', OUT);
