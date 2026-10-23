# Ahlou Lahi — Registre des membres

Progressive Web App de recensement des membres de l'organisation **Ahlou Lahi** dans les régions du Sénégal,
avec un espace d'administration sécurisé (tableau de bord, CRUD, recherche).

## Fonctionnalités

### Formulaire public (`/`)
- Assistant en 4 étapes : identité → localisation & contact → électeur & organisation → vérification.
- **Cascade Région → Département → Commune** : 14 régions, 46 départements, 553 communes
  (liste officielle fournie par l'organisation, `scripts/communes-source.tsv`).
- Champs : prénom, nom, sexe, date et lieu de naissance, nationalité, situation matrimoniale, enfants,
  photo (redimensionnée sur l'appareil), téléphone (+221) avec WhatsApp, téléphone secondaire, e-mail,
  quartier/village, adresse, **n° de carte d'électeur**, CNI, lieu et bureau de vote, section/dahira, fonction,
  date d'adhésion, profession, niveau d'instruction, groupe sanguin, contact d'urgence, consentement.
- Contrôles : numéros sénégalais (70, 71, 75, 76, 77, 78, 33), unicité du téléphone, de la carte d'électeur et de la CNI.
- **Hors-ligne** : application installable, interface en cache (service worker), inscriptions mises en file
  (IndexedDB) et envoyées automatiquement au retour du réseau (Background Sync ou à la reconnexion).
- Carte de membre générée avec matricule (`AHL-2026-000123`), imprimable.

### Administration (`/admin`)
- **Tableau de bord** : indicateurs (total, nouveaux sur 30 jours avec tendance, à valider, couverture électorale,
  répartition par sexe, âge moyen), **carte choroplèthe interactive du Sénégal** (un clic sur une région filtre
  tout le tableau de bord), pyramide des âges, inscriptions sur 12 mois, statuts, top communes, fonctions,
  niveaux d'instruction, derniers inscrits. Date grégorienne et hégirienne. Thème clair et sombre.
- **Membres** : recherche instantanée insensible aux accents (nom, téléphone, n° électeur, CNI, matricule, quartier…),
  filtres avancés (cascade géographique, sexe, statut, fonction, instruction, carte d'électeur, tranche d'âge,
  période d'inscription), tri, pagination, fiche détaillée, création, modification, suppression,
  actions groupées (valider, suspendre, supprimer), **export CSV** (compatible Excel).
- **Utilisateurs** (administrateurs) : rôles *Administrateur*, *Éditeur*, *Lecteur*.
- **Journal d'activité** : connexions, échecs, créations, modifications, exports…
- Interface adaptée au mobile (tableau en cartes, menu latéral escamotable, modales plein écran).

### Sécurité
- Mots de passe hachés avec **scrypt** ; politique de complexité ; changement obligatoire à la première connexion.
- Sessions aléatoires (stockées hachées en base), cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS,
  expiration après 8 h d'inactivité ; les autres sessions sont fermées au changement de mot de passe.
- Limitation des tentatives de connexion (verrouillage 15 min) et des inscriptions publiques.
- Protection CSRF (en-tête dédié + contrôle d'origine), Content-Security-Policy stricte, en-têtes de sécurité,
  requêtes SQL paramétrées, neutralisation des formules dans l'export CSV, pot de miel anti-robots.

## Démarrage

Prérequis : **Node.js 22.13 ou plus récent** (version LTS). Le projet n'a aucune dépendance npm : il utilise SQLite intégré à Node.

```bash
npm start                    # http://localhost:3000  ·  admin : http://localhost:3000/admin
```

Au premier démarrage, un compte administrateur est créé et son mot de passe provisoire s'affiche dans la console
(ou définissez-le avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Données de démonstration (membres **fictifs**, pour voir le tableau de bord rempli) :

```bash
npm run seed -- 400
```

Tests :

```bash
npm test
```

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` / `HOST` | Adresse d'écoute | `3000` / `0.0.0.0` |
| `DB_FILE` | Fichier SQLite | `data/ahloulaahi.db` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte administrateur initial | `admin@ahloulaahi.sn` / généré |
| `COOKIE_SECURE=1` | Force l'attribut `Secure` du cookie | — |
| `TRUST_PROXY=1` | Derrière un reverse proxy (IP réelle, détection HTTPS) | — |

### Mise en production
- Servez l'application en **HTTPS** (obligatoire pour l'installation PWA et le service worker hors `localhost`),
  par exemple derrière Nginx ou Caddy avec `TRUST_PROXY=1`.
- Sauvegardez régulièrement le dossier `data/` (base SQLite).

## Structure

```
server/            API HTTP (sans framework), base SQLite, sécurité, validation
public/            PWA : formulaire public, administration, service worker, données
  data/senegal.json        découpage administratif (généré par scripts/build-geo.mjs)
  data/regions-paths.json  tracés des régions pour la carte
scripts/           génération des données géographiques, jeu de démonstration
test/              tests de l'API
```

Pour mettre à jour la liste des communes : modifiez `scripts/communes-source.tsv`, puis lancez `npm run build:geo`.

## Crédits
- Tracés des régions : [@react-map/senegal](https://www.npmjs.com/package/@react-map/senegal) (MIT).
- Graphiques : [Chart.js](https://www.chartjs.org/) 4.4.7 (MIT).
- Police : Plus Jakarta Sans (SIL Open Font License).
