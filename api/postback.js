// Tiny proxy: forwards Bitcotask's postback (and any other offerwall's
// postback) from your own domain through to the real backend on
// Google Apps Script — because Bitcotask requires the Postback URL to be
// on your registered domain, and GitHub Pages can't run this itself.
export default async function handler(req, res) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBhPX3efkISli9hte4CtsgyR9zgBbIQrEdBlG4elcbKG53bLMY6t9IuUW__u5tiswOVw/exec';

  const params = new URLSearchParams(req.query).toString();
  const targetUrl = APPS_SCRIPT_URL + '?' + params;

  try {
    const response = await fetch(targetUrl);
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Proxy error: ' + err.message });
  }
}
