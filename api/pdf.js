// Vercel Serverless Function — POST { html, filename } -> application/pdf
// Renders the client-built PDF HTML with headless Chromium so the output is
// pixel-identical to the on-screen design, with real selectable Arabic text.
// No iOS print pipeline involved.

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let browser = null;
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    if (!body || !body.html) { res.status(400).json({ error: 'missing html' }); return; }

    const filename = (body.filename || 'plan').replace(/[^\w\-\.]+/g, '_');

    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--no-zygote'],
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(body.html, { waitUntil: 'networkidle0', timeout: 15000 });
    try { await page.evaluateHandle('document.fonts.ready'); } catch (e) {}

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      preferCSSPageSize: true
    });

    await browser.close();
    browser = null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (e) {} }
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
