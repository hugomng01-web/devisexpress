import { api } from '../api.js';

const $ = selector => document.querySelector(selector);
const status = $('#admin-status');
const metricList = [
  ['accounts_total', 'Comptes confirmés au total'],
  ['accounts_new', 'Comptes créés sur la période, confirmés'],
  ['active_accounts', 'Comptes actifs mesurés'],
  ['returning_accounts', 'Comptes actifs sur plusieurs jours'],
  ['retention', 'Taux de retour des comptes actifs mesurés'],
  ['visitors', 'Navigateurs visiteurs estimés, hors connexion'],
  ['browsers', 'Navigateurs invités actifs'],
  ['returning_browsers', 'Navigateurs invités actifs sur plusieurs jours'],
  ['declared_pro', 'Profils professionnels déclarés'],
  ['declared_beta', 'Profils bêta-testeurs déclarés'],
  ['quotes', 'Créations de devis observées'],
  ['pro_quotes', 'Devis déclarés professionnels'],
  ['pdfs', 'PDF générés'],
  ['reminders', 'Relances marquées comme faites'],
  ['ai', 'Réponses IA reçues et mesurées'],
  ['reviews_received', 'Avis reçus encore conservés'],
  ['reviews_published', 'Avis publiés sur la période'],
  ['reviews_average', 'Note moyenne des avis publiés sur la période'],
];
let lastStats, offset = 0, statsLoad = 0, reviewsLoad = 0;
const node = (tag, content, className) => {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
};
function showChart(series) {
  if (!series.length) { $('#chart').replaceChildren(node('p', 'Aucune activité mesurée sur cette période.')); return; }
  const table = node('table', undefined, 'chart-table');
  const head = table.createTHead().insertRow();
  const types = [['accounts', 'Inscriptions'], ['quotes', 'Devis'], ['active', 'Activité']];
  for (const label of ['Date', ...types.map(([, label]) => label)]) head.append(node('th', label));
  const body = table.createTBody();
  const scale = Math.max(1, ...series.flatMap(day => types.map(([key]) => day[key])));
  for (const day of series.slice(-30).reverse()) {
    const row = body.insertRow();
    row.insertCell().textContent = day.date.split('-').reverse().join('/');
    for (const [key] of types) {
      const cell = row.insertCell();
      cell.textContent = day[key];
      const bar = node('span', undefined, 'bar bar-' + key);
      bar.style.width = (100 * day[key] / scale) + '%';
      bar.setAttribute('aria-hidden', 'true');
      cell.append(bar);
    }
  }
  $('#chart').replaceChildren(table);
}
async function loadStats() {
  const request = ++statsLoad;
  status.textContent = 'Chargement des statistiques…';
  $('#csv').disabled = true;
  try {
    const days = $('#period').value;
    const data = await api('admin/stats?days=' + days);
    if (request !== statsLoad) return;
    data.retention = data.active_accounts ? Math.round(1000 * data.returning_accounts / data.active_accounts) / 10 : null;
    lastStats = { days, data };
    $('#metrics').replaceChildren(...metricList.map(([id, label]) => {
      const card = node('article', undefined, 'metric');
      const value = data[id] == null ? '—' : new Intl.NumberFormat('fr-FR').format(data[id]) + (id === 'retention' ? ' %' : id === 'reviews_average' ? ' / 5' : '');
      card.append(node('span', label), node('strong', value));
      return card;
    }));
    showChart(data.series);
    $('#csv').disabled = false;
    status.textContent = '';
  } catch (error) { if (request === statsLoad) status.textContent = error.message; }
}
function csv() {
  const { days, data } = lastStats;
  const row = fields => fields.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',');
  const exported = new Date().toISOString();
  const rows = [['export_utc', 'période_jours', 'date_paris', 'métrique', 'valeur']];
  for (const [id, label] of metricList) rows.push([exported, days, '', label, data[id]]);
  for (const day of data.series) for (const [key, label] of [['accounts', 'Comptes confirmés'], ['quotes', 'Devis observés'], ['active', 'Activité mesurée']]) rows.push([exported, days, day.date, label, day[key]]);
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = node('a');
  link.href = url;
  link.download = 'devisexpress-analytics-' + exported.slice(0, 10) + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function loadReviews() {
  const request = ++reviewsLoad;
  const filter = $('#review-status').value;
  status.textContent = 'Chargement des avis…';
  try {
    const { reviews } = await api('admin/reviews?status=' + filter + '&offset=' + offset);
    if (request !== reviewsLoad) return;
    $('#earlier').disabled = offset === 0;
    $('#later').disabled = reviews.length < 50;
    $('#review-queue').replaceChildren(...(reviews.length ? reviews.map(review => {
      const article = node('article', undefined, 'panel');
      const profile = review.profile === 'professionnel' ? 'Professionnel déclaré' : 'Bêta-testeur déclaré';
      const date = new Date(review.created_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
      article.append(node('h3', review.rating + ' / 5 · ' + review.author),
        node('p', [profile, review.trade, review.company, 'Déposé le ' + date, 'Utilisé le ' + review.experience_date.split('-').reverse().join('/')].filter(Boolean).join(' · '), 'muted'), node('p', review.comment));
      const actions = { pending: [['Publier', 'published'], ['Refuser', 'rejected']], published: [['Retirer', 'withdrawn']], rejected: [['Publier', 'published']], withdrawn: [] };
      const bar = node('div', undefined, 'toolbar');
      for (const [label, target] of actions[review.status]) {
        const button = node('button', label);
        button.addEventListener('click', async () => {
          if (!confirm(label + ' cet avis ?')) return;
          for (const item of bar.children) item.disabled = true;
          try { await api('admin/reviews', { id: review.id, previous: review.status, status: target }); await loadReviews(); }
          catch (error) { status.textContent = error.message; for (const item of bar.children) item.disabled = false; }
        });
        bar.append(button);
      }
      article.append(bar);
      return article;
    }) : [node('p', 'Aucun avis dans cette catégorie.')]));
    status.textContent = '';
  } catch (error) { if (request === reviewsLoad) status.textContent = error.message; }
}
function view(reviews) {
  $('#show-stats').setAttribute('aria-pressed', String(!reviews));
  $('#show-reviews').setAttribute('aria-pressed', String(reviews));
  $('#stats').hidden = reviews;
  $('#moderation').hidden = !reviews;
  if (reviews) { statsLoad++; loadReviews(); }
  else { reviewsLoad++; loadStats(); }
}
$('#show-stats').onclick = () => view(false);
$('#show-reviews').onclick = () => view(true);
$('#period').onchange = loadStats;
$('#review-status').onchange = () => { offset = 0; loadReviews(); };
$('#earlier').onclick = () => { offset = Math.max(0, offset - 50); loadReviews(); };
$('#later').onclick = () => { offset += 50; loadReviews(); };
$('#csv').onclick = csv;

api('session').then(({ user }) => {
  if (!user?.admin) { status.textContent = 'Connectez-vous avec le compte administrateur pour accéder aux données.'; return; }
  $('#dashboard').hidden = false;
  loadStats();
}).catch(() => { status.textContent = 'Espace administrateur momentanément indisponible.'; });
