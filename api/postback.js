
/**************************************************************
 * VEXORA INTERNATIONAL — Backend (Google Apps Script)
 * ------------------------------------------------------------
 * v2 — SECURITY-HARDENED VERSION
 **************************************************************/

const SPREADSHEET_ID = '1AjGSYRD7sZmFTSnyfGt-IEjLLyC1uRq4OKotl8jImKY';

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== 'PASTE_YOUR_SPREADSHEET_ID_HERE_OR_LEAVE_EMPTY_IF_BOUND') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

const SHEET_NAMES = {
  USERS: 'Users',
  IPLOG: 'IPLog',
  ADS: 'Ads',
  CLICKS: 'AdClicks',
  TRANSACTIONS: 'Transactions',
  WITHDRAWALS: 'Withdrawals',
  SHORTLINKS: 'Shortlinks',
  OFFERWALLS: 'Offerwalls',
  REFERRALS: 'Referrals',
  PRIZEPOOL: 'PrizePool',
  POSTBACKLOG: 'PostbackLog'
};

function setupSheets() {
  ensureSheets();
  getSessionSecret();
  Logger.log('All sheets created/verified: ' + Object.values(SHEET_NAMES).join(', '));
  Logger.log('Session secret is set (auto-generated, stored in Script Properties).');
  Logger.log('--- Still to do in Script Properties (Project Settings > Script Properties) ---');
  Logger.log('HCAPTCHA_SECRET_KEY  = your hCaptcha secret key');
  Logger.log('GOOGLE_CLIENT_ID     = your OAuth Client ID (recommended, tightens login security)');
}

function ensureSheets() {
  const ss = getSpreadsheet();

  const schema = {
    [SHEET_NAMES.USERS]: ['UserID','Name','Email','GoogleID','Balance','Role','Status','SignupIP','LastLoginIP','CreatedAt','LastLoginAt','ReferredBy','ReferralCode'],
    [SHEET_NAMES.IPLOG]: ['LogID','UserID','Email','IPAddress','Action','Timestamp'],
    [SHEET_NAMES.ADS]: ['AdID','AdvertiserEmail','Title','TargetURL','Duration','PricePerView','TotalViewsBought','ViewsUsed','Status','CreatedAt','ProofImageURL'],
    [SHEET_NAMES.CLICKS]: ['ClickID','UserID','AdID','Reward','IPAddress','Timestamp'],
    [SHEET_NAMES.TRANSACTIONS]: ['TxnID','UserID','Type','Amount','Method','Status','Reference','Timestamp'],
    [SHEET_NAMES.WITHDRAWALS]: ['WithdrawID','UserID','TokenAmount','Method','WalletAddress','Status','RequestedAt','ProcessedAt','PayoutValue','PayoutCurrency'],
    [SHEET_NAMES.SHORTLINKS]: ['LinkID','Title','OriginalURL','ShortURL','Reward','Status'],
    [SHEET_NAMES.OFFERWALLS]: ['WallID','ProviderName','IframeURL','APIKey','SecretKey','TokenMultiplier','Status'],
    [SHEET_NAMES.REFERRALS]: ['ReferralID','ReferrerUserID','ReferredUserID','SignupBonusPaid','Level1Earned','Level2Earned','CreatedAt'],
    [SHEET_NAMES.PRIZEPOOL]: ['Date','Rank','UserID','UserName','TokensEarned','PrizeToken','Status'],
    [SHEET_NAMES.POSTBACKLOG]: ['Timestamp','WallID','Params','Result']
  };

  Object.keys(schema).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(schema[name]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, schema[name].length).setFontWeight('bold').setBackground('#0F1229').setFontColor('#F5B942');
    } else {
      const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      schema[name].forEach((col) => {
        if (existingHeaders.indexOf(col) === -1) {
          const newCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, newCol).setValue(col).setFontWeight('bold').setBackground('#0F1229').setFontColor('#F5B942');
        }
      });
    }
  });

  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }
}

let _sheetsEnsured = false;
function ensureSheetsOnce() {
  if (!_sheetsEnsured) {
    ensureSheets();
    _sheetsEnsured = true;
  }
}

const _sheetCache = {};
function getSheet(name) {
  ensureSheetsOnce();
  if (!_sheetCache[name]) {
    _sheetCache[name] = getSpreadsheet().getSheetByName(name);
  }
  return _sheetCache[name];
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function findRowIndexByValue(sheet, columnName, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = headers.indexOf(columnName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(value)) return i + 1;
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0] + Date.now();
}

