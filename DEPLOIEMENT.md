# Mise en service de DevisExpress V2

Cette livraison prépare une seule mise à jour. La version publique existante ne fait pas partie de l’environnement de test.

## Préparer les services gratuits

1. Créer un projet **Supabase Free** de test, région UE, avec un titulaire autorisé après validation du représentant légal. Vérifier les conditions contractuelles et l’identité exacte de l’éditeur et du responsable de traitement. Choisir un mot de passe de base robuste et le conserver hors du dépôt.
2. Dans **SQL Editor**, exécuter `supabase/001_v2.sql`. Dans **Database → Extensions**, activer `pg_cron`, puis exécuter `supabase/002_retention.sql`. Régler la durée de conservation résiduelle et la gestion des sauvegardes conformément aux conditions du projet.
3. Dans **Authentication → URL Configuration**, régler l’URL du site et autoriser précisément `https://<domaine>/app/confirmation.html` pour les emails et `https://<domaine>/api/v2/callback` pour Google, dans chaque environnement. Garder le domaine de production distinct de l’environnement de test.
4. Dans **Authentication**, activer le fournisseur email et la confirmation obligatoire. Configurer un SMTP autorisé par ses conditions pour envoyer aux vrais utilisateurs. Le SMTP intégré de Supabase est limité aux destinataires de l’équipe et ne convient pas au lancement public. Avec le SMTP personnalisé activé, dans **Email Templates**, renseigner les deux liens directs ci-dessous. Tester la réception et le lien sur deux adresses de test avant de diffuser.
5. Créer et confirmer le compte qui administrera le site. Dans **Authentication → Users**, copier l’UUID de ce compte dans `DX_ADMIN_USER_ID`. Utiliser uniquement cet UUID et protéger le mot de passe et sa boîte email.
6. Dans les variables Netlify de l’environnement de test, renseigner `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et la clé JWT historique `SUPABASE_SERVICE_ROLE_KEY` côté fonctions exclusivement. Générer `DX_HASH_SECRET` avec `openssl rand -hex 32`. Configurer `ALLOWED_ORIGIN` avec l’origine exacte, sans barre finale. Aucun secret ne doit être copié dans un message ni dans `public/`.
7. Pour Google, activer le fournisseur dans Supabase et créer un client OAuth Web côté Google. Dans Google, autoriser l’URI fournie par Supabase, de la forme `https://<projet>.supabase.co/auth/v1/callback`. Reporter le client et son secret dans Supabase, puis activer `DX_GOOGLE_ENABLED=true`. Tant que le flux réel et les conditions du fournisseur ne sont pas validés, garder ce bouton désactivé.
8. GroqCloud exige l’âge de 18 ans pour accéder ou utiliser son service Cloud. Faire valider le portage du compte par un adulte juridiquement autorisé et les conditions d’utilisation applicables, y compris les conditions de traitement. Le fournisseur reste le même, via `AI_PROVIDER=openai`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-120b` et la clé côté serveur. Si le Groq du projet ne peut pas être activé sous ces conditions, conserver `AI_PROVIDER=openai` et retirer `OPENAI_API_KEY` de l’environnement V2 pour utiliser le mode local. Cette procédure ne demande aucune modification de la production actuelle.

### Liens des emails Supabase

- Confirmation d’inscription : `{{ .RedirectTo }}#token={{ .TokenHash }}&type=signup`
- Récupération : `{{ .RedirectTo }}#token={{ .TokenHash }}&type=recovery`

Désactiver le suivi des clics dans le SMTP. L’ouverture du lien affiche une page de confirmation. Seule l’action sur son bouton consomme le jeton, même si le lien a été préchargé auparavant par la messagerie. Le fragment du lien garde le jeton hors de la requête HTTP qui charge la page.

## Vérifications juridiques avant publication

Relire les trois projets de pages légales avec le représentant légal et, selon le statut retenu, l’accompagnement juridique de l’école ou un professionnel. Le régime français distingue les éditeurs professionnels et non professionnels. La gratuité ne permet pas à elle seule de trancher cette qualification. Confirmer la capacité à accepter les contrats de chaque fournisseur, le statut de l’activité, les informations obligatoires de l’éditeur, le directeur de publication le cas échéant, le numéro de téléphone de l’hébergeur et un contact exerçable pour les droits RGPD.

