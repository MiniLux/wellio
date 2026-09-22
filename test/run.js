/* Tests de bout en bout : rendu, calculs, export/import. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* ---------- jeu de données synthétique ---------- */
function seed() {
  const entries = {};
  const today = new Date();
  const rnd = (seedv => () => (seedv = (seedv * 1103515245 + 12345) % 2147483648) / 2147483648)(42);
  const foods = ['Café', 'Légumes', 'Gluten', 'Sucre', 'Fait maison', 'Laitages'];
  const acts = ['Marche', 'Yoga', 'Course', 'Journée assise'];
  const symps = ['Fatigue', 'Mal de tête', 'Ballonnements', 'Douleurs articulaires'];
  let prevSleep = 7;
  for (let i = 119; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (rnd() < 0.12) continue; // quelques jours non renseignés
    const sleep = Math.round((5 + rnd() * 4) * 4) / 4;
    // corrélation volontaire : peu de sommeil la veille -> plus de symptômes
    const nSym = Math.max(0, Math.round((8 - prevSleep) * 0.8 + (rnd() - 0.5) * 1.5));
    const stress = Math.max(0, Math.min(10, Math.round(10 - sleep + (rnd() - 0.5) * 3)));
    const mealTags = foods.filter(() => rnd() < 0.3);
    entries[ds] = {
      date: ds,
      meals: {
        breakfast: { text: 'Porridge, fruits', tags: mealTags },
        lunch: { text: 'Salade, poulet', tags: foods.filter(() => rnd() < 0.25) },
        dinner: { text: 'Soupe, pain', tags: foods.filter(() => rnd() < 0.25) },
        bonus: { text: rnd() < 0.3 ? 'Carré de chocolat' : '', tags: [] }
      },
      steps: Math.round(3000 + rnd() * 9000),
      activity: { tags: acts.filter(() => rnd() < 0.3), minutes: Math.round(rnd() * 12) * 5, note: '' },
      sleep: {
        hours: sleep, quality: Math.max(1, Math.min(5, Math.round(sleep - 3 + (rnd() - 0.5)))),
        pain: rnd() < 0.25, painTags: rnd() < 0.2 ? ['Lombaires'] : [], painNote: '',
        numbness: rnd() < 0.15, numbTags: rnd() < 0.1 ? ['Main droite'] : [], numbNote: ''
      },
      symptoms: { tags: symps.slice(0, Math.min(nSym, symps.length)), note: '' },
      stress,
      mood: { score: Math.max(1, Math.min(5, Math.round(6 - stress / 2.5))), note: '' },
      updatedAt: new Date(d).toISOString()
    };
    prevSleep = sleep;
  }
  return { app: 'wellio', schemaVersion: 1, createdAt: new Date().toISOString(), entries, tags: null, settings: { lastExportAt: null } };
}

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  let fails = 0;
  const check = (name, cond, extra) => { console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

  const data = seed();
  delete data.tags;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(db => { try { localStorage.setItem('wellio.db.v1', JSON.stringify(db)); } catch (e) {} }, data);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/vibrate/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  console.log('\n— Rendu —');
  check('journal visible', await page.locator('#scr-journal.active').isVisible());
  check('calendrier rempli (42 cases)', (await page.locator('#cal-grid .day').count()) === 42);
  check('pastilles de données présentes', (await page.locator('#cal-grid .dot.filled').count()) > 10);
  await page.screenshot({ path: path.join(SHOTS, '01-journal.png') });

  // saisie manuelle
  console.log('\n— Saisie —');
  await page.locator('#f-steps').fill('8421');
  await page.locator('#tags-symptom .chip', { hasText: 'Fatigue' }).first().click();
  // l'humeur est un bouton bascule : on choisit une valeur différente de l'actuelle
  const curMood = await page.evaluate(() => { const e = DB.entries[todayISO()]; return e ? e.mood.score : null; });
  const wantMood = curMood === 4 ? 2 : 4;
  await page.locator(`#f-mood button[data-v="${wantMood}"]`).click();
  await page.locator('#f-stress').evaluate(e => { e.value = 3; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => { const t = todayISO(); const e = DB.entries[t]; return e && { steps: e.steps, mood: e.mood.score, stress: e.stress, sym: e.symptoms.tags }; });
  check('pas enregistrés', saved && saved.steps === 8421, JSON.stringify(saved));
  check('humeur enregistrée', saved && saved.mood === wantMood, 'valeur=' + (saved && saved.mood));
  check('stress enregistré', saved && saved.stress === 3);
  check('symptôme enregistré', saved && saved.sym.includes('Fatigue'));
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('wellio.db.v1')).entries[todayISO()].steps);
  check('persistance localStorage', persisted === 8421);

  // douleurs / engourdissements
  await page.locator('#f-pain').click();
  await page.waitForTimeout(150);
  check('détails douleurs affichés', await page.locator('#pain-details').isVisible());
  await page.locator('#tags-pain .chip', { hasText: 'Nuque' }).first().click();
  await page.waitForTimeout(300);
  check('zone de douleur enregistrée', await page.evaluate(() => DB.entries[todayISO()].sleep.painTags.includes('Nuque')));
  await page.screenshot({ path: path.join(SHOTS, '02-journal-bas.png'), fullPage: false });

  // ajout d'un tag personnalisé (fenêtre intégrée, pas de prompt() natif)
  await page.locator('#tags-symptom .chip.add').click();
  await page.waitForTimeout(200);
  check('fenêtre « nouveau tag » ouverte', await page.locator('#prompt-dlg').isVisible());
  await page.locator('#pr-input').fill('Acouphènes');
  await page.locator('#pr-ok').click();
  await page.waitForTimeout(300);
  check('tag personnalisé ajouté à la liste', await page.evaluate(() => DB.tags.symptom.includes('Acouphènes')));
  check('tag personnalisé sélectionné pour le jour', await page.evaluate(() => DB.entries[todayISO()].symptoms.tags.includes('Acouphènes')));
  check('fenêtre refermée', !(await page.locator('#prompt-dlg').isVisible()));
  // annulation : rien ne doit être ajouté
  await page.locator('#tags-activity .chip.add').click();
  await page.waitForTimeout(150);
  await page.locator('#pr-input').fill('À jeter');
  await page.locator('#pr-cancel').click();
  await page.waitForTimeout(200);
  check('annulation sans effet', await page.evaluate(() => !DB.tags.activity.includes('À jeter')));

  // boissons : compteurs, total, retrait
  console.log('\n— Boissons —');
  const drinkChip = n => page.locator('#drink-chips .chip.drink').nth(n);
  await drinkChip(0).click(); await page.waitForTimeout(120);
  await drinkChip(0).click(); await page.waitForTimeout(120);
  await drinkChip(2).click(); await page.waitForTimeout(250);
  const dr = await page.evaluate(() => {
    const e = DB.entries[todayISO()];
    const st = drinkStats(e);
    return { n: e.drinks.items.length, ml: st.ml, caf: st.caf, t: e.drinks.items.every(i => /^\d{2}:\d{2}$/.test(i.t)) };
  });
  check('3 boissons enregistrées', dr.n === 3, JSON.stringify(dr));
  check('volume total calculé', dr.ml === 250 * 2 + 100, dr.ml + ' ml');
  check('café compté comme caféine', dr.caf === 1);
  check('heure enregistrée automatiquement', dr.t);
  check('compteur affiché sur la pastille', (await drinkChip(0).locator('.cnt').textContent()) === '2');
  check('total affiché', (await page.locator('#drink-total').textContent()).includes('600'));
  check('une ligne par verre', (await page.locator('#drink-log .drink-row').count()) === 3);

  // quantité modifiable après coup
  await page.locator('#drink-log .drink-row .qty').first().click();
  await page.waitForTimeout(250);
  check('fenêtre quantité ouverte', await page.locator('#qty-dlg').isVisible());
  await page.locator('#qty-presets .chip', { hasText: '500 ml' }).first().click();
  await page.waitForTimeout(250);
  check('quantité modifiée', await page.evaluate(() => DB.entries[todayISO()].drinks.items[0].ml === 500));
  check('total recalculé', await page.evaluate(() => drinkStats(DB.entries[todayISO()]).ml === 500 + 250 + 100));
  check('quantité affichée dans la ligne', (await page.locator('#drink-log .drink-row .qty').first().textContent()).includes('500'));

  // saisie libre d'un volume
  await page.locator('#drink-log .drink-row .qty').first().click();
  await page.waitForTimeout(200);
  await page.locator('#qty-input').fill('1000');
  await page.locator('#qty-ok').click();
  await page.waitForTimeout(250);
  check('volume libre accepté', await page.evaluate(() => DB.entries[todayISO()].drinks.items[0].ml === 1000));
  check('affichage en litres', (await page.locator('#drink-total').textContent()).includes('L'));

  // appui long sur une pastille = choix de la quantité avant ajout
  const box = await drinkChip(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(250);
  check('appui long ouvre le choix de quantité', await page.locator('#qty-dlg').isVisible());
  await page.locator('#qty-cancel').click();
  await page.waitForTimeout(200);
  check('annulation : aucun verre ajouté', await page.evaluate(() => DB.entries[todayISO()].drinks.items.length === 3));

  await page.locator('#drink-log .drink-row .minus').first().click();
  await page.waitForTimeout(250);
  check('retrait d\'un verre', await page.evaluate(() => DB.entries[todayISO()].drinks.items.length === 2));
  check('heure enregistrée sans être affichée', await page.evaluate(() =>
    DB.entries[todayISO()].drinks.items.every(i => /^\d{2}:\d{2}$/.test(i.t))
  ) && !(await page.locator('#drink-log').textContent()).match(/\d{2}h\d{2}/));

  console.log('\n— Stats —');
  await page.locator('.tabbar button[data-scr="stats"]').click();
  await page.waitForTimeout(500);
  const nCorr = await page.locator('#corr-top .corr-item').count();
  check('corrélations calculées', nCorr > 0, nCorr + ' éléments');
  check('graphique présent', (await page.locator('#scatter-box svg.chart circle').count()) > 5);
  check('effets de tags calculés', (await page.locator('#tag-effects .corr-item').count()) > 0);
  check('tableau hebdo', (await page.locator('#weekly table tbody tr').count()) > 3);
  await page.screenshot({ path: path.join(SHOTS, '03-stats.png') });
  await page.locator('#scatter-box').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, '04-stats-graph.png') });

  // corrélation attendue : sommeil (J) -> symptômes (J+1) négative
  const r = await page.evaluate(() => { const res = pearson(pairs('sleepHours', 'symptomCount', 1)); return res && { r: res.r, n: res.n }; });
  check('corrélation sommeil→symptômes J+1 négative', r && r.r < -0.3, r ? `r=${r.r.toFixed(2)} n=${r.n}` : 'null');

  // contrôle du calcul de Pearson sur des valeurs connues
  const rcheck = await page.evaluate(() => {
    const pts = [[1, 2], [2, 4], [3, 6], [4, 8], [5, 11]].map(([x, y]) => ({ x, y }));
    return pearson(pts).r;
  });
  check('Pearson exact (valeurs connues)', Math.abs(rcheck - 0.995893) < 0.0005, 'r=' + rcheck.toFixed(5));

  console.log('\n— Données —');
  await page.locator('.tabbar button[data-scr="data"]').click();
  await page.waitForTimeout(400);
  const csv = await page.evaluate(() => exportCSVWide());
  const rows = csv.trim().split('\n');
  check('CSV : une ligne par jour + en-tête', rows.length === (await page.evaluate(() => Object.keys(DB.entries).length)) + 1, rows.length + ' lignes');
  check('CSV : 36 colonnes', rows[0].split(';').length === 36, rows[0].split(';').length + '');
  check('CSV : pas de séparateur cassé', rows.every(l => l.split(';').length >= 36));
  check('CSV : colonnes boissons présentes', rows[0].includes('boissons_total_ml') && rows[0].includes('dernier_cafe'));
  const csvLong = await page.evaluate(() => exportCSVLong());
  check('CSV détaillé non vide', csvLong.split('\n').length > 500);

  // aller-retour export → import
  const round = await page.evaluate(() => {
    const before = JSON.stringify(DB.entries);
    const payload = JSON.parse(exportPayload());
    DB = freshDB();
    applyImport(payload, 'replace');
    return { same: JSON.stringify(DB.entries) === before, n: Object.keys(DB.entries).length };
  });
  check('aller-retour export/import identique', round.same, round.n + ' journées');

  // fusion : l'entrée la plus récente gagne
  const merge = await page.evaluate(() => {
    const d = '2020-01-15';
    const inc = JSON.parse(exportPayload());
    inc.entries[d] = Object.assign(emptyEntry(d), { steps: 12345, updatedAt: '2030-01-01T00:00:00.000Z' });
    applyImport(inc, 'merge');
    return DB.entries[d] && DB.entries[d].steps;
  });
  check('fusion ajoute les journées manquantes', merge === 12345, String(merge));

  await page.screenshot({ path: path.join(SHOTS, '05-donnees.png') });

  // mode sombre
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'fr-FR' });
  await dark.addInitScript(db => { try { localStorage.setItem('wellio.db.v1', JSON.stringify(db)); } catch (e) {} }, data);
  const p2 = await dark.newPage();
  await p2.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(SHOTS, '06-journal-sombre.png') });
  await p2.locator('.tabbar button[data-scr="stats"]').click();
  await p2.waitForTimeout(500);
  await p2.screenshot({ path: path.join(SHOTS, '07-stats-sombre.png') });

  // débordement horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('pas de débordement horizontal', !overflow);

  console.log('\n— Console —');
  check('aucune erreur JS', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  console.log(fails ? `\n❌ ${fails} test(s) en échec` : '\n✅ tous les tests passent');
  process.exit(fails ? 1 : 0);
})();