function getScriptProp(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === '') ? fallback : v;
}

function getSessionSecret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SESSION_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', s);
  }
  return s;
}

function hmacHex(payload, secret) {
  const raw = Utilities.computeHmacSha256Signature(payload, secret);
  return raw.map(b => ((b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))).join('');
}

function signToken(payload) {
  const secret = getSessionSecret();
  return Utilities.base64EncodeWebSafe(payload) + '.' + hmacHex(payload, secret);
}
function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) throw new Error('Missing or invalid token.');
  const dot = token.lastIndexOf('.');
  const encoded = token.substring(0, dot);
  const sig = token.substring(dot + 1);
  const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString();
  const expected = hmacHex(payload, getSessionSecret());
  if (expected !== sig) throw new Error('Invalid or tampered token.');
  return payload;
}

function createSessionToken(userId) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return signToken(userId + '|' + exp);
}
function requireAuth(paramsOrBody) {
  const token = paramsOrBody && paramsOrBody.token;
  const payload = verifyToken(token);
  const parts = payload.split('|');
  const userId = parts[0];
  const exp = Number(parts[1]);
  if (!userId || !exp || Date.now() > exp) throw new Error('Session expired. Please log in again.');
  return userId;
}

function createAdTicket(userId, adId) {
  return signToken(['ADT', userId, adId, Date.now()].join('|'));
}
function verifyAdTicket(ticket, userId, adId, minWaitMs) {
  const payload = verifyToken(ticket);
  const parts = payload.split('|');
  if (parts[0] !== 'ADT' || parts[1] !== userId || parts[2] !== adId) {
    throw new Error('Invalid ad ticket.');
  }
  const issuedAt = Number(parts[3]);
  const elapsed = Date.now() - issuedAt;
  if (elapsed < minWaitMs - 1000) {
    throw new Error('Please wait for the ad timer to finish before claiming.');
  }
  if (elapsed > minWaitMs + 15 * 60 * 1000) {
    throw new Error('This ad session expired. Please open the ad again.');
  }
  return true;
}

function verifyGoogleIdToken(idToken) {
  if (!idToken) throw new Error('Missing Google ID token.');
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  const data = JSON.parse(res.getContentText());
  if (data.error || !data.email) throw new Error('Invalid Google login token.');
  if (Number(data.exp) * 1000 < Date.now()) throw new Error('Google login token expired.');

  const expectedClientId = getScriptProp('GOOGLE_CLIENT_ID', '');
  if (expectedClientId && data.aud !== expectedClientId) {
    throw new Error('Google login token was not issued for this site.');
  }
  return { email: data.email, name: data.name || data.email, sub: data.sub, picture: data.picture || '' };
}

