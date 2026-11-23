# DevisExpress — version 1

Application web pour artisans : devis professionnels en 2 minutes grâce à l'IA, PDF soigné, suivi des relances.

Ce dossier contient **tout le code**. Il vous appartient : vous pouvez l'héberger, le modifier et le vendre sans dépendre de qui que ce soit.

---

## 1. Ce que contient le projet

```
devisexpress/
├── public/                     ← le site
│   ├── index.html              ← page d'accueil commerciale (offre, tarifs, FAQ)
│   └── app/                    ← l'application
│       ├── index.html
│       ├── app.js              ← logique (devis, relances, profil, bibliothèque…)
│       ├── pdf.js              ← création du PDF
│       ├── prompts.js          ← consignes envoyées à l'IA
│       ├── styles.css
│       └── vendor/pdf-lib.min.js  (bibliothèque PDF, licence MIT)
├── netlify/functions/ai.mjs    ← le petit serveur qui parle à l'IA avec VOTRE clé
├── netlify.toml                ← réglages d'hébergement
└── package.json
```

## 2. Fonctionnalités de la v1

- **Profil entreprise** rempli une fois : nom, SIRET, adresse, TVA (ou franchise en base), assurance, médiateur, logo, couleur, numérotation.
- **Saisie du chantier en langage naturel ou à la voix** → l'IA crée les lignes du devis.
- **Bibliothèque de prestations** : vos prix sont utilisés en priorité ; les prix estimés par l'IA sont surlignés.
- **Texte de présentation** rédigé par l'IA.
- **Calculs automatiques** : TVA par taux (20 / 10 / 5,5 / 0 %), remise, acompte.
- **PDF A4 professionnel** : multipage, logo, mentions, zone « Bon pour accord ».
- **Relances** à J+3, J+7 et J+14 (modifiables) : message email et SMS prêts, personnalisables par l'IA.
- **Tableau de bord** : devis du mois, en attente, signés, taux de signature.
- **Sauvegarde** : export et import des données en un clic.
- **Modèles de devis par métier** (plomberie, électricité, peinture, carrelage, menuiserie, chauffage, multi-services) et **modèles personnels** (« Enregistrer comme modèle »).
- Fonctionne **sans IA** : tant qu'aucune clé n'est configurée, l'application passe toute seule en mode sans IA. Les lignes sont préparées à partir de la description, les prix sont repris de la bibliothèque, le texte de présentation est rédigé automatiquement (3 formulations au choix). Les boutons propres à l'IA sont masqués.

## 3. Mettre en ligne (environ 30 minutes, sans coder)

Vous aurez besoin de trois comptes gratuits ou presque.

### Étape 1 — Clé API pour l'IA (optionnelle)

L'application marche sans clé. Pour activer l'IA, trois possibilités :
- **Gratuit pour tester : Google Gemini.** Sur aistudio.google.com, « Get API key » → « Create API key ». Dans Netlify, ajoutez `GEMINI_API_KEY`. Attention : en gratuit, Google peut utiliser les demandes pour améliorer ses produits ; passez en payant avant d'y mettre les données de vrais clients.
- **Groq (gratuit, compatible OpenAI)** : `OPENAI_API_KEY` = votre clé Groq, `OPENAI_BASE_URL` = `https://api.groq.com/openai/v1`, `AI_PROVIDER` = `openai`, `AI_MODEL` = un modèle listé dans la console Groq.
- **Payant (recommandé pour la production) : Anthropic**, comme ci-dessous.

1. Créez un compte sur **console.anthropic.com** (ou platform.openai.com si vous préférez OpenAI).
2. Ajoutez un moyen de paiement et un petit crédit (10 € suffisent pour commencer : un devis coûte une fraction de centime avec un modèle rapide).
3. **Fixez une limite de dépense mensuelle** dans la console (sécurité).
4. Créez une clé API et copiez-la. Ne la partagez jamais, ne la mettez jamais dans le code.

