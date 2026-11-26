# Rapport de validation locale

## Vérifications exécutées

Netlify Dev a chargé les deux fonctions et servi l’accueil, l’application, la page de confirmation, l’administration et la confidentialité. Les en-têtes CSP étaient présents. La connexion via Netlify Dev et la transmission des deux cookies de session ont été vérifiées avec un serveur Supabase simulé. Le mode hors configuration et le refus d’accès à l’ancienne page commerciale ont été contrôlés via HTTP. Ce test ne consomme aucun crédit de déploiement.

| Parcours | Résultat et environnement |
| --- | --- |
| Accueil et navigation | Chromium à 1 440 px et 390 px. Accès direct au parcours invité, texte de lancement, disparition des tarifs, vidéo reliée au fichier local et ancienne page commerciale indisponible depuis la racine publique. |
| Parcours sans compte | Création d’un devis, édition du client et de la description, génération de lignes, fichier PDF contrôlé par son en-tête, suivi et relance marquée comme faite. Le stockage V1 est repris lors de l’inscription de test. |
| IA et confidentialité | Fonction Netlify réelle invoquée avec un serveur Groq simulé. Le nom, l’adresse, le téléphone et l’email fictifs saisis dans la description sont absents du texte reçu par le fournisseur simulé. |
| Comptes et emails | Deux sessions Chromium et tests HTTP contre les fonctions réelles. Supabase et la réception d’emails sont simulés. Vérification du lien de confirmation à usage unique, préchargement sans consommation du lien, connexion, déconnexion, création d’un nouveau mot de passe et suppression du compte. |
| Sauvegarde et conflits | Transfert explicite, récupération de la fiche et de l’identifiant d’un devis dans un autre navigateur, puis synchronisation d’un changement. Deux modifications du même champ déclenchent un conflit. L’export de la copie locale puis l’ouverture de la version en ligne sont testés. |
| Permissions et intégrité | Exécution de la migration dans PostgreSQL via PGlite avec les rôles Supabase reproduits. Lecture de sa ligne, refus de la lecture de l’autre compte, interdiction de lecture anonyme et d’accès aux statistiques privées, refus d’une révision dépassée, suppression en cascade. Tests HTTP complémentaires pour les réponses 401 et 403. |
| Avis et modération | Dépôt anonyme fictif avec consentement, déduplication dans le test HTTP, attente de modération, publication depuis le compte administrateur, profil bêta affiché, retrait par code. |
| Analytics | Consentement, exclusion de l’administrateur et des tests, absence du contenu du devis dans l’événement, déduplication, export CSV, requête d’agrégats et compteurs testés. Les aperçus de l’administration sont étiquetés « données de test fictives ». |
| Dictée | API de reconnaissance détectée dans Chromium. La transcription audio réelle n’a pas été testée. |

Les bases de test et leurs utilisateurs, devis et avis fictifs sont isolés et disparaissent à la fin des scripts. La production publique n’a reçu aucune donnée de test.

## À vérifier sur l’environnement de recette avant publication

- Paramétrage du projet Supabase, flux SMTP réel sur deux boîtes externes, rotation d’une session réelle, OAuth Google s’il est activé, suppression du compte réel de test et purge pg_cron.
- Groq avec une clé autorisée et validation de la qualité sur des descriptions fictives. Dictée sur un téléphone réel et test Safari iOS.
- Nouveaux volumes sur Netlify et Supabase, stabilité du domaine et compteurs après intégration.
- Coordonnées et qualification juridique de l’éditeur, représentant légal, conditions de sous-traitance et transferts.
- Contrôler les éventuelles différences entre le dépôt privé et la V1 archivée avant le commit groupé.