function doGet(e) {
  ensureSheetsOnce();
  const action = e.parameter.action;

  try {
    if (action === 'offerwallPostback') return offerwallPostback(e.parameter);
    if (action === 'bitcotaskPostback') return offerwallPostback(Object.assign({}, e.parameter, { wall_id: e.parameter.wall_id || 'BCT1' }));
    if (action === 'getAds') return jsonResponse(getActiveAds());
    if (action === 'getOfferwalls') return jsonResponse(getActiveOfferwalls());
    if (action === 'getPrizePool') return jsonResponse(getTodayPrizePool());

    const userId = requireAuth(e.parameter);
    if (action === 'getShortlinks') return jsonResponse(getActiveShortlinks(userId));
    if (action === 'getUserFull') return jsonResponse(getUserFull(userId));
    if (action === 'getTransactions') return jsonResponse(getUserTransactions(userId));
    if (action === 'getWithdrawals') return jsonResponse(getUserWithdrawals(userId));
    if (action === 'getReferralStats') return jsonResponse(getReferralStats(userId));

    return jsonResponse({ error: 'Unknown GET action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  ensureSheetsOnce();
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  const ip = body.ip || 'unknown';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e2) {
    return jsonResponse({ success: false, error: 'Server is busy, please try again in a moment.' });
  }

  try {
    if (action === 'loginWithGoogle') return jsonResponse(loginOrCreateUser(body, ip));

    const userId = requireAuth(body);

    if (action === 'startAdView') return jsonResponse(startAdView(userId, body));
    if (action === 'watchAd') return jsonResponse(recordAdView(userId, body, ip));
    if (action === 'submitAd') return jsonResponse(submitAd(userId, body));
    if (action === 'requestWithdraw') return jsonResponse(requestWithdraw(userId, body));
    if (action === 'depositFunds') return jsonResponse(depositFunds(userId, body));
    if (action === 'completeShortlink') return jsonResponse(completeShortlink(userId, body, ip));
    if (action === 'claimFaucet') return jsonResponse(claimFaucet(userId, body, ip));

    return jsonResponse({ success: false, error: 'Unknown POST action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function loginOrCreateUser(body, ip) {
  const profile = verifyGoogleIdToken(body.idToken);
  const sheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(sheet);
  let user = users.find(u => u.Email === profile.email);
  const now = new Date();

  if (!user) {
    const userId = generateId('U');
    const referralCode = userId;
    sheet.appendRow([userId, profile.name, profile.email, profile.sub, 0, 'user', 'active', ip, ip, now, now, body.referredBy || '', referralCode]);
    user = { UserID: userId, Name: profile.name, Email: profile.email, Balance: 0, Role: 'user', Status: 'active', ReferralCode: referralCode };
    logIP(userId, profile.email, ip, 'signup');

    if (body.referredBy && body.referredBy !== userId) {
      registerReferral(body.referredBy, userId);
    }
  } else {
    const rowIdx = findRowIndexByValue(sheet, 'Email', profile.email);
    sheet.getRange(rowIdx, 9).setValue(ip);
    sheet.getRange(rowIdx, 11).setValue(now);
    logIP(user.UserID, profile.email, ip, 'login');
  }

  return {
    success: true,
    user: { UserID: user.UserID, Name: user.Name, Email: user.Email, Balance: user.Balance, ReferralCode: user.ReferralCode || user.UserID },
    picture: profile.picture,
    token: createSessionToken(user.UserID)
  };
}

function getUserFull(userId) {
  const userSheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(userSheet);
  const user = users.find(u => u.UserID === userId);
  if (!user) return { success: false, error: 'User not found' };

  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const allTxns = sheetToObjects(txnSheet).filter(t => t.UserID === userId);
  const recentTxns = allTxns.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)).slice(0, 10);

  const today = new Date().toDateString();
  const todayEarning = allTxns
    .filter(t => new Date(t.Timestamp).toDateString() === today && Number(t.Amount) > 0)
    .reduce((sum, t) => sum + Number(t.Amount), 0);

  return { success: true, user: user, todayEarning: todayEarning, recentTransactions: recentTxns };
}

function logIP(userId, email, ip, action) {
  const sheet = getSheet(SHEET_NAMES.IPLOG);
  sheet.appendRow([generateId('LOG'), userId, email, ip, action, new Date()]);
}

function submitAd(userId, body) {
  const userSheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(userSheet);
  const me = users.find(u => u.UserID === userId);
  if (!me) return { success: false, error: 'User not found' };

  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const txns = sheetToObjects(txnSheet);
  const approved = txns.find(t => t.UserID === userId && t.Type === 'deposit' && t.Status === 'Approved' && !t.usedForAd);
  if (!approved) {
    return { success: false, error: 'No approved payment found. Please send payment first and wait for admin approval.' };
  }

  const sheet = getSheet(SHEET_NAMES.ADS);
  const adId = generateId('AD');
  sheet.appendRow([adId, me.Email, body.title, body.targetUrl, body.duration, body.pricePerView, body.totalViews, 0, 'pending_review', new Date(), body.proofImageUrl || '']);
  return { success: true, message: 'Ad submitted. It will go live after admin review.', adId: adId };
}

function getActiveAds() {
  const sheet = getSheet(SHEET_NAMES.ADS);
  const ads = sheetToObjects(sheet).filter(a => a.Status === 'active' && Number(a.ViewsUsed) < Number(a.TotalViewsBought));
  return { success: true, ads: ads };
}

function startAdView(userId, body) {
  const adSheet = getSheet(SHEET_NAMES.ADS);
  const ads = sheetToObjects(adSheet);
  const ad = ads.find(a => a.AdID === body.adId && a.Status === 'active');
  if (!ad) return { success: false, error: 'Ad not found or no longer active.' };

  const clickSheet = getSheet(SHEET_NAMES.CLICKS);
  const clicks = sheetToObjects(clickSheet);
  const already = clicks.find(c => c.UserID === userId && c.AdID === body.adId &&
    new Date(c.Timestamp).toDateString() === new Date().toDateString());
  if (already) return { success: false, error: 'You already watched this ad today.' };

  return { success: true, ticket: createAdTicket(userId, body.adId), duration: Number(ad.Duration) };
}

function recordAdView(userId, body, ip) {
  const adSheet = getSheet(SHEET_NAMES.ADS);
  const adRow = findRowIndexByValue(adSheet, 'AdID', body.adId);
  if (adRow === -1) return { success: false, error: 'Ad not found' };

  const ads = sheetToObjects(adSheet);
  const ad = ads[adRow - 2];

  verifyAdTicket(body.ticket, userId, body.adId, Number(ad.Duration) * 1000);

  const clickSheet = getSheet(SHEET_NAMES.CLICKS);
  const clicks = sheetToObjects(clickSheet);
  const already = clicks.find(c => c.UserID === userId && c.AdID === body.adId &&
    new Date(c.Timestamp).toDateString() === new Date().toDateString());
  if (already) return { success: false, error: 'You already watched this ad today.' };

  const reward = getRewardForDuration(ad.Duration);

  clickSheet.appendRow([generateId('CLK'), userId, body.adId, reward, ip, new Date()]);
  adSheet.getRange(adRow, 8).setValue(Number(ad.ViewsUsed) + 1);

  creditBalance(userId, reward, 'ptc_earning', 'Ad:' + body.adId);
  return { success: true, reward: reward };
}

function getRewardForDuration(duration) {
  const table = { '5': 20, '10': 30, '30': 50, '60': 75 };
  return table[String(duration)] || 0;
}

function creditBalance(userId, amount, type, reference) {
  const userSheet = getSheet(SHEET_NAMES.USERS);
  const rowIdx = findRowIndexByValue(userSheet, 'UserID', userId);
  if (rowIdx === -1) return;
  const currentBalance = Number(userSheet.getRange(rowIdx, 5).getValue());
  userSheet.getRange(rowIdx, 5).setValue(currentBalance + amount);

  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  txnSheet.appendRow([generateId('TXN'), userId, type, amount, 'internal', 'Approved', reference, new Date()]);

  if (['ptc_earning', 'faucet_earning', 'shortlink_earning', 'offerwall_earning'].includes(type)) {
    payReferralCommission(userId, amount);
  }
}

function depositFunds(userId, body) {
  const sheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const txnId = generateId('TXN');
  let reference = body.reference || '';

  if (body.proofImageBase64) {
    const proofUrl = saveProofImageToDrive(body.proofImageBase64, txnId);
    reference = reference + (reference ? ' | ' : '') + 'Proof: ' + proofUrl;
  }

  sheet.appendRow([txnId, userId, 'deposit', body.amount, body.method, 'Pending', reference, new Date()]);
  return { success: true, message: 'Payment recorded. You can submit ads after approval.', txnId: txnId };
}

function saveProofImageToDrive(base64Data, txnId) {
  try {
    const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    const mimeType = matches ? matches[1] : 'image/png';
    const rawBase64 = matches ? matches[2] : base64Data;
    const extension = mimeType.split('/')[1] || 'png';

    const folderName = 'Vexora Payment Proofs';
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    const blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), mimeType, txnId + '.' + extension);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (e) {
    return 'Upload failed: ' + e.message;
  }
}

function getUserTransactions(userId) {
  const sheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const txns = sheetToObjects(sheet).filter(t => t.UserID === userId);
  return { success: true, transactions: txns };
}

const TOKENS_PER_USDT = 100000;
const TOKENS_TO_PKR_RATE = 0.0038;

function getMinTokensForMethod(method) {
  if (method === 'faucetpay_ltc') return 10000;
  if (method === 'crypto') return TOKENS_PER_USDT;
  if (method === 'pkr_easypaisa' || method === 'pkr_jazzcash') {
    return Math.ceil(380 / TOKENS_TO_PKR_RATE);
  }
  return 50000;
}

function requestWithdraw(userId, body) {
  const tokenAmount = Number(body.amount);
  const method = body.method;
  const minTokens = getMinTokensForMethod(method);

  if (!tokenAmount || tokenAmount < minTokens) {
    return { success: false, error: 'Minimum withdrawal for this method is ' + minTokens.toLocaleString() + ' tokens.' };
  }

  const userSheet = getSheet(SHEET_NAMES.USERS);
  const rowIdx = findRowIndexByValue(userSheet, 'UserID', userId);
  if (rowIdx === -1) return { success: false, error: 'User not found' };
  const balance = Number(userSheet.getRange(rowIdx, 5).getValue());
  if (balance < tokenAmount) return { success: false, error: 'Insufficient balance.' };

  userSheet.getRange(rowIdx, 5).setValue(balance - tokenAmount);

  let payoutValue, payoutCurrency, methodLabel;
  if (method === 'faucetpay_ltc') {
    payoutValue = tokenAmount / TOKENS_PER_USDT; payoutCurrency = 'USDT (paid in LTC)'; methodLabel = 'FaucetPay (LTC)';
  } else if (method === 'crypto') {
    payoutValue = tokenAmount / TOKENS_PER_USDT; payoutCurrency = 'USDT'; methodLabel = 'Crypto Wallet';
  } else if (method === 'pkr_easypaisa') {
    payoutValue = tokenAmount * TOKENS_TO_PKR_RATE; payoutCurrency = 'PKR'; methodLabel = 'Easypaisa';
  } else if (method === 'pkr_jazzcash') {
    payoutValue = tokenAmount * TOKENS_TO_PKR_RATE; payoutCurrency = 'PKR'; methodLabel = 'JazzCash';
  } else {
    payoutValue = tokenAmount / TOKENS_PER_USDT; payoutCurrency = 'USDT'; methodLabel = method;
  }

  const sheet = getSheet(SHEET_NAMES.WITHDRAWALS);
  const wId = generateId('WD');
  sheet.appendRow([wId, userId, tokenAmount, methodLabel, body.walletAddress, 'Pending', new Date(), '', payoutValue, payoutCurrency]);

  return { success: true, message: 'Withdrawal request submitted for review.', withdrawId: wId, payoutValue: payoutValue, payoutCurrency: payoutCurrency };
}

function getUserWithdrawals(userId) {
  const sheet = getSheet(SHEET_NAMES.WITHDRAWALS);
  const rows = sheetToObjects(sheet).filter(w => w.UserID === userId);
  return { success: true, withdrawals: rows };
}

function processApprovedWithdrawalBonuses() {
  const wSheet = getSheet(SHEET_NAMES.WITHDRAWALS);
  const withdrawals = sheetToObjects(wSheet);
  const approved = withdrawals.filter(w => w.Status === 'Approved');
  approved.forEach(w => payReferralSignupBonusIfEligible(w.UserID));
}

const REFERRAL_SIGNUP_BONUS = 25000;
const LEVEL_1_COMMISSION = 0.05;
const LEVEL_2_COMMISSION = 0.02;

function registerReferral(referrerUserId, referredUserId) {
  const sheet = getSheet(SHEET_NAMES.REFERRALS);
  sheet.appendRow([generateId('REF'), referrerUserId, referredUserId, false, 0, 0, new Date()]);
}

function payReferralSignupBonusIfEligible(referredUserId) {
  const sheet = getSheet(SHEET_NAMES.REFERRALS);
  const rows = sheetToObjects(sheet);
  const rowIndex = rows.findIndex(r => r.ReferredUserID === referredUserId);
  if (rowIndex === -1) return;
  const referral = rows[rowIndex];
  if (referral.SignupBonusPaid === true || referral.SignupBonusPaid === 'TRUE') return;

  creditBalance(referral.ReferrerUserID, REFERRAL_SIGNUP_BONUS, 'referral_signup_bonus', 'Referred user first withdrawal: ' + referredUserId);

  const sheetRow = rowIndex + 2;
  sheet.getRange(sheetRow, 4).setValue(true);
}

function payReferralCommission(earnerUserId, earnedAmount) {
  const sheet = getSheet(SHEET_NAMES.REFERRALS);
  const rows = sheetToObjects(sheet);

  const level1Row = rows.find(r => r.ReferredUserID === earnerUserId);
  if (level1Row) {
    const level1Commission = earnedAmount * LEVEL_1_COMMISSION;
    creditBalance(level1Row.ReferrerUserID, level1Commission, 'referral_commission_l1', 'From ' + earnerUserId);
    updateReferralEarned(level1Row.ReferralID, 'Level1Earned', level1Commission);

    const level2Row = rows.find(r => r.ReferredUserID === level1Row.ReferrerUserID);
    if (level2Row) {
      const level2Commission = earnedAmount * LEVEL_2_COMMISSION;
      creditBalance(level2Row.ReferrerUserID, level2Commission, 'referral_commission_l2', 'From ' + earnerUserId);
      updateReferralEarned(level2Row.ReferralID, 'Level2Earned', level2Commission);
    }
  }
}

function updateReferralEarned(referralId, columnName, amountToAdd) {
  const sheet = getSheet(SHEET_NAMES.REFERRALS);
  const rowIdx = findRowIndexByValue(sheet, 'ReferralID', referralId);
  if (rowIdx === -1) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = headers.indexOf(columnName) + 1;
  const current = Number(sheet.getRange(rowIdx, col).getValue()) || 0;
  sheet.getRange(rowIdx, col).setValue(current + amountToAdd);
}

function getReferralStats(userId) {
  const sheet = getSheet(SHEET_NAMES.REFERRALS);
  const rows = sheetToObjects(sheet);
  const myReferrals = rows.filter(r => r.ReferrerUserID === userId);

  const totalL1Earned = myReferrals.reduce((sum, r) => sum + Number(r.Level1Earned || 0), 0);
  const totalL2Earned = myReferrals.reduce((sum, r) => sum + Number(r.Level2Earned || 0), 0);
  const bonusesPaid = myReferrals.filter(r => r.SignupBonusPaid === true || r.SignupBonusPaid === 'TRUE').length;

  return {
    success: true,
    referralCode: userId,
    totalReferrals: myReferrals.length,
    signupBonusesPaid: bonusesPaid,
    level1CommissionEarned: totalL1Earned,
    level2CommissionEarned: totalL2Earned
  };
}

function getHCaptchaSecret() {
  return getScriptProp('HCAPTCHA_SECRET_KEY', '');
}

function verifyHCaptcha(token) {
  if (!token) return false;
  const secret = getHCaptchaSecret();
  if (!secret) return false;
  try {
    const res = UrlFetchApp.fetch('https://hcaptcha.com/siteverify', {
      method: 'post',
      payload: { secret: secret, response: token },
      muteHttpExceptions: true
    });
    const data = JSON.parse(res.getContentText());
    return data.success === true;
  } catch (e) {
    return false;
  }
}

function claimFaucet(userId, body, ip) {
  const captchaOk = verifyHCaptcha(body.captchaToken);
  if (!captchaOk) {
    return { success: false, error: 'Captcha verification failed. Please try again.' };
  }

  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const txns = sheetToObjects(txnSheet).filter(t => t.UserID === userId && t.Type === 'faucet_earning');
  if (txns.length) {
    const last = txns.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
    const diffMs = Date.now() - new Date(last.Timestamp).getTime();
    const cooldownMs = 5 * 60 * 1000;
    if (diffMs < cooldownMs) {
      const remainingMin = Math.ceil((cooldownMs - diffMs) / 60000);
      return { success: false, error: 'Next claim available in ' + remainingMin + ' minutes.' };
    }
  }

  const reward = Math.floor(Math.random() * (50 - 30 + 1)) + 30;
  creditBalance(userId, reward, 'faucet_earning', 'Faucet claim IP:' + ip);
  return { success: true, reward: reward };
}

function getActiveOfferwalls() {
  const sheet = getSheet(SHEET_NAMES.OFFERWALLS);
  const rows = sheetToObjects(sheet).filter(o => o.Status === 'active');
  const safe = rows.map(o => ({ WallID: o.WallID, ProviderName: o.ProviderName, IframeURL: o.IframeURL, APIKey: o.APIKey, Status: o.Status }));
  return { success: true, offerwalls: safe };
}

function md5Hex(str) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8);
  return raw.map(b => ((b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))).join('');
}

