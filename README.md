# Wellio — journal de santé (PWA)

Application web installable sur iPhone pour noter chaque jour : repas, boissons, pas,
activités, sommeil (durée, qualité, douleurs, engourdissements), symptômes, stress et humeur.
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

### En cas d'erreur `git@github.com: Permission denied (publickey)`

GitHub ne connaît pas de clé SSH pour cette machine. Au choix :

**1. Se passer de GitHub** — l'option B ci-dessus (`npx vercel`) ne demande aucune clé.

**2. Passer le dépôt en HTTPS** (authentification par navigateur) :

```bash
brew install gh          # si besoin (macOS) — sinon : https://cli.github.com
gh auth login            # → GitHub.com → HTTPS → "Login with a web browser"
git remote set-url origin https://github.com/<ton-compte>/wellio.git
git push -u origin main
```

**3. Créer une clé SSH** (à faire une fois, utile pour tous tes projets) :

```bash
ssh-keygen -t ed25519 -C "sobota.jonathan@gmail.com"   # 3× Entrée
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub                         # copie la clé publique
```

Colle-la sur https://github.com/settings/ssh/new (titre libre, type « Authentication key »),
puis vérifie et pousse :

```bash
ssh -T git@github.com   # doit répondre "Hi <ton-compte>! You've successfully authenticated"
git push -u origin main
```

Autre cause possible du même message : le dépôt n'existe pas encore sur GitHub, ou l'URL
du remote contient une faute. `git remote -v` affiche l'URL configurée.

---

## 2. Installer sur l'iPhone

1. Ouvre l'URL Vercel dans **Safari** (pas Chrome : seul Safari peut installer une PWA sur iOS).
2. Bouton **Partager** → **Sur l'écran d'accueil** → *Ajouter*.
3. L'icône Wellio apparaît ; l'app s'ouvre en plein écran, sans barre d'adresse.

⚠️ Après l'installation, utilise **toujours l'icône de l'écran d'accueil** : la version
installée et la version ouverte dans Safari ont chacune leur propre stockage, les données
ne sont pas partagées entre les deux.

---

## 3. Saisir les boissons

Carte **Boissons** de l'écran Journal :

- **un tap sur une pastille** ajoute un verre à la quantité par défaut de cette boisson ;
- **un appui long** ouvre le choix de la quantité avant l'ajout (100 / 150 / 200 / 250 /
  330 / 500 / 750 ml, 1 L, ou saisie libre) ;
- le récapitulatif liste **un verre par ligne** ; toucher la quantité la modifie, le « − »
  retire ce verre précis ;
- la barre du haut affiche le total bu, avec un repère à 1,5 L.

L'heure de chaque verre est mémorisée sans être affichée, uniquement pour la journée en
cours (un jour passé complété après coup n'est pas horodaté). Elle sert à la variable
« heure du dernier café » de l'écran Stats. Pour ne plus l'enregistrer du tout, retirer
`t: selDate === todayISO() ? nowHHMM() : null` dans `addDrink()` (`src/js/02-journal.js`).

Quantité par défaut, caractère caféiné et caractère alcoolisé se règlent boisson par
boisson dans *Données → Mes boissons*, où tu peux aussi en ajouter ou en supprimer.

---

## 4. Les données

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

- *large* : une ligne par jour, 36 colonnes ;
- *détaillé* : une ligne par champ (`date;categorie;champ;valeur`), pratique pour un
  tableau croisé dynamique ou pandas.

Si le stockage venait à être vidé (réinstallation, « effacer les données de site »), seule
la sauvegarde `.json` permet de tout retrouver : exporte-la de temps en temps.
L'app affiche un rappel si la dernière sauvegarde date de plus de 30 jours.

---

## 5. L'écran Stats

Les boissons y comptent comme quatre variables à part entière — volume total, nombre de
boissons caféinées, verres d'alcool, heure du dernier café — ce qui permet des questions
du type « un café après 16 h raccourcit-il ma nuit ? ».

- **Corrélations les plus fortes** : toutes les paires de variables sont testées
  (coefficient de Pearson), le même jour *et* avec un décalage d'un jour
  (« effet le lendemain »). Les liens apparaissent à partir de 7 jours comparables et
  d'un |r| ≥ 0,25, triés par force. Chaque ligne est cliquable et ouvre le nuage de points.
  Une même variable n'apparaît pas plus de trois fois, sinon un groupe très lié
  (sommeil / qualité / stress) monopoliserait la liste ; les paires liées par construction
  (nombre de cafés ↔ heure du dernier café, par exemple) sont écartées.
- **Explorateur** : deux variables au choix, nuage de points + droite de régression,
  `r`, nombre de jours, et si le résultat peut être dû au hasard (p ≈ Fisher z).
- **Effet des tags** : pour chaque tag utilisé au moins 4 fois, la moyenne de la variable
  choisie les jours *avec* vs *sans* le tag — le même jour et le lendemain.
- **Moyennes par semaine** : les 8 dernières semaines.

Rappel affiché dans l'app : une corrélation n'est pas une causalité. C'est une piste,
à confronter au vécu (et à un professionnel de santé si ça touche à un symptôme).

---

## 6. Modifier l'app

```
src/app.css          styles
src/app.html         structure des écrans
src/js/01-store.js   modèle de données, stockage, dates, utilitaires DOM
src/js/02-journal.js calendrier + formulaire du jour
src/js/03-stats.js   statistiques, corrélations, graphiques
src/js/04-data.js    export/import, tags, boissons, navigation, démarrage
src/preview.js       jeu de démonstration (aperçu uniquement, pas déployé)
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

Pour changer la liste des tags ou des boissons proposés par défaut : `DEFAULT_TAGS` et
`DEFAULT_DRINKS` dans `src/js/01-store.js` (ce qui est ajouté depuis l'app est stocké dans
les données de l'utilisateur).
Pour ajouter un champ suivi par les stats : ajoute-le à `emptyEntry()` puis une entrée
dans `VARS` (`src/js/03-stats.js`) — il apparaîtra automatiquement dans les corrélations,
l'explorateur et les exports.

Après une modification, pense à incrémenter `CACHE` dans `sw.js` pour que les iPhone
récupèrent bien la nouvelle version.
