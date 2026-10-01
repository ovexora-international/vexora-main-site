// Postback bridge: BitcoTasks (and other offerwalls) call this URL on your
// own domain and it hands the data to the Google Apps Script backend.
//
// This reads the RAW request body itself (bodyParser disabled below)
// instead of relying on Vercel's automatic JSON/form parsing — some
// offerwall servers send POST data without a standard Content-Type
// header, which makes automatic parsing silently return nothing. Reading
// the raw stream ourselves works no matter what headers were sent.
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

function parseAnyBody(raw) {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch (e) { /* fall through */ }
  }
  try {
    return Object.fromEntries(new URLSearchParams(trimmed));
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypz49bqs_67lR7V9Fs2TxlZYyus1lntpMm8Lpk1YgEuy3DSF1GNh2lxxGUF2Trl6E/exec';

  const raw = await readRawBody(req);
  const bodyParams = parseAnyBody(raw);
  const all = Object.assign({}, req.query || {}, bodyParams);

  const allowed = ['wall_id', 'subId', 'transId', 'reward', 'payout', 'status', 'signature',
                   'debug', 'userIp', 'user_id', 'amount', 'transaction_id', 'secret_key'];
  const out = new URLSearchParams({ action: 'offerwallPostback' });
  allowed.forEach(k => {
    if (all[k] !== undefined && all[k] !== null && all[k] !== '') out.append(k, String(all[k]));
  });
  // Also log exactly what raw bytes arrived, so if something's still off
  // we can see it immediately in PostbackLog without guessing.
  out.append('_rawLen', String(raw.length));

  try {
    const response = await fetch(APPS_SCRIPT_URL + '?' + out.toString());
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send('ERROR: proxy - ' + err.message);
  }
}
