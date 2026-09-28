bash

cat /home/claude/build/vexora-vercel-site/api/postback.js
Output

// Postback bridge: Bitcotasks (and other offerwalls) call this URL on your own
// domain, and it hands the data to the Google Apps Script backend.
// It accepts BOTH a POST (form/JSON body) and a GET (query string), because
// providers differ, and answers with the backend's plain-text reply
// ("OK" / "DUP" / "ERROR: ...") which is what offerwalls expect.
export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBhPX3efkISli9hte4CtsgyR9zgBbIQrEdBlG4elcbKG53bLMY6t9IuUW__u5tiswOVw/exec';

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = Object.fromEntries(new URLSearchParams(body)); } catch (e) { body = {}; }
  }
  const all = Object.assign({}, req.query || {}, (body && typeof body === 'object') ? body : {});

  const allowed = ['wall_id', 'subId', 'transId', 'reward', 'payout', 'status', 'signature',
                   'debug', 'userIp', 'user_id', 'amount', 'transaction_id', 'secret_key'];
  const out = new URLSearchParams({ action: 'offerwallPostback' });
  allowed.forEach(k => {
    if (all[k] !== undefined && all[k] !== null) out.append(k, String(all[k]));
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
