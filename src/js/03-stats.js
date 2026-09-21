/* =======================================================================
   Wellio — écran Statistiques (orienté corrélations)
   ======================================================================= */

const hasSleep = e => e.sleep.hours != null || e.sleep.quality != null || e.sleep.pain || e.sleep.numbness;

const VARS = [
  { key: 'sleepHours', label: 'Sommeil (h)', short: 'Sommeil', subj: 'le sommeil', unit: 'h', dec: 1, get: e => e.sleep.hours },
  { key: 'sleepQuality', label: 'Qualité du sommeil', short: 'Qualité sommeil', subj: 'la qualité du sommeil', unit: '/5', dec: 1, get: e => e.sleep.quality },
  { key: 'steps', label: 'Nombre de pas', short: 'Pas', subj: 'le nombre de pas', unit: '', dec: 0, get: e => e.steps },
  { key: 'activityMin', label: "Durée d'activité (min)", short: 'Activité', subj: "la durée d'activité", unit: ' min', dec: 0, get: e => e.activity.minutes },
  { key: 'stress', label: 'Niveau de stress', short: 'Stress', subj: 'le stress', unit: '/10', dec: 1, get: e => e.stress },
  { key: 'mood', label: 'Humeur', short: 'Humeur', subj: "l'humeur", unit: '/5', dec: 1, get: e => e.mood.score },
  { key: 'symptomCount', label: 'Nombre de symptômes', short: 'Symptômes', subj: 'le nombre de symptômes', unit: '', dec: 1, get: e => completeness(e) > 0 ? e.symptoms.tags.length : null },
  {
    key: 'pain', label: 'Douleurs nocturnes', short: 'Douleurs', subj: 'les douleurs nocturnes', unit: '', dec: 2, bool: true,
    cause: 'il y a des douleurs nocturnes', more: 'les douleurs nocturnes sont plus fréquentes', less: 'les douleurs nocturnes sont plus rares',
    get: e => hasSleep(e) ? (e.sleep.pain ? 1 : 0) : null
  },
  {
    key: 'numbness', label: 'Engourdissements', short: 'Engourdis.', subj: 'les engourdissements', unit: '', dec: 2, bool: true,
    cause: 'il y a des engourdissements', more: 'les engourdissements sont plus fréquents', less: 'les engourdissements sont plus rares',
    get: e => hasSleep(e) ? (e.sleep.numbness ? 1 : 0) : null
  }
];
/** « Quand le sommeil augmente » / « Quand il y a des douleurs nocturnes ». */
const causePhrase = V => V.bool ? V.cause : `${V.subj} augmente`;
/** « le stress a tendance à diminuer » / « les douleurs sont plus fréquentes ». */
const effectPhrase = (V, r) => V.bool ? (r > 0 ? V.more : V.less) : `${V.subj} a tendance à ${r > 0 ? 'augmenter' : 'diminuer'}`;
const VAR_BY_KEY = Object.fromEntries(VARS.map(v => [v.key, v]));

let period = 90;
let lag = 0;
let varX = 'sleepHours', varY = 'symptomCount';
let tagTarget = 'symptomCount';

/* ---------- séries ---------- */
function datesInPeriod() {
  const all = Object.keys(DB.entries).sort();
  if (!period) return all;
  const min = addDays(todayISO(), -(period - 1));
  return all.filter(d => d >= min);
}
function valueOn(date, key) {
  const e = DB.entries[date];
  if (!e) return null;
  const v = VAR_BY_KEY[key].get(e);
  return (v === null || v === undefined || Number.isNaN(v)) ? null : Number(v);
}
/** Paires (x du jour J, y du jour J+lag) disponibles. */
function pairs(xKey, yKey, lagDays) {
  const out = [];
  for (const d of datesInPeriod()) {
    const x = valueOn(d, xKey);
    if (x === null) continue;
    const d2 = lagDays ? addDays(d, lagDays) : d;
    const y = valueOn(d2, yKey);
    if (y === null) continue;
    out.push({ x, y, date: d, date2: d2 });
  }
  return out;
}

