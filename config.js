/**************************************************************
 * VEXORA INTERNATIONAL — Frontend Config
 * ------------------------------------------------------------
 * FILL IN THESE VALUES:
 *
 * 1) API_URL: Apps Script "Deploy > New deployment > Web app" URL
 * 2) GOOGLE_CLIENT_ID: from console.cloud.google.com credentials
 *    (also paste the SAME client ID into backend Script Properties
 *    as GOOGLE_CLIENT_ID — this locks logins to your site only)
 * 3) HCAPTCHA_SITE_KEY: from hcaptcha.com dashboard
 **************************************************************/

const CONFIG = {
  API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
  GOOGLE_CLIENT_ID: "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE",
  HCAPTCHA_SITE_KEY: "PASTE_YOUR_HCAPTCHA_SITE_KEY_HERE",
  SITE_NAME: "Vexora International",
  CURRENCY_SYMBOL: "",
  CURRENCY_NAME: "Token",
  TOKENS_PER_USDT: 100000 // 100,000 Token = 1 USDT
};

// ---- Helper: format a token amount, e.g. "1,250 Token" ----
function formatTokens(amount) {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString('en-US') + ' ' + CONFIG.CURRENCY_NAME;
}

// ---- Helper: convert tokens to USDT (used on the withdrawal page) ----
function tokensToUSDT(tokens) {
  return Number(tokens) / CONFIG.TOKENS_PER_USDT;
}

// ---- Helper: get the current user's IP (public API), cached for the
// whole session so we don't re-fetch it on every single API call. ----
let _cachedIP = null;
async function getUserIP() {
  if (_cachedIP) return _cachedIP;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    _cachedIP = data.ip;
    return _cachedIP;
  } catch (e) {
    return 'unknown';
  }
}
// Fire this in the background as soon as a page loads so it's ready
// before any POST request needs it (removes a round-trip from the
// critical path of every earning action).
getUserIP();

// ---- Helper: send a GET request to the Apps Script backend.
// The session token (if any) is attached automatically — pages never
// need to pass userId/email by hand, which also means a page can't
// accidentally query someone else's data. ----
async function apiGet(action, params = {}) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.append('action', action);
  const session = getSession();
  if (session && session.token) url.searchParams.append('token', session.token);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
  const res = await fetch(url);
  const data = await res.json();
  if (data && data.error === 'Session expired. Please log in again.') {
    clearSession();
    window.location.href = 'index.html';
  }
  return data;
}

// ---- Helper: send a POST request to the Apps Script backend.
// Session token is attached automatically for the same reason as above. ----
async function apiPost(action, payload = {}) {
  const ip = await getUserIP();
  const session = getSession();
  const token = session && session.token;
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // keeps Apps Script CORS-friendly
    body: JSON.stringify({ action, ip, token, ...payload })
  });
  const data = await res.json();
  if (data && data.error === 'Session expired. Please log in again.') {
    clearSession();
    window.location.href = 'index.html';
  }
  return data;
}

// ---- Helper: logged-in user session (now includes the signed session token) ----
function saveSession(user) {
  localStorage.setItem('vexora_user', JSON.stringify(user));
}
function getSession() {
  const raw = localStorage.getItem('vexora_user');
  return raw ? JSON.parse(raw) : null;
}
function clearSession() {
  localStorage.removeItem('vexora_user');
}
function requireLogin() {
  const user = getSession();
  if (!user || !user.token) {
    clearSession(); // clear any stale/incomplete session so index.html doesn't bounce back here
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

// ---- Helper: read a ?ref=USERID referral code from the current URL and
// remember it, so it survives from the landing page through to signup. ----
function captureReferralCode() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) localStorage.setItem('vexora_referral_code', ref);
}
function getStoredReferralCode() {
  return localStorage.getItem('vexora_referral_code') || '';
}

// ---- Helper: build a shareable referral link for the current user ----
function getReferralLink(userId) {
  return window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'index.html?ref=' + userId;
}

// ---- Helper: slide-out drawer menu toggle (used on all dashboard pages) ----
function toggleMenu() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('menu-overlay');
  if (drawer) drawer.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}
