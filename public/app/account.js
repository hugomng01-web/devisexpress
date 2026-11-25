import { api } from '../api.js';
import { isTestMode } from '../telemetry.js';
import { equal, mergeWorkspace } from './merge.js';

export function setupAccount({ read, install, empty, guest, safe, exportState }) {
  const panel = document.querySelector('#account-panel');
  const info = document.querySelector('#account-info');
  const buttons = document.querySelector('#account-actions');
  const form = document.querySelector('#account-form');
  const status = document.querySelector('#account-status');
  const accountButton = document.querySelector('#account-button');
  const google = document.querySelector('#account-google');
  let user, saved, revision = 0, conflicts = [], timer, inFlight, switching = false, enabled = false, emailEnabled = false;
  let mode = 'login';
  const key = () => 'dx_draft_' + user.id;
  const tell = text => { status.textContent = text; };
  const setMode = value => {
    mode = value;
    form.hidden = false;
    form.elements.email.hidden = value === 'password';
    form.elements.email.required = value !== 'password';
    form.elements.password.hidden = value === 'recover';
    form.elements.password.required = value !== 'recover';
    form.elements.password.minLength = ['signup', 'password'].includes(value) ? 10 : 1;
    form.elements.password.autocomplete = value === 'login' ? 'current-password' : 'new-password';
    form.querySelector('button').textContent = { login: 'Se connecter', signup: 'Créer mon compte', recover: 'Envoyer le lien', password: 'Enregistrer le mot de passe' }[value];
  };
  const makeButton = (text, action) => {
    const button = document.createElement('button');
    button.className = 'btn';
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', async () => {
      if (switching || !safe()) return tell('Terminez d’abord l’action en cours.');
      button.disabled = true;
      try { await action(); } catch (error) { tell(error.message || 'Connexion interrompue. Réessayez.'); }
      finally { button.disabled = false; }
    });
    buttons.append(button);
  };
  function render() {
    accountButton.textContent = user ? 'Mon compte' : 'Sauvegarde en ligne';
    buttons.replaceChildren();
    google.hidden = Boolean(user) || !google.hasAttribute('href');
    form.hidden = Boolean(user) || !emailEnabled;
    if (!user) {
      info.textContent = enabled && (emailEnabled || !google.hidden) ? 'Créez un compte gratuit pour retrouver vos devis et votre fiche entreprise sur tous vos appareils.' : 'Sauvegarde en ligne indisponible. Vous pouvez continuer à utiliser l’application sur cet appareil.';
      if (!emailEnabled) return;
      makeButton('Connexion', () => setMode('login'));
      makeButton('Créer mon compte gratuit', () => setMode('signup'));
      makeButton('Mot de passe oublié', () => setMode('recover'));
      return;
    }
    info.textContent = user.email;
    if (user.admin) {
      const link = document.createElement('a');
      link.href = '/admin/';
      link.className = 'btn';
      link.textContent = 'DevisExpress Analytics';
      buttons.append(link);
    }
    makeButton('Synchroniser maintenant', () => reconcile(true));
    if (revision === 0) makeButton('Transférer mes données locales', transfer);
    makeButton('Se déconnecter', logout);
    if (!user.admin) makeButton('Supprimer mon compte', remove);
    if (conflicts.length) {
      makeButton('Exporter ma version', () => exportState(read()));
      makeButton('Exporter la version en ligne', async () => {
        const remote = await readCloud();
        if (remote.state) await exportState(remote.state);
      });
      makeButton('Reprendre la version en ligne', async () => {
        if (!window.confirm('Exporter votre version locale avant de reprendre la version en ligne ?')) return;
        const remote = await readCloud();
        if (!await exportState(read())) return;
        install(remote.state || empty(), true);
        acknowledge(remote);
      });
    }
  }
  function keepDraft() {
    if (!user) return;
    try {
      if (equal(read(), saved)) sessionStorage.removeItem(key());
      else sessionStorage.setItem(key(), JSON.stringify({ local: read(), saved, revision }));
    } catch { tell('Brouillon trop volumineux pour ce navigateur. Exportez vos modifications si la synchronisation échoue.'); }
  }
  async function readCloud(expected = user?.id, knownRevision = -1) {
    const remote = await api(knownRevision > 0 ? 'workspace?revision=' + knownRevision : 'workspace');
    if (remote.unchanged) remote.state = saved;
    if (remote.owner !== expected) throw new Error('Le compte actif a changé. Exportez votre brouillon et rechargez la page.');
    return remote;
  }
  function acknowledge(remote) {
    revision = remote.revision;
    saved = structuredClone(read());
    conflicts = [];
    keepDraft();
    render();
    tell(revision ? 'Sauvegarde en ligne à jour.' : 'Aucune sauvegarde en ligne pour ce compte.');
  }
  async function attach(newUser) {
    if (!safe()) throw new Error('Terminez l’action en cours, puis rechargez la page.');
    const remote = await readCloud(newUser.id);
    if (!safe()) throw new Error('Terminez l’action en cours, puis rechargez la page.');
    user = newUser;
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch { /* navigateur sans stockage */ }
    install(remote.state || empty(), true);
    acknowledge(remote);
    if (draft?.local && draft.saved) {
      revision = draft.revision;
      saved = draft.saved;
      install(draft.local, true);
      changed();
    }
  }
  function reconcile(force = false) {
    if (!user || (!force && (switching || conflicts.length)) || !safe()) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const remote = await readCloud(user.id, revision);
      if (!safe()) return;
      const draft = structuredClone(read());
      let candidate = draft;
      if (remote.revision !== revision) {
        const result = mergeWorkspace(saved, draft, remote.state || empty());
        conflicts = result.conflicts;
        if (conflicts.length) {
          render();
          tell('Modifications concurrentes : ' + conflicts.slice(0, 3).join(', ') + '. Les deux versions sont conservées. Vous pouvez les exporter avant de reprendre la version en ligne.');
          return;
        }
        candidate = result.merged;
      }
      if (equal(candidate, remote.state || empty())) {
        if (!equal(candidate, draft)) install(candidate, true);
        acknowledge(remote);
        return;
      }
      const next = await api('workspace', { owner: user.id, revision: remote.revision, state: candidate });
      // Les saisies effectuées pendant la requête restent dans le brouillon.
      const latest = read();
      revision = next.revision;
      saved = candidate;
      if (equal(latest, draft) && safe()) {
        if (!equal(candidate, draft)) install(candidate, true);
      } else if (!equal(draft, candidate)) {
        const result = mergeWorkspace(draft, latest, candidate);
        if (result.conflicts.length || !safe()) {
          // Garder l'ancienne base afin de détecter à nouveau la divergence.
          revision = -1;
          saved = draft;
          conflicts = result.conflicts;
        } else install(result.merged, true);
      }
      keepDraft();
      render();
      tell(conflicts.length ? 'Modifications concurrentes. Exportez vos versions avant de reprendre la sauvegarde en ligne.' :
        equal(read(), saved) ? 'Sauvegarde en ligne à jour.' : 'Modifications locales en attente.');
    })().catch(error => {
      tell(error.status === 409 ? 'Une sauvegarde a changé. Une nouvelle synchronisation sera tentée.' :
        error.status === 401 ? 'Session expirée. Exportez le brouillon si besoin, puis reconnectez-vous.' :
        (error.message || 'Connexion interrompue.') + ' Modifications conservées dans cet onglet.');
    }).finally(() => { inFlight = null; });
    return inFlight;
  }
  function changed() {
    if (!user) return;
    keepDraft();
    clearTimeout(timer);
    timer = setTimeout(() => reconcile(), 650);
  }
  async function transfer() {
    switching = true;
    try {
      const source = guest();
      if (equal(source, empty())) return tell('Aucune donnée locale à transférer.');
      if (!window.confirm('Copier les devis, la fiche entreprise et les réglages locaux dans ce compte ?')) return;
      await inFlight;
      const remote = await readCloud();
      if (remote.revision || !equal(read(), empty())) return tell('Ce compte contient déjà des données. Le transfert intégral reste disponible uniquement vers un compte vide. Votre copie locale est conservée et exportable.');
      const result = await api('workspace', { owner: user.id, revision: 0, state: source });
      if (!equal(read(), empty()) || !safe()) {
        tell('Transfert enregistré en ligne. Terminez vos modifications puis synchronisez.');
        return;
      }
      install(source, true);
      acknowledge(result);
    } finally { switching = false; }
  }
  async function logout() {
    switching = true;
    try {
      await reconcile(true);
      if (!equal(read(), saved) && !window.confirm('Des modifications sont en attente. Le brouillon restera dans cet onglet. Se déconnecter ?')) return;
      keepDraft();
      await api('logout', {});
      user = null;
      install(guest(), false);
      setMode('login');
      render();
      tell('Déconnecté. Vous utilisez les données locales de cet appareil.');
    } finally { switching = false; }
  }
  async function remove() {
    if (!window.confirm('Supprimer définitivement votre compte et sa sauvegarde en ligne ? Exportez une copie depuis le profil si vous souhaitez la conserver.')) return;
    switching = true;
    try {
      await inFlight;
      await api('delete-account', { confirm: 'SUPPRIMER' });
      try { sessionStorage.removeItem(key()); } catch { /* navigateur sans stockage */ }
      user = null;
      install(guest(), false);
      setMode('login');
      render();
      tell('Compte et sauvegarde en ligne supprimés.');
    } finally { switching = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (switching || !safe()) return;
    switching = true;
    const submit = form.querySelector('button');
    submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if (mode === 'signup') data.test = isTestMode();
      const result = await api(mode, data);
      if (mode === 'login') await attach(result.user);
      if (mode === 'signup') tell('Consultez votre boîte email pour confirmer votre adresse.');
      if (mode === 'recover') tell('Si un compte existe pour cette adresse, un lien de réinitialisation sera envoyé.');
      if (mode === 'password') { form.hidden = true; tell('Mot de passe enregistré.'); }
      form.elements.password.value = '';
    } catch (error) { tell(error.message || 'Connexion interrompue. Réessayez.'); }
    finally { submit.disabled = false; switching = false; }
  });
  accountButton.addEventListener('click', () => { panel.hidden = !panel.hidden; accountButton.setAttribute('aria-expanded', String(!panel.hidden)); });
  setMode('login');
  render();
  const query = new URLSearchParams(location.search);
  if (query.has('compte')) accountButton.click();
  api('config').then(async options => {
    enabled = options.enabled;
    emailEnabled = enabled && options.email === true;
    if (options.google) google.href = '/api/v2/google';
    render();
    if (!enabled) return;
    const session = await api('session');
    if (session.user) await attach(session.user);
    if (emailEnabled && session.user && query.get('compte') === 'reinitialiser') setMode('password');
    else if (emailEnabled && !session.user && query.get('compte') === 'creer') setMode('signup');
    if (query.has('compte')) history.replaceState(null, '', location.pathname + location.hash);
  }).catch(() => tell('Impossible de joindre la sauvegarde en ligne. Vos données locales restent accessibles.'));
  setInterval(() => { if (document.visibilityState === 'visible') reconcile(); }, 45000);
  window.addEventListener('focus', () => reconcile());
  window.addEventListener('online', () => reconcile());
  return { changed, isAdmin: () => Boolean(user?.admin), switchInProgress: () => switching };
}
