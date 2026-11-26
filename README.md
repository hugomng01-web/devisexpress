# DevisExpress V2

Version locale à valider. L’accueil, l’application, les avis et les pages d’information partagent l’hébergement statique Netlify. L’application existante conserve son stockage invité V1 sur la même origine. Les nouvelles fonctions Netlify servent de passerelle vers Supabase et conservent la fonction Groq existante. `archive/accueil-commercial-v1.html` est en dehors de `public/`. Le ZIP de livraison contient aussi un instantané V1 séparé.

## Utiliser et relire

- `public/index.html` pour l’accueil et sa vidéo. Le bouton principal ouvre directement l’application.
- `public/app/` pour le parcours invité et la sauvegarde facultative. L’utilisateur connecté doit autoriser le transfert des données locales vers un compte vide. L’original local reste disponible après déconnexion. Un compte déjà alimenté conserve sa sauvegarde et la copie locale reste exportable.
- `public/admin/` pour l’interface Analytics. Le seul identifiant autorisé est `DX_ADMIN_USER_ID`, contrôlé sur le serveur après vérification de la session par Supabase. Aucun accès aux devis privés depuis cette interface.
- `supabase/001_v2.sql` crée les tables, contraintes, permissions et règles RLS. `supabase/002_retention.sql` installe la purge planifiée.
- `.env.example` liste les variables. La clé Supabase de service et la clé Groq restent dans les fonctions Netlify.
- `DEPLOIEMENT.md` décrit le paramétrage, les coûts et les décisions restantes. `TESTS.md` indique ce qui a été réellement exécuté.

## Fonctionnement

L’utilisateur invité continue d’utiliser la clé `devisexpress_v1`. Les données du compte sont stockées dans une ligne PostgreSQL par utilisateur avec une révision. La RLS autorise la lecture de sa propre ligne. L’écriture atomique est liée à `auth.uid()` dans le SQL, avec une condition sur la révision. Le serveur vérifie aussi que le compte attendu par l’onglet correspond à celui qui est actuellement authentifié. La sauvegarde inclut le profil et le logo, les devis, les prestations, les modèles et les relances.

Une modification indépendante peut être fusionnée automatiquement. Deux éditions concurrentes du même devis ou champ du profil, ainsi que des numéros de devis identiques, sont signalées. Les deux versions restent exportables. L’action « Reprendre la version en ligne » exporte le brouillon local avant de l’écarter. Le brouillon hors ligne est gardé dans l’onglet tant que le stockage de session le permet. Utiliser l’export avant de fermer l’onglet en cas de synchronisation persistante impossible. Le transfert initial est une copie vers un compte vide pour éviter tout écrasement involontaire.

Les avis sont volontaires, disponibles sans compte et publiés sur décision de l’administrateur. Le texte est affiché comme texte brut. Le formulaire contrôle les longueurs et les profils déclarés. Le dépôt est limité par réseau et le contenu identique est dédupliqué. Le code remis à l’auteur permet de supprimer son avis. Les notes faibles suivent la même modération.

Analytics distingue les comptes confirmés, les navigateurs invités, les événements observés et les déclarations. Les identifiants sont pseudonymisés côté serveur. Les modifications de devis ne génèrent pas de nouvel événement de création. La duplication voulue depuis l’application constitue une nouvelle création. Les PDF sont comptés à chaque génération réussie et les requêtes IA mesurées à chaque réponse reçue après consentement. Les chiffres sont partiels et les profils sont déclarés. Un compte et son navigateur invité peuvent figurer dans des séries différentes. Les données événementielles expirent après six mois. Les séries « depuis le lancement » sont limitées aux données encore conservées. L’export CSV enregistre les agrégats horodatés et les séries disponibles.

Le compte administrateur est exclu des mesures d’usage côté serveur. Pour les tests hors connexion, activez le mode test dans les préférences. Les devis de démonstration et les nouveaux devis créés en mode test restent exclus après changement de préférence. Une inscription par email réalisée en mode test est exclue des statistiques de comptes. Utiliser une instance isolée pour tester OAuth, le routage email et la publication des avis. Pour exclure un compte de test déjà créé sur un projet, un opérateur Supabase peut ajouter le booléen `dx_test=true` dans ses métadonnées administratives et supprimer le compte une fois les tests terminés.

## Exécuter en local

Node.js 22 ou plus récent. `node tests/api.mjs` démarre les fonctions réelles avec un service Supabase et un fournisseur IA simulés. `node tests/sql.mjs` nécessite `@electric-sql/pglite`. `node tests/browser.mjs` nécessite Playwright et Chromium. Les dépendances n’entrent pas dans le site statique.

```sh
npm install --no-save --package-lock=false playwright @electric-sql/pglite
node tests/api.mjs
node tests/sql.mjs
DX_CHROMIUM=/chemin/vers/chromium node tests/browser.mjs
```

Pour une instance locale raccordée à un projet de test, configurer `.env` et utiliser `netlify dev`. Pour relire seulement les pages statiques, un serveur HTTP local pointant sur `public/` suffit. Les fonctionnalités dépendantes des API sont alors indisponibles.
