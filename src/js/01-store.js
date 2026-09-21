/* =======================================================================
   Wellio — stockage & modèle de données
   Tout est conservé localement sur l'appareil (IndexedDB + miroir
   localStorage). Rien n'est envoyé sur un serveur.
   ======================================================================= */
'use strict';

const APP_NAME = 'Wellio';
const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const LS_KEY = 'wellio.db.v1';
const IDB_NAME = 'wellio';
const IDB_STORE = 'kv';

const DEFAULT_TAGS = {
  food: ['Fait maison', 'Légumes', 'Fruits', 'Protéines', 'Féculents', 'Laitages',
    'Gluten', 'Sucre', 'Café', 'Alcool', 'Épicé', 'Plat industriel', 'Restaurant', 'Léger', 'Copieux'],
  activity: ['Marche', 'Course', 'Vélo', 'Natation', 'Musculation', 'Yoga',
    'Étirements', 'Randonnée', 'Jardinage', 'Ménage', 'Journée assise', 'Repos complet'],
  symptom: ['Mal de tête', 'Migraine', 'Fatigue', 'Ballonnements', 'Nausée', 'Reflux',
    'Douleurs articulaires', 'Douleurs musculaires', 'Mal de dos', 'Vertiges',
    'Brouillard mental', 'Palpitations', 'Crampes', 'Démangeaisons', 'Essoufflement', 'Yeux secs'],
  pain: ['Nuque', 'Épaules', 'Dos', 'Lombaires', 'Hanches', 'Genoux', 'Jambes', 'Mâchoire'],
  numb: ['Main gauche', 'Main droite', 'Bras', 'Pieds', 'Jambes', 'Visage']
};

const MEALS = [
  { key: 'breakfast', label: 'Petit-déjeuner', icon: '🌅' },
  { key: 'lunch', label: 'Déjeuner', icon: '☀️' },
  { key: 'dinner', label: 'Dîner', icon: '🌆' },
  { key: 'bonus', label: 'Bonus / en-cas', icon: '🍪' }
];

const MOODS = [
  { v: 1, e: '😞', l: 'Très mauvaise' },
  { v: 2, e: '🙁', l: 'Mauvaise' },
  { v: 3, e: '😐', l: 'Neutre' },
  { v: 4, e: '🙂', l: 'Bonne' },
  { v: 5, e: '😄', l: 'Très bonne' }
];

const SLEEP_Q = [
  { v: 1, l: 'Très mauvaise' }, { v: 2, l: 'Mauvaise' }, { v: 3, l: 'Moyenne' },
  { v: 4, l: 'Bonne' }, { v: 5, l: 'Excellente' }
];

/* ---------- état ---------- */
let DB = null;

function emptyEntry(date) {
  return {
    date,
    meals: { breakfast: { text: '', tags: [] }, lunch: { text: '', tags: [] }, dinner: { text: '', tags: [] }, bonus: { text: '', tags: [] } },
    steps: null,
    activity: { tags: [], minutes: null, note: '' },
    sleep: { hours: null, quality: null, pain: false, painTags: [], painNote: '', numbness: false, numbTags: [], numbNote: '' },
    symptoms: { tags: [], note: '' },
    stress: null,
    mood: { score: null, note: '' },
    updatedAt: null
  };
}

function freshDB() {
  return {
    app: 'wellio',
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    entries: {},
    tags: JSON.parse(JSON.stringify(DEFAULT_TAGS)),
    settings: { lastExportAt: null }
  };
}

/* ---------- IndexedDB minimal ---------- */
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(IDB_STORE, mode);
        const out = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => { req.result.close(); resolve(out && out.result !== undefined ? out.result : null); };
        tx.onerror = () => { req.result.close(); resolve(null); };
      } catch (e) { resolve(null); }
    };
  });
}

async function loadDB() {
  let data = null;
  try {
    const raw = await idb('readonly', s => s.get('db'));
    if (raw) data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) { /* ignore */ }
  if (!data) {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) data = JSON.parse(raw); } catch (e) { /* ignore */ }
  }
  DB = migrate(data) || freshDB();
  return DB;
}

function migrate(data) {
  if (!data || typeof data !== 'object' || !data.entries) return null;
  const base = freshDB();
  const db = Object.assign(base, data);
  db.schemaVersion = SCHEMA_VERSION;
  db.tags = Object.assign({}, base.tags, data.tags || {});
  db.settings = Object.assign({}, base.settings, data.settings || {});
  // normalise chaque entrée sur le schéma courant
  const norm = {};
  for (const [date, e] of Object.entries(db.entries)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const t = emptyEntry(date);
    deepMerge(t, e);
    t.date = date;
    norm[date] = t;
  }
  db.entries = norm;
  return db;
}