### Étape 2 — Mettre le code sur GitHub
1. Créez un compte sur **github.com**.
2. Créez un nouveau dépôt privé (« New repository »), nommé `devisexpress`.
3. Cliquez sur « uploading an existing file » et glissez **tout le contenu** du dossier `devisexpress` (en gardant l'arborescence). Validez (« Commit changes »).

### Étape 3 — Héberger sur Netlify
1. Créez un compte sur **netlify.com** (connexion avec GitHub).
2. « Add new site » → « Import an existing project » → GitHub → choisissez `devisexpress`.
3. Laissez les réglages proposés (ils sont lus dans `netlify.toml`) et cliquez sur « Deploy ».
4. Dans **Site configuration → Environment variables**, ajoutez :
   - `ANTHROPIC_API_KEY` = votre clé (ou `AI_PROVIDER` = `openai` et `OPENAI_API_KEY` = votre clé)
   - (conseillé) `ALLOWED_ORIGIN` = l'adresse de votre site, par exemple `https://devisexpress.netlify.app`
5. « Deploys » → « Trigger deploy » pour prendre en compte la clé.

Votre site est en ligne : page d'accueil à la racine, application sur `/app/`.

### Étape 4 — Votre nom de domaine (optionnel, ~10 €/an)
Achetez un domaine (OVH, Gandi, Namecheap…) et reliez-le dans Netlify : **Domain management → Add a domain**. Le HTTPS est automatique.

> Important : Netlify « Drop » (le glisser-déposer sans GitHub) ne publie **pas** le serveur IA. Passez par GitHub comme ci-dessus, ou par la commande `netlify deploy` si vous êtes à l'aise.

## 4. Modifier l'application

- **Modèle d'IA** : variable `AI_MODEL` (par défaut `claude-haiku-5-5` chez Anthropic, `gpt-4o-mini` chez OpenAI : vérifiez les noms de modèles actuels dans la documentation du fournisseur).
- **Consignes de l'IA** : `public/app/prompts.js`.
- **Couleurs et style** : `public/app/styles.css`.
- **Textes de la page d'accueil et tarifs** : `public/index.html`.
- **Modèles de relance par défaut** : début de `public/app/app.js` (`DEFAULT_TEMPLATES`). Chaque artisan peut aussi les modifier dans son profil.

Après chaque modification envoyée sur GitHub, Netlify remet le site à jour tout seul.

## 5. Limites de cette v1 (à savoir avant de vendre)

| Point | Situation en v1 | Prévu en v2 |
|---|---|---|
| Comptes utilisateurs | Pas de connexion : les données restent dans le navigateur de l'artisan | Connexion par email (Supabase), données sur le serveur, accès depuis tous ses appareils |
| Paiement | Les formules de la page d'accueil ne sont pas encore appliquées (pas de limite de 3 devis, pas d'essai de 14 jours) | Abonnement Stripe, limites du plan gratuit, essai gratuit |
| Relances | Le message est prêt au bon moment ; l'artisan l'envoie en un clic depuis sa messagerie | Envoi automatique des emails (Brevo ou Resend) |
| Protection de l'IA | Limite de 60 demandes par heure et par adresse IP | IA réservée aux abonnés connectés |
| Facture, signature en ligne | Non | Transformation devis → facture, signature électronique |

Tant que la v2 n'est pas en place, le plus simple est de **vendre « à la main »** à vos premiers clients (virement ou lien de paiement Stripe), en leur donnant l'adresse de l'application.

## 6. Obligations légales pour VOTRE activité

- Créez votre statut (micro-entreprise suffit pour démarrer).
- Remplacez les liens du pied de page par de vraies pages : **mentions légales, CGU/CGV, politique de confidentialité** (RGPD). Des générateurs gratuits existent ; faites-les relire si possible.
- Les mentions obligatoires d'un devis varient selon le métier et le statut de l'artisan : faites valider le modèle de devis par un expert-comptable avant de le commercialiser largement.
- Les prix proposés par l'IA sont des suggestions : l'application le signale clairement à l'artisan, gardez ce garde-fou.

## 7. Tester sur votre ordinateur

Avec Node.js installé : `npm install -g netlify-cli`, puis dans ce dossier `netlify dev`, et ouvrez l'adresse affichée. Pour l'IA en local, créez un fichier `.env` contenant `ANTHROPIC_API_KEY=...` (ne l'envoyez jamais sur GitHub).