function logPostback(wallId, params, result) {
  try {
    const safe = Object.assign({}, params);
    if (safe.secret_key) safe.secret_key = '***';
    if (safe.password) safe.password = '***';
    getSheet(SHEET_NAMES.POSTBACKLOG).appendRow([new Date(), wallId || '', JSON.stringify(safe), result]);
  } catch (e) { /* logging must never break a postback */ }
}

// Universal postback endpoint. Three formats are understood:
//  1) BitcoTasks: subId, transId, reward, status, signature = MD5(subId+transId+reward+Secret)
//  2) CPAGrip:    tracking_id (user), payout (USD), offer_id, password (= Secret in the sheet).
//                 CPAGrip sends NO unique transaction id, so repeats of the same
//                 user + offer within 10 minutes are treated as duplicates.
//  3) Manual test: user_id, amount, transaction_id, secret_key (answered in JSON)
// Providers get a plain-text "ok" or "ERROR: ...". Secrets live in the Offerwalls sheet.
function offerwallPostback(params) {
  const providerStyle = !!params.signature;
  const cpagripStyle = !providerStyle && params.tracking_id !== undefined;
  const plainText = providerStyle || cpagripStyle;

  const finish = (code, message, extra) => {
    logPostback(params.wall_id, params, code + ': ' + message);
    if (plainText) {
      const text = (code === 'OK' || code === 'DUP') ? 'ok' : 'ERROR: ' + message;
      return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
    }
    return jsonResponse(Object.assign({ success: code !== 'ERR', message: message }, extra || {}));
  };

  const wall = sheetToObjects(getSheet(SHEET_NAMES.OFFERWALLS)).find(w => String(w.WallID) === String(params.wall_id));
  if (!wall) return finish('ERR', 'Unknown wall_id');
  if (wall.Status !== 'active') return finish('ERR', 'This offerwall is not active');
  const secret = String(wall.SecretKey || '');
  if (!secret) return finish('ERR', 'No SecretKey set for this wall in the sheet');

  if (providerStyle) {
    const expected = md5Hex(String(params.subId || '') + String(params.transId || '') + String(params.reward || '') + secret);
    if (expected !== String(params.signature).toLowerCase()) return finish('ERR', "Signature doesn't match");
  } else if (cpagripStyle) {
    if (String(params.password || '') !== secret) return finish('ERR', 'Invalid password');
  } else if (String(params.secret_key) !== secret) {
    return finish('ERR', 'Invalid secret key');
  }

  const userId = String(params.subId || params.tracking_id || params.user_id || '').trim();
  const transId = String(params.transId || params.transaction_id || '').trim();
  const offerId = String(params.offer_id || '').trim();
  const rewardRaw = params.reward !== undefined ? params.reward
                  : (params.payout !== undefined ? params.payout : params.amount);
  const amount = Math.abs(Number(rewardRaw)) * (Number(wall.TokenMultiplier) || 1);
  if (!userId || !(amount > 0)) return finish('ERR', 'Missing user id or reward');

  const isChargeback = String(params.status) === '2';
  const suffix = isChargeback ? ':cb' : '';
  const refPrefix = wall.WallID + ':' + userId + ':' + (offerId || 'x') + ':';
  const reference = transId
    ? wall.WallID + ':' + transId + suffix
    : refPrefix + Date.now() + suffix;

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const txns = sheetToObjects(getSheet(SHEET_NAMES.TRANSACTIONS));
    let duplicate;
    if (transId) {
      duplicate = txns.find(t => t.Reference === reference);
    } else {
      const tenMin = 10 * 60 * 1000;
      duplicate = txns.find(t => String(t.Reference).indexOf(refPrefix) === 0 &&
        (Date.now() - new Date(t.Timestamp).getTime()) < tenMin);
    }
    if (duplicate) return finish('DUP', 'Already processed');

    if (findRowIndexByValue(getSheet(SHEET_NAMES.USERS), 'UserID', userId) === -1) {
      return finish('ERR', 'User not found: ' + userId);
    }
    if (isChargeback) creditBalance(userId, -amount, 'offerwall_chargeback', reference);
    else creditBalance(userId, amount, 'offerwall_earning', reference);
  } finally {
    lock.releaseLock();
  }
  return finish('OK', isChargeback ? 'Chargeback applied' : 'Reward credited', { amount: amount });
}