Confirmer la région Supabase, les prestataires email, la reconnaissance vocale et Google s’il est activé, les accords de sous-traitance, les transferts hors EEE et leurs garanties, les durées de rétention et les paramètres Groq. Compléter les mentions correspondantes. Pour les avis, vérifier l’applicabilité des règles françaises sur les avis de consommateurs aux bêta-testeurs et ajouter le canal requis pour la notification des refus si ces règles s’appliquent.

## Coût cible et limites

| Service | Offre et points à contrôler |
| --- | --- |
| Netlify Free | 300 crédits/mois sur l’offre à crédits. 15 crédits par mise en production, 20 par Go de bande passante, 2 par 10 000 requêtes web et 10 par Go-heure de fonctions. Confirmer le plan exact et le solde dans le compte. La vidéo est en lecture à la demande. |
| Supabase Free | 500 Mo de base, 1 Go de stockage de fichiers, 5 Go d’egress et 5 Go d’egress en cache, 50 000 utilisateurs actifs mensuels, jusqu’à deux projets actifs et mise en pause possible après sept jours de faible activité. La V2 place les logos dans la sauvegarde JSON. Chaque envoi de sauvegarde est limité à 3,6 Mo côté application serveur. |
| Supabase Auth | SMTP intégré réservé aux membres de l’équipe, 2 messages par heure selon la documentation. Il faut un expéditeur et un SMTP réellement utilisables à 0 € pour l’inscription publique. Brevo affiche 300 envois/jour sur Free mais la validation d’un expéditeur et les exigences de domaine restent à vérifier. Un SMTP déjà disponible et autorisé peut être utilisé sans achat supplémentaire. |
| Groq Free | La table publique du modèle indique 30 requêtes/minute, 1 000/jour, 8 000 jetons/minute et 200 000/jour. Les limites exactes du compte font foi. L’assistant utilise le mode local lorsque l’API échoue. |

Aucune carte ni facturation activée pour cette livraison. Une offre gratuite peut interrompre le service à l’épuisement de ses limites. Conserver les exports JSON lorsque la version V1 ou V2 est utilisée sans compte.

## Validation et déploiement groupé

Vérifier d’abord l’état du dépôt privé et les écarts depuis le ZIP V1 local. Une fois les paramètres et la version validés, conserver un point de restauration Git. Tester les fonctionnalités distantes sur un projet isolé avec des données fictives et supprimer les données de test. Exécuter les tests de l’archive. L’archive livre `mise-a-jour-V2.patch`, un patch unique vérifié contre le code V1 du dossier de passation. Dans un clone du dépôt privé, créer une branche de travail et lancer `git apply --check /chemin/mise-a-jour-V2.patch`. Si la commande aboutit, appliquer le patch avec `git apply /chemin/mise-a-jour-V2.patch`. Si elle échoue parce que le dépôt a divergé du ZIP V1, comparer les fichiers et intégrer les changements sur la branche. Inclure dans le commit les sources, les scripts et la documentation. Le dossier publié par Netlify est uniquement `public/`. Regrouper les changements dans un commit, faire approuver le passage sur `main` et vérifier la génération de l’accueil, de la vidéo et des fonctions. En cas de retour à la V1, préserver le projet Supabase et exporter les données créées dans des comptes V2 avant tout nettoyage.

## Sources officielles consultées

- [Supabase Pricing](https://supabase.com/pricing) et [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [Crédits Netlify](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
- [Quotas Groq](https://console.groq.com/docs/rate-limits), [conditions GroqCloud](https://groq.com/groqcloud-services-agreement/) et [données GroqCloud](https://console.groq.com/docs/your-data).
- [CNIL, informer les personnes](https://www.cnil.fr/fr/rgpd-informer-les-personnes) et [mesure d’audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience).
- [Service Public, mineur et création d’entreprise](https://entreprendre.service-public.gouv.fr/vosdroits/F31627).
- [LCEN](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164/).
