# Wellio — journal de santé (PWA)

Application web installable sur iPhone pour noter chaque jour : repas, pas, activités,
sommeil (durée, qualité, douleurs, engourdissements), symptômes, stress et humeur.
Calendrier mensuel, écran de statistiques orienté **corrélations**, export/import complet
des données.

- **Aucun serveur, aucun compte, aucune donnée envoyée** : tout est stocké dans le
  navigateur de l'iPhone (IndexedDB + localStorage).
- **Hébergement gratuit** : ce sont des fichiers statiques → plan Hobby de Vercel
  (0 €, pas de base de données, pas de fonction serverless, donc rien à payer ni à surveiller).
- **Hors-ligne** : un service worker met l'app en cache, elle s'ouvre sans réseau.

---

## 1. Déployer sur Vercel (≈ 5 minutes)

### Option A — via GitHub (recommandé, permet les mises à jour en un `git push`)

1. Crée un dépôt vide sur GitHub, par exemple `wellio`.
2. Depuis ce dossier :

   ```bash
   git init
   git add .
   git commit -m "Wellio v1"
   git branch -M main
   git remote add origin git@github.com:<ton-compte>/wellio.git
   git push -u origin main
   ```

3. Sur [vercel.com](https://vercel.com) → **Add New… → Project** → importe le dépôt.
4. Framework Preset : **Other**. Build Command : *(laisser vide)*.
   Output Directory : **`.`** (le dossier courant). Root Directory : `./`
5. **Deploy**. Tu obtiens une URL du type `https://wellio-xxx.vercel.app`.

### Option B — sans GitHub, en ligne de commande

```bash
npm i -g vercel
vercel        # première fois : répond "Other", build vide, output "."
vercel --prod # met en production
```

> Rien d'autre à configurer : pas de variables d'environnement, pas de base de données.
> Le plan Hobby suffit et reste à 0 €.

---

## 2. Installer sur l'iPhone

1. Ouvre l'URL Vercel dans **Safari** (pas Chrome : seul Safari peut installer une PWA sur iOS).
2. Bouton **Partager** → **Sur l'écran d'accueil** → *Ajouter*.
3. L'icône Wellio apparaît ; l'app s'ouvre en plein écran, sans barre d'adresse.

⚠️ Après l'installation, utilise **toujours l'icône de l'écran d'accueil** : la version
installée et la version ouverte dans Safari ont chacune leur propre stockage, les données
ne sont pas partagées entre les deux.

---

## 3. Les données

| Où | Quoi |
|---|---|
| IndexedDB (`wellio`) | copie principale du journal |
| localStorage (`wellio.db.v1`) | copie miroir, relue au démarrage |

L'app demande au navigateur un stockage « persistant » (`navigator.storage.persist()`),
ce qui protège les données contre le nettoyage automatique de Safari.

**Sauvegarde :** onglet *Données* → **Exporter la sauvegarde (.json)**. Sur iPhone, la
feuille de partage propose « Enregistrer dans Fichiers » (donc iCloud Drive).
Ce fichier `.json` contient tout et se réimporte à l'identique — c'est ce qu'il faut faire
en cas de changement de téléphone. À l'import, tu choisis **fusionner** (la version la plus
récente de chaque journée gagne) ou **remplacer**.

**Analyse :** deux exports CSV (séparateur `;`, encodage UTF-8 avec BOM → s'ouvrent
directement dans Numbers/Excel) :

- *large* : une ligne par jour, 29 colonnes ;
- *détaillé* : une ligne par champ (`date;categorie;champ;valeur`), pratique pour un
  tableau croisé dynamique ou pandas.

Si le stockage venait à être vidé (réinstallation, « effacer les données de site »), seule
la sauvegarde `.json` permet de tout retrouver : exporte-la de temps en temps.
L'app affiche un rappel si la dernière sauvegarde date de plus de 30 jours.

---

## 4. L'écran Stats

- **Corrélations les plus fortes** : toutes les paires de variables sont testées
  (coefficient de Pearson), le même jour *et* avec un décalage d'un jour
  (« effet le lendemain »). Les liens apparaissent à partir de 7 jours comparables et
  d'un |r| ≥ 0,25, triés par force. Chaque ligne est cliquable et ouvre le nuage de points.
- **Explorateur** : deux variables au choix, nuage de points + droite de régression,
  `r`, nombre de jours, et si le résultat peut être dû au hasard (p ≈ Fisher z).
- **Effet des tags** : pour chaque tag utilisé au moins 4 fois, la moyenne de la variable
  choisie les jours *avec* vs *sans* le tag — le même jour et le lendemain.
- **Moyennes par semaine** : les 8 dernières semaines.

Rappel affiché dans l'app : une corrélation n'est pas une causalité. C'est une piste,
à confronter au vécu (et à un professionnel de santé si ça touche à un symptôme).

---

## 5. Modifier l'app

```
src/app.css          styles
src/app.html         structure des écrans
src/js/01-store.js   modèle de données, stockage, dates, utilitaires DOM
src/js/02-journal.js calendrier + formulaire du jour
src/js/03-stats.js   statistiques, corrélations, graphiques
src/js/04-data.js    export/import, tags, navigation, démarrage
build.js             assemble le tout dans index.html
make_icons.py        régénère les icônes
test/run.js          tests end-to-end (Playwright) + captures d'écran
```

```bash
node build.js        # régénère index.html  ← à relancer après chaque modif de src/
node test/run.js     # lance les tests (npm i -D playwright au préalable)
python3 make_icons.py
```

L'app finale est **un seul fichier HTML** sans dépendance externe : pas de framework,
pas de CDN, pas de build à installer.

Pour changer la liste des tags proposés par défaut : `DEFAULT_TAGS` dans
`src/js/01-store.js` (les tags ajoutés depuis l'app sont stockés dans les données).
Pour ajouter un champ suivi par les stats : ajoute-le à `emptyEntry()` puis une entrée
dans `VARS` (`src/js/03-stats.js`) — il apparaîtra automatiquement dans les corrélations,
l'explorateur et les exports.

Après une modification, pense à incrémenter `CACHE` dans `sw.js` pour que les iPhone
récupèrent bien la nouvelle version.
