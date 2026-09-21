/* =======================================================================
   Wellio — écran Données : export, import, tags, maintenance
   ======================================================================= */

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function saveFile(filename, mime, content) {
  if (window.WELLIO_PREVIEW) {
    toast("Aperçu : les téléchargements sont bloqués ici, l'export marchera sur ta version installée.");
    return false;
  }
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const file = new File([blob], filename, { type: mime });
  // Sur iPhone, la feuille de partage permet « Enregistrer dans Fichiers » / iCloud.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; }
    catch (err) { if (err && err.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/* ---------- export ---------- */
function exportPayload() {
  return JSON.stringify({ ...DB, exportedAt: new Date().toISOString(), app: 'wellio', schemaVersion: SCHEMA_VERSION }, null, 2);
}
async function exportJSON() {
  const ok = await saveFile(`wellio-sauvegarde-${stamp()}.json`, 'application/json', exportPayload());
  if (!ok) return;
  DB.settings.lastExportAt = new Date().toISOString();
  persist(true); renderDataScreen();
  toast('Sauvegarde exportée');
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const CSV_SEP = ';'; // Excel/Numbers en français

function exportCSVWide() {
  const head = ['date', 'jour_semaine', 'petit_dejeuner', 'petit_dejeuner_tags', 'dejeuner', 'dejeuner_tags',
    'diner', 'diner_tags', 'bonus', 'bonus_tags', 'pas', 'activites', 'activite_minutes', 'activite_note',
    'sommeil_heures', 'sommeil_qualite_1_5', 'douleurs', 'douleurs_zones', 'douleurs_note',
    'engourdissements', 'engourdissements_zones', 'engourdissements_note',
    'symptomes', 'symptomes_nombre', 'symptomes_note', 'stress_0_10', 'humeur_1_5', 'humeur_note', 'modifie_le'];
  const lines = [head.join(CSV_SEP)];
  for (const d of Object.keys(DB.entries).sort()) {
    const e = DB.entries[d];
    const m = k => e.meals[k];
    lines.push([
      d, DAYS[parseISO(d).getDay()],
      m('breakfast').text, m('breakfast').tags.join(', '),
      m('lunch').text, m('lunch').tags.join(', '),
      m('dinner').text, m('dinner').tags.join(', '),
      m('bonus').text, m('bonus').tags.join(', '),
      e.steps, e.activity.tags.join(', '), e.activity.minutes, e.activity.note,
      e.sleep.hours, e.sleep.quality,
      e.sleep.pain ? 'oui' : 'non', e.sleep.painTags.join(', '), e.sleep.painNote,
      e.sleep.numbness ? 'oui' : 'non', e.sleep.numbTags.join(', '), e.sleep.numbNote,
      e.symptoms.tags.join(', '), e.symptoms.tags.length, e.symptoms.note,
      e.stress, e.mood.score, e.mood.note, e.updatedAt
    ].map(csvCell).join(CSV_SEP));
  }
  return '﻿' + lines.join('\n');
}

function exportCSVLong() {
  const lines = ['date' + CSV_SEP + 'categorie' + CSV_SEP + 'champ' + CSV_SEP + 'valeur'];
  const push = (d, c, f, v) => { if (v !== null && v !== undefined && v !== '' && v !== false) lines.push([d, c, f, v].map(csvCell).join(CSV_SEP)); };
  for (const d of Object.keys(DB.entries).sort()) {
    const e = DB.entries[d];
    MEALS.forEach(m => {
      push(d, 'repas', m.key + '_texte', e.meals[m.key].text);
      e.meals[m.key].tags.forEach(t => push(d, 'repas', m.key + '_tag', t));
    });
    push(d, 'activite', 'pas', e.steps);
    push(d, 'activite', 'minutes', e.activity.minutes);
    push(d, 'activite', 'note', e.activity.note);
    e.activity.tags.forEach(t => push(d, 'activite', 'tag', t));
    push(d, 'sommeil', 'heures', e.sleep.hours);
    push(d, 'sommeil', 'qualite', e.sleep.quality);
    push(d, 'sommeil', 'douleurs', e.sleep.pain ? 'oui' : null);
    e.sleep.painTags.forEach(t => push(d, 'sommeil', 'douleur_zone', t));
    push(d, 'sommeil', 'douleur_note', e.sleep.painNote);
    push(d, 'sommeil', 'engourdissements', e.sleep.numbness ? 'oui' : null);
    e.sleep.numbTags.forEach(t => push(d, 'sommeil', 'engourdissement_zone', t));
    push(d, 'sommeil', 'engourdissement_note', e.sleep.numbNote);
    e.symptoms.tags.forEach(t => push(d, 'symptomes', 'tag', t));
    push(d, 'symptomes', 'note', e.symptoms.note);
    push(d, 'etat', 'stress', e.stress);
    push(d, 'etat', 'humeur', e.mood.score);
    push(d, 'etat', 'humeur_note', e.mood.note);
  }
  return '﻿' + lines.join('\n');
}

/* ---------- import ---------- */
function validateImport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Fichier illisible.');
  if (!obj.entries || typeof obj.entries !== 'object') throw new Error('Ce fichier ne contient pas de journal Wellio.');
  const keys = Object.keys(obj.entries).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (!keys.length) throw new Error('Aucune journée valide dans ce fichier.');
  return keys.length;
}

function applyImport(incoming, mode) {
  const migrated = migrate(incoming);
  if (mode === 'replace') {
    DB = migrated;
  } else {
    for (const [d, e] of Object.entries(migrated.entries)) {
      const cur = DB.entries[d];
      if (!cur || !cur.updatedAt || (e.updatedAt && e.updatedAt > cur.updatedAt)) DB.entries[d] = e;
    }
    for (const kind of Object.keys(DB.tags)) {
      const add = (migrated.tags[kind] || []).filter(t => !DB.tags[kind].includes(t));
      DB.tags[kind].push(...add);
    }
  }
  persist(true);
  selectDate(todayISO());
  renderStats(); renderDataScreen();
  toast(mode === 'replace' ? 'Données remplacées' : 'Données fusionnées');
}

/* ---------- gestion des tags ---------- */
const TAG_KIND_LABELS = { food: '🍽 Repas', activity: '🚶 Activités', symptom: '🩺 Symptômes', pain: '💢 Zones de douleur', numb: '🌀 Engourdissements' };

function renderTagManager() {
  const box = $('#tag-manager');
  const parts = [];
  for (const [kind, label] of Object.entries(TAG_KIND_LABELS)) {
    parts.push(el('div', { class: 'field-label', text: label }));
    const chips = el('div', { class: 'chips' });
    DB.tags[kind].forEach(t => {
      chips.appendChild(el('button', {
        type: 'button', class: 'chip', text: t + '  ×', 'aria-label': 'Supprimer le tag ' + t,
        onclick: async () => {
          const ok = await confirmDlg('Supprimer ce tag ?', `« ${t} » disparaîtra de la liste proposée. Les jours déjà enregistrés avec ce tag ne sont pas modifiés.`, 'Supprimer');
          if (!ok) return;
          DB.tags[kind] = DB.tags[kind].filter(x => x !== t);
          persist(true); renderTagManager(); renderDay();
        }
      }));
    });
    chips.appendChild(el('button', {
      type: 'button', class: 'chip add', text: '+ ajouter',
      onclick: async () => {
        const v = await promptDlg('Nouveau tag — ' + label, 'Nom du tag');
        if (!v || DB.tags[kind].includes(v)) return;
        DB.tags[kind].push(v); persist(true); renderTagManager(); renderDay();
      }
    }));
    parts.push(chips);
  }
  box.replaceChildren(...parts);
}

/* ---------- infos & bannière ---------- */
async function renderDataScreen() {
  renderTagManager();

  const n = Object.keys(DB.entries).length;
  const dates = Object.keys(DB.entries).sort();
  const size = new Blob([JSON.stringify(DB)]).size;
  let persisted = null;
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) { }
  const le = DB.settings.lastExportAt ? new Date(DB.settings.lastExportAt) : null;

  $('#storage-info').replaceChildren(
    el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Journées enregistrées' }), el('span', { text: String(n), style: 'font-variant-numeric:tabular-nums' })]),
    el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Période couverte' }), el('span', { text: n ? `${shortDate(dates[0])} → ${shortDate(dates[dates.length - 1])}` : '—' })]),
    el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Taille des données' }), el('span', { text: (size / 1024).toFixed(1) + ' Ko' })]),
    el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Dernière sauvegarde' }), el('span', { text: le ? le.toLocaleDateString('fr-FR') : 'jamais' })]),
    el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Stockage protégé' }), el('span', { text: persisted === null ? 'inconnu' : persisted ? 'oui' : 'non garanti' })]),
    el('p', { class: 'hint', text: `${APP_NAME} · version ${APP_VERSION} · données stockées uniquement sur cet appareil, aucun compte, aucun serveur.` })
  );

  // bannière de rappel de sauvegarde
  const banner = $('#backup-banner');
  const days = le ? (Date.now() - le.getTime()) / 86400000 : Infinity;
  if (window.WELLIO_PREVIEW) {
    banner.replaceChildren(el('div', { class: 'banner' }, [
      el('span', { text: '👀' }),
      el('span', { style: 'flex:1' }, [el('strong', { text: 'Aperçu de démonstration. ' }),
        document.createTextNode("Les 90 jours affichés sont fictifs et l'export de fichiers est bloqué dans cet aperçu. Sur la version installée depuis Vercel, tout fonctionne et le journal démarre vide.")])
    ]));
  } else if (n >= 7 && days > 30) {
    banner.replaceChildren(el('div', { class: 'banner' }, [
      el('span', { text: '⚠️' }),
      el('span', { style: 'flex:1' }, [document.createTextNode(le ? `Dernière sauvegarde il y a ${Math.round(days)} jours. ` : 'Aucune sauvegarde pour le moment. '), el('span', { text: 'Exporte le fichier .json pour ne rien perdre.' })]),
      el('button', { text: 'Exporter', onclick: exportJSON })
    ]));
  } else banner.replaceChildren();
}

function bindData() {
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', async () => {
    await saveFile(`wellio-journal-${stamp()}.csv`, 'text/csv', exportCSVWide()); toast('CSV exporté');
  });
  $('#btn-export-csv-long').addEventListener('click', async () => {
    await saveFile(`wellio-journal-detail-${stamp()}.csv`, 'text/csv', exportCSVLong()); toast('CSV détaillé exporté');
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async ev => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    let obj, count;
    try { obj = JSON.parse(await f.text()); count = validateImport(obj); }
    catch (err) { toast('Import impossible : ' + (err.message || 'fichier invalide')); return; }
    const dlg = $('#import-dlg');
    $('#imp-text').textContent = `${count} journée${count > 1 ? 's' : ''} trouvée${count > 1 ? 's' : ''} dans ce fichier. Tu as ${Object.keys(DB.entries).length} journée(s) sur cet appareil.`;
    const close = () => { dlg.close(); $('#imp-merge').onclick = $('#imp-replace').onclick = $('#imp-cancel').onclick = null; };
    $('#imp-merge').onclick = () => { close(); applyImport(obj, 'merge'); };
    $('#imp-replace').onclick = async () => {
      close();
      const ok = await confirmDlg('Remplacer toutes les données ?', 'Le journal actuel de cet appareil sera définitivement supprimé et remplacé par le contenu du fichier.', 'Remplacer');
      if (ok) applyImport(obj, 'replace');
    };
    $('#imp-cancel').onclick = close;
    dlg.showModal();
  });
  $('#btn-wipe').addEventListener('click', async () => {
    const ok = await confirmDlg('Tout effacer ?', 'Toutes les journées et tous les tags personnalisés seront supprimés de cet appareil. Pense à exporter une sauvegarde avant.', 'Tout effacer');
    if (!ok) return;
    DB = freshDB(); persist(true);
    selectDate(todayISO()); renderStats(); renderDataScreen(); toast('Données effacées');
  });
}

/* ---------- navigation ---------- */
function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
  $$('.tabbar button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.scr === name)));
  if (name === 'stats') renderStats();
  if (name === 'data') renderDataScreen();
  haptic();
}

/* ---------- démarrage ---------- */
async function boot() {
  await loadDB();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }

  buildStaticControls();
  bindForm();
  bindStats();
  bindData();
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.scr)));

  const d = parseISO(todayISO());
  calMonth = { y: d.getFullYear(), m: d.getMonth() };
  selectDate(todayISO());

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(true); });
  window.addEventListener('pagehide', () => persist(true));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
