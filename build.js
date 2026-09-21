/* Assemble les sources en deux cibles :
   - index.html        → page complète, autonome, déployable telle quelle (Vercel)
   - build/artifact.html → fragment pour l'aperçu Artifact (sans <html>/<head>/<body>)
   Usage : node build.js
*/
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const ROOT = __dirname;            // index.html est servi à la racine
const BUILD = path.join(__dirname, 'build'); // sortie annexe (aperçu Artifact)
const read = p => fs.readFileSync(p, 'utf8');

const css = read(path.join(SRC, 'app.css'));
const html = read(path.join(SRC, 'app.html'));
const js = ['01-store.js', '02-journal.js', '03-stats.js', '04-data.js']
  .map(f => read(path.join(SRC, 'js', f))).join('\n\n');

const DESC = "Journal quotidien : repas, pas, activités, sommeil, symptômes, stress et humeur, avec calendrier, corrélations et export des données.";

const core = `<style>\n${css}\n</style>\n\n${html}\n\n<script>\n${js}\n</script>\n`;

/* --- cible Vercel --- */
const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<title>Wellio — journal de santé</title>
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1a19" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Wellio">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<link rel="icon" href="/icons/icon-192.png">
</head>
<body>
${core}
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
</script>
</body>
</html>
`;

/* --- cible Artifact (l'hôte fournit le squelette de page) --- */
const preview = read(path.join(SRC, 'preview.js'));
const artifact = `<title>Wellio</title>\n<script>\n${preview}\n</script>\n${core}`;

fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'index.html'), page);
fs.writeFileSync(path.join(BUILD, 'artifact.html'), artifact);
console.log('index.html         ', (page.length / 1024).toFixed(1) + ' Ko');
console.log('build/artifact.html', (artifact.length / 1024).toFixed(1) + ' Ko');
