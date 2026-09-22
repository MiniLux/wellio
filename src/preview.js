/* =======================================================================
   Wellio — complément chargé UNIQUEMENT dans l'aperçu (artefact claude.ai).
   Il remplit l'app avec 90 jours de données de démonstration pour qu'on
   puisse juger l'ergonomie et l'écran de stats, et il explique que le
   téléchargement de fichiers est désactivé dans cet aperçu.
   Ce fichier n'est pas inclus dans la version déployée sur Vercel.
   ======================================================================= */
window.WELLIO_PREVIEW = true;

(function seedDemo() {
  try {
    if (localStorage.getItem('wellio.db.v1')) return;
  } catch (e) { return; }

  const rnd = (s => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)(7);
  const foods = ['Café', 'Légumes', 'Gluten', 'Sucre', 'Fait maison', 'Laitages', 'Alcool'];
  const acts = ['Marche', 'Yoga', 'Course', 'Journée assise', 'Étirements'];
  const symps = ['Fatigue', 'Mal de tête', 'Ballonnements', 'Douleurs articulaires'];
  const pick = (arr, p) => arr.filter(() => rnd() < p);
  const hhmm = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
  const entries = {};
  const today = new Date();
  let prevSleep = 7, prevLateCoffee = 0;

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (i > 0 && rnd() < 0.1) continue; // quelques jours non renseignés, sauf aujourd'hui

    // boissons de la journée (un café tardif dégrade le sommeil de la nuit suivante)
    const drinks = [];
    const nWater = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < nWater; k++) drinks.push({ name: 'Eau', ml: 250, t: hhmm(7.5 + rnd() * 13) });
    const nCoffee = Math.floor(rnd() * 3.4);
    let lastCoffee = 0;
    for (let k = 0; k < nCoffee; k++) {
      const h = k === 0 ? 7.5 + rnd() * 1.5 : 11 + rnd() * 9;
      lastCoffee = Math.max(lastCoffee, h);
      drinks.push({ name: 'Café', ml: 100, t: hhmm(h) });
    }
    if (rnd() < 0.35) drinks.push({ name: 'Thé', ml: 200, t: hhmm(15 + rnd() * 2) });
    if (rnd() < 0.3) drinks.push({ name: 'Tisane', ml: 200, t: hhmm(21 + rnd()) });
    if (rnd() < 0.25) { drinks.push({ name: 'Vin', ml: 125, t: hhmm(20 + rnd()) }); if (rnd() < 0.5) drinks.push({ name: 'Vin', ml: 125, t: hhmm(21 + rnd()) }); }
    if (rnd() < 0.2) drinks.push({ name: 'Soda', ml: 330, t: hhmm(13 + rnd() * 5) });
    drinks.sort((a, b) => a.t.localeCompare(b.t));

    const latePenalty = prevLateCoffee > 15 ? (prevLateCoffee - 15) * 0.5 : 0;
    const sleep = Math.max(3.5, Math.round((5.6 + rnd() * 3.4 - latePenalty) * 4) / 4);
    prevLateCoffee = lastCoffee;
    const nSym = Math.max(0, Math.round((7.8 - prevSleep) * 0.8 + (rnd() - 0.5) * 1.6));
    const stress = Math.max(0, Math.min(10, Math.round(9.5 - sleep + (rnd() - 0.5) * 3)));
    entries[ds] = {
      date: ds,
      meals: {
        breakfast: { text: rnd() < 0.5 ? 'Porridge, banane' : 'Tartines, œufs', tags: pick(foods, 0.3) },
        lunch: { text: rnd() < 0.5 ? 'Salade de lentilles' : 'Riz, poulet, courgettes', tags: pick(foods, 0.25) },
        dinner: { text: rnd() < 0.5 ? 'Soupe et pain' : 'Pâtes au pesto', tags: pick(foods, 0.25) },
        bonus: { text: rnd() < 0.35 ? 'Carré de chocolat' : '', tags: [] }
      },
      drinks: { items: drinks, note: '' },
      steps: Math.round(2800 + rnd() * 9500),
      activity: { tags: pick(acts, 0.3), minutes: Math.round(rnd() * 10) * 5, note: '' },
      sleep: {
        hours: sleep,
        quality: Math.max(1, Math.min(5, Math.round(sleep - 3 + (rnd() - 0.5)))),
        pain: rnd() < 0.24, painTags: rnd() < 0.18 ? ['Lombaires'] : [], painNote: '',
        numbness: rnd() < 0.14, numbTags: rnd() < 0.1 ? ['Main droite'] : [], numbNote: ''
      },
      symptoms: { tags: symps.slice(0, Math.min(nSym, symps.length)), note: '' },
      stress,
      mood: { score: Math.max(1, Math.min(5, Math.round(6 - stress / 2.4))), note: '' },
      updatedAt: new Date(d).toISOString()
    };
    prevSleep = sleep;
  }
  try {
    localStorage.setItem('wellio.db.v1', JSON.stringify({
      app: 'wellio', schemaVersion: 1, demo: true, createdAt: new Date().toISOString(),
      entries, settings: { lastExportAt: null }
    }));
  } catch (e) { /* stockage indisponible : l'aperçu démarrera vide */ }
})();
