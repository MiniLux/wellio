/* =======================================================================
   Wellio — écran Journal : calendrier + saisie du jour
   ======================================================================= */

let selDate = todayISO();
let calMonth = null; // {y, m}

/* ---------- Calendrier ---------- */
function renderCalendar() {
  const grid = $('#cal-grid');
  const { y, m } = calMonth;
  $('#cal-title').textContent = `${MONTHS[m]} ${y}`;

  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(y, m, 1 - startOffset);
  const today = todayISO();
  const frag = document.createDocumentFragment();

  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const ds = iso(d);
    const e = getEntry(ds);
    const n = completeness(e);
    const cls = ['day'];
    if (d.getMonth() !== m) cls.push('out');
    if (ds === today) cls.push('today');
    if (ds === selDate) cls.push('sel');
    if (ds > today) cls.push('future');

    const dots = el('div', { class: 'dots' });
    if (n > 0) {
      const lvl = n >= 6 ? 3 : n >= 3 ? 2 : 1;
      for (let k = 0; k < lvl; k++) dots.appendChild(el('span', { class: 'dot filled' }));
    }
    if (e && e.symptoms.tags.length) dots.appendChild(el('span', { class: 'dot sym' }));

    frag.appendChild(el('button', {
      class: cls.join(' '), 'data-date': ds, type: 'button',
      'aria-label': longDate(ds), onclick: () => selectDate(ds)
    }, [el('span', { class: 'num', text: String(d.getDate()) }), dots]));
  }
  grid.replaceChildren(frag);
}

function selectDate(ds) {
  selDate = ds;
  const d = parseISO(ds);
  if (!calMonth || calMonth.y !== d.getFullYear() || calMonth.m !== d.getMonth()) calMonth = { y: d.getFullYear(), m: d.getMonth() };
  renderCalendar();
  renderDay();
  haptic();
  $('#day-scroll').scrollTop = 0;
}

function shiftMonth(delta) {
  const d = new Date(calMonth.y, calMonth.m + delta, 1);
  calMonth = { y: d.getFullYear(), m: d.getMonth() };
  renderCalendar();
}

/* ---------- Chips de tags ---------- */
function renderChips(container, kind, selected, onChange, tone, sortSelectedFirst) {
  const box = typeof container === 'string' ? $(container) : container;
  const list = DB.tags[kind] || [];
  const extra = selected.filter(t => !list.includes(t));
  let all = [...list, ...extra];
  // au premier affichage d'un jour, les tags choisis remontent en tête (utile
  // dans les rangées défilantes) ; ensuite l'ordre reste stable pendant la saisie
  if (sortSelectedFirst) all = [...all.filter(t => selected.includes(t)), ...all.filter(t => !selected.includes(t))];
  const frag = document.createDocumentFragment();
  all.forEach(tag => {
    const on = selected.includes(tag);
    frag.appendChild(el('button', {
      type: 'button', class: 'chip' + (tone ? ' tone-' + tone : '') + (on ? ' on' : ''), text: tag,
      onclick: () => {
        const i = selected.indexOf(tag);
        if (i >= 0) selected.splice(i, 1); else selected.push(tag);
        haptic();
        renderChips(box, kind, selected, onChange, tone);
        onChange();
      }
    }));
  });
  frag.appendChild(el('button', {
    type: 'button', class: 'chip add', text: '+ ajouter',
    onclick: async () => {
      const v = await promptDlg('Nouveau tag — ' + (TAG_KIND_LABELS[kind] || kind), 'Nom du tag');
      if (!v) return;
      if (!DB.tags[kind].includes(v)) DB.tags[kind].push(v);
      if (!selected.includes(v)) selected.push(v);
      haptic();
      renderChips(box, kind, selected, onChange, tone);
      onChange();
    }
  }));
  box.replaceChildren(frag);
}

/* ---------- Boissons ---------- */
const HYDRA_SCALE = 2000; // la barre est pleine à 2 L, le repère est posé à 1,5 L

