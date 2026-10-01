// AI yozgan markdown matndan haqiqiy fayl yasaydi: .docx (Word), .pdf, .txt
// Qo'llab-quvvatlanadi: # sarlavha, ## bo'lim, ### kichik bo'lim, - band, 1. raqamli band, **qalin**, oddiy paragraf.

const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, 'fonts', 'Montserrat-Regular.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'Montserrat-Bold.ttf');

/** markdown → bloklar ro'yxati */
function parse(md) {
  const blocks = [];
  for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^```/.test(line)) continue;
    if (/^\|?\s*-{3,}/.test(line)) continue; // jadval chiziqlari
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) blocks.push({ type: `h${m[1].length}`, text: m[2] });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) blocks.push({ type: 'li', text: m[1] });
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) blocks.push({ type: 'ol', n: m[1], text: m[2] });
    else if (line.startsWith('|')) blocks.push({ type: 'p', text: line.split('|').map((c) => c.trim()).filter(Boolean).join(' — ') });
    else blocks.push({ type: 'p', text: line.trim() });
  }
  return blocks;
}

/** "**qalin** oddiy" → [{text, bold}] */
function runs(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.map((r) => ({ ...r, text: r.text.replace(/`/g, '') }));
}

const plain = (text) => runs(text).map((r) => r.text).join('');

/** Fayl nomi uchun xavfsiz qisqa nom */
function fileName(title, ext) {
  const base = String(title || 'hujjat')
    .replace(/[ʻʼ‘’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'hujjat';
  return `${base}.${ext}`;
}

async function makeDocx(title, md) {
  const children = [];
  if (title) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true })] }));
  for (const b of parse(md)) {
    const r = runs(b.text).map((x) => new TextRun({ text: x.text, bold: x.bold }));
    if (b.type === 'h1') children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: r }));
    else if (b.type === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: r }));
    else if (b.type === 'h3') children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: r }));
    else if (b.type === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: r }));
    else if (b.type === 'ol') children.push(new Paragraph({ children: [new TextRun({ text: `${b.n}. `, bold: true }), ...r] }));
    else children.push(new Paragraph({ children: r, spacing: { after: 120 } }));
  }
  const doc = new Document({
    creator: 'Xabarnoma AI',
    title: title || 'Hujjat',
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

function makePdf(title, md) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: title || 'Hujjat', Author: 'Xabarnoma AI' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('reg', FONT_REG);
    doc.registerFont('bold', FONT_BOLD);
    const W = doc.page.width - 112;
    const write = (text, { size = 11, font = 'reg', gap = 6, indent = 0, color = '#1A1F36' } = {}) => {
      const parts = runs(text);
      doc.fillColor(color).fontSize(size);
      parts.forEach((p, i) => {
        doc.font(p.bold || font === 'bold' ? 'bold' : 'reg').text(p.text, doc.page.margins.left + indent, undefined, {
          width: W - indent,
          continued: i < parts.length - 1,
          lineGap: 2,
        });
      });
      doc.moveDown(gap / 12);
    };
    if (title) {
      write(title, { size: 20, font: 'bold', gap: 4, color: '#0D1224' });
      doc.moveTo(56, doc.y).lineTo(56 + W, doc.y).lineWidth(2).strokeColor('#FFD23F').stroke();
      doc.moveDown(0.8);
    }
    for (const b of parse(md)) {
      if (b.type === 'h1') write(b.text, { size: 17, font: 'bold', gap: 8, color: '#0D1224' });
      else if (b.type === 'h2') write(b.text, { size: 14, font: 'bold', gap: 6, color: '#2C3A6B' });
      else if (b.type === 'h3') write(b.text, { size: 12, font: 'bold', gap: 4 });
      else if (b.type === 'li') write(`•  ${b.text}`, { indent: 10, gap: 3 });
      else if (b.type === 'ol') write(`${b.n}.  ${b.text}`, { indent: 10, gap: 3 });
      else write(b.text, { gap: 6 });
    }
    doc.fontSize(8).fillColor('#9AA6D1').font('reg').text('Xabarnoma AI · t.me/mashrabbekmaxmatkulov', 56, doc.page.height - 40, { width: W, align: 'center', lineBreak: false });
    doc.end();
  });
}

function makeTxt(title, md) {
  const body = parse(md)
    .map((b) => (b.type === 'li' ? `- ${plain(b.text)}` : b.type === 'ol' ? `${b.n}. ${plain(b.text)}` : plain(b.text)))
    .join('\n');
  return Buffer.from(`${title ? `${title}\n\n` : ''}${body}\n`, 'utf8');
}

const TYPES = {
  docx: { make: makeDocx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { make: makePdf, mime: 'application/pdf' },
  txt: { make: makeTxt, mime: 'text/plain' },
};

/**
 * AI javobidan fayl so'rovini ajratadi.
 * Format: 1-qator "[FAYL:docx]", keyin "# Sarlavha", keyin matn.
 * forced — foydalanuvchi aniq fayl so'ragan, lekin AI belgini unutgan bo'lsa.
 */
function extractFile(reply, forced) {
  const m = String(reply || '').match(/^\s*\[FAYL:(docx|pdf|txt)\]\s*\n?/i);
  const type = m ? m[1].toLowerCase() : forced;
  if (!type) return null;
  let body = m ? reply.slice(m[0].length) : reply;
  let title = '';
  const t = body.match(/^\s*#\s+(.+)\n?/);
  if (t) {
    title = plain(t[1]).trim();
    body = body.slice(t[0].length);
  }
  return { type, title: title || 'Hujjat', body };
}

/** Foydalanuvchi xabaridan qaysi format so'ralganini aniqlaydi */
function wantedFormat(text) {
  const s = String(text || '').toLowerCase();
  if (/\b(word|docx|ворд|doc)\b|word\s*format|word\s*qilib/.test(s)) return 'docx';
  if (/\bpdf\b|пдф/.test(s)) return 'pdf';
  if (/\btxt\b|matn\s*fayl/.test(s)) return 'txt';
  return null;
}

async function build(file) {
  const t = TYPES[file.type];
  const buffer = await t.make(file.title, file.body);
  return { buffer, filename: fileName(file.title, file.type), contentType: t.mime };
}

module.exports = { extractFile, wantedFormat, build, parse };
