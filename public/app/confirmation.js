import { api } from '../api.js';

const parameters = new URLSearchParams(location.hash.slice(1));
const token = parameters.get('token');
const type = parameters.get('type');
history.replaceState(null, '', location.pathname);
const title = document.querySelector('#confirmation-title');
const status = document.querySelector('#confirmation-status');
const button = document.querySelector('#confirmation-submit');

if (!token || !['email', 'signup', 'recovery'].includes(type)) {
  status.textContent = 'Ouvrez le lien de votre email de confirmation ou de réinitialisation.';
} else {
  button.disabled = false;
  if (type === 'recovery') {
    title.textContent = 'Réinitialisez votre mot de passe';
    status.textContent = 'Continuez pour choisir un nouveau mot de passe.';
    button.textContent = 'Continuer la réinitialisation';
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { next } = await api('confirm-email', { token, type });
      location.replace(next);
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });
}