/* ---------- statistiques ---------- */
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
function pearson(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  if (dx === 0 || dy === 0) return null;
  const r = num / Math.sqrt(dx * dy);
  return { r, n, p: pValue(r, n), mx, my, slope: num / dx };
}
/** Fonction d'erreur — approximation d'Abramowitz & Stegun 7.1.26. */
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return s * y;
}
/** p bilatéral via la transformation z de Fisher (approximation suffisante ici). */
function pValue(r, n) {
  if (n < 5 || Math.abs(r) >= 0.999) return 0;
  const z = Math.atanh(r) * Math.sqrt(n - 3);
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}
function strengthLabel(r) {
  const a = Math.abs(r);
  if (a >= 0.6) return 'lien fort';
  if (a >= 0.4) return 'lien net';
  if (a >= 0.25) return 'lien léger';
  return 'lien faible';
}
function corrColor(r) {
  const a = Math.min(1, Math.abs(r) / 0.8);
  const light = document.documentElement.getAttribute('data-theme') === 'dark' ? false : !matchMedia('(prefers-color-scheme: dark)').matches;
  const pos = light ? [42, 120, 214] : [57, 135, 229];
  const neg = light ? [208, 59, 59] : [230, 103, 103];
  const c = r >= 0 ? pos : neg;
  const alpha = 0.35 + 0.65 * a;
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(2)})`;
}
/** Graduations « rondes » (1, 2, 2,5, 5, 10 × 10^k) dans l'intervalle donné. */
function niceTicks(lo, hi, count) {
  if (hi <= lo) return [lo];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out.length >= 2 ? out : [lo, hi];
}
function tickLabel(V, v) {
  if (V.bool) return v > 0.5 ? 'oui' : 'non';
  if (V.key === 'steps') return Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v));
  let r = Math.round(v * 100) / 100;
  if (r === 0) r = 0; // évite « -0 »
  return r.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
/** Dispersion à appliquer quand les valeurs sont discrètes (sinon les points se superposent). */
function jitterAmp(vals) {
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  if (uniq.length > 12 || uniq.length < 2) return 0;
  let minGap = Infinity;
  for (let i = 1; i < uniq.length; i++) minGap = Math.min(minGap, uniq[i] - uniq[i - 1]);
  return minGap * 0.4;
}
/** Générateur pseudo-aléatoire déterministe : le nuage ne bouge pas d'un rendu à l'autre. */
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function fmtVal(key, v) {
  if (v === null || v === undefined) return '—';
  const V = VAR_BY_KEY[key];
  if (V.bool) return Math.round(v * 100) + ' %';
  if (key === 'steps') return Math.round(v).toLocaleString('fr-FR');
  if (key === 'sleepHours') return fmtHours(Math.round(v * 4) / 4);
  return v.toFixed(V.dec) + V.unit;
}

/* ---------- rendu ---------- */
function renderStats() {
  const dates = datesInPeriod();
  renderKpis(dates);
  renderTopCorrelations();
  renderScatter();
  renderTagEffects();
  renderWeekly();
}

function renderKpis(dates) {
  const filled = dates.filter(d => completeness(DB.entries[d]) > 0);
  const avg = key => {
    const vals = dates.map(d => valueOn(d, key)).filter(v => v !== null);
    return vals.length ? mean(vals) : null;
  };
  const items = [
    { k: 'Jours renseignés', v: String(filled.length), s: period ? `sur ${period} j` : '' },
    { k: 'Sommeil moyen', v: avg('sleepHours') === null ? '—' : fmtHours(Math.round(avg('sleepHours') * 4) / 4), s: '' },
    { k: 'Pas / jour', v: avg('steps') === null ? '—' : Math.round(avg('steps')).toLocaleString('fr-FR'), s: '' },
    { k: 'Stress moyen', v: avg('stress') === null ? '—' : avg('stress').toFixed(1), s: '/10' }
  ];
  $('#kpis').replaceChildren(...items.map(i => el('div', { class: 'kpi' }, [
    el('div', { class: 'v' }, [document.createTextNode(i.v), i.s ? el('small', { text: ' ' + i.s }) : null]),
    el('div', { class: 'k', text: i.k })
  ])));
}

function renderTopCorrelations() {
  const box = $('#corr-top');
  const found = [];
  for (const L of [0, 1]) {
    for (let i = 0; i < VARS.length; i++) {
      for (let j = 0; j < VARS.length; j++) {
        if (i === j) continue;
        if (L === 0 && j < i) continue; // symétrique
        const res = pearson(pairs(VARS[i].key, VARS[j].key, L));
        if (!res || res.n < 7) continue;
        if (Math.abs(res.r) < 0.25) continue;
        found.push({ x: VARS[i], y: VARS[j], lag: L, ...res });
      }
    }
  }
  found.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const top = found.slice(0, 8);

  if (!top.length) {
    box.replaceChildren(el('div', { class: 'empty' }, [
      el('span', { class: 'big', text: '🔍' }),
      document.createTextNode('Pas encore assez de données. Il faut au moins 7 jours comparables pour qu\'une corrélation devienne lisible — continue à remplir le journal.')
    ]));
    return;
  }
  box.replaceChildren(...top.map(c => {
    const when = c.lag ? ' le lendemain' : '';
    const fiab = c.p < 0.01 ? 'signal net' : c.p < 0.05 ? 'signal probable' : 'à confirmer';
    return el('button', {
      class: 'corr-item', type: 'button', style: 'width:100%;text-align:left',
      onclick: () => { varX = c.x.key; varY = c.y.key; lag = c.lag; syncStatControls(); renderScatter(); $('#scatter-box').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, [
      el('span', { class: 'rbadge', text: (c.r > 0 ? '+' : '') + c.r.toFixed(2), style: `background:${corrColor(c.r)}` }),
      el('span', { class: 'txt' }, [
        document.createTextNode(`Quand ${causePhrase(c.x)}, ${effectPhrase(c.y, c.r)}${when}.`),
        el('small', { text: `${strengthLabel(c.r)} · ${c.n} jours comparés · ${fiab}` })
      ])
    ]);
  }));
}

function syncStatControls() {
  $('#var-x').value = varX; $('#var-y').value = varY;
  $$('#lag-seg button').forEach(b => b.setAttribute('aria-pressed', String(parseInt(b.dataset.lag, 10) === lag)));
}

function renderScatter() {
  const box = $('#scatter-box');
  const X = VAR_BY_KEY[varX], Y = VAR_BY_KEY[varY];
  const pts = pairs(varX, varY, lag);
  const res = pearson(pts);
  if (pts.length < 3) {
    box.replaceChildren(el('div', { class: 'empty' }, [el('span', { class: 'big', text: '📉' }), document.createTextNode('Pas assez de jours où ces deux champs sont renseignés ensemble.')]));
    return;
  }
  const W = 320, H = 210, ml = 40, mr = 8, mt = 10, mb = 28;
  const pw = W - ml - mr, ph = H - mt - mb;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const pad = (a) => { let lo = Math.min(...a), hi = Math.max(...a); if (lo === hi) { lo -= 1; hi += 1; } const d = (hi - lo) * 0.08; return [lo - d, hi + d]; };
  const [x0, x1] = pad(xs), [y0, y1] = pad(ys);
  const sx = v => ml + (v - x0) / (x1 - x0) * pw;
  const sy = v => mt + ph - (v - y0) / (y1 - y0) * ph;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Nuage de points : ${X.label} en abscisse, ${Y.label} en ordonnée`);
  const mk = (t, a) => { const n = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };

  // grille + graduations (pas « ronds »)
  const yTicks = Y.bool ? [0, 1] : niceTicks(y0, y1, 5);
  yTicks.forEach(v => {
    const yy = sy(v);
    if (yy < mt - 1 || yy > mt + ph + 1) return;
    svg.appendChild(mk('line', { class: 'grid-line', x1: ml, x2: W - mr, y1: yy, y2: yy }));
    const t = mk('text', { x: ml - 6, y: yy + 3.5, 'text-anchor': 'end' });
    t.textContent = tickLabel(Y, v);
    svg.appendChild(t);
  });
  const xTicks = X.bool ? [0, 1] : niceTicks(x0, x1, 4);
  xTicks.forEach((v, i) => {
    const xx = sx(v);
    if (xx < ml - 1 || xx > W - mr + 1) return;
    const t = mk('text', { x: xx, y: H - 12, 'text-anchor': 'middle' });
    t.textContent = tickLabel(X, v);
    svg.appendChild(t);
  });
  svg.appendChild(mk('line', { class: 'axis', x1: ml, x2: ml, y1: mt, y2: mt + ph }));
  svg.appendChild(mk('line', { class: 'axis', x1: ml, x2: W - mr, y1: mt + ph, y2: mt + ph }));

  // droite de régression
  if (res) {
    const a = res.slope, b = res.my - a * res.mx;
    const lx0 = Math.max(x0, Math.min(...xs)), lx1 = Math.min(x1, Math.max(...xs));
    svg.appendChild(mk('line', {
      x1: sx(lx0), y1: sy(a * lx0 + b), x2: sx(lx1), y2: sy(a * lx1 + b),
      stroke: corrColor(res.r), 'stroke-width': 2, 'stroke-linecap': 'round'
    }));
  }
  // points (anneau de surface 2px pour la lisibilité des superpositions)
  const jx = jitterAmp(xs), jy = jitterAmp(ys);
  const rand = mulberry(pts.length * 7 + 13);
  pts.forEach(p => {
    const c = mk('circle', {
      cx: sx(p.x + (rand() - 0.5) * jx), cy: sy(p.y + (rand() - 0.5) * jy), r: 4.5,
      fill: 'var(--s1)', 'fill-opacity': 0.75, stroke: 'var(--surface)', 'stroke-width': 2
    });
    const ti = document.createElementNS(ns, 'title');
    ti.textContent = `${shortDate(p.date)} · ${X.short} ${fmtVal(varX, p.x)} → ${Y.short} ${fmtVal(varY, p.y)}`;
    c.appendChild(ti);
    svg.appendChild(c);
  });

  const caption = res
    ? el('p', { class: 'hint', style: 'margin-top:4px' }, [
      el('strong', { text: `r = ${res.r >= 0 ? '+' : ''}${res.r.toFixed(2)}` }),
      document.createTextNode(` · ${strengthLabel(res.r)} · ${res.n} jours · ${res.p < 0.05 ? 'peu probable au hasard' : 'peut être dû au hasard'}`)
    ])
    : el('p', { class: 'hint', text: 'Variation insuffisante pour calculer une corrélation.' });

  box.replaceChildren(
    el('p', { class: 'hint', style: 'margin:0 0 6px', text: `${Y.label} (vertical) selon ${X.label} (horizontal)${lag ? ' — mesuré le lendemain' : ''}` }),
    svg, caption
  );
}