function addDrink(name, ml) {
  const def = drinkDef(name);
  const e = ensureEntry(selDate);
  // l'heure est mémorisée sans être affichée : elle sert à la statistique
  // « heure du dernier café » et n'a de sens que pour la journée en cours
  e.drinks.items.push({ name, ml: ml == null ? def.ml : ml, t: selDate === todayISO() ? nowHHMM() : null });
  haptic(); renderDrinks(); touched();
}
/** Appui long sur une pastille : on choisit la quantité avant d'ajouter. */
async function addDrinkCustom(name) {
  const def = drinkDef(name);
  const ml = await promptQty(`${def.icon} ${name} — quantité`, def.ml);
  if (ml === null) return;
  addDrink(name, ml);
}
async function editDrinkQty(index) {
  const e = ensureEntry(selDate);
  const it = e.drinks.items[index];
  if (!it) return;
  const def = drinkDef(it.name);
  const ml = await promptQty(`${def.icon} ${it.name} — quantité`, Number(it.ml) || def.ml);
  if (ml === null) return;
  it.ml = ml;
  renderDrinks(); touched();
}
function removeDrinkAt(index) {
  const e = ensureEntry(selDate);
  e.drinks.items.splice(index, 1);
  haptic(); renderDrinks(); touched();
}

function renderDrinks() {
  const e = getEntry(selDate) || emptyEntry(selDate);
  const items = e.drinks.items;
  const st = drinkStats(e);

  $('#drink-total').textContent = fmtVolume(st.ml);
  $('#drink-bar').style.width = Math.min(100, st.ml / HYDRA_SCALE * 100) + '%';

  // compteurs : un tap = un verre de plus
  const counts = new Map();
  items.forEach(i => counts.set(i.name, (counts.get(i.name) || 0) + 1));
  const frag = document.createDocumentFragment();
  DB.drinks.forEach(d => {
    const n = counts.get(d.name) || 0;
    const chip = el('button', {
      type: 'button', class: 'chip drink' + (n ? ' on' : ''),
      'aria-label': `Ajouter ${d.name.toLowerCase()} (${d.ml} ml). Appui long pour choisir la quantité.`
    }, [
      el('span', { text: d.icon + ' ' + d.name }),
      n ? el('span', { class: 'cnt', text: String(n) }) : null
    ]);
    const wasLong = onLongPress(chip, () => addDrinkCustom(d.name));
    chip.addEventListener('click', () => { if (!wasLong()) addDrink(d.name); });
    frag.appendChild(chip);
  });
  frag.appendChild(el('button', {
    type: 'button', class: 'chip add', text: '+ ajouter',
    onclick: async () => {
      const v = await promptDlg('Nouvelle boisson', 'Nom (ex. Kéfir)');
      if (!v) return;
      if (!DB.drinks.some(d => d.name.toLowerCase() === v.toLowerCase())) DB.drinks.push({ name: v, icon: '🥛', ml: 200, caf: false, alc: false });
      addDrink(v);
      renderDrinks();
      toast('Ajoutée — volume et type modifiables dans Données');
    }
  }));
  $('#drink-chips').replaceChildren(frag);

  // récapitulatif : une ligne par verre, avec sa quantité modifiable
  const rows = items.map((it, idx) => {
    const def = drinkDef(it.name);
    const ml = Number(it.ml) || def.ml || 0;
    return el('div', { class: 'drink-row' }, [
      el('span', { class: 'name', text: `${def.icon} ${it.name}` }),
      el('button', {
        type: 'button', class: 'qty', text: fmtVolume(ml),
        'aria-label': `Modifier la quantité (${ml} ml)`, onclick: () => editDrinkQty(idx)
      }),
      el('button', {
        class: 'minus', type: 'button', text: '−',
        'aria-label': `Retirer ce ${it.name.toLowerCase()}`, onclick: () => removeDrinkAt(idx)
      })
    ]);
  });
  if (items.length) {
    rows.push(el('p', { class: 'hint', text: 'Touche une quantité pour la modifier. Appui long sur une boisson pour choisir la quantité dès l\'ajout.' }));
  }
  $('#drink-log').replaceChildren(...rows);
}

/* ---------- Formulaire du jour ---------- */
let flagTimer;
function touched() {
  const e = ensureEntry(selDate);
  e.updatedAt = new Date().toISOString();
  pruneIfBlank(selDate);
  persist();
  renderCalendar();
  const f = $('#saved-flag');
  f.classList.add('on');
  clearTimeout(flagTimer); flagTimer = setTimeout(() => f.classList.remove('on'), 1400);
}

function buildStaticControls() {
  // Repas
  const box = $('#meals');
  box.replaceChildren(...MEALS.map(m => el('div', { class: 'meal' }, [
    el('h3', {}, [el('span', { text: m.icon }), el('span', { text: m.label })]),
    el('input', { type: 'text', id: 'f-meal-' + m.key, placeholder: 'Ce que tu as mangé…' }),
    el('div', { class: 'chips chips-scroll', id: 'tags-meal-' + m.key, style: 'margin-top:8px' })
  ])));

  // Qualité de sommeil
  $('#f-sleep-q').replaceChildren(...SLEEP_Q.map(q => el('button', {
    type: 'button', 'data-v': q.v, 'aria-pressed': 'false', text: String(q.v),
    title: q.l, 'aria-label': q.l
  })));
  // Humeur
  $('#f-mood').replaceChildren(...MOODS.map(q => el('button', {
    type: 'button', 'data-v': q.v, 'aria-pressed': 'false', text: q.e,
    title: q.l, 'aria-label': q.l
  })));
}

function bindForm() {
  const E = () => ensureEntry(selDate);

  // Repas : texte
  MEALS.forEach(m => {
    $('#f-meal-' + m.key).addEventListener('input', ev => { E().meals[m.key].text = ev.target.value; touched(); });
  });

  // Boissons
  $('#f-drink-note').addEventListener('input', ev => { E().drinks.note = ev.target.value; touched(); });

  // Pas
  const steps = $('#f-steps');
  steps.addEventListener('input', ev => {
    const v = ev.target.value === '' ? null : Math.max(0, Math.min(100000, parseInt(ev.target.value, 10) || 0));
    E().steps = v; touched();
  });
  $$('[data-steps]').forEach(b => b.addEventListener('click', () => {
    const cur = E().steps || 0;
    const v = Math.max(0, cur + parseInt(b.dataset.steps, 10));
    E().steps = v; steps.value = v; haptic(); touched();
  }));

  // Durée d'activité
  const am = $('#f-actmin');
  am.addEventListener('input', ev => {
    const v = parseInt(ev.target.value, 10);
    E().activity.minutes = v; $('#o-actmin').textContent = fmtMin(v); touched();
  });
  $('#f-activity-note').addEventListener('input', ev => { E().activity.note = ev.target.value; touched(); });

  // Sommeil
  const sh = $('#f-sleep-h');
  sh.addEventListener('input', ev => {
    const v = parseFloat(ev.target.value);
    E().sleep.hours = v; $('#o-sleep-h').textContent = fmtHours(v); touched();
  });
  $('#f-sleep-q').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    const v = parseInt(b.dataset.v, 10);
    const e = E();
    e.sleep.quality = e.sleep.quality === v ? null : v;
    haptic(); syncSeg('#f-sleep-q', e.sleep.quality); touched();
  });
  $('#f-pain').addEventListener('click', () => {
    const e = E(); e.sleep.pain = !e.sleep.pain;
    if (!e.sleep.pain) { e.sleep.painTags.length = 0; e.sleep.painNote = ''; $('#f-pain-note').value = ''; }
    haptic(); renderDay(); touched();
  });
  $('#f-numb').addEventListener('click', () => {
    const e = E(); e.sleep.numbness = !e.sleep.numbness;
    if (!e.sleep.numbness) { e.sleep.numbTags.length = 0; e.sleep.numbNote = ''; $('#f-numb-note').value = ''; }
    haptic(); renderDay(); touched();
  });
  $('#f-pain-note').addEventListener('input', ev => { E().sleep.painNote = ev.target.value; touched(); });
  $('#f-numb-note').addEventListener('input', ev => { E().sleep.numbNote = ev.target.value; touched(); });

  // Symptômes
  $('#f-symptom-note').addEventListener('input', ev => { E().symptoms.note = ev.target.value; touched(); });

  // Stress
  $('#f-stress').addEventListener('input', ev => {
    const v = parseInt(ev.target.value, 10);
    E().stress = v; $('#o-stress').textContent = v + '/10'; touched();
  });
  // Humeur
  $('#f-mood').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    const v = parseInt(b.dataset.v, 10);
    const e = E();
    e.mood.score = e.mood.score === v ? null : v;
    haptic(); syncSeg('#f-mood', e.mood.score); touched();
  });
  $('#f-mood-note').addEventListener('input', ev => { E().mood.note = ev.target.value; touched(); });

  // Effacer le jour
  $('#btn-clear-day').addEventListener('click', async () => {
    if (!getEntry(selDate)) return;
    const ok = await confirmDlg('Effacer ce jour ?', `Toutes les données du ${longDate(selDate).toLowerCase()} seront supprimées.`, 'Effacer');
    if (!ok) return;
    delete DB.entries[selDate];
    persist(true); renderDay(); renderCalendar(); toast('Journée effacée');
  });

  // Navigation calendrier
  $('#prev-month').addEventListener('click', () => shiftMonth(-1));
  $('#next-month').addEventListener('click', () => shiftMonth(1));
  $('#btn-today').addEventListener('click', () => selectDate(todayISO()));

  // Swipe horizontal sur le calendrier
  let x0 = null, y0 = null;
  const cw = document.querySelector('.cal-wrap');
  cw.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  cw.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) shiftMonth(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });
}