function getActiveShortlinks(userId) {
  const sheet = getSheet(SHEET_NAMES.SHORTLINKS);
  const rows = sheetToObjects(sheet).filter(s => s.Status === 'active');

  const todayStr = new Date().toDateString();
  const clicksToday = userId
    ? sheetToObjects(getSheet(SHEET_NAMES.CLICKS)).filter(c => c.UserID === userId && new Date(c.Timestamp).toDateString() === todayStr)
    : [];

  const withStatus = rows.map(link => ({
    ...link,
    ClaimedToday: clicksToday.some(c => c.AdID === 'SL:' + link.LinkID)
  }));

  return { success: true, shortlinks: withStatus };
}

function completeShortlink(userId, body, ip) {
  const sheet = getSheet(SHEET_NAMES.SHORTLINKS);
  const rows = sheetToObjects(sheet);
  const link = rows.find(l => l.LinkID === body.linkId);
  if (!link) return { success: false, error: 'Link not found' };

  const clickSheet = getSheet(SHEET_NAMES.CLICKS);
  const clicks = sheetToObjects(clickSheet);
  const already = clicks.find(c => c.UserID === userId && c.AdID === 'SL:' + body.linkId &&
    new Date(c.Timestamp).toDateString() === new Date().toDateString());
  if (already) return { success: false, error: 'You already claimed this link today. It resets at midnight.' };
  clickSheet.appendRow([generateId('CLK'), userId, 'SL:' + body.linkId, Number(link.Reward), ip, new Date()]);

  creditBalance(userId, Number(link.Reward), 'shortlink_earning', 'Link:' + body.linkId);
  return { success: true, reward: Number(link.Reward) };
}

