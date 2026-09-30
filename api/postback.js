
// Postback bridge: BitcoTasks (and other offerwalls) call this URL on your
// own domain — BitcoTasks specifically sends an HTTP POST — and this hands
// the data to the Google Apps Script backend. It accepts POST with a
// JSON body, POST with a form-encoded body, AND a plain GET query string,
// since different providers do it differently, and replies with the
// backend's plain-text answer ("ok" / "ERROR: ...") which is what
// offerwalls expect to see.
export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypz49bqs_67lR7V9Fs2TxlZYyus1lntpMm8Lpk1YgEuy3DSF1GNh2lxxGUF2Trl6E/exec';

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');

  let parsedBody = {};
  if (typeof body === 'object' && body !== null) {
    parsedBody = body; // Vercel already parsed JSON or form-encoded for us
  } else if (typeof body === 'string' && body.length) {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try { parsedBody = JSON.parse(trimmed); } catch (e) { parsedBody = {}; }
    } else {
      try { parsedBody = Object.fromEntries(new URLSearchParams(trimmed)); } catch (e) { parsedBody = {}; }
    }
  }

  const all = Object.assign({}, req.query || {}, parsedBody);

  const allowed = ['wall_id', 'subId', 'transId', 'reward', 'payout', 'status', 'signature',
                   'debug', 'userIp', 'user_id', 'amount', 'transaction_id', 'secret_key'];
  const out = new URLSearchParams({ action: 'offerwallPostback' });
  allowed.forEach(k => {
    if (all[k] !== undefined && all[k] !== null && all[k] !== '') out.append(k, String(all[k]));
  });

  try {
    const response = await fetch(APPS_SCRIPT_URL + '?' + out.toString());
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send('ERROR: proxy - ' + err.message);
  }
}