function fmtHours(v) {
  if (v === null || v === undefined) return '—';
  const h = Math.floor(v), m = Math.round((v - h) * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
function fmtMin(v) {
  if (v === null || v === undefined) return '—';
  if (v === 0) return '0 min';
  return v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? String(v % 60).padStart(2, '0') : ''}` : `${v} min`;
}
function syncSeg(sel, value) {
  $$(sel + ' button[data-v]').forEach(b => b.setAttribute('aria-pressed', String(parseInt(b.dataset.v, 10) === value)));
}

function renderDay() {
  const e = getEntry(selDate) || emptyEntry(selDate);
  $('#day-title').textContent = longDate(selDate);

  MEALS.forEach(m => {
    $('#f-meal-' + m.key).value = e.meals[m.key].text || '';
    renderChips('#tags-meal-' + m.key, 'food', ensureEntry(selDate).meals[m.key].tags, touched, 'food', true);
  });

  renderDrinks();
  $('#f-drink-note').value = e.drinks.note || '';

  $('#f-steps').value = e.steps == null ? '' : e.steps;
  renderChips('#tags-activity', 'activity', ensureEntry(selDate).activity.tags, touched, 'act');
  $('#f-actmin').value = e.activity.minutes == null ? 0 : e.activity.minutes;
  $('#o-actmin').textContent = fmtMin(e.activity.minutes);
  $('#f-activity-note').value = e.activity.note || '';

  $('#f-sleep-h').value = e.sleep.hours == null ? 7 : e.sleep.hours;
  $('#o-sleep-h').textContent = fmtHours(e.sleep.hours);
  syncSeg('#f-sleep-q', e.sleep.quality);

  $('#f-pain').setAttribute('aria-pressed', String(!!e.sleep.pain));
  $('#pain-details').hidden = !e.sleep.pain;
  if (e.sleep.pain) {
    renderChips('#tags-pain', 'pain', ensureEntry(selDate).sleep.painTags, touched, 'sym');
    $('#f-pain-note').value = e.sleep.painNote || '';
  }
  $('#f-numb').setAttribute('aria-pressed', String(!!e.sleep.numbness));
  $('#numb-details').hidden = !e.sleep.numbness;
  if (e.sleep.numbness) {
    renderChips('#tags-numb', 'numb', ensureEntry(selDate).sleep.numbTags, touched, 'sym');
    $('#f-numb-note').value = e.sleep.numbNote || '';
  }

  renderChips('#tags-symptom', 'symptom', ensureEntry(selDate).symptoms.tags, touched, 'sym');
  $('#f-symptom-note').value = e.symptoms.note || '';

  $('#f-stress').value = e.stress == null ? 5 : e.stress;
  $('#o-stress').textContent = e.stress == null ? '—' : e.stress + '/10';
  syncSeg('#f-mood', e.mood.score);
  $('#f-mood-note').value = e.mood.note || '';

  // une entrée vide créée par ensureEntry ne doit pas rester en base
  pruneIfBlank(selDate);
}
