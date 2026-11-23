// DevisExpress — consignes envoyées à l'IA.
// Ce fichier est utilisé à la fois par le navigateur (démo) et par le serveur
// (netlify/functions/ai.mjs), pour que l'IA reçoive exactement les mêmes consignes.

const clip = (s, n) => String(s ?? '').slice(0, n);

export const TASKS = ['lignes', 'intro', 'relance'];

/** Transforme une description libre du chantier en lignes de devis. */
function promptLignes(d) {
  const biblio = (d.bibliotheque || []).slice(0, 80)
    .map(p => `- ${clip(p.designation, 120)} | unité: ${clip(p.unite, 10)} | prix HT: ${Number(p.prixHT) || 0} €`)
    .join('\n') || '(vide)';
  return `Tu es l'assistant d'un artisan français (${clip(d.metier, 80) || 'artisan du bâtiment'}).
Transforme la description de chantier ci-dessous en lignes de devis claires et professionnelles.

Règles :
- Utilise EN PRIORITÉ les prestations de la bibliothèque de l'artisan, avec SES prix (mets "estime": false).
- Si une prestation n'existe pas dans la bibliothèque, propose un prix unitaire HT réaliste pour la France et mets "estime": true.
- Sépare la fourniture et la main-d'œuvre quand c'est l'usage du métier. Ajoute le déplacement ou l'évacuation des gravats seulement s'ils sont mentionnés.
- Désignations courtes et précises (max 80 caractères). "details" : une phrase optionnelle de précision (marque, dimension, méthode), sinon "".
- Unités autorisées : u, h, j, m², ml, m³, kg, forfait, lot, ens.
- Quantités numériques. N'invente pas de quantités absurdes : si inconnue, mets 1.
- N'invente aucune information sur le client.

Bibliothèque de l'artisan :
${biblio}

Description du chantier :
"""${clip(d.description, 4000)}"""

Réponds UNIQUEMENT avec du JSON valide, sans texte autour, au format :
{"objet":"titre court du chantier","lignes":[{"designation":"","details":"","qte":1,"unite":"u","pu":0,"estime":false}]}`;
}

/** Rédige le texte de présentation du devis. */
function promptIntro(d) {
  const lignes = (d.lignes || []).slice(0, 40).map(l => `- ${clip(l.designation, 100)} (${l.qte} ${clip(l.unite, 10)})`).join('\n');
  return `Tu rédiges le court texte de présentation placé en haut d'un devis d'artisan français.

Entreprise : ${clip(d.entreprise, 120)} — métier : ${clip(d.metier, 80) || 'artisan'}
Client : ${clip(d.client, 120) || 'le client'}
Objet du chantier : ${clip(d.objet, 200)}
${d.dateDebut ? `Début des travaux envisagé : ${clip(d.dateDebut, 40)}\n` : ''}${d.duree ? `Durée estimée : ${clip(d.duree, 60)}\n` : ''}Prestations :
${lignes || '(non précisées)'}
${d.consigne ? `Consigne de l'artisan : ${clip(d.consigne, 300)}\n` : ''}
Règles :
- 3 à 5 phrases, vouvoiement, ton professionnel, chaleureux et rassurant, sans superlatifs creux.
- Commence par "Madame, Monsieur," ou "Bonjour ${clip(d.client, 60) || ''}," selon que le nom du client est connu.
- Reformule le besoin du client, résume ce qui est prévu, mentionne le soin apporté au chantier (propreté, respect des délais).
- N'invente AUCUNE certification, garantie, label, prix ou date qui ne figure pas ci-dessus.
- Termine en invitant à retourner le devis signé ou à appeler pour toute question.
- Pas de signature, pas de formule d'objet, pas de markdown.

Réponds uniquement avec le texte.`;
}

/** Personnalise un message de relance. */
function promptRelance(d) {
  return `Tu aides un artisan français à relancer un client qui n'a pas encore répondu à un devis.

Relance n°${Number(d.niveau) || 1} sur 3 (1 = simple prise de nouvelles, 2 = proposer de réserver une date, 3 = dernière relance polie).
Canal : ${d.canal === 'sms' ? 'SMS (max 300 caractères)' : 'email (avec une première ligne "Objet : ...")'}
Artisan : ${clip(d.artisan, 120)} — téléphone : ${clip(d.tel, 30)}
Client : ${clip(d.client, 120)}
Devis n°${clip(d.numero, 40)} du ${clip(d.dateEnvoi, 20)} — ${clip(d.objet, 200)} — montant ${clip(d.montant, 30)} TTC
Valable jusqu'au : ${clip(d.validite, 20)}
${d.consigne ? `Consigne de l'artisan : ${clip(d.consigne, 300)}\n` : ''}
Règles : vouvoiement, court, humain, jamais insistant ni culpabilisant, aucune information inventée. Pas de markdown.
Réponds uniquement avec le message.`;
}

export function buildPrompt(task, data) {
  if (task === 'lignes') return promptLignes(data || {});
  if (task === 'intro') return promptIntro(data || {});
  if (task === 'relance') return promptRelance(data || {});
  throw new Error('Tâche inconnue');
}

/** Extrait un objet JSON d'une réponse d'IA, même entourée de texte ou de ```json. */
export function parseJSON(text) {
  const s = String(text || '');
  try { return JSON.parse(s); } catch (e) { /* on cherche plus loin */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { /* rien */ }
  }
  return null;
}