function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const k of Object.keys(target)) {
    if (!(k in src)) continue;
    const a = target[k], b = src[k];
    if (Array.isArray(a)) target[k] = Array.isArray(b) ? b.slice() : a;
    else if (a && typeof a === 'object') deepMerge(a, b);
    else if (b !== undefined) target[k] = b;
  }
  return target;
}

let saveTimer = null;
function persist(immediate) {
  clearTimeout(saveTimer);
  const doIt = () => {
    const json = JSON.stringify(DB);
    try { localStorage.setItem(LS_KEY, json); } catch (e) { /* quota */ }
    idb('readwrite', s => s.put(json, 'db'));
  };
  if (immediate) doIt(); else saveTimer = setTimeout(doIt, 300);
}

/* ---------- accès aux entrées ---------- */
function getEntry(date) { return DB.entries[date] || null; }
function ensureEntry(date) {
  if (!DB.entries[date]) DB.entries[date] = emptyEntry(date);
  return DB.entries[date];
}
function isBlank(e) {
  if (!e) return true;
  if (e.steps != null || e.stress != null) return false;
  if (e.mood.score != null || e.mood.note) return false;
  if (e.sleep.hours != null || e.sleep.quality != null || e.sleep.pain || e.sleep.numbness) return false;
  if (e.symptoms.tags.length || e.symptoms.note) return false;
  if (e.activity.tags.length || e.activity.note || e.activity.minutes != null) return false;
  for (const m of MEALS) { const x = e.meals[m.key]; if (x.text || x.tags.length) return false; }
  return true;
}
function pruneIfBlank(date) {
  const e = DB.entries[date];
  if (e && isBlank(e)) delete DB.entries[date];
}
/** Nombre de champs majeurs renseignés (0-7) — sert aux pastilles du calendrier. */
function completeness(e) {
  if (!e) return 0;
  let n = 0;
  if (MEALS.some(m => e.meals[m.key].text || e.meals[m.key].tags.length)) n++;
  if (e.steps != null) n++;
  if (e.activity.tags.length || e.activity.minutes != null || e.activity.note) n++;
  if (e.sleep.hours != null || e.sleep.quality != null) n++;
  if (e.symptoms.tags.length || e.symptoms.note) n++;
  if (e.stress != null) n++;
  if (e.mood.score != null) n++;
  return n;
}

/* ---------- dates ---------- */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayISO() { return iso(new Date()); }
function addDays(isoStr, n) { const d = parseISO(isoStr); d.setDate(d.getDate() + n); return iso(d); }
function longDate(isoStr) {
  const d = parseISO(isoStr);
  const t = todayISO();
  if (isoStr === t) return "Aujourd'hui";
  if (isoStr === addDays(t, -1)) return 'Hier';
  if (isoStr === addDays(t, 1)) return 'Demain';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function shortDate(isoStr) { const d = parseISO(isoStr); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

/* ---------- utilitaires DOM ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  if (children) (Array.isArray(children) ? children : [children]).forEach(c => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
function confirmDlg(title, text, okLabel) {
  return new Promise(resolve => {
    const dlg = $('#confirm-dlg');
    $('#cf-title').textContent = title; $('#cf-text').textContent = text; $('#cf-ok').textContent = okLabel;
    const done = v => { dlg.close(); $('#cf-ok').onclick = null; $('#cf-cancel').onclick = null; resolve(v); };
    $('#cf-ok').onclick = () => done(true);
    $('#cf-cancel').onclick = () => done(false);
    dlg.showModal();
  });
}
/** Saisie de texte en fenêtre modale : `prompt()` est bloqué dans certains
 *  contextes (iframe en bac à sable, app installée sur iOS). */
function promptDlg(title, placeholder, okLabel) {
  return new Promise(resolve => {
    const dlg = $('#prompt-dlg'), form = $('#prompt-form'), input = $('#pr-input');
    $('#pr-title').textContent = title;
    $('#pr-ok').textContent = okLabel || 'Ajouter';
    input.placeholder = placeholder || '';
    input.value = '';
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      form.onsubmit = null; $('#pr-cancel').onclick = null; dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(v);
    };
    form.onsubmit = ev => { ev.preventDefault(); finish(input.value.trim() || null); };
    $('#pr-cancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null); // touche Échap / geste de fermeture
    dlg.showModal();
    setTimeout(() => { try { input.focus(); } catch (e) { } }, 60);
  });
}
function haptic() { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } }
