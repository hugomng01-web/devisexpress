import { api } from './api.js';
import { setupPrivacy } from './telemetry.js';

setupPrivacy();
const list = document.querySelector('#review-list');
const empty = document.querySelector('#review-empty');
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
};
async function refreshReviews() {
  try {
    const { reviews } = await api('reviews');
    empty.hidden = Boolean(reviews.length);
    list.replaceChildren(...reviews.map(review => {
      const article = node('article', '', 'box review-card');
      const rating = node('span', '★'.repeat(review.rating), 'review-rating');
      rating.setAttribute('aria-label', review.rating + ' sur 5');
      const status = review.profile === 'professionnel' ? 'Professionnel déclaré' : 'Bêta-testeur déclaré';
      article.append(rating, node('h3', review.author), node('p', review.comment),
        node('small', [status, review.trade, review.company].filter(Boolean).join(' · ')),
        node('p', 'Utilisé le ' + review.experience_date.split('-').reverse().join('/') + ' · Publié le ' +
          new Date(review.published_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })));;
      return article;
    }));
  } catch { empty.textContent = 'Les avis sont momentanément indisponibles.'; }
}
document.querySelector('#review-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const output = document.querySelector('#review-result');
  const button = form.querySelector('button');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    const result = await api('reviews', { ...data, rating: Number(data.rating), consent: data.consent === 'on' });
    output.replaceChildren(document.createTextNode('Merci. Votre avis est en attente de modération.'));
    if (result.receipt) output.append(node('br', ''), node('span', 'Conservez ce code de retrait : ' + result.receipt));
    form.reset();
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#review-withdraw').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const output = document.querySelector('#withdraw-result');
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('review-withdraw', Object.fromEntries(new FormData(form)));
    output.textContent = 'Demande traitée. Si le code correspondait à un avis, celui-ci a été supprimé.';
    form.reset();
    refreshReviews();
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; }
});
refreshReviews();