/* ---------- effet des tags ---------- */
function allTagsUsed() {
  const counts = new Map();
  for (const d of datesInPeriod()) {
    const e = DB.entries[d]; if (!e) continue;
    const set = new Set();
    MEALS.forEach(m => e.meals[m.key].tags.forEach(t => set.add('🍽 ' + t)));
    e.activity.tags.forEach(t => set.add('🚶 ' + t));
    e.symptoms.tags.forEach(t => set.add('🩺 ' + t));
    for (const t of set) {
      if (!counts.has(t)) counts.set(t, []);
      counts.get(t).push(d);
    }
  }
  return counts;
}

function renderTagEffects() {
  const box = $('#tag-effects');
  const counts = allTagsUsed();
  const target = tagTarget;
  const rows = [];
  const allDates = datesInPeriod();

  for (const [tag, days] of counts) {
    if (days.length < 4) continue;
    const dset = new Set(days);
    for (const L of [0, 1]) {
      // un tag de symptôme comparé au nombre de symptômes du même jour ne dit rien
      if (L === 0 && target === 'symptomCount' && tag.startsWith('🩺')) continue;
      const withV = [], withoutV = [];
      for (const d of allDates) {
        const ref = L ? addDays(d, -L) : d; // le jour du tag
        const v = valueOn(d, target);
        if (v === null) continue;
        (dset.has(ref) ? withV : withoutV).push(v);
      }
      if (withV.length < 4 || withoutV.length < 4) continue;
      const mw = mean(withV), mo = mean(withoutV);
      rows.push({ tag, lag: L, diff: mw - mo, mw, mo, n: withV.length });
    }
  }
  if (!rows.length) {
    box.replaceChildren(el('div', { class: 'empty' }, [el('span', { class: 'big', text: '🏷️' }), document.createTextNode("Ajoute des tags à tes repas, activités et symptômes : dès qu'un tag revient 4 fois, son effet apparaît ici.")]));
    return;
  }
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const top = rows.slice(0, 8);
  const maxAbs = Math.max(...top.map(r => Math.abs(r.diff)));
  const T = VAR_BY_KEY[target];

  box.replaceChildren(...top.map(r => {
    const pct = Math.abs(r.diff) / maxAbs * 100;
    const sign = r.diff > 0 ? '+' : '';
    return el('div', { class: 'corr-item' }, [
      el('span', { class: 'rbadge', text: sign + (T.bool ? Math.round(r.diff * 100) + '%' : r.diff.toFixed(T.dec)), style: `background:${corrColor(r.diff)}` }),
      el('span', { class: 'txt' }, [
        document.createTextNode(`${r.tag}${r.lag ? ' → lendemain' : ''}`),
        el('small', { text: `${T.short} : ${fmtVal(target, r.mw)} avec · ${fmtVal(target, r.mo)} sans · ${r.n} jours` }),
        el('span', { class: 'bar-track', style: 'margin-top:6px;display:block' }, [
          el('span', { class: 'bar-fill', style: `width:${pct}%;background:${corrColor(r.diff)}` })
        ])
      ])
    ]);
  }));
}

