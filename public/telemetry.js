import { api } from './api.js';

const key = 'dx_usage_preferences';
const defaults = { consent: false, test: false, profile: 'non_renseigne' };
function preferences() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { return { ...defaults }; }
}

const sent = new Set();
export function track(kind, eventId = crypto.randomUUID(), test = false) {
  const p = preferences();
  if (!p.consent || !p.browser || p.test || test) return;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  const once = ['visite', 'activite'].includes(kind) ? kind + date + ':' + p.profile : null;
  if (once && sent.has(once)) return;
  if (once) sent.add(once);
  api('event', { kind, eventId, consent: true, browser: p.browser, profile: p.profile }).catch(() => {
    if (once) sent.delete(once);
  });
}
export const isTestMode = () => preferences().test;

export function setupPrivacy({ app = false, demo = () => false } = {}) {
  const panel = document.querySelector('#usage-preferences');
  if (!panel) return;
  const form = panel.querySelector('form');
  const status = panel.querySelector('output');
  const trackPage = () => track(app ? 'activite' : 'visite', undefined, demo());
  const previous = preferences();
  form.elements.consent.checked = previous.consent;
  form.elements.test.checked = previous.test;
  form.elements.profile.value = previous.profile;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const current = preferences();
    const next = { ...current, consent: form.elements.consent.checked, test: form.elements.test.checked, profile: form.elements.profile.value };
    if (next.consent && !next.browser) next.browser = crypto.randomUUID();
    try {
      localStorage.setItem(key, JSON.stringify(next));
      sent.clear();
      trackPage();
      status.textContent = 'Préférences enregistrées.';
    } catch { status.textContent = 'Ce navigateur ne permet pas de mémoriser vos préférences.'; }
  });
  panel.querySelector('[data-erase-usage]').addEventListener('click', async () => {
    const current = preferences();
    try {
      localStorage.setItem(key, JSON.stringify({ ...current, consent: false }));
      form.elements.consent.checked = false;
      if (current.browser) await api('analytics-erase', { browser: current.browser });
      status.textContent = 'Mesure désactivée et données associées supprimées.';
    } catch { status.textContent = 'Suppression indisponible. Réessayez dans quelques instants.'; }
  });
  trackPage();
  if (app) window.addEventListener('focus', trackPage);
}
