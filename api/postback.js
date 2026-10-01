// Postback bridge: BitcoTasks (and other offerwalls) call this URL on your
// own domain and it hands the data to the Google Apps Script backend.
//
// Reads the RAW request body itself (bodyParser disabled below) so it
// works no matter what Content-Type (or lack of one) the sender used.
// Handles plain JSON, form-urlencoded, AND multipart/form-data (which is
// what many offerwall servers actually send for POST postbacks).
export const config = {
  api: { bodyParser: false }
};

function readRawBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

// Parses multipart/form-data bodies (no file uploads expected, just
// plain text fields, which is all a postback needs).
function parseMultipart(raw, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = match ? (match[1] || match[2]) : null;
  if (!boundary) return {};
  const parts = raw.split('--' + boundary);
  const out = {};
  parts.forEach(part => {
    const nameMatch = /name="([^"]+)"/.exec(part);
    if (!nameMatch) return;
    const name = nameMatch[1];
    const valueStart = part.indexOf('\r\n\r\n');
    if (valueStart === -1) return;
    let value = part.substring(valueStart + 4);
    value = value.replace(/\r\n--$/, '').replace(/\r\n$/, '');
    out[name] = value;
  });
  return out;
}

function parseAnyBody(raw, contentType) {
  if (!raw) return {};
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return parseMultipart(raw, contentType);
  }
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch (e) { /* fall through */ }
  }
  try {
    return Object.fromEntries(new URLSearchParams(trimmed));
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBhPX3efkISli9hte4CtsgyR9zgBbIQrEdBlG4elcbKG53bLMY6t9IuUW__u5tiswOVw/exec';

  const contentType = req.headers['content-type'] || '';
  const raw = await readRawBody(req);
  const bodyParams = parseAnyBody(raw, contentType);
  const all = Object.assign({}, req.query || {}, bodyParams);

  const allowed = ['wall_id', 'subId', 'transId', 'reward', 'reward_name', 'reward_value',
                   'payout', 'status', 'signature', 'userIp', 'country',
                   'user_id', 'amount', 'transaction_id', 'secret_key'];
  const out = new URLSearchParams({ action: 'offerwallPostback' });
  allowed.forEach(k => {
    if (all[k] !== undefined && all[k] !== null && all[k] !== '') out.append(k, String(all[k]));
  });

  // Debug breadcrumbs so PostbackLog shows exactly what was received,
  // in case the format still isn't what we expect.
  out.append('_ct', contentType.substring(0, 60));
  out.append('_rawLen', String(raw.length));
  out.append('_rawPreview', raw.substring(0, 350));

  try {
    const response = await fetch(APPS_SCRIPT_URL + '?' + out.toString());
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send('ERROR: proxy - ' + err.message);
  }
}