const TOTAL_DAILY_POOL = 500000;
const PRIZE_PERCENTAGES = { 1: 0.30, 2: 0.20, 3: 0.15, 4: 0.10, 5: 0.08, 6: 0.06, 7: 0.045, 8: 0.03, 9: 0.02, 10: 0.015 };

function runDailyPrizePool() {
  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const allTxns = sheetToObjects(txnSheet);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDateStr = yesterday.toDateString();

  const earningTypes = ['ptc_earning', 'faucet_earning', 'shortlink_earning', 'offerwall_earning'];
  const dayTxns = allTxns.filter(t => earningTypes.includes(t.Type) && new Date(t.Timestamp).toDateString() === targetDateStr);

  const totals = {};
  dayTxns.forEach(t => { totals[t.UserID] = (totals[t.UserID] || 0) + Number(t.Amount); });

  const ranked = Object.entries(totals)
    .map(([userId, tokensEarned]) => ({ userId, tokensEarned }))
    .sort((a, b) => b.tokensEarned - a.tokensEarned)
    .slice(0, 10);

  const userSheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(userSheet);
  const prizeSheet = getSheet(SHEET_NAMES.PRIZEPOOL);

  ranked.forEach((entry, index) => {
    const rank = index + 1;
    const percentage = PRIZE_PERCENTAGES[rank] || 0;
    const prize = Math.round(TOTAL_DAILY_POOL * percentage);
    const user = users.find(u => u.UserID === entry.userId);
    const userName = user ? user.Name : entry.userId;

    prizeSheet.appendRow([targetDateStr, rank, entry.userId, userName, entry.tokensEarned, prize, 'Paid']);
    creditBalance(entry.userId, prize, 'daily_prize_pool', 'Rank ' + rank + ' on ' + targetDateStr);
  });

  Logger.log('Daily prize pool distributed for ' + targetDateStr + ': ' + ranked.length + ' winners.');
}

