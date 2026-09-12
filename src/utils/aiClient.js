// Gemini model IDs (Google AI Studio / Gemini API).
// Deep = gemini-2.5-pro: most capable stable Pro, used for monthly review + priorities.
//   Free tier: 5 RPM / 100 RPD. Paid (pro offer): spend-based, no hard RPD cap.
// Lite = gemini-2.5-flash: fast workhorse for chat.
//   Free tier: 10 RPM / 250 RPD. Paid: effectively unlimited.
// Upgrade options: gemini-3.1-pro-preview (deep), gemini-3.8-flash (lite) — paid only.
const DEEP_MODEL = 'gemini-2.5-pro';
const LITE_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const KEY_LS       = 'finplan_ai_key';
const RPD_DATE_LS  = 'finplan_ai_rpd_date';
const RPD_COUNT_LS = 'finplan_ai_rpd_count';
// Soft daily cap on deep (Pro) calls. Free tier = 100 RPD; paid tier has no hard cap.
// Set conservatively — a personal finance app rarely needs >50 deep analyses/day.
export const DEEP_RPD_CAP = 50;

export const getApiKey = () => localStorage.getItem(KEY_LS) || '';
export const setApiKey = k => localStorage.setItem(KEY_LS, k.trim());
export const clearApiKey = () => localStorage.removeItem(KEY_LS);

export function deepUsageToday() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(RPD_DATE_LS) !== today) return 0;
  return parseInt(localStorage.getItem(RPD_COUNT_LS) || '0', 10);
}

function bumpDeep() {
  const today = new Date().toISOString().slice(0, 10);
  const n = localStorage.getItem(RPD_DATE_LS) === today
    ? parseInt(localStorage.getItem(RPD_COUNT_LS) || '0', 10)
    : 0;
  localStorage.setItem(RPD_DATE_LS, today);
  localStorage.setItem(RPD_COUNT_LS, String(n + 1));
}

async function gemini(model, contents, system) {
  const key = getApiKey();
  if (!key) throw new Error('No API key — add your Gemini key in the AI tab.');
  const body = {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
  };
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

/** Deep analysis — uses the most capable model (hard daily cap). */
export async function callDeep(contents, system) {
  if (deepUsageToday() >= DEEP_RPD_CAP)
    throw new Error(`Daily deep-analysis limit reached (${DEEP_RPD_CAP}/day). Chat is still available.`);
  const result = await gemini(DEEP_MODEL, contents, system);
  bumpDeep();
  return result;
}

/** Lite chat — fast, high daily allowance. */
export async function callLite(contents, system) {
  return gemini(LITE_MODEL, contents, system);
}
