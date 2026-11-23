/* Nông trại bài tập / 과제농장 — logic ứng dụng */
(function () {
  'use strict';
  const KEY = 'skyfarm.data.v1', SKEY = 'skyfarm.settings.v1', TKEY = 'skyfarm.timer.v1';
  const MAX_STAGE = 4;
  const TYPES = {
    carrot: { icon: '🥕', item: 'water' },
    tomato: { icon: '🍅', item: 'fert' },
    cabbage: { icon: '🥬', item: 'water' },
    duck: { icon: '🦆', item: 'feed' }
  };
  const TYPE_ORDER = ['carrot', 'tomato', 'cabbage', 'duck'];
  const ITEM_ICON = { water: '💧', fert: '🧪', feed: '🌽' };
  const STAGE_ICON_PLANT = ['🌰', '🌱', '🌿', '🍃'];
  const STAGE_ICON_DUCK = ['🥚', '🐣', '🐥', '🐤', '🦆'];

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function persist(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ không khả dụng */ } }

  /* ---------- Dữ liệu ---------- */
  let data = load(KEY, null);
  if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.tasks)) data = { subjects: [], tasks: [] };
  data.subjects = data.subjects.filter(s => s && TYPES[s.type] && Farm.slot(s.slotId) && Farm.slot(s.slotId).type === s.type);
  data.subjects.forEach(s => { s.stage = Math.min(MAX_STAGE, Math.max(0, s.stage | 0)); s.items = Math.max(0, s.items | 0); });
  data.tasks = data.tasks.filter(t => t && data.subjects.some(s => s.id === t.subjectId));
  let settings = Object.assign({ lang: 'vi', theme: 'day' }, load(SKEY, {}));
  if (!I18N[settings.lang]) settings.lang = 'vi';
  let timer = Object.assign({ status: 'idle' }, load(TKEY, {}));

  const ui = { subjectId: null, tab: 'hw', onlyAttention: false, highlightSlot: null, pop: null };
  let modal = null, alertData = null, lastFocus = null;

  const save = () => persist(KEY, data);
  const saveSettings = () => persist(SKEY, settings);
  const saveTimer = () => persist(TKEY, timer);

  const getSubject = id => data.subjects.find(s => s.id === id) || null;
  const getTask = id => data.tasks.find(t => t.id === id) || null;
  const subjectBySlot = slotId => data.subjects.find(s => s.slotId === slotId) || null;

  /* ---------- Ngôn ngữ ---------- */
  function t(key, params) {
    let s = I18N[settings.lang][key];
    if (s == null) s = I18N.vi[key];
    if (s == null) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    return s;
  }
  function tH(key, params) { const p = {}; for (const k in (params || {})) p[k] = esc(params[k]); return t(key, p); }
  const locale = () => (settings.lang === 'ko' ? 'ko-KR' : 'vi-VN');

  /* ---------- Ngày giờ ---------- */
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function dueAt(task) {
    if (!task.dueDate) return null;
    const d = parseYmd(task.dueDate);
    if (task.dueTime) { const a = task.dueTime.split(':').map(Number); d.setHours(a[0], a[1], 0, 0); }
    else d.setHours(23, 59, 59, 999);
    return d;
  }
  function fmtTime(hhmm) {
    const a = hhmm.split(':').map(Number);
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(2000, 0, 1, a[0], a[1]));
  }
  function fmtDay(s) {
    const now = new Date();
    if (s === ymd(now)) return t('today');
    if (s === ymd(addDays(now, 1))) return t('tomorrow');
    if (s === ymd(addDays(now, -1))) return t('yesterday');
    const opt = settings.lang === 'ko' ? { month: 'long', day: 'numeric', weekday: 'short' } : { weekday: 'short', day: '2-digit', month: '2-digit' };
    return new Intl.DateTimeFormat(locale(), opt).format(parseYmd(s));
  }
  function fmtDue(task) { return fmtDay(task.dueDate) + (task.dueTime ? ' ' + fmtTime(task.dueTime) : ''); }
  function fmtMs(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  /* ---------- Trạng thái & mức khẩn ---------- */
  function status(task, now) {
    now = now || new Date();
    const today = ymd(now);
    const s = { overdue: false, dueToday: false, dueSoon: false, doToday: false, important: !!task.important };
    if (!task.done) {
      const da = dueAt(task);
      if (da) {
        if (now > da) s.overdue = true;
        else if (task.dueDate === today) s.dueToday = true;
        else if (da - now <= 24 * 3600 * 1000) s.dueSoon = true;
      }
      if (task.plannedDate === today) s.doToday = true;
    }
    return s;
  }
  function needsAttention(task, now) { if (task.done) return false; const s = status(task, now); return s.overdue || s.dueToday || s.doToday; }
  function rank(task, now) {
    const s = status(task, now);
    if (s.overdue) return 0; if (s.dueToday) return 1; if (s.dueSoon) return 2; if (s.doToday) return 3; if (task.dueDate) return 4; return 5;
  }
  function sortTasks(list, now) {
    return list.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done) return (b.doneAt || 0) - (a.doneAt || 0);
      const ra = rank(a, now), rb = rank(b, now);
      if (ra !== rb) return ra - rb;
      const da = dueAt(a), db = dueAt(b);
      const ta = da ? da.getTime() : Infinity, tb = db ? db.getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  function badgeInfo(sub, now) {
    const list = data.tasks.filter(x => x.subjectId === sub.id && needsAttention(x, now));
    return { n: list.length, over: list.some(x => status(x, now).overdue) };
  }

  /* ---------- Nhãn trạng thái (chữ + biểu tượng) ---------- */
  function chipsHTML(task, now) {
    const s = status(task, now);
    const c = [];
    if (task.done) c.push(['done', '✅', t('st_done')]);
    if (s.overdue) c.push(['over', '❗', t('st_overdue') + ' · ' + fmtDue(task)]);
    if (s.dueToday) c.push(['today', '⏰', t('st_dueToday') + (task.dueTime ? ' · ' + fmtTime(task.dueTime) : '')]);
    if (s.dueSoon) c.push(['soon', '⏳', t('st_dueSoon') + ' · ' + fmtDue(task)]);
    if (s.doToday) c.push(['do', '📌', t('st_doToday')]);
    if (s.important) c.push(['imp', '⭐', t('st_important')]);
    if (task.kind === 'hw' && task.rewarded) c.push(['reward', '🎁', t('st_rewarded')]);
    return c.map(([k, i, txt]) => '<span class="chip chip-' + k + '"><span aria-hidden="true">' + i + '</span> ' + esc(txt) + '</span>').join('');
  }

  /* ---------- Toast ---------- */
  function toast(msg, icon) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (icon ? '<span class="toast-ico" aria-hidden="true">' + icon + '</span>' : '') + '<span>' + esc(msg) + '</span>';
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
  }

  /* ---------- Bản đồ ---------- */
  function slotLabel(sl) { return t('zone_' + sl.type) + ', ' + t('slotN', { n: sl.n }); }
  function renderFarm() {
    const now = new Date();
    const bySlot = {}, badges = {}, labels = {};
    Farm.SLOTS.forEach(sl => {
      const sub = subjectBySlot(sl.id);
      const zone = t('zone_' + sl.type), slot = t('slotN', { n: sl.n });
      if (sub) {
        bySlot[sl.id] = { stage: sub.stage };
        labels[sl.id] = t('slotAria', { zone: zone, slot: slot, name: sub.name });
        const b = badgeInfo(sub, now);
        if (b.n) badges[sl.id] = { n: b.n, over: b.over, label: t(b.over ? 'badgeAriaOver' : 'badgeAria', { name: sub.name, n: b.n }) };
      } else {
        labels[sl.id] = t('emptySlotAria', { zone: zone, slot: slot });
      }
    });
    const sel = getSubject(ui.subjectId);
    Farm.update({ bySlot: bySlot, badges: badges, labels: labels, selected: sel ? sel.slotId : null, highlight: ui.highlightSlot, pop: ui.pop });
    ui.pop = null;
    const hint = $('#empty-hint');
    hint.hidden = data.subjects.length > 0;
    hint.textContent = t('emptyHint');
  }

  /* ---------- Bảng quản lý môn ---------- */
  function renderPanel() {
    const el = $('#panel');
    const sub = getSubject(ui.subjectId);
    if (!sub) { el.hidden = true; el.innerHTML = ''; document.body.classList.remove('panel-open'); return; }
    const scroller = el.querySelector('.panel-body');
    const keepScroll = scroller ? scroller.scrollTop : 0;
    el.hidden = false;
    document.body.classList.add('panel-open');
    const now = new Date();
    const sl = Farm.slot(sub.slotId), ty = TYPES[sub.type], item = ty.item;
    const itemName = t('item_' + item), itemIcon = ITEM_ICON[item];
    const tasks = data.tasks.filter(x => x.subjectId === sub.id);
    const hw = tasks.filter(x => x.kind === 'hw'), td = tasks.filter(x => x.kind === 'todo');
    const list = ui.tab === 'hw' ? hw : td;
    let shown = sortTasks(list, now);
    if (ui.onlyAttention) shown = shown.filter(x => needsAttention(x, now));
    const isDuck = sub.type === 'duck';
    const stageName = t((isDuck ? 'stage_duck_' : 'stage_plant_') + sub.stage);
    const stageIcon = isDuck ? STAGE_ICON_DUCK[sub.stage] : (sub.stage === MAX_STAGE ? ty.icon : STAGE_ICON_PLANT[sub.stage]);
    const full = sub.stage >= MAX_STAGE;

    let steps = '';
    for (let i = 1; i <= MAX_STAGE; i++) steps += '<span class="seg' + (i <= sub.stage ? ' on' : '') + '"></span>';

    let careAction, careHint = '';
    if (full) {
      careAction = '<button class="btn primary big" type="button" data-action="harvest">' + (isDuck ? '🏁 ' + esc(t('finishRaise')) : '🧺 ' + esc(t('harvest'))) + '</button>';
      careHint = t(isDuck ? 'needRaise' : 'needHarvest');
    } else {
      careAction = '<button class="btn primary big" type="button" data-action="use-item"' + (sub.items < 1 ? ' disabled' : '') + '>' + itemIcon + ' ' + esc(t('useItem', { item: itemName })) + '</button>';
      if (sub.items < 1) careHint = t('noItem', { item: itemName });
    }

    const cntHw = hw.filter(x => !x.done).length, cntTd = td.filter(x => !x.done).length;
    const attHw = hw.filter(x => needsAttention(x, now)).length, attTd = td.filter(x => needsAttention(x, now)).length;
    const tabBtn = (k, label, cnt, att) => '<button type="button" role="tab" class="tab' + (ui.tab === k ? ' on' : '') + '" aria-selected="' + (ui.tab === k) + '" data-action="tab" data-tab="' + k + '">' +
      esc(label) + ' <span class="count">' + cnt + '</span>' + (att ? '<span class="att" aria-label="' + esc(t('badgeAria', { name: label, n: att })) + '">🔔' + att + '</span>' : '') + '</button>';

    let items = '';
    if (!shown.length) {
      items = '<li class="empty-list">' + esc(ui.onlyAttention && list.length ? t('emptyFiltered') : t(ui.tab === 'hw' ? 'emptyHw' : 'emptyTodo')) + '</li>';
    } else {
      items = shown.map(task => {
        const s = status(task, now);
        const cls = 'task' + (task.done ? ' done' : '') + (s.overdue ? ' is-over' : s.dueToday ? ' is-today' : s.dueSoon ? ' is-soon' : '');
        const meta = [];
        if (task.plannedDate) meta.push('<span>📅 ' + esc(t('planLabel')) + ': ' + esc(fmtDay(task.plannedDate)) + '</span>');
        if (task.dueDate) meta.push('<span>🗓️ ' + esc(t('dueLabel')) + ': ' + esc(fmtDue(task)) + '</span>');
        return '<li class="' + cls + '">' +
          '<button type="button" class="check" data-action="toggle-done" data-id="' + task.id + '" aria-pressed="' + !!task.done + '" aria-label="' + esc(t(task.done ? 'markUndone' : 'markDone', { name: task.title })) + '">' + (task.done ? '✓' : '') + '</button>' +
          '<div class="task-body">' +
          '<div class="task-title">' + esc(task.title) + '</div>' +
          '<div class="chips">' + chipsHTML(task, now) + '</div>' +
          (meta.length ? '<div class="task-meta">' + meta.join('') + '</div>' : '') +
          (task.note ? '<div class="task-note">' + esc(task.note) + '</div>' : '') +
          '</div>' +
          '<div class="task-actions">' +
          (task.kind === 'hw' && !task.done ? '<button type="button" class="icon-btn" data-action="focus-task" data-id="' + task.id + '" title="' + esc(t('focusThis')) + '"><span aria-hidden="true">⏱️</span><span class="lbl">' + esc(t('focusThis')) + '</span></button>' : '') +
          '<button type="button" class="icon-btn" data-action="edit-task" data-id="' + task.id + '" title="' + esc(t('edit')) + '"><span aria-hidden="true">✏️</span><span class="lbl">' + esc(t('edit')) + '</span></button>' +
          '<button type="button" class="icon-btn danger" data-action="delete-task" data-id="' + task.id + '" title="' + esc(t('delete')) + '"><span aria-hidden="true">🗑️</span><span class="lbl">' + esc(t('delete')) + '</span></button>' +
          '</div></li>';
      }).join('');
    }

    el.innerHTML =
      '<div class="panel-head">' +
      '<div class="panel-icon" aria-hidden="true">' + ty.icon + '</div>' +
      '<div class="panel-titles"><div class="panel-zone">' + esc(t('zone_' + sub.type)) + ' · ' + esc(t('slotN', { n: sl.n })) + '</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(sub.name) + '</h2></div>' +
      '<button type="button" class="icon-btn" data-action="edit-subject"><span aria-hidden="true">✏️</span><span class="lbl">' + esc(t('editSubject')) + '</span></button>' +
      '<button type="button" class="icon-btn close" data-action="close-panel" aria-label="' + esc(t('close')) + '"><span aria-hidden="true">✕</span></button>' +
      '</div>' +
      '<div class="panel-body">' +
      '<section class="care">' +
      '<div class="care-row"><span class="stage-name"><span aria-hidden="true">' + stageIcon + '</span> ' + esc(stageName) + '</span><span class="step">' + esc(t('step', { a: sub.stage, b: MAX_STAGE })) + '</span></div>' +
      '<div class="steps" aria-hidden="true">' + steps + '</div>' +
      '<div class="inv"><span>' + esc(t('youHave')) + ':</span> <strong class="inv-count">' + itemIcon + ' ' + esc(itemName) + ' × <span data-inv>' + sub.items + '</span></strong></div>' +
      '<p class="small muted">' + esc(t('itemOwn', { name: sub.name })) + '</p>' +
      careAction +
      (careHint ? '<p class="care-hint">' + esc(careHint) + '</p>' : '') +
      '</section>' +
      '<div class="tabs" role="tablist">' + tabBtn('hw', t('tabHw'), cntHw, attHw) + tabBtn('todo', t('tabTodo'), cntTd, attTd) + '</div>' +
      '<div class="list-tools">' +
      '<button type="button" class="toggle' + (ui.onlyAttention ? ' on' : '') + '" data-action="toggle-attention" aria-pressed="' + ui.onlyAttention + '"><span aria-hidden="true">🔔</span> ' + esc(t('onlyAttention')) + '</button>' +
      '<button type="button" class="btn primary" data-action="add-task"><span aria-hidden="true">➕</span> ' + esc(t(ui.tab === 'hw' ? 'addHw' : 'addTodo')) + '</button>' +
      '</div>' +
      '<p class="reward-hint">' + (ui.tab === 'hw' ? '🎁 ' + esc(t('hwRewardHint', { icon: itemIcon, item: itemName })) : 'ℹ️ ' + esc(t('todoNoReward'))) + '</p>' +
      '<ul class="task-list" role="tabpanel">' + items + '</ul>' +
      '</div>';
    const nb = el.querySelector('.panel-body');
    if (nb) nb.scrollTop = keepScroll;
  }

  function openPanel(subId, opts) {
    const was = ui.subjectId;
    ui.subjectId = subId;
    if (opts && opts.fromBadge) {
      const now = new Date();
      ui.onlyAttention = true;
      const hasHw = data.tasks.some(x => x.subjectId === subId && x.kind === 'hw' && needsAttention(x, now));
      ui.tab = hasHw ? 'hw' : 'todo';
    } else if (was !== subId) {
      ui.onlyAttention = false; ui.tab = 'hw';
    }
    renderAll();
    const h = $('#panel-title'); if (h) h.focus({ preventScroll: true });
  }
  function closePanel() { ui.subjectId = null; renderAll(); }

  /* ---------- Hộp thoại ---------- */
  function openModal(type, d) {
    if (!modal) lastFocus = document.activeElement;
    modal = { type: type, data: d || {} };
    renderModal(true);
  }
  function closeModal() {
    modal = null;
    const el = $('#modal'); el.hidden = true; el.innerHTML = '';
    if (ui.highlightSlot) { ui.highlightSlot = null; renderFarm(); }
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { } }
    lastFocus = null;
  }
  function field(label, inner, help, id) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + inner + (help ? '<div class="help">' + esc(help) + '</div>' : '') + '</div>';
  }
  function renderModal(first) {
    const el = $('#modal');
    if (!modal) { el.hidden = true; return; }
    const d = modal.data;
    let html = '';
    if (modal.type === 'subject') html = subjectModalHTML(d);
    else if (modal.type === 'task') html = taskModalHTML(d);
    else if (modal.type === 'timer') html = timerModalHTML(d);
    else if (modal.type === 'confirm') html = confirmModalHTML(d);
    el.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">' + html + '</div>';
    el.hidden = false;
    if (first) {
      const fi = el.querySelector('[autofocus]') || el.querySelector('input, select, textarea, button');
      if (fi) fi.focus({ preventScroll: true });
    }
  }

  /* Môn học */
  function slotOwner(slotId, exceptId) { return data.subjects.find(s => s.slotId === slotId && s.id !== exceptId) || null; }
  function freeSlots(type, exceptId) { return Farm.SLOTS.filter(s => s.type === type && !slotOwner(s.id, exceptId)); }
  function subjectModalHTML(d) {
    const editing = !!d.id;
    let h = '<h2 id="modal-title">' + esc(t(editing ? 'editSubjectTitle' : 'newSubject')) + '</h2>';
    h += field(t('subjectName'), '<input id="f-name" type="text" maxlength="40" data-field="name" value="' + esc(d.name || '') + '" placeholder="' + esc(t('subjectNamePh')) + '" autofocus autocomplete="off">', '', 'f-name');
    if (editing) {
      const sl = Farm.slot(d.slotId);
      h += '<p class="linked">' + TYPES[d.type].icon + ' ' + esc(t('linkedTo', { zone: t('zone_' + d.type), slot: t('slotN', { n: sl.n }) })) + '</p>';
      h += '<p class="small muted">' + esc(t('typeLocked')) + '</p>';
    } else {
      h += '<fieldset class="field"><legend>' + esc(t('chooseType')) + '</legend><div class="type-grid">';
      TYPE_ORDER.forEach(type => {
        const free = freeSlots(type, null).length;
        h += '<button type="button" class="type-btn' + (d.type === type ? ' sel' : '') + '" data-action="pick-type" data-type="' + type + '" aria-pressed="' + (d.type === type) + '"' + (free ? '' : ' disabled') + '>' +
          '<span class="type-ico" aria-hidden="true">' + TYPES[type].icon + '</span><span class="type-name">' + esc(t('type_' + type)) + '</span>' +
          '<span class="type-sub">' + esc(free ? t('freeCount', { n: free }) : t('noFree')) + '</span>' +
          '<span class="type-sub">' + ITEM_ICON[TYPES[type].item] + ' ' + esc(t('item_' + TYPES[type].item)) + '</span></button>';
      });
      h += '</div></fieldset>';
      if (d.type) {
        h += '<fieldset class="field"><legend>' + esc(t('chooseSlot')) + '</legend><div class="slot-row">';
        Farm.SLOTS.filter(s => s.type === d.type).forEach(sl => {
          const owner = slotOwner(sl.id, null);
          h += '<button type="button" class="slot-btn' + (d.slotId === sl.id ? ' sel' : '') + '" data-action="pick-slot" data-slot-pick="' + sl.id + '" aria-pressed="' + (d.slotId === sl.id) + '"' + (owner ? ' disabled' : '') + '>' +
            esc(t('slotN', { n: sl.n })) + (owner ? '<small>' + esc(t('slotTakenBy', { name: owner.name })) + '</small>' : '') + '</button>';
        });
        h += '</div><div class="help">' + esc(t('slotHint')) + '</div></fieldset>';
      }
    }
    if (d.error) h += '<p class="form-error" role="alert">⚠️ ' + esc(t(d.error)) + '</p>';
    h += '<div class="modal-actions">' +
      (editing ? '<button type="button" class="btn danger" data-action="subject-delete">🗑️ ' + esc(t('deleteSubject')) + '</button>' : '') +
      '<span class="grow"></span>' +
      '<button type="button" class="btn" data-action="modal-close">' + esc(t('cancel')) + '</button>' +
      '<button type="button" class="btn primary" data-action="subject-save">💾 ' + esc(t('save')) + '</button></div>';
    return h;
  }
  function openSubjectModal(d) {
    d = Object.assign({ name: '', type: null, slotId: null }, d || {});
    if (!d.id && d.type && !d.slotId) { const f = freeSlots(d.type, null)[0]; d.slotId = f ? f.id : null; }
    ui.highlightSlot = d.id ? null : d.slotId;
    renderFarm();
    openModal('subject', d);
  }
  function saveSubject() {
    const d = modal.data, name = (d.name || '').trim();
    if (!name) { d.error = 'needName'; return renderModal(); }
    if (d.id) {
      const s = getSubject(d.id); if (s) s.name = name;
      save(); closeModal(); renderAll(); toast(t('saved'), '💾');
      return;
    }
    if (!d.type) { d.error = 'needType'; return renderModal(); }
    if (!d.slotId || slotOwner(d.slotId, null) || Farm.slot(d.slotId).type !== d.type) { d.error = 'needSlot'; return renderModal(); }
    const s = { id: uid(), name: name, type: d.type, slotId: d.slotId, stage: 0, items: 0, createdAt: Date.now() };
    data.subjects.push(s);
    save(); closeModal();
    toast(t('subjectAdded', { name: name }), TYPES[s.type].icon);
    openPanel(s.id);
  }

  /* Bài tập / việc cần làm */
  function taskModalHTML(d) {
    const hw = d.kind === 'hw';
    let h = '<h2 id="modal-title">' + esc(t(d.id ? (hw ? 'taskEditHw' : 'taskEditTodo') : (hw ? 'taskNewHw' : 'taskNewTodo'))) + '</h2>';
    const sub = getSubject(d.subjectId);
    if (sub) h += '<p class="linked">' + TYPES[sub.type].icon + ' ' + esc(sub.name) + ' · ' + esc(t(hw ? 'tabHw' : 'tabTodo')) + '</p>';
    h += field(t('fTitle'), '<input id="f-title" type="text" maxlength="120" data-field="title" value="' + esc(d.title || '') + '" placeholder="' + esc(t(hw ? 'fTitlePhHw' : 'fTitlePhTodo')) + '" autofocus autocomplete="off">', '', 'f-title');
    const quick = fieldName => '<div class="quick">' +
      '<button type="button" class="chip-btn" data-action="quick-date" data-field-name="' + fieldName + '" data-val="today">' + esc(t('today')) + '</button>' +
      '<button type="button" class="chip-btn" data-action="quick-date" data-field-name="' + fieldName + '" data-val="tomorrow">' + esc(t('tomorrow')) + '</button>' +
      '<button type="button" class="chip-btn" data-action="quick-date" data-field-name="' + fieldName + '" data-val="">' + esc(t('clearDate')) + '</button></div>';
    h += field(t('fPlan'), '<input id="f-plan" type="date" data-field="plannedDate" value="' + esc(d.plannedDate || '') + '">' + quick('plannedDate'), t('fPlanHelp'), 'f-plan');
    h += '<div class="field-row">' +
      field(t('fDueDate'), '<input id="f-due" type="date" data-field="dueDate" value="' + esc(d.dueDate || '') + '">', '', 'f-due') +
      field(t('fDueTime'), '<input id="f-time" type="time" data-field="dueTime" value="' + esc(d.dueTime || '') + '">', '', 'f-time') +
      '</div>' + quick('dueDate') + '<div class="help">' + esc(t('fDueHelp')) + '</div>';
    h += field(t('fNote'), '<textarea id="f-note" rows="3" maxlength="500" data-field="note">' + esc(d.note || '') + '</textarea>', '', 'f-note');
    h += '<label class="check-line"><input type="checkbox" data-field="important"' + (d.important ? ' checked' : '') + '> <span>' + esc(t('fImportant')) + '</span></label>';
    if (d.error) h += '<p class="form-error" role="alert">⚠️ ' + esc(t(d.error)) + '</p>';
    h += '<div class="modal-actions"><span class="grow"></span>' +
      '<button type="button" class="btn" data-action="modal-close">' + esc(t('cancel')) + '</button>' +
      '<button type="button" class="btn primary" data-action="task-save">💾 ' + esc(t('save')) + '</button></div>';
    return h;
  }
  function openTaskModal(kind, task) {
    if (task) openModal('task', { id: task.id, subjectId: task.subjectId, kind: task.kind, title: task.title, plannedDate: task.plannedDate || '', dueDate: task.dueDate || '', dueTime: task.dueTime || '', note: task.note || '', important: !!task.important });
    else openModal('task', { subjectId: ui.subjectId, kind: kind, title: '', plannedDate: '', dueDate: '', dueTime: '', note: '', important: false });
  }
  function saveTask() {
    const d = modal.data, title = (d.title || '').trim();
    if (!title) { d.error = 'needName'; return renderModal(); }
    if (d.dueTime && !d.dueDate) { d.error = 'needDueDate'; return renderModal(); }
    const fields = { title: title, plannedDate: d.plannedDate || '', dueDate: d.dueDate || '', dueTime: d.dueTime || '', note: (d.note || '').trim(), important: !!d.important };
    if (d.id) {
      const task = getTask(d.id); if (task) Object.assign(task, fields);
    } else {
      data.tasks.push(Object.assign({ id: uid(), subjectId: d.subjectId, kind: d.kind, done: false, rewarded: false, doneAt: null, createdAt: Date.now() }, fields));
    }
    ui.tab = d.kind;
    save(); closeModal(); renderAll(); toast(t('saved'), '💾');
  }
  function toggleDone(id) {
    const task = getTask(id); if (!task) return;
    const sub = getSubject(task.subjectId); if (!sub) return;
    task.done = !task.done;
    task.doneAt = task.done ? Date.now() : null;
    if (task.done && task.kind === 'hw') {
      if (!task.rewarded) {
        task.rewarded = true;
        sub.items += 1;
        const item = TYPES[sub.type].item;
        toast(t('rewardGot', { icon: ITEM_ICON[item], item: t('item_' + item), name: sub.name }), '🎁');
        setTimeout(() => Farm.floatText(sub.slotId, '+1 ' + ITEM_ICON[item]), 30);
      } else {
        toast(t('rewardAlready'), 'ℹ️');
      }
    }
    save(); renderAll();
  }

  /* Chăm sóc */
  function useItem() {
    const sub = getSubject(ui.subjectId); if (!sub || sub.items < 1 || sub.stage >= MAX_STAGE) return;
    sub.items -= 1; sub.stage += 1;
    ui.pop = sub.slotId;
    const item = TYPES[sub.type].item;
    save(); renderAll();
    Farm.floatText(sub.slotId, ITEM_ICON[item] + ' ✨');
    toast(t('grew', { item: t('item_' + item), name: sub.name }), '✨');
  }
  function harvest() {
    const sub = getSubject(ui.subjectId); if (!sub || sub.stage < MAX_STAGE) return;
    const icon = TYPES[sub.type].icon;
    sub.stage = 0; ui.pop = sub.slotId;
    save(); renderAll();
    Farm.floatText(sub.slotId, icon + ' 🎉');
    toast(t(sub.type === 'duck' ? 'raised' : 'harvested'), '🎉');
  }

  /* Xác nhận */
  function confirmModalHTML(d) {
    return '<h2 id="modal-title">' + esc(t('confirmTitle')) + '</h2><p>' + tH(d.msgKey, d.params) + '</p>' +
      '<div class="modal-actions"><span class="grow"></span><button type="button" class="btn" data-action="modal-close" autofocus>' + esc(t('cancel')) + '</button>' +
      '<button type="button" class="btn danger" data-action="confirm-yes">🗑️ ' + esc(t('delete')) + '</button></div>';
  }

  /* ---------- Đồng hồ tập trung ---------- */
  function remaining() {
    if (timer.status === 'running') return Math.max(0, timer.endAt - Date.now());
    if (timer.status === 'paused') return timer.remainingMs;
    return 0;
  }
  function hwOptions(sel) {
    let h = '<option value="">' + esc(t('noLink')) + '</option>';
    data.subjects.forEach(sub => {
      const list = sortTasks(data.tasks.filter(x => x.subjectId === sub.id && x.kind === 'hw' && !x.done), new Date());
      if (!list.length) return;
      h += '<optgroup label="' + esc(TYPES[sub.type].icon + ' ' + sub.name) + '">' + list.map(x => '<option value="' + x.id + '"' + (sel === x.id ? ' selected' : '') + '>' + esc(x.title) + '</option>').join('') + '</optgroup>';
    });
    return h;
  }
  function taskLabel(id) {
    const task = id ? getTask(id) : null;
    if (!task) return t('standalone');
    const sub = getSubject(task.subjectId);
    return (sub ? sub.name + ' – ' : '') + task.title;
  }
  function timerModalHTML(d) {
    let h = '<h2 id="modal-title">⏱️ ' + esc(t('timerTitle')) + '</h2>';
    if (timer.status === 'idle') {
      h += '<fieldset class="field"><legend>' + esc(t('chooseLen')) + '</legend><div class="preset-row">';
      [10, 15, 25].forEach(n => {
        h += '<button type="button" class="preset' + (d.preset === n ? ' sel' : '') + '" data-action="timer-preset" data-min="' + n + '" aria-pressed="' + (d.preset === n) + '">' + esc(t('minutes', { n: n })) + '</button>';
      });
      h += '<button type="button" class="preset' + (d.preset === 'custom' ? ' sel' : '') + '" data-action="timer-preset" data-min="custom" aria-pressed="' + (d.preset === 'custom') + '">✍️ ' + esc(t('custom')) + '</button>';
      h += '</div>';
      if (d.preset === 'custom') {
        h += '<div class="custom-min"><input id="f-min" type="number" min="1" max="180" step="1" inputmode="numeric" data-field="custom" value="' + esc(d.custom || '') + '" placeholder="' + esc(t('customPh')) + '" aria-label="' + esc(t('customPh')) + '"> <span>' + esc(t('minutes', { n: '' }).trim()) + '</span></div>';
      }
      h += '</fieldset>';
      h += field(t('linkTask'), '<select id="f-link" data-field="taskId">' + hwOptions(d.taskId) + '</select>', '', 'f-link');
      h += '<p class="small muted">ℹ️ ' + esc(t('timerNoReward')) + '</p>';
      if (d.error) h += '<p class="form-error" role="alert">⚠️ ' + esc(t(d.error)) + '</p>';
      h += '<div class="modal-actions"><span class="grow"></span><button type="button" class="btn" data-action="modal-close">' + esc(t('close')) + '</button>' +
        '<button type="button" class="btn primary" data-action="timer-start">▶️ ' + esc(t('start')) + '</button></div>';
    } else {
      const run = timer.status === 'running';
      h += '<div class="timer-big" aria-label="' + esc(t('timerRemain')) + '"><span data-timer-big>' + fmtMs(remaining()) + '</span></div>';
      h += '<p class="timer-state">' + (run ? '🟢 ' + esc(t('running')) : '⏸️ ' + esc(t('paused'))) + '</p>';
      h += '<p class="linked">📘 ' + esc(taskLabel(timer.taskId)) + '</p>';
      h += '<p class="small muted">' + esc(t('timerBusyNote')) + '</p>';
      h += '<div class="modal-actions"><button type="button" class="btn danger" data-action="timer-end">⏹️ ' + esc(t('end')) + '</button><span class="grow"></span>' +
        (run ? '<button type="button" class="btn" data-action="timer-pause">⏸️ ' + esc(t('pause')) + '</button>'
          : '<button type="button" class="btn primary" data-action="timer-resume">▶️ ' + esc(t('resume')) + '</button>') +
        '<button type="button" class="btn" data-action="modal-close">' + esc(t('close')) + '</button></div>';
    }
    return h;
  }
  function openTimer(taskId) { openModal('timer', { preset: 25, custom: '', taskId: taskId || '' }); }
  function startTimer() {
    const d = modal.data;
    let min = d.preset;
    if (min === 'custom') {
      min = Number(d.custom);
      if (!Number.isFinite(min) || min < 1 || min > 180 || Math.floor(min) !== min) { d.error = 'invalidMin'; return renderModal(); }
    }
    const ms = min * 60000;
    timer = { status: 'running', durationMs: ms, endAt: Date.now() + ms, remainingMs: ms, taskId: d.taskId || '' };
    saveTimer(); closeModal(); renderTimerChip();
  }
  function pauseTimer() { if (timer.status !== 'running') return; timer.remainingMs = Math.max(0, timer.endAt - Date.now()); timer.status = 'paused'; saveTimer(); afterTimerChange(); }
  function resumeTimer() { if (timer.status !== 'paused') return; timer.endAt = Date.now() + timer.remainingMs; timer.status = 'running'; saveTimer(); afterTimerChange(); }
  function endTimer() { timer = { status: 'idle' }; saveTimer(); afterTimerChange(); toast(t('sessionEnded'), '⏹️'); }
  function afterTimerChange() { renderTimerChip(); if (modal && modal.type === 'timer') renderModal(); }
  function finishTimer() {
    const mins = Math.round((timer.durationMs || 0) / 60000);
    const taskId = timer.taskId;
    timer = { status: 'idle' }; saveTimer();
    showAlert({ kind: 'timeup', mins: mins, taskId: taskId });
    afterTimerChange();
  }
  function renderTimerChip() {
    const el = $('#timer-chip');
    if (timer.status === 'idle') { el.hidden = true; el.innerHTML = ''; document.title = t('appName') + ' · ' + (settings.lang === 'ko' ? 'Nông trại bài tập' : '과제농장'); return; }
    const run = timer.status === 'running';
    const time = fmtMs(remaining());
    const sig = timer.status + '|' + settings.lang + '|' + timer.taskId;
    if (el.dataset.sig !== sig || el.hidden) {
      el.innerHTML = '<button type="button" class="chip-main" data-action="open-timer" aria-label="' + esc(t('openTimer')) + '">' +
        '<span class="tc-ico" aria-hidden="true">' + (run ? '⏱️' : '⏸️') + '</span><span class="tc-time" data-chip-time>' + time + '</span>' +
        '<span class="tc-label">' + esc(run ? taskLabel(timer.taskId) : t('paused')) + '</span></button>' +
        (run ? '<button type="button" class="tc-btn" data-action="timer-pause">⏸️ <span>' + esc(t('pause')) + '</span></button>'
          : '<button type="button" class="tc-btn" data-action="timer-resume">▶️ <span>' + esc(t('resume')) + '</span></button>');
      el.dataset.sig = sig;
      el.hidden = false;
    } else {
      const s = el.querySelector('[data-chip-time]'); if (s && s.textContent !== time) s.textContent = time;
    }
    document.title = time + ' · ' + t('appName');
  }
  function tick() {
    if (timer.status === 'running' && Date.now() >= timer.endAt) { finishTimer(); return; }
    if (timer.status !== 'idle') {
      renderTimerChip();
      const big = document.querySelector('[data-timer-big]');
      if (big) { const v = fmtMs(remaining()); if (big.textContent !== v) big.textContent = v; }
    }
  }

  /* Thông báo trong web (không đè lên hộp thoại đang mở) */
  function showAlert(d) { alertData = d; renderAlert(); const b = $('#alert button'); if (b) b.focus(); }
  function renderAlert() {
    const el = $('#alert');
    if (!alertData) { el.hidden = true; el.innerHTML = ''; return; }
    const d = alertData;
    const task = d.taskId ? getTask(d.taskId) : null;
    el.innerHTML = '<div class="modal-card alert-card" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-msg">' +
      '<div class="alert-ico" aria-hidden="true">⏰</div>' +
      '<h2 id="alert-title">' + esc(t('timeUpTitle')) + '</h2>' +
      '<p id="alert-msg">' + esc(t('timeUpMsg', { n: d.mins })) + '</p>' +
      (task ? '<p class="linked">📘 ' + esc(taskLabel(task.id)) + '</p>' : '') +
      '<p class="small muted">' + esc(t('timeUpNote')) + '</p>' +
      '<div class="modal-actions"><span class="grow"></span><button type="button" class="btn primary" data-action="alert-ok">👍 ' + esc(t('ok')) + '</button></div></div>';
    el.hidden = false;
  }

  /* ---------- Giao diện chung ---------- */
  function applyStatic() {
    document.documentElement.lang = settings.lang;
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(n => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    document.querySelectorAll('[data-action="set-lang"]').forEach(b => {
      const on = b.dataset.lang === settings.lang;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    const night = settings.theme === 'night';
    document.body.classList.toggle('night', night);
    document.body.classList.toggle('day', !night);
    $('#theme-ico').textContent = night ? '☀️' : '🌙';
    $('#theme-label').textContent = t(night ? 'btnDay' : 'btnNight');
    $('#theme-btn').title = t(night ? 'toDayTitle' : 'toNightTitle');
    $('#theme-btn').setAttribute('aria-label', t(night ? 'toDayTitle' : 'toNightTitle'));
  }
  function renderAll() {
    applyStatic(); renderFarm(); renderPanel(); renderTimerChip();
    if (alertData) renderAlert();
  }

  /* ---------- Sự kiện ---------- */
  function onSlot(slotId) {
    const sub = subjectBySlot(slotId);
    if (sub) openPanel(sub.id);
    else { const sl = Farm.slot(slotId); openSubjectModal({ type: sl.type, slotId: sl.id }); }
  }
  function onBadge(slotId) { const sub = subjectBySlot(slotId); if (sub) openPanel(sub.id, { fromBadge: true }); }

  const actions = {
    'add-subject': () => openSubjectModal({}),
    'open-timer': () => openTimer(''),
    'toggle-theme': () => { settings.theme = settings.theme === 'night' ? 'day' : 'night'; saveSettings(); applyStatic(); },
    'set-lang': a => { settings.lang = a.dataset.lang; saveSettings(); renderAll(); if (modal) renderModal(); },
    'close-panel': () => closePanel(),
    'tab': a => { ui.tab = a.dataset.tab; renderPanel(); const b = $('#panel .tab.on'); if (b) b.focus(); },
    'toggle-attention': () => { ui.onlyAttention = !ui.onlyAttention; renderPanel(); const b = $('#panel .toggle'); if (b) b.focus(); },
    'add-task': () => openTaskModal(ui.tab),
    'toggle-done': a => { toggleDone(a.dataset.id); const b = document.querySelector('[data-action="toggle-done"][data-id="' + a.dataset.id + '"]'); if (b) b.focus({ preventScroll: true }); },
    'edit-task': a => { const task = getTask(a.dataset.id); if (task) openTaskModal(task.kind, task); },
    'delete-task': a => {
      const task = getTask(a.dataset.id); if (!task) return;
      openModal('confirm', { msgKey: 'confirmDeleteTask', params: { name: task.title }, onYes: () => { data.tasks = data.tasks.filter(x => x.id !== task.id); save(); toast(t('deleted'), '🗑️'); } });
    },
    'focus-task': a => openTimer(a.dataset.id),
    'use-item': () => useItem(),
    'harvest': () => harvest(),
    'edit-subject': () => { const s = getSubject(ui.subjectId); if (s) openSubjectModal({ id: s.id, name: s.name, type: s.type, slotId: s.slotId }); },
    'modal-close': () => closeModal(),
    'pick-type': a => {
      const d = modal.data; d.type = a.dataset.type; d.error = null;
      const cur = d.slotId && Farm.slot(d.slotId);
      if (!cur || cur.type !== d.type || slotOwner(d.slotId, null)) { const f = freeSlots(d.type, null)[0]; d.slotId = f ? f.id : null; }
      ui.highlightSlot = d.slotId; renderFarm(); renderModal();
      const b = $('#modal .type-btn.sel'); if (b) b.focus();
    },
    'pick-slot': a => {
      const d = modal.data; d.slotId = a.dataset.slotPick; d.error = null;
      ui.highlightSlot = d.slotId; renderFarm(); renderModal();
      const b = $('#modal .slot-btn.sel'); if (b) b.focus();
    },
    'subject-save': () => saveSubject(),
    'subject-delete': () => {
      const s = getSubject(modal.data.id); if (!s) return;
      openModal('confirm', {
        msgKey: 'confirmDeleteSubject', params: { name: s.name }, onYes: () => {
          data.tasks = data.tasks.filter(x => x.subjectId !== s.id);
          data.subjects = data.subjects.filter(x => x.id !== s.id);
          if (ui.subjectId === s.id) ui.subjectId = null;
          save(); toast(t('deleted'), '🗑️');
        }
      });
    },
    'task-save': () => saveTask(),
    'quick-date': a => {
      const v = a.dataset.val, fname = a.dataset.fieldName, now = new Date();
      modal.data[fname] = v === 'today' ? ymd(now) : v === 'tomorrow' ? ymd(addDays(now, 1)) : '';
      if (fname === 'dueDate' && !modal.data[fname]) modal.data.dueTime = '';
      renderModal();
    },
    'confirm-yes': () => { const fn = modal.data.onYes; closeModal(); if (fn) fn(); renderAll(); },
    'timer-preset': a => { const m = a.dataset.min; modal.data.preset = m === 'custom' ? 'custom' : Number(m); modal.data.error = null; renderModal(); const i = $('#f-min'); if (i) i.focus(); else { const b = $('#modal .preset.sel'); if (b) b.focus(); } },
    'timer-start': () => startTimer(),
    'timer-pause': () => pauseTimer(),
    'timer-resume': () => resumeTimer(),
    'timer-end': () => endTimer(),
    'alert-ok': () => { alertData = null; renderAlert(); }
  };

  function fireSvg(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }

  document.addEventListener('click', e => {
    const target = e.target;
    if (target.closest && target.closest('#overlay')) {
      const badge = target.closest('[data-badge]');
      if (badge) { onBadge(badge.getAttribute('data-badge')); return; }
      const hit = target.closest('[data-slot]');
      if (hit) { onSlot(hit.getAttribute('data-slot')); return; }
    }
    const a = target.closest && target.closest('[data-action]');
    if (a && !a.disabled && actions[a.dataset.action]) { actions[a.dataset.action](a, e); return; }
    if (target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('#overlay') && (e.target.hasAttribute('data-slot') || e.target.hasAttribute('data-badge'))) {
      e.preventDefault(); fireSvg(e.target); return;
    }
    if (e.key === 'Escape') {
      if (alertData) { alertData = null; renderAlert(); }
      else if (modal) closeModal();
      else if (ui.subjectId) closePanel();
      return;
    }
    if (e.key === 'Enter' && modal && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      if (modal.type === 'subject') saveSubject();
      else if (modal.type === 'task') saveTask();
      else if (modal.type === 'timer' && timer.status === 'idle') startTimer();
    }
  });
  function bindField(e) {
    const n = e.target;
    if (!modal || !n.dataset || !n.dataset.field || !n.closest('#modal')) return;
    modal.data[n.dataset.field] = n.type === 'checkbox' ? n.checked : n.value;
  }
  document.addEventListener('input', bindField);
  document.addEventListener('change', bindField);

  /* Bộ đếm dựa trên mốc kết thúc: luôn đúng khi chuyển tab */
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { tick(); if (!document.hidden) refreshStatuses(true); });
  window.addEventListener('focus', tick);
  window.addEventListener('pageshow', tick);

  /* Cập nhật nhãn trạng thái theo thời gian thực */
  let lastSig = '';
  function refreshStatuses(force) {
    const now = new Date();
    const sig = ymd(now) + '|' + data.tasks.map(x => { const s = status(x, now); return x.id + (s.overdue ? 'o' : '') + (s.dueToday ? 't' : '') + (s.dueSoon ? 's' : '') + (s.doToday ? 'd' : ''); }).join(',');
    if (force || sig !== lastSig) { lastSig = sig; renderFarm(); renderPanel(); }
  }
  setInterval(() => refreshStatuses(false), 20000);

  /* ---------- Nền trời ---------- */
  function buildSky() {
    const clouds = $('#clouds');
    const conf = [
      { top: 9, w: 150, dur: 170, delay: -20 },
      { top: 22, w: 110, dur: 210, delay: -120 },
      { top: 5, w: 90, dur: 240, delay: -60 },
      { top: 34, w: 130, dur: 190, delay: -150 },
      { top: 60, w: 100, dur: 230, delay: -90 }
    ];
    clouds.innerHTML = conf.map((c, i) => '<div class="cloud" style="top:' + c.top + '%;width:' + c.w + 'px;animation-duration:' + c.dur + 's;animation-delay:' + c.delay + 's">' + Farm.cloudSVG(i) + '</div>').join('');
    const stars = [[8, 12], [18, 30], [27, 8], [40, 22], [52, 6], [63, 18], [74, 10], [86, 26], [93, 7], [12, 48], [88, 52]];
    $('#stars').innerHTML = stars.map(([l, tp], i) => '<span class="star' + (i % 3 === 0 ? ' big' : '') + '" style="left:' + l + '%;top:' + tp + '%;animation-delay:-' + (i * 1.3) + 's"></span>').join('');
  }

  /* ---------- Khởi động ---------- */
  Farm.init($('#farm'), $('#overlay'));
  function fitView() {
    const vb = window.innerWidth < 640 ? '-340 -40 680 520' : '-380 -80 760 560';
    ['#farm', '#overlay'].forEach(s => { const el = $(s); if (el.getAttribute('viewBox') !== vb) el.setAttribute('viewBox', vb); });
  }
  fitView();
  window.addEventListener('resize', fitView);
  buildSky();
  renderAll();
  tick();

  /* Cho phép kiểm thử tự động */
  window.__skyfarm = { data: () => data, timer: () => timer, settings: () => settings, ui: ui, status: status, actions: actions, tick: tick };
})();