function getTodayPrizePool() {
  const txnSheet = getSheet(SHEET_NAMES.TRANSACTIONS);
  const allTxns = sheetToObjects(txnSheet);

  const todayStr = new Date().toDateString();
  const earningTypes = ['ptc_earning', 'faucet_earning', 'shortlink_earning', 'offerwall_earning'];
  const todayTxns = allTxns.filter(t => earningTypes.includes(t.Type) && new Date(t.Timestamp).toDateString() === todayStr);

  const totals = {};
  todayTxns.forEach(t => { totals[t.UserID] = (totals[t.UserID] || 0) + Number(t.Amount); });

  const userSheet = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(userSheet);

  const ranked = Object.entries(totals)
    .map(([userId, tokensEarned]) => {
      const user = users.find(u => u.UserID === userId);
      return { userId, name: user ? user.Name : 'User', tokensEarned };
    })
    .sort((a, b) => b.tokensEarned - a.tokensEarned)
    .slice(0, 10)
    .map((entry, index) => {
      const rank = index + 1;
      const percentage = PRIZE_PERCENTAGES[rank] || 0;
      return { rank, name: entry.name, tokensEarned: entry.tokensEarned, estimatedPrize: Math.round(TOTAL_DAILY_POOL * percentage) };
    });

  return { success: true, leaderboard: ranked, totalPool: TOTAL_DAILY_POOL };
}
