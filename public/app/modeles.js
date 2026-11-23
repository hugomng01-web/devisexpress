// DevisExpress — modèles de devis par métier et textes automatiques (fonctionnent sans IA).
// Les prix sont laissés vides : ils sont repris de la bibliothèque de l'artisan quand une
// prestation porte le même nom, sinon l'artisan les complète (lignes surlignées).

export const MODELES = [
  { metier: 'Plomberie', items: [
    { nom: 'Remplacement de chauffe-eau', objet: 'Remplacement du chauffe-eau', duree: '1 jour', lignes: [
      ['Chauffe-eau électrique (fourniture)', 'Capacité et marque à préciser', 1, 'u'],
      ['Dépose et évacuation de l\'ancien chauffe-eau', '', 1, 'forfait'],
      ['Groupe de sécurité', '', 1, 'u'],
      ['Raccordements hydrauliques et électriques', '', 1, 'forfait'],
      ['Main-d\'œuvre plombier', 'Pose, mise en eau et mise en service', 3, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Recherche et réparation de fuite', objet: 'Recherche et réparation de fuite', duree: '1 jour', lignes: [
      ['Recherche de fuite', 'Diagnostic et localisation', 1, 'forfait'],
      ['Réparation de canalisation', 'Remplacement du tronçon endommagé', 1, 'forfait'],
      ['Fournitures (raccords, tube)', '', 1, 'lot'],
      ['Main-d\'œuvre plombier', '', 2, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Remplacement de WC', objet: 'Remplacement des WC', duree: '1 demi-journée', lignes: [
      ['WC complet (fourniture)', 'Modèle à préciser', 1, 'u'],
      ['Dépose et évacuation de l\'ancien WC', '', 1, 'forfait'],
      ['Main-d\'œuvre plombier', 'Pose et raccordement', 2, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Transformation baignoire en douche', objet: 'Transformation de la baignoire en douche', duree: '3 jours', lignes: [
      ['Dépose de la baignoire et évacuation', '', 1, 'forfait'],
      ['Receveur de douche extra-plat (fourniture)', 'Dimensions à préciser', 1, 'u'],
      ['Paroi de douche (fourniture)', '', 1, 'u'],
      ['Colonne ou mitigeur de douche (fourniture)', '', 1, 'u'],
      ['Reprise de l\'évacuation', '', 1, 'forfait'],
      ['Faïence murale (pose)', '', 6, 'm²'],
      ['Main-d\'œuvre plombier', '', 16, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
  ] },
  { metier: 'Électricité', items: [
    { nom: 'Remplacement du tableau électrique', objet: 'Remplacement et mise en conformité du tableau électrique', duree: '1 jour', lignes: [
      ['Tableau électrique (fourniture)', 'Nombre de rangées à préciser', 1, 'u'],
      ['Disjoncteurs divisionnaires', '', 10, 'u'],
      ['Interrupteurs différentiels 30 mA', '', 2, 'u'],
      ['Dépose de l\'ancien tableau', '', 1, 'forfait'],
      ['Main-d\'œuvre électricien', 'Câblage, repérage des circuits, essais', 6, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Ajout de prises et points lumineux', objet: 'Création de prises et de points lumineux', duree: '1 jour', lignes: [
      ['Création de prise de courant', 'Fourniture et pose, encastrée', 4, 'u'],
      ['Création de point lumineux', 'Fourniture et pose', 2, 'u'],
      ['Interrupteur (fourniture et pose)', '', 2, 'u'],
      ['Câbles et gaines', '', 1, 'lot'],
      ['Main-d\'œuvre électricien', '', 5, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Installation d\'une VMC', objet: 'Installation d\'une VMC simple flux', duree: '1 jour', lignes: [
      ['VMC simple flux (fourniture)', 'Modèle à préciser', 1, 'u'],
      ['Bouches d\'extraction', '', 3, 'u'],
      ['Gaines et accessoires', '', 1, 'lot'],
      ['Main-d\'œuvre électricien', 'Pose, raccordement et mise en service', 5, 'h'],
      ['Déplacement', '', 1, 'forfait'] ] },
  ] },
  { metier: 'Peinture', items: [
    { nom: 'Peinture d\'une pièce', objet: 'Peinture murs et plafond', duree: '2 jours', lignes: [
      ['Protection des sols et du mobilier', '', 1, 'forfait'],
      ['Préparation des supports', 'Rebouchage, ponçage, sous-couche', 30, 'm²'],
      ['Peinture murs (2 couches)', 'Finition mate ou satinée', 30, 'm²'],
      ['Peinture plafond (2 couches)', '', 12, 'm²'],
      ['Nettoyage de fin de chantier', '', 1, 'forfait'] ] },
    { nom: 'Pose de papier peint', objet: 'Pose de papier peint', duree: '1 jour', lignes: [
      ['Dépose de l\'ancien revêtement', '', 20, 'm²'],
      ['Préparation des murs', '', 20, 'm²'],
      ['Pose de papier peint', 'Papier fourni par le client', 20, 'm²'],
      ['Nettoyage de fin de chantier', '', 1, 'forfait'] ] },
    { nom: 'Peinture de façade', objet: 'Ravalement et peinture de façade', duree: '5 jours', lignes: [
      ['Installation d\'échafaudage', '', 1, 'forfait'],
      ['Nettoyage haute pression de la façade', '', 80, 'm²'],
      ['Traitement des fissures', '', 1, 'forfait'],
      ['Peinture façade (2 couches)', '', 80, 'm²'],
      ['Repli de chantier et nettoyage', '', 1, 'forfait'] ] },
  ] },
  { metier: 'Carrelage', items: [
    { nom: 'Pose de carrelage au sol', objet: 'Pose de carrelage au sol', duree: '3 jours', lignes: [
      ['Dépose de l\'ancien revêtement et évacuation', '', 20, 'm²'],
      ['Ragréage du sol', '', 20, 'm²'],
      ['Pose de carrelage', 'Carrelage fourni par le client', 20, 'm²'],
      ['Plinthes (fourniture et pose)', '', 18, 'ml'],
      ['Joints et nettoyage', '', 1, 'forfait'] ] },
    { nom: 'Faïence de salle de bain', objet: 'Pose de faïence murale en salle de bain', duree: '2 jours', lignes: [
      ['Préparation des murs', '', 15, 'm²'],
      ['Pose de faïence murale', '', 15, 'm²'],
      ['Profilés de finition', '', 8, 'ml'],
      ['Joints et nettoyage', '', 1, 'forfait'] ] },
  ] },
  { metier: 'Menuiserie', items: [
    { nom: 'Remplacement de fenêtre', objet: 'Remplacement de fenêtres', duree: '1 jour', lignes: [
      ['Fenêtre PVC double vitrage (fourniture)', 'Dimensions à préciser', 2, 'u'],
      ['Dépose des anciennes fenêtres', '', 2, 'u'],
      ['Pose en rénovation', '', 2, 'u'],
      ['Habillages et finitions', '', 1, 'forfait'],
      ['Évacuation des déchets', '', 1, 'forfait'] ] },
    { nom: 'Pose de porte intérieure', objet: 'Pose de portes intérieures', duree: '1 jour', lignes: [
      ['Bloc-porte intérieur (fourniture)', '', 2, 'u'],
      ['Dépose des anciennes portes', '', 2, 'u'],
      ['Pose et réglage', '', 2, 'u'],
      ['Poignées (fourniture et pose)', '', 2, 'u'] ] },
  ] },
  { metier: 'Chauffage et climatisation', items: [
    { nom: 'Entretien de chaudière', objet: 'Entretien annuel de la chaudière', duree: '1 heure', lignes: [
      ['Entretien annuel chaudière gaz', 'Nettoyage, contrôle, réglages et attestation d\'entretien', 1, 'forfait'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Installation de climatisation', objet: 'Installation d\'une climatisation réversible', duree: '1 jour', lignes: [
      ['Climatiseur réversible mono-split (fourniture)', 'Puissance à préciser', 1, 'u'],
      ['Liaisons frigorifiques et support', '', 1, 'lot'],
      ['Pose et mise en service', '', 1, 'forfait'],
      ['Déplacement', '', 1, 'forfait'] ] },
  ] },
  { metier: 'Multi-services', items: [
    { nom: 'Petits travaux à l\'heure', objet: 'Petits travaux', duree: '1 jour', lignes: [
      ['Main-d\'œuvre', '', 4, 'h'],
      ['Petites fournitures', '', 1, 'lot'],
      ['Déplacement', '', 1, 'forfait'] ] },
    { nom: 'Montage de meubles', objet: 'Montage de meubles', duree: '1 demi-journée', lignes: [
      ['Montage de meuble', '', 3, 'u'],
      ['Fixation murale', '', 2, 'u'],
      ['Évacuation des emballages', '', 1, 'forfait'] ] },
  ] },
];

const lower1 = s => { const t = String(s || '').trim(); return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
const FEM = ['rénovation', 'renovation', 'pose', 'installation', 'création', 'transformation', 'réparation', 'peinture', 'mise', 'recherche', 'réfection', 'construction', 'dépose', 'fourniture', 'remise', 'motorisation', 'isolation', 'démolition', 'maintenance'];
const MASC = ['remplacement', 'entretien', 'ravalement', 'montage', 'changement', 'nettoyage', 'raccordement', 'dépannage', 'aménagement', 'traitement', 'débouchage', 'carrelage', 'ajout'];
/** "Remplacement du chauffe-eau" -> "le remplacement du chauffe-eau" */
function avecArticle(objet) {
  const o = lower1(objet);
  if (!o) return 'vos travaux';
  const w = o.split(/\s+/)[0].replace(/[^a-zàâäéèêëîïôöùûüç'-]/gi, '');
  if (/^(le|la|les|l'|un|une|des|vos|votre|du)\b/.test(o)) return o;
  if (FEM.includes(w) || MASC.includes(w)) return (/^[aeiouyéèêàh]/i.test(w) ? "l'" : FEM.includes(w) ? 'la ' : 'le ') + o;
  return `votre projet : ${o}`;
}
const isPro = nom => /\b(sci|sarl|sas|eurl|sasu|sa|syndic|copropri|société|ste|ets|mairie|agence)\b/i.test(nom || '');
function salutation(nom) {
  const n = String(nom || '').trim();
  if (!n) return 'Madame, Monsieur,';
  if (isPro(n)) return 'Madame, Monsieur,';
  if (/^(m\.|mme|mlle|monsieur|madame)\b/i.test(n)) return `Bonjour ${n},`;
  return `Bonjour ${n},`;
}
function liste(lignes) {
  const noms = lignes.map(l => String(l.designation || '').trim()).filter(Boolean)
    .filter(n => !/^(déplacement|main-d.?œuvre|main d.?oeuvre)/i.test(n)).slice(0, 4).map(lower1);
  if (!noms.length) return '';
  if (noms.length === 1) return noms[0];
  return noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
}

/**
 * Texte de présentation automatique, sans IA. `variante` permet de proposer d'autres formulations.
 * @param d { client, objet, lignes, dateDebut (jj/mm/aaaa), duree, entreprise }
 */
export function texteIntro(d, variante = 0) {
  const objet = avecArticle(d.objet);
  const l = liste(d.lignes || []);
  const planning = [d.dateDebut ? `les travaux pourraient débuter le ${d.dateDebut}` : '', d.duree ? `pour une durée estimée de ${d.duree}` : ''].filter(Boolean).join(', ');
  const v = ((variante % 3) + 3) % 3;
  if (v === 0) {
    return `${salutation(d.client)}

Suite à notre échange, j'ai le plaisir de vous adresser mon devis pour ${objet}.${l ? ` La prestation comprend notamment ${l}.` : ''}${planning ? ` Selon mon planning, ${planning}.` : ''} Le chantier sera mené avec soin, dans le respect des délais, et laissé propre à notre départ.

Je reste à votre disposition pour toute question ou adaptation. Pour valider, il vous suffit de me retourner ce devis signé avec la mention « Bon pour accord ».`;
  }
  if (v === 1) {
    return `${salutation(d.client)}

Merci pour votre confiance. Comme convenu, voici ma proposition détaillée pour ${objet}.${l ? ` Elle inclut ${l}, avec des fournitures de qualité et une mise en œuvre soignée.` : ''}${planning ? ` À titre indicatif, ${planning}.` : ''}

Chaque poste est détaillé ci-dessous pour une totale transparence. N'hésitez pas à m'appeler si vous souhaitez en discuter ; dès réception du devis signé, je bloque une date pour votre chantier.`;
  }
  return `${salutation(d.client)}

Vous trouverez ci-dessous mon devis pour ${objet}.${planning ? ` ${planning.charAt(0).toUpperCase() + planning.slice(1)}.` : ''} Je reste joignable pour toute question.

Pour confirmer, il suffit de me retourner ce devis signé.`;
}