/* ---------- moyennes hebdomadaires ---------- */
function renderWeekly() {
  const dates = datesInPeriod();
  if (!dates.length) { $('#weekly').replaceChildren(el('div', { class: 'empty', text: 'Aucune donnée sur la période.' })); return; }
  const weeks = new Map();
  for (const d of dates) {
    const dt = parseISO(d);
    const monday = new Date(dt); monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const k = iso(monday);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(d);
  }
  const keys = [...weeks.keys()].sort().reverse().slice(0, 8);
  const cell = (ds, key) => {
    const vals = ds.map(d => valueOn(d, key)).filter(v => v !== null);
    return vals.length ? mean(vals) : null;
  };
  const head = el('tr', {}, [
    el('th', { text: 'Semaine' }), el('th', { text: 'Som.' }), el('th', { text: 'Pas' }),
    el('th', { text: 'Stress' }), el('th', { text: 'Hum.' }), el('th', { text: 'Sympt.' })
  ]);
  const body = keys.map(k => {
    const ds = weeks.get(k);
    const s = cell(ds, 'sleepHours'), p = cell(ds, 'steps'), st = cell(ds, 'stress'), m = cell(ds, 'mood'), sy = cell(ds, 'symptomCount');
    return el('tr', {}, [
      el('td', { text: 'sem. du ' + shortDate(k) }),
      el('td', { text: s === null ? '—' : (Math.round(s * 10) / 10).toFixed(1) }),
      el('td', { text: p === null ? '—' : Math.round(p).toLocaleString('fr-FR') }),
      el('td', { text: st === null ? '—' : st.toFixed(1) }),
      el('td', { text: m === null ? '—' : m.toFixed(1) }),
      el('td', { text: sy === null ? '—' : sy.toFixed(1) })
    ]);
  });
  const tbl = el('table', { class: 'tbl' }, [el('thead', {}, head), el('tbody', {}, body)]);
  $('#weekly').replaceChildren(tbl);
}

function bindStats() {
  const opts = sel => VARS.map(v => el('option', { value: v.key, text: v.label }));
  $('#var-x').replaceChildren(...opts()); $('#var-y').replaceChildren(...opts());
  $('#tag-target').replaceChildren(...VARS.map(v => el('option', { value: v.key, text: 'Effet sur : ' + v.label.toLowerCase() })));
  $('#tag-target').value = tagTarget;
  syncStatControls();

  $('#period').addEventListener('change', e => { period = parseInt(e.target.value, 10); renderStats(); });
  $('#var-x').addEventListener('change', e => { varX = e.target.value; renderScatter(); });
  $('#var-y').addEventListener('change', e => { varY = e.target.value; renderScatter(); });
  $('#lag-seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-lag]'); if (!b) return;
    lag = parseInt(b.dataset.lag, 10); syncStatControls(); renderScatter();
  });
  $('#tag-target').addEventListener('change', e => { tagTarget = e.target.value; renderTagEffects(); });
}
