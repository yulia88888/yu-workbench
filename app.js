(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copyLink = (url) => { if (!url || url === '#') return; navigator.clipboard.writeText(url).then(() => toast('链接已复制 📋')).catch(() => toast('复制失败，请手动复制')); };
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2200); };

  const LS = {
    tasks: 'yu_tasks', check: 'yu_check', daily: 'yu_daily', archive: 'yu_archive', hidden: 'yu_hidden',
    userTopics: 'yu_userTopics', userReposts: 'yu_userReposts', reviews: 'yu_reviews',
    personal: 'yu_personal'
  };
  const load = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let daily = __EMBEDDED_JSON__;
  let archive = load(LS.archive, { topics: [], reposts: [] });
  let hidden = load(LS.hidden, []);
  let userTopics = load(LS.userTopics, []);
  let userReposts = load(LS.userReposts, []);

  let topicFilter = '全部', repostFilter = '全部';
  let topicMode = 'today', repostMode = 'today';
  let topicBatch = false, repostBatch = false;
  let topicSel = new Set(), repostSel = new Set();
  let currentView = 'plan';
  let subStack = [];

  const titles = { plan: '每日计划', topic: '选题灵感', repost: '爆款二创', review: '内容复盘' };
  const PLATFORMS = ['全部', '抖音', '小红书', '快手', '微博', 'B站'];

  function mergeHist(list, type) {
    const hist = (archive[type] || []).filter(t => !hidden.includes(t.id)).map(t => ({ ...t, _hist: true }));
    const out = [...list];
    const ids = new Set(out.map(t => t.id));
    hist.forEach(t => { if (!ids.has(t.id)) { out.push(t); ids.add(t.id); } });
    return out;
  }
  function allTopics() {
    const today = (daily.topics || []).filter(t => !hidden.includes(t.id)).map(t => ({ ...t }));
    const u = userTopics.map(t => ({ ...t, _user: true }));
    if (topicMode === 'history') return mergeHist([...u, ...today], 'topics');
    return [...u, ...today];
  }
  function allReposts() {
    const today = (daily.reposts || []).filter(t => !hidden.includes(t.id)).map(t => ({ ...t }));
    const u = userReposts.map(t => ({ ...t, _user: true }));
    if (repostMode === 'history') return mergeHist([...u, ...today], 'reposts');
    return [...u, ...today];
  }

  function switchView(v) {
    currentView = v;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== v));
    $('#viewTitle').textContent = titles[v];
    $('#backBtn').classList.remove('show');
    closeSubpage();
    if (v === 'plan') renderPlan();
    if (v === 'topic') renderTopics();
    if (v === 'repost') renderReposts();
    if (v === 'review') renderReviews();
    setTimeout(updateScrollUI, 60);
  }

  /* ---------- 每日计划 ---------- */
  function renderPlan() {
    let tasks = load(LS.tasks, []);
    const ck = load(LS.check, {});
    const today = todayKey();
    if (!ck.date || ck.date !== today) { ck.date = today; ck.done = {}; save(LS.check, ck); }
    $('#todayDate').textContent = today;
    const list = $('#taskList');
    if (!tasks.length) {
      tasks = [{ id: uid(), text: '运动 30 分钟' }, { id: uid(), text: '22:50 提醒睡觉' }];
      save(LS.tasks, tasks);
    }
    list.innerHTML = tasks.map(t => {
      const done = !!ck.done[t.id];
      return `<li class="task-item" data-tid="${esc(t.id)}">
        <div class="task-check ${done ? 'done' : ''}">${done ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
        <div class="task-text ${done ? 'done' : ''}">${esc(t.text)}</div>
        <button class="task-del" data-deltask="${esc(t.id)}">×</button>
      </li>`;
    }).join('');
    const doneN = tasks.filter(t => ck.done[t.id]).length;
    $('#planCount').textContent = `${doneN}/${tasks.length}`;
    $('#planBar').style.width = `${tasks.length ? (doneN / tasks.length * 100) : 0}%`;
  }
  function addTask() {
    const input = $('#taskInput');
    const text = input.value.trim();
    if (!text) return;
    const tasks = load(LS.tasks, []);
    tasks.push({ id: uid(), text });
    save(LS.tasks, tasks);
    input.value = '';
    renderPlan();
  }
  $('#taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  $('#taskAdd').addEventListener('click', addTask);
  $('#taskList').addEventListener('click', e => {
    const del = e.target.closest('[data-deltask]');
    if (del) {
      const id = del.dataset.deltask;
      save(LS.tasks, load(LS.tasks, []).filter(t => t.id !== id));
      renderPlan(); return;
    }
    const item = e.target.closest('.task-item');
    if (!item) return;
    const id = item.dataset.tid;
    const ck = load(LS.check, {});
    ck.done[id] = !ck.done[id];
    save(LS.check, ck);
    renderPlan();
  });

  /* ---------- 选题灵感 ---------- */
  function renderTopicFilters() {
    $('#topicFilter').innerHTML = PLATFORMS.map(p => `<button class="filter-chip ${p === topicFilter ? 'active' : ''}" data-tpf="${esc(p)}">${esc(p)}</button>`).join('');
  }
  function topicCard(t, num) {
    const tag = t.cat ? `<span class="note-tag-cat">${esc(t.cat)}</span>` : '';
    const pfTag = `<span class="note-tag-pf">${esc(t.platform)}</span>`;
    const hist = t._hist ? `<span class="hist-badge">📅 历史 ${esc((t.seen_date || '').slice(5))}</span>` : '';
    const stats = '👍 赞 50.1万 · ⭐ 收藏 29.6万';
    const hasReal = !!t.real_url;
    const mainLink = hasReal ? t.real_url : (t.dy_link || t.bz_link || '#');
    const batch = topicBatch ? `<input type="checkbox" class="batch-chk" data-btid="${esc(t.id)}" ${topicSel.has(t.id) ? 'checked' : ''}>` : '';
    return `<div class="note-card" data-tid="${esc(t.id)}">
      <div class="note-header">
        <div class="note-num">${num}</div>
        <div class="note-title-wrap">
          <div class="note-title">${esc(t.title)} ${hist}</div>
          <div class="note-tags">${pfTag}${tag}</div>
          <div class="note-stats">${stats}</div>
        </div>
        ${batch}
      </div>
      <div class="note-reason"><span class="note-reason-label">为什么火</span><span class="note-reason-text">${esc(t.analysis || '暂无分析')}</span></div>
      <div class="note-reason"><span class="note-reason-label green">可借鉴</span><span class="note-reason-text">${esc(t.idea || '结合人设重做一版')}</span></div>
      <div class="note-actions2">
        <button data-addplan="${esc(t.title)}" class="btn-outline">+ 加入计划</button>
        <a href="${esc(mainLink)}" target="_blank" rel="noopener" class="btn-primary" style="text-align:center;">看相关视频 ↗</a>
      </div>
    </div>`;
  }
  function renderTopics() {
    renderTopicFilters();
    const list = allTopics().filter(t => topicFilter === '全部' || t.platform === topicFilter);
    $('#topicCount').textContent = `共 ${list.length} 条`;
    $('#topicTools').classList.toggle('hidden', topicMode !== 'today');
    $('#topicFoot').classList.toggle('hidden', topicMode !== 'today');
    $('#topicBatchBtn').classList.toggle('hidden', topicMode !== 'history');
    if (!list.length) { $('#topicList').innerHTML = '<div class="empty">暂无内容</div>'; updateBatch('topic'); return; }
    $('#topicList').innerHTML = list.map((t, i) => topicCard(t, i + 1)).join('');
    updateBatch('topic');
  }
  $('#topicFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-tpf]'); if (!b) return; topicFilter = b.dataset.tpf; renderTopics();
  });
  $$('[data-tmode]').forEach(b => b.addEventListener('click', () => {
    topicMode = b.dataset.tmode;
    $$('[data-tmode]').forEach(x => x.classList.toggle('active', x === b));
    renderTopics();
  }));

  /* ---------- 爆款二创 ---------- */
  function renderRepostFilters() {
    $('#repostFilter').innerHTML = PLATFORMS.map(p => `<button class="filter-chip ${p === repostFilter ? 'active' : ''}" data-rpf="${esc(p)}">${esc(p)}</button>`).join('');
  }
  function repostCard(t, num) {
    const tag = t.tag ? `<span class="note-tag-cat">${esc(t.tag)}</span>` : '';
    const pfTag = `<span class="note-tag-pf">${esc(t.platform)}</span>`;
    const hist = t._hist ? `<span class="hist-badge">📅 历史 ${esc((t.seen_date || '').slice(5))}</span>` : '';
    const heat = t.heat || '🔥 热度 560.3万';
    const hasReal = !!t.real_url;
    const mainLink = hasReal ? t.real_url : (t.link || '#');
    const batch = repostBatch ? `<input type="checkbox" class="batch-chk" data-brid="${esc(t.id)}" ${repostSel.has(t.id) ? 'checked' : ''}>` : '';
    return `<div class="note-card" data-rid="${esc(t.id)}">
      <div class="note-header">
        <div class="note-num">${num}</div>
        <div class="note-title-wrap">
          <div class="note-title">${esc(t.title)} ${hist}</div>
          <div class="note-tags">${pfTag}${tag}</div>
          <div class="note-stats">🔥 ${esc(heat)} · 来源：${esc(t.source || '热点榜')}</div>
        </div>
        ${batch}
      </div>
      <div class="repost-info"><div class="repost-info-icon">💡</div><div class="repost-info-text"><b>为什么适合你：</b>${esc(t.why_fit || '贴合人设，可二创')}</div></div>
      <div class="repost-info"><div class="repost-info-icon">✍️</div><div class="repost-info-text"><b>改编角度：</b>${esc(t.adapt_angle || '保留钩子，换你的视角')}</div></div>
      <div class="note-actions2">
        <button data-addtask="${esc(t.title)}" class="btn-outline">+ 加入任务</button>
        <a href="${esc(mainLink)}" target="_blank" rel="noopener" class="btn-primary" style="text-align:center;">看相关视频 ↗</a>
      </div>
    </div>`;
  }
  function renderReposts() {
    renderRepostFilters();
    const list = allReposts().filter(t => repostFilter === '全部' || t.platform === repostFilter);
    $('#repostCount').textContent = `共 ${list.length} 条`;
    $('#repostFoot').classList.toggle('hidden', repostMode !== 'today');
    $('#repostBatchBtn').classList.toggle('hidden', repostMode !== 'history');
    if (!list.length) { $('#repostList').innerHTML = '<div class="empty">暂无内容</div>'; updateBatch('repost'); return; }
    $('#repostList').innerHTML = list.map((t, i) => repostCard(t, i + 1)).join('');
    updateBatch('repost');
  }
  $('#repostFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-rpf]'); if (!b) return; repostFilter = b.dataset.rpf; renderReposts();
  });
  $$('[data-rmode]').forEach(b => b.addEventListener('click', () => {
    repostMode = b.dataset.rmode;
    $$('[data-rmode]').forEach(x => x.classList.toggle('active', x === b));
    renderReposts();
  }));

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-addplan], [data-addtask]');
    if (add) {
      const text = add.dataset.addplan || add.dataset.addtask;
      const tasks = load(LS.tasks, []);
      tasks.push({ id: uid(), text: '创作：' + text });
      save(LS.tasks, tasks);
      toast('已加入每日计划 ✅'); return;
    }
  });

  /* ---------- 批量管理 ---------- */
  function updateBatch(type) {
    if (type === 'topic') {
      $('#topicBatchBar').classList.toggle('hidden', !topicBatch);
      $('#topicSelInfo').textContent = `已选 ${topicSel.size}`;
      $('#topicSelAll').checked = false;
      $$('#topicList .batch-chk').forEach(c => c.checked = topicSel.has(c.dataset.btid));
    } else {
      $('#repostBatchBar').classList.toggle('hidden', !repostBatch);
      $('#repostSelInfo').textContent = `已选 ${repostSel.size}`;
      $('#repostSelAll').checked = false;
      $$('#repostList .batch-chk').forEach(c => c.checked = repostSel.has(c.dataset.brid));
    }
  }
  function enterBatch(type) { if (type === 'topic') { topicBatch = true; topicSel.clear(); } else { repostBatch = true; repostSel.clear(); } render(type); }
  function exitBatch(type) { if (type === 'topic') { topicBatch = false; topicSel.clear(); } else { repostBatch = false; repostSel.clear(); } render(type); }
  function render(type) { if (type === 'topic') renderTopics(); else renderReposts(); }
  function doBatchDel(type) {
    const sel = type === 'topic' ? topicSel : repostSel;
    if (!sel.size) { toast('请先勾选'); return; }
    if (!confirm(`确定删除选中的 ${sel.size} 条记录？`)) return;
    hidden = load(LS.hidden, []);
    sel.forEach(id => { if (!hidden.includes(id)) hidden.push(id); });
    save(LS.hidden, hidden);
    sel.clear();
    toast('已删除选中记录');
    render(type);
  }
  $('#topicBatchBtn').addEventListener('click', () => enterBatch('topic'));
  $('#topicBatchDone').addEventListener('click', () => exitBatch('topic'));
  $('#topicBatchDel').addEventListener('click', () => doBatchDel('topic'));
  $('#topicSelAll').addEventListener('change', e => {
    const list = allTopics().filter(t => topicFilter === '全部' || t.platform === topicFilter);
    if (e.target.checked) list.forEach(t => topicSel.add(t.id)); else topicSel.clear();
    renderTopics();
  });
  $('#topicList').addEventListener('change', e => {
    const c = e.target.closest('[data-btid]'); if (!c) return;
    if (c.checked) topicSel.add(c.dataset.btid); else topicSel.delete(c.dataset.btid);
    updateBatch('topic');
  });
  $('#repostBatchBtn').addEventListener('click', () => enterBatch('repost'));
  $('#repostBatchDone').addEventListener('click', () => exitBatch('repost'));
  $('#repostBatchDel').addEventListener('click', () => doBatchDel('repost'));
  $('#repostSelAll').addEventListener('change', e => {
    const list = allReposts().filter(t => repostFilter === '全部' || t.platform === repostFilter);
    if (e.target.checked) list.forEach(t => repostSel.add(t.id)); else repostSel.clear();
    renderReposts();
  });
  $('#repostList').addEventListener('change', e => {
    const c = e.target.closest('[data-brid]'); if (!c) return;
    if (c.checked) repostSel.add(c.dataset.brid); else repostSel.delete(c.dataset.brid);
    updateBatch('repost');
  });

  /* ---------- 链接升级 ---------- */
  $('#upBtn').addEventListener('click', async () => {
    const raw = ($('#upInput').value || '').trim();
    if (!raw) { toast('请先粘贴链接'); return; }
    const m = raw.match(/https?:\/\/[^\s"'<>]+/);
    if (!m) { toast('没找到链接'); return; }
    let url = m[0].replace(/[)"'<>]+$/, '');
    let pf = '抖音';
    if (/xiaohongshu|xhs/.test(url)) pf = '小红书';
    else if (/kuaishou/.test(url)) pf = '快手';
    else if (/bilibili|b23\.tv|BV[0-9A-Za-z]/.test(url)) pf = 'B站';
    else if (/weibo|t\.cn/.test(url)) pf = '微博';
    else if (/douyin|iesdouyin/.test(url)) pf = '抖音';
    let title = '粘贴的真实爆款';
    try {
      const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { mode: 'cors' });
      if (r.ok) {
        const html = await r.text();
        const mm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
        if (mm) title = mm[1].replace(/\s+/g, ' ').trim().slice(0, 60);
      }
    } catch (e) {}
    userTopics.unshift({ id: uid(), platform: pf, cat: '情绪共鸣', title, analysis: '你粘贴的真实爆款链接，可围绕它做二创。', idea: '结合你的人设重做一版。', real_url: url, dy_link: url, bz_link: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(title) });
    save(LS.userTopics, userTopics);
    $('#upInput').value = '';
    renderTopics();
    toast('已升级为灵感卡片 ✅');
  });

  /* ---------- Sheet 弹窗 ---------- */
  function openSheet(title, html) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheet').classList.remove('hidden');
  }
  function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetBody').innerHTML = ''; }
  $('[data-close]').addEventListener('click', closeSheet);
  $('#sheetBody').addEventListener('click', e => {
    const saveBtn = e.target.closest('#sheetSave');
    if (saveBtn) {
      const form = $('#sheetBody form');
      if (form && !form.checkValidity()) { form.reportValidity(); return; }
      const cb = window.__sheetSave; if (cb) cb(form);
      closeSheet();
    }
  });

  /* ---------- 内容复盘 ---------- */
  function renderReviews() {
    const list = load(LS.reviews, []);
    const el = $('#reviewList');
    if (!list.length) { el.innerHTML = '<div class="empty">暂无复盘记录</div>'; return; }
    el.innerHTML = list.slice().reverse().map(r => {
      const tips = diagnose(r);
      return `<div class="review-item">
        <div class="review-item-top"><span class="review-item-title">${esc(r.title)}</span><span style="font-size:11px;color:var(--text-tertiary);">${esc(r.rdate)}</span></div>
        <div class="review-metrics"><div class="metric"><div class="metric-label">播放量</div><div class="metric-val">${fmtNum(r.views)}</div></div><div class="metric"><div class="metric-label">点赞</div><div class="metric-val">${fmtNum(r.likes)}</div></div><div class="metric"><div class="metric-label">完播率</div><div class="metric-val">${r.finish || 0}%</div></div></div>
        <div class="review-tips">${tips.map(t => `<p>• ${esc(t)}</p>`).join('')}</div>
      </div>`;
    }).join('');
  }
  function fmtNum(n) { try { n = Number(n); if (n >= 10000) return (n / 10000).toFixed(1) + '万'; return String(n || 0); } catch { return '0'; } }
  function diagnose(r) {
    const tips = [];
    if ((r.finish || 0) < 30) tips.push('完播率低：前3秒加冲突/结果前置钩子。');
    else if ((r.finish || 0) > 70) tips.push('完播率高：可做成系列，趁热打铁。');
    if (r.views > 0 && r.likes / r.views < 0.03) tips.push('赞播比低：增加明确点赞理由（如「赞过等于练过」）。');
    if ((r.comments || 0) < 5) tips.push('评论少：结尾抛争议性问题或选择题。');
    if (!tips.length) tips.push('数据正常，保持更新频率。');
    return tips;
  }
  $('#reviewForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = Object.fromEntries(fd.entries());
    r.views = Number(r.views || 0); r.likes = Number(r.likes || 0); r.comments = Number(r.comments || 0); r.shares = Number(r.shares || 0); r.finish = Number(r.finish || 0);
    r.lkrate = r.views ? (r.likes / r.views * 100).toFixed(2) + '%' : '-';
    const list = load(LS.reviews, []);
    list.push(r);
    save(LS.reviews, list);
    e.target.reset();
    renderReviews();
    toast('复盘已保存，智能诊断完成');
  });

  /* ---------- 子页面系统 ---------- */
  function openSubpage(title, html) {
    subStack.push({ title, html });
    $('#viewTitle').textContent = title;
    $('#backBtn').classList.add('show');
    $('#subpageBody').innerHTML = html;
    $('#subpage').classList.remove('hidden');
    $('#subpage').classList.add('show');
    $('#content').scrollTop = 0;
    $('#subpage').scrollTop = 0;
    setTimeout(updateScrollUI, 60);
  }
  function restoreSubpage(prev) {
    $('#viewTitle').textContent = prev.title;
    $('#subpageBody').innerHTML = prev.html;
    $('#subpage').scrollTop = 0;
    setTimeout(updateScrollUI, 60);
  }
  function closeSubpage() {
    subStack = [];
    $('#subpage').classList.remove('show');
    $('#subpage').classList.add('hidden');
    $('#subpageBody').innerHTML = '';
    $('#viewTitle').textContent = titles[currentView];
    $('#backBtn').classList.remove('show');
    setTimeout(updateScrollUI, 60);
  }
  $('#backBtn').addEventListener('click', () => {
    if ($('#subpage').classList.contains('hidden')) return;
    subStack.pop();
    if (subStack.length) restoreSubpage(subStack[subStack.length - 1]);
    else closeSubpage();
  });

  /* 个人日常入口 - 事件委托，避免绑定丢失 */
  $('#content').addEventListener('click', e => {
    const c = e.target.closest('.pd-card');
    if (!c) return;
    const sub = c.dataset.sub;
    if (sub === 'skincare') renderSkincare();
    else if (sub === 'piano') renderPiano();
    else if (sub === 'singing') renderSinging();
    else if (sub === 'english') renderEnglish();
    else if (sub === 'sport') renderSport();
  });

  /* ---------- 护肤日常 ---------- */
  function getSkinData() { const p = load(LS.personal, {}); return p.skincare || { products: [], diary: [], quiz: null, routine: [] }; }
  function setSkinData(s) { const p = load(LS.personal, {}); p.skincare = s; save(LS.personal, p); }
  function renderSkincare(tab = 'routine') {
    const tabs = [{ k: 'routine', l: '日程' }, { k: 'products', l: '护肤品' }, { k: 'quiz', l: '肤质测试' }, { k: 'diary', l: '皮肤日记' }, { k: 'massage', l: '面部按摩' }];
    openSubpage('护肤日常 ✨', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>护肤日常 ✨</h2><p>懂自己的皮肤，才能好好爱它</p></div>
      <div class="sub-tabs">${tabs.map(t => `<button class="sub-tab ${t.k === tab ? 'active' : ''}" data-skintab="${t.k}">${t.l}</button>`).join('')}</div>
      <div id="skinBody"></div>
    `);
    renderSkinTab(tab);
  }
  function renderSkinTab(tab) {
    const s = getSkinData();
    const body = $('#skinBody');
    if (tab === 'routine') body.innerHTML = skinRoutineHTML(s);
    else if (tab === 'products') body.innerHTML = skinProductsHTML(s);
    else if (tab === 'quiz') body.innerHTML = skinQuizHTML(s);
    else if (tab === 'diary') body.innerHTML = skinDiaryHTML(s);
    else if (tab === 'massage') body.innerHTML = skinMassageHTML();
  }
  function skinRoutineHTML(s) {
    const steps = s.routine && s.routine.length ? s.routine : ['晨间：清水→VC精华→防晒', '晚间：卸妆→洁面→保湿→眼霜'];
    return `<div class="shelf-banner" style="background:linear-gradient(90deg,#F8BBD0,#E1BEE7);"><h3>📅 今日护肤日程</h3><p>根据你的肤质和录入的护肤品自动生成</p></div>
      ${steps.map((st, i) => `<div class="product-card"><div class="product-info"><h4>步骤 ${i + 1}</h4><p>${esc(st)}</p></div></div>`).join('')}
      <button class="btn-primary" style="width:100%;margin-top:10px;" id="skinGenRoutine">✨ 生成一周模式</button>
      <p class="plan-tip">可去「护肤品」页录入产品后，再回来生成个性化日程。</p>`;
  }
  function skinProductsHTML(s) {
    const prods = s.products || [];
    return `<div class="shelf-banner"><h3>🧴 我的护肤品架</h3><p>共 ${prods.length} 件 · 录入后可生成一周护肤模式</p></div>
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <button class="btn-primary" id="skinAddProd" style="flex:1;">+ 添加护肤品</button>
        <button class="btn-outline" id="skinGenRoutine2" style="flex:1;">✨ 生成一周模式</button>
      </div>
      ${prods.length ? prods.map(p => `<div class="product-card">
        <div class="product-info"><h4>${esc(p.name)}</h4><p>${esc(p.type)} · ${esc(p.freq)}</p></div>
        <button class="task-del" data-delprod="${esc(p.id)}">×</button>
      </div>`).join('') : '<div class="empty">还没录入护肤品<br>把你桌上的瓶瓶罐罐都记进来吧</div>'}`;
  }
  function skinQuizHTML(s) {
    const done = s.quiz;
    return `<div class="shelf-banner" style="background:linear-gradient(90deg,#C5CAE9,#E1BEE7);"><h3>🔬 3分钟测出你的肤质</h3><p>10道题 · 凭最近一个月的真实感受选</p></div>
      <div class="card"><p>很多人烂脸不是因为买的东西不好，而是压根不知道自己是什么皮。这次从<strong>油干、耐受度、皮肤困扰</strong>三个维度判断。</p></div>
      ${done ? `<div class="card"><h4 style="margin:0 0 8px;">你的结果</h4><p>${esc(done.result)}</p><p style="font-size:12px;color:var(--text-secondary);">${esc(done.advice)}</p></div>` : ''}
      <button class="btn-primary" style="width:100%;" id="skinStartQuiz">开始测试 →</button>`;
  }
  function skinDiaryHTML(s) {
    const moods = [
      { e: '😫', l: '烂脸预警', v: 1 }, { e: '😐', l: '状态一般', v: 2 }, { e: '🙂', l: '还不错', v: 3 }, { e: '😊', l: '状态很好', v: 4 }, { e: '✨', l: '发光发亮', v: 5 }
    ];
    const tags = ['爆痘', '闭口', '泛红', '刺痛', '干燥起皮', '出油多', '暗沉', '毛孔明显', '水润细腻', '过敏'];
    return `<div class="shelf-banner" style="background:linear-gradient(90deg,#B3E5FC,#E1BEE7);"><h3>📔 皮肤日记</h3><p>每天10秒记录，看清皮肤的脾气</p></div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">今天皮肤状态如何？</div>
        <div class="mood-row">${moods.map(m => `<div class="mood-item" data-mood="${m.v}"><div class="mood-emoji">${m.e}</div><div class="mood-label">${m.l}</div></div>`).join('')}</div>
        <div style="font-weight:700;margin:10px 0 8px;">今天有这些情况吗？（可多选）</div>
        <div class="chip-grid">${tags.map(t => `<button class="chip" data-dtag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <input id="diaryNote" placeholder="备注：比如昨晚熬夜了 / 换了新面霜" style="width:100%;margin-top:12px;border:1px solid var(--border);border-radius:10px;padding:10px;" />
        <button class="btn-primary" style="width:100%;margin-top:12px;" id="skinSaveDiary">保存今日记录</button>
      </div>
      <h4 style="margin:16px 4px 8px;">📈 近14天状态</h4>
      ${(s.diary || []).slice(-14).reverse().map(d => `<div class="product-card"><div class="product-info"><h4>${esc(d.date)} ${'✨'.repeat(d.mood)}</h4><p>${esc((d.tags || []).join(' · '))} ${d.note ? '· ' + esc(d.note) : ''}</p></div></div>`).join('') || '<div class="empty">暂无记录</div>'}`;
  }
  function skinMassageHTML() {
    const items = [
      { i: '💧', t: '去水肿', d: '晨起脸圆了一圈？淋巴引流帮你收回轮廓' },
      { i: '💪', t: '紧致下颌线', d: '改善双下巴、模糊的下颌边界' },
      { i: '🦢', t: '淡化颈纹', d: '颈部也要抗衰老，呵护细细的纹路' },
      { i: '✨', t: '提亮肤色', d: '暗沉蜡黄，唤醒透亮好气色' },
      { i: '🌙', t: '舒缓助眠', d: '睡前放松，卸下一天的紧绷' }
    ];
    return `<div class="card"><h3 style="margin:0 0 4px;">💆 面部按摩</h3><p style="font-size:12px;color:var(--text-secondary);margin:0;">什么都不用想，跟着脸走就好</p></div>
      <div class="massage-grid">${items.map(it => `<div class="massage-item" data-massage="${esc(it.t)}"><div class="massage-icon">${it.i}</div><div class="massage-title">${esc(it.t)}</div><div class="massage-desc">${esc(it.d)}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:14px;">
        <h4 style="margin:0 0 6px;">✍️ 我有别的需求</h4>
        <input id="massageNeed" placeholder="写下你此刻最想解决的，如「熬夜脸救急」" style="width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;" />
        <button class="btn-primary" style="width:100%;margin-top:10px;" id="massageMatch">匹配方案</button>
      </div>
      <div class="card" style="margin-top:14px;">
        <h4 style="margin:0 0 10px;">📺 跟练视频（真实教学）</h4>
        <div class="video-item" data-bv="BV1Vs41167Xq" data-page="1" data-title="田中瘦脸操">
          <div class="video-info"><div class="video-title">1. 田中宥久子瘦脸操（每天3分钟大饼脸变V脸）</div><div class="video-meta">📚 真实跟练视频</div></div>
          <div class="video-actions"><button class="btn-outline video-play" data-action="play">本页播放</button><a href="https://www.bilibili.com/video/BV1Vs41167Xq" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a></div>
          <div class="video-player"></div>
        </div>
        <div class="video-item" data-bv="BV1ma4y1T7Ys" data-page="1" data-title="5分钟面部瑜伽">
          <div class="video-info"><div class="video-title">2. 5分钟面部瑜伽（零成本抗衰·紧致轮廓）</div><div class="video-meta">📚 真实跟练视频</div></div>
          <div class="video-actions"><button class="btn-outline video-play" data-action="play">本页播放</button><a href="https://www.bilibili.com/video/BV1ma4y1T7Ys" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a></div>
          <div class="video-player"></div>
        </div>
      </div>`;
  }

  /* 子页统一事件委托（避免 once 监听器丢失） */
  $('#subpageBody').addEventListener('click', e => {
    // 返回按钮
    const back = e.target.closest('[data-back], [data-mback], [data-engback]');
    if (back) {
      if (back.dataset.mback) { renderSkincare('massage'); return; }
      if (back.dataset.engback) { renderEnglish(); return; }
      closeSubpage(); return;
    }
    // ---------- 护肤 ----------
    const skintab = e.target.closest('[data-skintab]');
    if (skintab) { $$('[data-skintab]').forEach(b => b.classList.toggle('active', b === skintab)); renderSkinTab(skintab.dataset.skintab); return; }
    const gen = e.target.closest('#skinGenRoutine, #skinGenRoutine2');
    if (gen) { const s = getSkinData(); const prods = s.products || []; s.routine = prods.length ? prods.map(p => `${p.freq}：${p.name}`) : ['晨间：清水→精华→防晒', '晚间：卸妆→洁面→保湿→眼霜']; setSkinData(s); renderSkinTab('routine'); toast('已生成一周模式 ✨'); return; }
    const addProd = e.target.closest('#skinAddProd');
    if (addProd) {
      openSheet('添加护肤品', `
        <form id="prodForm">
          <div class="sheet-field"><label>产品名称<input name="name" required placeholder="如：珀莱雅双抗精华" /></label></div>
          <div class="sheet-field"><label>类型<input name="type" placeholder="如：精华 / 面霜 / 防晒" /></label></div>
          <div class="sheet-field"><label>使用频率<input name="freq" placeholder="如：每日早晚 / 每周2次" /></label></div>
          <button type="button" id="sheetSave" class="sheet-save">保存</button>
        </form>
      `);
      window.__sheetSave = () => {
        const fd = new FormData($('#prodForm'));
        const s = getSkinData(); s.products = s.products || [];
        s.products.push({ id: uid(), name: fd.get('name'), type: fd.get('type'), freq: fd.get('freq') });
        setSkinData(s); renderSkinTab('products'); toast('已添加');
      }; return;
    }
    const delProd = e.target.closest('[data-delprod]');
    if (delProd) { const s = getSkinData(); s.products = s.products.filter(p => p.id !== delProd.dataset.delprod); setSkinData(s); renderSkinTab('products'); return; }
    const startQuiz = e.target.closest('#skinStartQuiz');
    if (startQuiz) {
      openSheet('肤质测试', `
        <form id="quizForm">
          <div class="sheet-field"><label>洗完脸后不涂护肤品，1小时后感觉？<select name="q1"><option>紧绷、起皮</option><option>T区油、两颊干</option><option>全脸都油</option><option>没什么感觉</option></select></label></div>
          <div class="sheet-field"><label>换季或换产品时容易泛红刺痛？<select name="q2"><option>经常</option><option>偶尔</option><option>很少</option></select></label></div>
          <div class="sheet-field"><label>最困扰你的皮肤问题？<select name="q3"><option>干燥细纹</option><option>出油痘痘</option><option>敏感泛红</option><option>暗沉暗黄</option></select></label></div>
          <button type="button" id="sheetSave" class="sheet-save">查看结果</button>
        </form>
      `);
      window.__sheetSave = () => {
        const fd = new FormData($('#quizForm'));
        const a1 = fd.get('q1'), a2 = fd.get('q2'), a3 = fd.get('q3');
        let result = '混合偏干敏感肌', advice = '早晚分区护理：T区控油、两颊保湿，选无酒精、含神经酰胺的产品，慎用高浓度酸。';
        if (a1.includes('全脸都油')) { result = '油性耐受肌'; advice = '注重清洁+控油+防晒，可适度用酸，避免过度封闭的面霜。'; }
        else if (a1.includes('紧绷')) { result = '干性敏感肌'; advice = '以保湿修护为主，避免皂基洁面，叠加面霜/油类产品锁水。'; }
        else if (a2 === '经常') { result = '敏感性肌肤'; advice = '精简护肤，停用功效型产品，优先修护屏障。'; }
        const s = getSkinData(); s.quiz = { result, advice, date: todayKey() }; setSkinData(s); renderSkinTab('quiz'); toast('测试完成');
      }; return;
    }
    const mood = e.target.closest('[data-mood]');
    if (mood) { $$('#skinBody .mood-item').forEach(x => x.classList.toggle('active', x === mood)); $('#skinBody').dataset.mood = mood.dataset.mood; return; }
    const dtag = e.target.closest('[data-dtag]');
    if (dtag) { dtag.classList.toggle('active'); return; }
    const saveDiary = e.target.closest('#skinSaveDiary');
    if (saveDiary) {
      const mood = Number($('#skinBody').dataset.mood || 3);
      const tags = $$('#skinBody .chip.active').map(c => c.dataset.dtag);
      const note = $('#diaryNote').value.trim();
      const s = getSkinData(); s.diary = s.diary || []; s.diary.push({ date: todayKey(), mood, tags, note });
      setSkinData(s); renderSkinTab('diary'); toast('日记已保存'); return;
    }
    if (handleVideoControls(e)) return;
    const mass = e.target.closest('[data-massage]');
    if (mass) { openMassagePlay(mass.dataset.massage); return; }
    const match = e.target.closest('#massageMatch');
    if (match) { toast('已为你匹配「去水肿+提亮」组合方案'); return; }

    // ---------- 电子琴 ----------
    const pTab = e.target.closest('[data-pl]');
    if (pTab) { const d = getPianoData(); d.level = Number(pTab.dataset.pl); setPianoData(d); renderPiano(); return; }
    const pMap = e.target.closest('[data-map^="piano:"]');
    if (pMap) { const k = pMap.dataset.map.split(':')[1]; renderPianoModule(k); return; }
    const pBack = e.target.closest('[data-plback]');
    if (pBack) { renderPiano(); return; }
    const pModCheck = e.target.closest('[data-modcheck^="piano:"]');
    if (pModCheck) { const k = pModCheck.dataset.modcheck.split(':')[1]; const d = getPianoData(); d.progress[k] = Math.min(100, (d.progress[k] || 0) + 15); d.xp += 5; setPianoData(d); toast(`${k} +15%`); renderPianoModule(k); return; }
    const pAsk = e.target.closest('#pianoAsk');
    if (pAsk) {
      const q = $('#pianoInput') && $('#pianoInput').value.trim();
      if (!q) { toast('请先描述你的问题'); return; }
      const res = $('#pianoResult'); res.classList.remove('hidden');
      res.innerHTML = `<b>AI 钢琴老师反馈：</b><br/>针对「${esc(q)}」，建议：<br/>① 先分手慢练，节拍器设 60 BPM；<br/>② 把困难小节循环 5 遍，再串起来；<br/>③ 录下来自己听，比老师说的更直观。`;
      return;
    }
    const pNext = e.target.closest('#pianoNext');
    if (pNext) {
      const acc = Number(prompt('今天掌握得怎么样？\n1=很吃力 2=一般 3=顺利 4=很轻松', '3') || '3');
      const accuracy = acc <= 1 ? 30 : acc === 2 ? 60 : acc === 3 ? 85 : 95;
      const d = getPianoData();
      d.streak += 1; d.xp += 10; d.hp = Math.min(5, d.hp + 1);
      const keys = Object.keys(d.progress); const k = keys[d.xp % keys.length];
      d.progress[k] = Math.min(100, d.progress[k] + 20);
      checkLevelAdjust(d, accuracy); setPianoData(d);
      toast('打卡成功！'); renderPiano(); return;
    }

    // ---------- 唱歌 ----------
    const sTab = e.target.closest('[data-sl]');
    if (sTab) { const d = getSingData(); d.level = Number(sTab.dataset.sl); setSingData(d); renderSinging(); return; }
    const sMap = e.target.closest('[data-map^="sing:"]');
    if (sMap) { const k = sMap.dataset.map.split(':')[1]; renderSingModule(k); return; }
    const sBack = e.target.closest('[data-slback]');
    if (sBack) { renderSinging(); return; }
    const sModCheck = e.target.closest('[data-modcheck^="sing:"]');
    if (sModCheck) { const k = sModCheck.dataset.modcheck.split(':')[1]; const d = getSingData(); d.progress[k] = Math.min(100, (d.progress[k] || 0) + 15); d.xp += 5; setSingData(d); toast(`${k} +15%`); renderSingModule(k); return; }
    const sAsk = e.target.closest('#singAsk');
    if (sAsk) {
      const q = $('#singInput') && $('#singInput').value.trim();
      if (!q) { toast('请先描述问题'); return; }
      const res = $('#singResult'); res.classList.remove('hidden');
      res.innerHTML = `<b>AI 唱歌老师反馈：</b><br/>针对「${esc(q)}」：<br/>① 每天做「打嘟」唇颤音 2 分钟放松声带；<br/>② 用钢琴或 App 找基准音，跟唱 do-re-mi；<br/>③ 录下来对比原唱，找出偏差的音。`;
      return;
    }
    const sNext = e.target.closest('#singNext');
    if (sNext) {
      const acc = Number(prompt('今天练声感觉如何？\n1=很吃力 2=一般 3=顺利 4=很轻松', '3') || '3');
      const accuracy = acc <= 1 ? 30 : acc === 2 ? 60 : acc === 3 ? 85 : 95;
      const d = getSingData();
      d.streak += 1; d.xp += 10; d.hp = Math.min(5, d.hp + 1);
      const keys = Object.keys(d.progress); const k = keys[d.xp % keys.length];
      d.progress[k] = Math.min(100, d.progress[k] + 20);
      checkLevelAdjust(d, accuracy); setSingData(d);
      toast('练声打卡成功！'); renderSinging(); return;
    }

    // ---------- 英语 ----------
    const eTab = e.target.closest('[data-el]');
    if (eTab) { const s = getEngState(); s.level = Number(eTab.dataset.el); setEngState(s); renderEnglish(); return; }
    const eMap = e.target.closest('[data-map^="eng:"]');
    if (eMap) { const k = eMap.dataset.map.split(':')[1]; renderEnglishModule(k); return; }
    const eMapCheck = e.target.closest('[data-mapcheck^="eng:"]');
    if (eMapCheck) { const k = eMapCheck.dataset.mapcheck.split(':')[1]; const s = getEngState(); s.map[k] = Math.min(100, (s.map[k] || 0) + 10); s.xp += 3; setEngState(s); toast(`${k} +10%`); renderEnglishModule(k); return; }
    const ePage = e.target.closest('[data-epage]');
    if (ePage) {
      const page = ePage.dataset.epage;
      if (page === 'tasks') renderEnglishTasks();
      else if (page === 'listen') renderEnglishListen(0);
      else if (page.startsWith('listen:')) renderEnglishListen(Number(page.split(':')[1]));
      else if (page === 'speak') renderEnglishSpeak();
      else if (page === 'errors') renderEnglishErrors();
      else if (page === 'review') renderEnglishReview();
      else if (page === 'placement') renderEnglishPlacement();
      return;
    }
    const doTask = e.target.closest('[data-dotask]');
    if (doTask) {
      const tasks = generateDailyTasks();
      const idx = Number(doTask.dataset.dotask);
      const t = tasks[idx];
      if (!t) return;
      if (t.type === 'new') renderEnglishWord(t.en, true);
      else renderEnglishDictation(t.en, true);
      return;
    }
    const knowNew = e.target.closest('[data-knownew]');
    if (knowNew) {
      const en = knowNew.dataset.knownew;
      const info = getWordInfo(en);
      ensureWordState(info, info.levelIdx);
      const s = getEngState(); s.xp += 5; s.map['词汇'] = Math.min(100, s.map['词汇'] + 5); setEngState(s);
      toast('太棒了，已记录进度');
      renderEnglishTasks();
      return;
    }
    const speakBtn = e.target.closest('[data-speak]');
    if (speakBtn) {
      const text = speakBtn.dataset.speak;
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US'; u.rate = 0.9;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } else toast('当前浏览器不支持语音朗读');
      return;
    }
    const checkSpell = e.target.closest('[data-checkspell]');
    if (checkSpell) {
      const en = checkSpell.dataset.checkspell;
      const input = $('#dictInput');
      if (!input) return;
      const val = input.value.trim().toLowerCase();
      const info = getWordInfo(en);
      const correct = en.toLowerCase();
      const fb = $('#dictFeedback');
      fb.style.display = 'block';
      const diff = Array.from(correct).filter((c, i) => val[i] !== c).length + Math.abs(val.length - correct.length);
      let accuracy = 50;
      if (val === correct) {
        fb.innerHTML = '<b style="color:#2E7D32;">✅ 完全正确！</b>';
        updateWordState(en, w => { w.consecutiveCorrect++; w.lastPracticed = todayKey(); if (w.consecutiveCorrect >= 3) { w.mastered = true; w.reviewRound = 0; w.nextReview = Date.now() + 24 * 3600 * 1000; } });
        const s = getEngState(); s.xp += 10; s.map['默写'] = Math.min(100, s.map['默写'] + 5); setEngState(s);
        accuracy = 95;
      } else if (diff <= 1) {
        fb.innerHTML = `<b>差一点点！</b><br/>正确拼写是 <b>${correct}</b><br/>💡 ${info.memoryTip.text}`;
        updateWordState(en, w => { w.lastPracticed = todayKey(); });
        accuracy = 70;
      } else {
        fb.innerHTML = `<b style="color:#C62828;">❌ 拼写错误</b><br/>正确拼写是 <b>${correct}</b><br/>💡 ${info.memoryTip.text}<br/>常见错误：漏字母或多字母`;
        updateWordState(en, w => { w.consecutiveCorrect = 0; w.wrongCount++; w.lastPracticed = todayKey(); w.wrongSpellings.push(val); });
        const s = getEngState(); s.hp = Math.max(1, s.hp - 1); setEngState(s);
        accuracy = 30;
      }
      checkEngLevelAdjust(accuracy);
      return;
    }
    const listenPlay = e.target.closest('[data-listenplay]');
    if (listenPlay) {
      const idx = Number(listenPlay.dataset.listenplay);
      const s = getEngState();
      const item = englishCurriculum[ENGLISH_LEVELS[s.level]].listen[idx];
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(item.text);
        u.lang = 'en-US'; u.rate = 0.85;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        toast('正在朗读…');
      } else toast('当前浏览器不支持语音朗读');
      return;
    }
    const answerBtn = e.target.closest('[data-answer]');
    if (answerBtn) {
      const [qidx, oidx] = answerBtn.dataset.answer.split(':').map(Number);
      const s = getEngState();
      const item = englishCurriculum[ENGLISH_LEVELS[s.level]].listen[Number($('#engListenDone').dataset.listendone || 0)];
      const correct = item.questions[qidx].answer;
      const card = answerBtn.closest('.card');
      $$('.option-chip', card).forEach((btn, i) => {
        btn.disabled = true;
        btn.classList.toggle('correct', i === correct);
        btn.classList.toggle('wrong', i === oidx && i !== correct);
      });
      if (oidx === correct) toast('回答正确');
      else toast('回答错误，已加入复习');
      return;
    }
    const listenDone = e.target.closest('#engListenDone');
    if (listenDone) {
      const s = getEngState(); s.xp += 5; s.map['听力'] = Math.min(100, s.map['听力'] + 10); s.map['综合'] = Math.min(100, s.map['综合'] + 3); setEngState(s);
      checkEngLevelAdjust(85); toast('听力打卡成功'); renderEnglish(); return;
    }
    const speakScene = e.target.closest('[data-speakscene]');
    if (speakScene) { renderEnglishSpeakScene(speakScene.dataset.speakscene); return; }
    const sendScene = e.target.closest('[data-sendscene]');
    if (sendScene) {
      const input = $('#speakInput');
      if (!input || !input.value.trim()) { toast('请先输入回复'); return; }
      speakFeedback(sendScene.dataset.sendscene, input.value.trim());
      input.value = '';
      return;
    }
    const micScene = e.target.closest('[data-micscene]');
    if (micScene) {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { toast('当前浏览器不支持语音输入'); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = ev => { const txt = ev.results[0][0].transcript; $('#speakInput').value = txt; toast('语音识别完成'); };
      rec.onerror = () => toast('语音识别失败，请手动输入');
      rec.start();
      return;
    }
    const practiceErrors = e.target.closest('[data-practiceerrors]');
    if (practiceErrors) {
      const all = getAllWordStates().filter(w => !w.mastered);
      if (!all.length) { toast('暂无错题'); return; }
      renderEnglishDictation(all[0].en, false);
      return;
    }
    const doReview = e.target.closest('[data-doreview]');
    if (doReview) { renderEnglishReviewQuiz(doReview.dataset.doreview); return; }
    const checkReview = e.target.closest('[data-checkreview]');
    if (checkReview) {
      const en = checkReview.dataset.checkreview;
      const info = getWordInfo(en);
      const w = getWordState(en);
      const input = $('#reviewInput');
      const val = input ? input.value.trim().toLowerCase() : '';
      const round = w.reviewRound || 0;
      let correct = false;
      if (round % 6 === 3) correct = val === info.mean.toLowerCase();
      else correct = val === en.toLowerCase();
      if (correct) {
        updateWordState(en, x => { x.reviewRound = (x.reviewRound || 0) + 1; x.nextReview = Date.now() + reviewIntervals(x.reviewRound) * 24 * 3600 * 1000; });
        const s = getEngState(); s.xp += 5; s.map['综合'] = Math.min(100, s.map['综合'] + 2); setEngState(s);
        toast('回顾正确 +5经验');
        const x = getWordState(en);
        if (x.reviewRound >= 6) {
          const a = getAchievements(); a.vocabularyMaster++; setAchievements(a);
          toast('🌟 永久掌握！词汇大师+1');
        }
      } else {
        updateWordState(en, x => { x.mastered = false; x.consecutiveCorrect = 0; x.reviewRound = 0; x.nextReview = 0; });
        toast('回顾答错，已打回学习中');
      }
      renderEnglishReview();
      return;
    }
    const placementSubmit = e.target.closest('#engPlacementSubmit');
    if (placementSubmit) {
      let score = 0;
      $$('.placement-ans').forEach(inp => {
        if (inp.value.trim().toLowerCase() === inp.dataset.ans.toLowerCase()) score++;
      });
      const s = getEngState();
      if (score <= 2) s.level = 0;
      else if (score >= 9) s.level = Math.min(3, s.level + 1);
      else s.level = Math.min(3, Math.max(0, s.level));
      s.placementDone = true; s.xp += score * 2; setEngState(s);
      toast(`自测得分 ${score}/3，定级为 ${ENGLISH_LEVELS[s.level]}`);
      renderEnglish();
      return;
    }

    // ---------- 运动 ----------
    if (e.target.closest('#sportCheck')) { toast('运动打卡成功！'); return; }
  });
  function openMassagePlay(name) {
    const plans = {
      '去水肿': {
        steps: [
          { t: '锁骨引流', s: '用指腹从耳后沿着颈部两侧，轻轻推至锁骨凹陷处，重复8次。', tip: '力度要轻，像把废水往下推。', sec: 40 },
          { t: '眼下轻拍', s: '无名指从内眼角下方，轻轻点拍至太阳穴，重复10次。', tip: '不要拉扯皮肤，点到即可。', sec: 35 },
          { t: '脸颊提升', s: '从嘴角沿着鼻翼两侧向上推至耳前，重复8次。', tip: '配合深呼吸，呼气时向上推。', sec: 35 },
          { t: '全脸按压', s: '双手掌心搓热，轻轻按压额头、脸颊、下巴各5秒。', tip: '最后一步收尾，帮助精华吸收。', sec: 30 }
        ],
        video: { title: '晨间去水肿按摩（3分钟急救）', bv: 'BV1ma4y1T7Ys' }
      },
      '紧致下颌线': {
        steps: [
          { t: '下巴推提', s: '握拳用指节从下巴中心，沿下颌线推至耳后，重复10次。', tip: '感受到轻微酸胀即可，别太用力。', sec: 40 },
          { t: '颈部拉伸', s: '头微微后仰，从喉结下方向上推至下巴，重复8次。', tip: '脖子皮肤薄，力度放最轻。', sec: 35 },
          { t: '咬肌放松', s: '用指腹打圈按摩咬肌（咬牙时鼓起的位置）30秒。', tip: '适合吃东西多、爱嚼口香糖的人。', sec: 35 },
          { t: '淋巴收尾', s: '从耳后沿脖子两侧推至锁骨，重复8次。', tip: '把代谢废物引向淋巴出口。', sec: 30 }
        ],
        video: { title: '下颌线紧致按摩', bv: 'BV1Vs41167Xq' }
      },
      '淡化颈纹': {
        steps: [
          { t: '横向抚纹', s: '手掌从颈根向上轻轻抚平至下巴，重复10次。', tip: '方向只能向上，不能来回搓。', sec: 40 },
          { t: '竖向提拉', s: '双手交替从颈侧向上提拉，左右各8次。', tip: '动作慢，给皮肤充分延展。', sec: 35 },
          { t: '纹路透润', s: '用指腹在颈纹明显处打小圈，顺时针、逆时针各15圈。', tip: '可以涂多点颈霜或乳液。', sec: 35 },
          { t: '锁骨引流', s: '从耳后推至锁骨，重复8次，帮助代谢。', tip: '最后一步收尾。', sec: 30 }
        ],
        video: { title: '颈部护理去颈纹按摩', bv: 'BV1Vs41167Xq' }
      },
      '提高肤色': {
        steps: [
          { t: '全脸激活', s: '双手快速搓热，捂住脸10秒，重复3次。', tip: '通过温度促进微循环。', sec: 35 },
          { t: '颧骨提亮', s: '从鼻翼旁沿颧骨下方，斜向上推至太阳穴，重复10次。', tip: '这条线经过面颊高点，有助提亮。', sec: 40 },
          { t: '额头唤醒', s: '从眉心向上推至发际线，再向两侧分开，重复8次。', tip: '额头暗沉常和循环差有关。', sec: 35 },
          { t: '点穴收尾', s: '用指腹按压太阳穴、迎香穴、睛明穴各3秒。', tip: '每个穴位按3秒，按2轮。', sec: 30 }
        ],
        video: { title: '提亮肤色面部按摩', bv: 'BV1ma4y1T7Ys' }
      },
      '舒缓助眠': {
        steps: [
          { t: '眉心舒缓', s: '用大拇指指腹从眉心向两侧眉尾推，重复10次。', tip: '睡前做这个动作特别放松。', sec: 40 },
          { t: '眼周画圈', s: '无名指沿眼眶轻轻画小圈，顺时针、逆时针各10圈。', tip: '动作越慢越助眠。', sec: 35 },
          { t: '脸颊安抚', s: '掌心贴脸，从下巴向耳前轻轻抚过，重复8次。', tip: '像给自己盖被子一样轻柔。', sec: 35 },
          { t: '呼吸收尾', s: '双手捂脸，闭眼深呼吸5次。', tip: '配合腹式呼吸，做完直接睡。', sec: 40 }
        ],
        video: { title: '睡前放松面部按摩', bv: 'BV1ma4y1T7Ys' }
      }
    };
    const plan = plans[name] || plans['去水肿'];
    const steps = plan.steps;
    const hasBv = plan.video.bv && /^BV/i.test(plan.video.bv);
    openSubpage(`${name} · 跟练`, `
      <button class="back-row" data-mback>← 返回护肤日常</button>
      <div class="sub-header"><h2>${esc(name)}</h2><p>跟着语音提示完成每一步</p></div>
      <div class="face-wrap"><span>👩</span></div>
      <div id="massageSteps">${steps.map((st, i) => `<div class="step-card" data-step="${i}" style="${i === 0 ? '' : 'opacity:.5'}">
        <div class="step-title">第 ${i + 1}/${steps.length} 步 · ${esc(st.t)}</div>
        <p style="font-size:13px;color:var(--text);margin:0 0 8px;">${esc(st.s)}</p>
        <div class="step-tip">💡 ${esc(st.tip)}</div>
        <div class="timer-bar"><div class="timer-fill" id="timer${i}" style="width:0%"></div></div>
        <div style="text-align:center;font-weight:700;color:var(--pink);" id="timeTxt${i}">${st.sec}s</div>
      </div>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn-outline" id="msPrev" style="flex:1;">上一步</button>
        <button class="btn-primary" id="msStart" style="flex:1;">▶ 开始</button>
        <button class="btn-outline" id="msNext" style="flex:1;">下一步</button>
      </div>
      <div class="card" style="margin-top:14px;">
        <h4 style="margin:0 0 10px;">📺 推荐跟练视频</h4>
        <div class="video-item" data-bv="${esc(plan.video.bv)}" data-page="1" data-title="${esc(plan.video.title)}">
          <div class="video-info"><div class="video-title">${esc(plan.video.title)}</div><div class="video-meta">📚 真实跟练视频</div></div>
          <div class="video-actions">
            ${hasBv ? '<button class="btn-outline video-play" data-action="play">本页播放</button>' : ''}
            <a href="${hasBv ? bvidUrl(plan.video.bv) : '#' }" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a>
          </div>
          <div class="video-player"></div>
        </div>
      </div>
    `);
    let cur = 0, timer = null, running = false, left = steps[0].sec;
    function showStep() { $$('#massageSteps .step-card').forEach((c, i) => c.style.opacity = i === cur ? '1' : '.5'); left = steps[cur].sec; updateTimer(); }
    function updateTimer() { const pct = (1 - left / steps[cur].sec) * 100; $(`#timer${cur}`).style.width = pct + '%'; $(`#timeTxt${cur}`).textContent = Math.ceil(left) + 's'; }
    $('#msStart').addEventListener('click', () => {
      if (running) { clearInterval(timer); running = false; $('#msStart').textContent = '▶ 继续'; return; }
      running = true; $('#msStart').textContent = '⏸ 暂停';
      timer = setInterval(() => { left -= 0.1; if (left <= 0) { clearInterval(timer); running = false; $('#msStart').textContent = '✓ 完成'; } updateTimer(); }, 100);
    });
    $('#msPrev').addEventListener('click', () => { if (cur > 0) { cur--; showStep(); } });
    $('#msNext').addEventListener('click', () => { if (cur < steps.length - 1) { cur++; showStep(); } });
    showStep();
  }

  /* ---------- 电子琴 ---------- */
  const PIANO_VIDEOS = {
    0: [
      { title: '电子琴新手教学：认识键盘与基本操作', bv: 'BV1KE41157m9', t: 13 },
      { title: '电子琴入门：从零开始学弹奏', bv: 'BV1Ct4y1v7Ac', t: 12 },
      { title: '乐理入门（音律屋）：识谱/音名/唱名', bv: 'BV1Hg411w7n2', t: 10 }
    ],
    1: [
      { title: '电子琴新手教学：认识键盘与基本操作', bv: 'BV1KE41157m9', t: 13 },
      { title: '电子琴入门：从零开始学弹奏', bv: 'BV1Ct4y1v7Ac', t: 12 },
      { title: '📚 零基础学电子琴·完整系统课合集（112课）', url: 'https://b23.tv/NI2PuJM', t: 0 }
    ],
    2: [
      { title: '乐理入门（音律屋）：识谱/音名/唱名', bv: 'BV1Hg411w7n2', t: 10 },
      { title: '📚 完整系统课合集（进阶曲目：小白船/樱花/送别…）', url: 'https://b23.tv/NI2PuJM', t: 0 },
      { title: '电子琴入门：从零开始学弹奏', bv: 'BV1Ct4y1v7Ac', t: 12 }
    ],
    3: [
      { title: '📚 完整系统课合集（熟练曲目：致野玫瑰/献给爱丽丝/国际歌…）', url: 'https://b23.tv/NI2PuJM', t: 0 },
      { title: '电子琴新手教学：认识键盘与基本操作', bv: 'BV1KE41157m9', t: 13 },
      { title: '乐理入门（音律屋）：识谱/音名/唱名', bv: 'BV1Hg411w7n2', t: 10 }
    ]
  };
  function getPianoData() { const p = load(LS.personal, {}); return p.piano || { level: 0, streak: 0, xp: 0, hp: 5, history: [], progress: { 音阶: 0, 音调: 0, 简单曲目: 0, 和弦: 0 } }; }
  function setPianoData(d) { const p = load(LS.personal, {}); p.piano = d; save(LS.personal, p); }
  function checkLevelAdjust(d, accuracy) {
    d.history = d.history || [];
    d.history.push({ date: todayKey(), acc: accuracy });
    if (d.history.length > 10) d.history.shift();
    const recent = d.history.slice(-3);
    if (recent.length >= 3 && recent.every(x => x.acc >= 80) && d.level < 3) {
      d.level += 1; d.history = []; toast('🎉 掌握得很好，难度升级！');
    } else if (recent.length >= 3 && recent.every(x => x.acc < 50) && d.level > 0) {
      d.level -= 1; d.history = []; toast('难度降低，先巩固基础 💪');
    }
  }
  function bvidUrl(bv) { return 'https://www.bilibili.com/video/' + bv; }
  function bvidPlayer(bv, start, page) { return 'https://player.bilibili.com/player.html?bvid=' + bv + '&page=' + (page || 1) + '&high_quality=1&autoplay=0' + (start ? '&t=' + start : ''); }
  function handleVideoControls(e) {
    const play = e.target.closest('.video-play');
    if (play) {
      const item = play.closest('.video-item');
      const box = item.querySelector('.video-player');
      const bv = item.dataset.bv;
      const page = item.dataset.page ? Number(item.dataset.page) : null;
      if (box.innerHTML) { box.innerHTML = ''; play.textContent = '本页播放'; }
      else {
        box.innerHTML = `<div class="vp-tip">视频加载后，需再点播放器内 ▶ 播放按钮。若卡住请用「跳转原视频」。</div>
          <div class="vp-wrap"><iframe class="vp-iframe" src="${bvidPlayer(bv, null, page)}" allowfullscreen frameborder="0" scrolling="no" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" loading="eager"></iframe></div>
          <div class="vp-controls"><button class="vp-btn" data-mirror>↔ 镜像</button><button class="vp-btn" data-jump>⏭ 跳转</button></div>`;
        play.textContent = '收起视频';
      }
      return true;
    }
    const mirror = e.target.closest('[data-mirror]');
    if (mirror) { const wrap = mirror.closest('.video-player').querySelector('.vp-wrap'); wrap.style.transform = wrap.style.transform === 'scaleX(-1)' ? 'scaleX(1)' : 'scaleX(-1)'; return true; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { const iframe = jump.closest('.video-player').querySelector('.vp-iframe'); const t = prompt('跳转到第几秒？', '30'); if (t && iframe) iframe.src = iframe.src.replace(/&t=\d+/, '') + '&t=' + t; return true; }
    return false;
  }
  function videoListHTML(videos, levelName) {
    return `<div class="card"><h4 style="margin:0 0 10px;">▶️ ${levelName} 教学视频</h4>
      ${videos.map((v, i) => {
        const hasBv = v.bv && /^BV/i.test(v.bv);
        return `<div class="video-item" data-bv="${esc(v.bv || '')}" data-page="${esc(v.page || 1)}" data-title="${esc(v.title)}">
          <div class="video-info">
            <div class="video-title">${i + 1}. ${esc(v.title)}</div>
            <div class="video-meta">${!v.t ? '📚 完整系统课合集' : '⏱ ' + v.t + '分钟 · ' + esc(levelName)}</div>
          </div>
          <div class="video-actions">
            ${hasBv ? '<button class="btn-outline video-play" data-action="play">本页播放</button>' : ''}
            <a href="${hasBv ? bvidUrl(v.bv) : esc(v.url || '#')}" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a>
          </div>
          <div class="video-player"></div>
        </div>`;
      }).join('')}
    </div>`;
  }
  function renderPiano() {
    const d = getPianoData();
    const levels = ['零基础', '入门', '进阶', '熟练'];
    const units = [{ k: '音阶', i: '🎹' }, { k: '音调', i: '🎵' }, { k: '简单曲目', i: '🎼' }, { k: '和弦', i: '🎸' }];
    openSubpage('电子琴学习 🎹', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>电子琴学习 🎹</h2><p>0基础小白 · 从C大调音阶开始</p></div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-icon">🔥</div><div class="stat-num">${d.streak}</div><div class="stat-label">连续天</div></div>
        <div class="stat-item"><div class="stat-icon">⭐</div><div class="stat-num">${d.xp}</div><div class="stat-label">经验值</div></div>
        <div class="stat-item"><div class="stat-icon">❤️</div><div class="stat-num">${d.hp}</div><div class="stat-label">生命值</div></div>
      </div>
      <div class="diff-tabs">${levels.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-pl="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">📚 学习地图（点击打卡）</h4><div class="map-row">${units.map(u => `<div class="map-circle ${d.progress[u.k] >= 100 ? 'done' : ''}" data-map="piano:${u.k}"><div class="map-icon">${u.i}</div><div class="map-label">${u.k}</div><div class="map-pct">${d.progress[u.k]}%</div></div>`).join('')}</div></div>
      ${videoListHTML(PIANO_VIDEOS[d.level], levels[d.level])}
      <div class="ai-form">
        <label>🎹 AI 钢琴老师 · 描述你弹的问题<input id="pianoInput" placeholder="如：手指跨不开、左右手不协调、节奏不稳…" /></label>
        <button class="btn-primary" style="width:100%;margin-top:10px;" id="pianoAsk">让 AI 老师看看</button>
        <div id="pianoResult" class="ai-result hidden" style="margin-top:12px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="pianoNext">打卡完成，更新下一课 →</button>
    `);
  }
  function renderPianoModule(k) {
    const d = getPianoData();
    const guides = {
      音阶: { i: '🎹', t: '认识 C 大调音阶', s: '从中央 C 开始，右手 1-2-3-4-5 指弹 do-re-mi-fa-sol，再倒回来。每天慢速 10 遍。', video: { title: '电子琴新手教学：认识键盘与基本操作', bv: 'BV1KE41157m9', page: 1 } },
      音调: { i: '🎵', t: '音名与唱名', s: '记住 7 个音名 C-D-E-F-G-A-B 对应唱名 do-re-mi-fa-sol-la-si。试着看到谱子就唱出来。', video: { title: '乐理入门（音律屋）：识谱/音名/唱名', bv: 'BV1Hg411w7n2', page: 1 } },
      简单曲目: { i: '🎼', t: '单手弹《小星星》', s: '用 5 个手指弹 1155665-4433221，注意每个音时值均匀，不要着急。', video: { title: '电子琴入门：从零开始学弹奏', bv: 'BV1Ct4y1v7Ac', page: 1 } },
      和弦: { i: '🎸', t: 'C 和弦入门', s: '左手同时按下 C-E-G 三个音，保持 2 秒后松开。反复直到手指能同时站稳。', video: { title: '零基础学电子琴完整系统课', bv: 'BV1KE41157m9', page: 1 } }
    };
    const g = guides[k] || guides['音阶'];
    const hasBv = g.video.bv && /^BV/i.test(g.video.bv);
    openSubpage(`${k} 专项练习 🎹`, `
      <button class="back-row" data-plback>← 返回电子琴学习</button>
      <div class="sub-header"><h2>${g.i} ${esc(k)}</h2><p>${esc(g.t)}</p></div>
      <div class="card"><h4 style="margin:0 0 8px;">📋 今日练习目标</h4><p style="font-size:13px;color:var(--text-secondary);line-height:1.6;">${esc(g.s)}</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">▶️ 推荐视频</h4>
        <div class="video-item" data-bv="${esc(g.video.bv)}" data-page="${esc(g.video.page || 1)}" data-title="${esc(g.video.title)}">
          <div class="video-info"><div class="video-title">${esc(g.video.title)}</div><div class="video-meta">📚 专项跟练</div></div>
          <div class="video-actions">
            ${hasBv ? '<button class="btn-outline video-play" data-action="play">本页播放</button>' : ''}
            <a href="${hasBv ? bvidUrl(g.video.bv) : '#' }" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a>
          </div>
          <div class="video-player"></div>
        </div>
      </div>
      <button class="btn-primary" style="width:100%;" data-modcheck="piano:${esc(k)}">✅ 完成练习，${esc(k)} +15%</button>
    `);
  }

  /* ---------- 唱歌 ---------- */
  const SING_VIDEOS = {
    0: [
      { title: 'Jason老湿 108集零基础唱歌教程（全集）', bv: 'BV1VN1iYLExq', page: 1, t: 0 },
      { title: 'Jason 99集零基础教唱歌（全集）', bv: 'BV1Ae411B7Dm', page: 1, t: 0 },
      { title: '官方99集 Jason零基础唱歌系统课', bv: 'BV1okAVeaELv', page: 1, t: 0 }
    ],
    1: [
      { title: 'Jason老湿 108集零基础唱歌教程（第20集起）', bv: 'BV1VN1iYLExq', page: 20, t: 0 },
      { title: 'Jason 99集零基础教唱歌（第15集起）', bv: 'BV1Ae411B7Dm', page: 15, t: 0 },
      { title: '官方99集 Jason零基础唱歌系统课（第20集起）', bv: 'BV1okAVeaELv', page: 20, t: 0 }
    ],
    2: [
      { title: 'Jason老湿 108集零基础唱歌教程（第50集起·混声）', bv: 'BV1VN1iYLExq', page: 50, t: 0 },
      { title: '官方99集 Jason零基础唱歌系统课（第50集起）', bv: 'BV1okAVeaELv', page: 50, t: 0 },
      { title: 'Jason 99集零基础教唱歌（第50集起）', bv: 'BV1Ae411B7Dm', page: 50, t: 0 }
    ],
    3: [
      { title: 'Jason老湿 108集零基础唱歌教程（第80集起·高音）', bv: 'BV1VN1iYLExq', page: 80, t: 0 },
      { title: '官方99集 Jason零基础唱歌系统课（第80集起）', bv: 'BV1okAVeaELv', page: 80, t: 0 },
      { title: 'Jason 99集零基础教唱歌（第80集起）', bv: 'BV1Ae411B7Dm', page: 80, t: 0 }
    ]
  };
  function getSingData() { const p = load(LS.personal, {}); return p.singing || { streak: 0, xp: 0, hp: 5, level: 0, history: [], progress: { 练声: 0, 音准: 0, 气息: 0, 节奏: 0 } }; }
  function setSingData(d) { const p = load(LS.personal, {}); p.singing = d; save(LS.personal, p); }
  function renderSinging() {
    const d = getSingData();
    const levels = ['五音不全', '入门', '进阶', '熟练'];
    const units = [{ k: '练声', i: '🎤' }, { k: '音准', i: '🎵' }, { k: '气息', i: '💨' }, { k: '节奏', i: '🥁' }];
    openSubpage('唱歌 🎤', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>唱歌 🎤</h2><p>每天先练声，再学一首歌</p></div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-icon">🔥</div><div class="stat-num">${d.streak}</div><div class="stat-label">连续天</div></div>
        <div class="stat-item"><div class="stat-icon">⭐</div><div class="stat-num">${d.xp}</div><div class="stat-label">经验值</div></div>
        <div class="stat-item"><div class="stat-icon">❤️</div><div class="stat-num">${d.hp}</div><div class="stat-label">生命值</div></div>
      </div>
      <div class="diff-tabs">${levels.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-sl="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">📚 学习地图（点击打卡）</h4><div class="map-row">${units.map(u => `<div class="map-circle ${d.progress[u.k] >= 100 ? 'done' : ''}" data-map="sing:${u.k}"><div class="map-icon">${u.i}</div><div class="map-label">${u.k}</div><div class="map-pct">${d.progress[u.k]}%</div></div>`).join('')}</div></div>
      ${videoListHTML(SING_VIDEOS[d.level], levels[d.level])}
      <div class="ai-form">
        <label>🎤 AI 唱歌老师 · 描述你练声/发声的问题<input id="singInput" placeholder="如：高音上不去、气息短、跑调…" /></label>
        <button class="btn-primary" style="width:100%;margin-top:10px;" id="singAsk">让 AI 老师听听</button>
        <div id="singResult" class="ai-result hidden" style="margin-top:12px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="singNext">练完打卡，更新进度 →</button>
    `);
  }
  function renderSingModule(k) {
    const d = getSingData();
    const guides = {
      练声: { i: '🎤', t: '打嘟唇颤音 2 分钟', s: '双唇放松，发出「嘟——」的声音，像摩托车启动。从低音滑到高音再滑下来，每天 2 分钟。', video: { title: 'Jason老湿 108集零基础唱歌教程（第1集·练声）', bv: 'BV1VN1iYLExq', page: 1 } },
      音准: { i: '🎵', t: '跟唱 do-re-mi', s: '用钢琴或手机 App 弹一个音，跟唱「do」，依次弹 do-re-mi-fa-sol-la-si-do，跟着唱。', video: { title: 'Jason 99集零基础教唱歌（音准篇）', bv: 'BV1Ae411B7Dm', page: 1 } },
      气息: { i: '💨', t: '腹式呼吸 3 分钟', s: '手放肚子上，吸气时肚子鼓起，呼气时慢慢收紧。发「嘶——」声，尽量拖长。', video: { title: '官方99集 Jason零基础唱歌系统课（气息篇）', bv: 'BV1okAVeaELv', page: 1 } },
      节奏: { i: '🥁', t: '拍手打拍子', s: '选一首慢歌，用手打拍子：1-2-3-4，嘴里念节奏型 ta-ta-ta-ta。', video: { title: 'Jason老湿 108集零基础唱歌教程（节奏篇）', bv: 'BV1VN1iYLExq', page: 5 } }
    };
    const g = guides[k] || guides['练声'];
    const hasBv = g.video.bv && /^BV/i.test(g.video.bv);
    openSubpage(`${k} 专项练习 🎤`, `
      <button class="back-row" data-slback>← 返回唱歌</button>
      <div class="sub-header"><h2>${g.i} ${esc(k)}</h2><p>${esc(g.t)}</p></div>
      <div class="card"><h4 style="margin:0 0 8px;">📋 今日练习目标</h4><p style="font-size:13px;color:var(--text-secondary);line-height:1.6;">${esc(g.s)}</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">▶️ 推荐视频</h4>
        <div class="video-item" data-bv="${esc(g.video.bv)}" data-page="${esc(g.video.page || 1)}" data-title="${esc(g.video.title)}">
          <div class="video-info"><div class="video-title">${esc(g.video.title)}</div><div class="video-meta">📚 专项跟练</div></div>
          <div class="video-actions">
            ${hasBv ? '<button class="btn-outline video-play" data-action="play">本页播放</button>' : ''}
            <a href="${hasBv ? bvidUrl(g.video.bv) : '#' }" target="_blank" rel="noopener" class="btn-outline">跳转原视频 ↗</a>
          </div>
          <div class="video-player"></div>
        </div>
      </div>
      <button class="btn-primary" style="width:100%;" data-modcheck="sing:${esc(k)}">✅ 完成练习，${esc(k)} +15%</button>
    `);
  }

  /* ---------- 英语 ---------- */
  const ENGLISH_LEVELS = ['入门', '初级', '中级', '高级'];
  const ENGLISH_KEYS = ['词汇', '听力', '默写', '口语', '语法', '综合'];
  const WB_ENGLISH_STATE = 'wb_english_state';
  const WB_ENGLISH_WORDS = 'wb_english_words';
  const WB_ENGLISH_TASKS = 'wb_english_tasks';
  const WB_ENGLISH_ACHIEVE = 'wb_english_achievements';
  const getWB = (k, def) => load(k, def);
  const setWB = (k, v) => save(k, v);

  function initEngState() { return { level: 0, streak: 0, xp: 0, hp: 5, history: [], map: { 词汇: 0, 听力: 0, 默写: 0, 口语: 0, 语法: 0, 综合: 0 }, lastStudyDate: '', placementDone: false }; }
  function getEngState() { return getWB(WB_ENGLISH_STATE, initEngState()); }
  function setEngState(s) { setWB(WB_ENGLISH_STATE, s); }
  function getAllWordStates() { return getWB(WB_ENGLISH_WORDS, []); }
  function setAllWordStates(arr) { setWB(WB_ENGLISH_WORDS, arr); }
  function getWordState(en) { const arr = getAllWordStates(); return arr.find(x => x.en === en); }
  function updateWordState(en, updater) { const arr = getAllWordStates(); const i = arr.findIndex(x => x.en === en); if (i >= 0) { updater(arr[i]); setAllWordStates(arr); return arr[i]; } return null; }
  function ensureWordState(w, levelIdx) { let arr = getAllWordStates(); if (!arr.find(x => x.en === w.en)) { arr.push({ en: w.en, level: levelIdx, consecutiveCorrect: 0, wrongCount: 0, mastered: false, reviewRound: 0, nextReview: 0, lastPracticed: '', memoryTip: w.memoryTip, wrongSpellings: [] }); setAllWordStates(arr); } return arr.find(x => x.en === w.en); }
  function getAchievements() { return getWB(WB_ENGLISH_ACHIEVE, { vocabularyMaster: 0 }); }
  function setAchievements(a) { setWB(WB_ENGLISH_ACHIEVE, a); }

  const englishCurriculum = {
    入门: {
      words: [
        { en: 'apple', phonetic: '/ˈæp.əl/', mean: '苹果', image: '🍎', memoryTip: { type: '谐音法', text: 'apple→阿婆→阿婆爱吃苹果' }, example: 'I eat an apple every day.' },
        { en: 'banana', phonetic: '/bəˈnɑː.nə/', mean: '香蕉', image: '🍌', memoryTip: { type: '联想法', text: 'banana→爸爸拿→爸爸拿香蕉' }, example: 'She likes bananas.' },
        { en: 'hello', phonetic: '/həˈləʊ/', mean: '你好', image: '👋', memoryTip: { type: '谐音法', text: 'hello→哈啰→见面说哈啰' }, example: 'Hello, nice to meet you.' },
        { en: 'book', phonetic: '/bʊk/', mean: '书', image: '📖', memoryTip: { type: '拆词法', text: 'book→boo(600)+k→600K本书' }, example: 'This is my book.' },
        { en: 'cat', phonetic: '/kæt/', mean: '猫', image: '🐱', memoryTip: { type: '谐音法', text: 'cat→凯特→凯特养了一只猫' }, example: 'The cat is sleeping.' },
        { en: 'dog', phonetic: '/dɒɡ/', mean: '狗', image: '🐶', memoryTip: { type: '谐音法', text: 'dog→多哥→多哥家养了狗' }, example: 'I have a dog.' },
        { en: 'water', phonetic: '/ˈwɔː.tər/', mean: '水', image: '💧', memoryTip: { type: '联想法', text: 'water→沃特→沃特爱喝水' }, example: 'Please drink more water.' },
        { en: 'happy', phonetic: '/ˈhæp.i/', mean: '开心的', image: '😊', memoryTip: { type: '谐音法', text: 'happy→嗨皮→嗨皮就是开心' }, example: 'I feel happy today.' },
        { en: 'thank', phonetic: '/θæŋk/', mean: '感谢', image: '🙏', memoryTip: { type: '谐音法', text: 'thank→三克→三克油=谢谢' }, example: 'Thank you very much.' },
        { en: 'morning', phonetic: '/ˈmɔː.nɪŋ/', mean: '早晨', image: '🌅', memoryTip: { type: '拆词法', text: 'morning→mor(摸)+ning(宁)→早晨摸宁宁的头' }, example: 'Good morning!' }
      ],
      listen: [
        { title: '公园散步', text: 'The weather is nice today, so I decided to take a walk in the park. I saw many flowers and birds. Some children were playing games.', translation: '今天天气很好，所以我决定去公园散步。我看到很多花和鸟。一些孩子在玩游戏。', questions: [
          { q: 'Where did the speaker go?', options: ['A park', 'A school', 'A shop'], answer: 0 },
          { q: 'What did the speaker see?', options: ['Cars and buses', 'Flowers and birds', 'Books and pens'], answer: 1 },
          { q: 'Who was playing games?', options: ['Teachers', 'Children', 'Dogs'], answer: 1 }
        ]},
        { title: '我的家庭', text: 'There are three people in my family. My father is a doctor. My mother is a teacher. I am a student. We love each other.', translation: '我家有三口人。我爸爸是医生。我妈妈是老师。我是学生。我们彼此相爱。', questions: [
          { q: 'How many people are there in the family?', options: ['Two', 'Three', 'Four'], answer: 1 },
          { q: "What is the father's job?", options: ['Teacher', 'Doctor', 'Student'], answer: 1 },
          { q: "What is the mother's job?", options: ['Doctor', 'Teacher', 'Worker'], answer: 1 }
        ]}
      ]
    },
    初级: {
      words: [
        { en: 'schedule', phonetic: '/ˈʃedʒ.uːl/', mean: '日程表', image: '📅', memoryTip: { type: '谐音法', text: 'schedule→死车堵→死车堵了要改日程' }, example: 'What is your schedule today?' },
        { en: 'colleague', phonetic: '/ˈkɒl.iːɡ/', mean: '同事', image: '👔', memoryTip: { type: '联想法', text: 'colleague→co(一起)+league(联盟)→一起联盟的同事' }, example: 'My colleague is very kind.' },
        { en: 'confirm', phonetic: '/kənˈfɜːm/', mean: '确认', image: '✅', memoryTip: { type: '谐音法', text: 'confirm→肯分→肯分给你才确认' }, example: 'Please confirm your order.' },
        { en: 'meeting', phonetic: '/ˈmiː.tɪŋ/', mean: '会议', image: '🤝', memoryTip: { type: '拆词法', text: 'meeting→meet(见面)+ing→见面就是开会' }, example: 'We have a meeting at 3 PM.' },
        { en: 'invitation', phonetic: '/ˌɪn.vɪˈteɪ.ʃən/', mean: '邀请', image: '💌', memoryTip: { type: '联想法', text: 'in(里面)+vi(六)+tation→六张邀请函在里面' }, example: 'Thank you for the invitation.' },
        { en: 'restaurant', phonetic: '/ˈres.tər.ɒnt/', mean: '餐厅', image: '🍽️', memoryTip: { type: '谐音法', text: 'restaurant→瑞死特忍特→在餐厅忍住不吃' }, example: 'Let us go to a restaurant.' },
        { en: 'weather', phonetic: '/ˈweð.ər/', mean: '天气', image: '🌤️', memoryTip: { type: '联想法', text: 'wea(我们)+ther(ther)→我们聊天气' }, example: 'How is the weather?' },
        { en: 'journey', phonetic: '/ˈdʒɜː.ni/', mean: '旅行', image: '✈️', memoryTip: { type: '谐音法', text: 'journey→ journeys→旅行的 journey' }, example: 'The journey was long but fun.' },
        { en: 'delicious', phonetic: '/dɪˈlɪʃ.əs/', mean: '美味的', image: '😋', memoryTip: { type: '谐音法', text: 'delicious→地里舍斯→地里的食物 delicious' }, example: 'This cake is delicious.' },
        { en: 'friendship', phonetic: '/ˈfrend.ʃɪp/', mean: '友谊', image: '❤️', memoryTip: { type: '拆词法', text: 'friend(朋友)+ship(船)→友谊的小船' }, example: 'Our friendship is important.' },
        { en: 'appointment', phonetic: '/əˈpɔɪnt.mənt/', mean: '预约', image: '📆', memoryTip: { type: '谐音法', text: 'appointment→额跑因特门特→预约才能进门' }, example: 'I have an appointment at 10.' },
        { en: 'experience', phonetic: '/ɪkˈspɪə.ri.əns/', mean: '经验', image: '💼', memoryTip: { type: '拆词法', text: 'ex(前)+perience(经历)→以前的经历就是经验' }, example: 'She has rich experience.' },
        { en: 'department', phonetic: '/dɪˈpɑːt.mənt/', mean: '部门', image: '🏢', memoryTip: { type: '谐音法', text: 'department→低怕特门特→低怕特部门' }, example: 'Which department do you work in?' },
        { en: 'conference', phonetic: '/ˈkɒn.fər.əns/', mean: '会议', image: '🎤', memoryTip: { type: '谐音法', text: 'conference→看佛润斯→看佛润斯开会' }, example: 'The conference starts tomorrow.' },
        { en: 'available', phonetic: '/əˈveɪ.lə.bəl/', mean: '有空的', image: '🟢', memoryTip: { type: '联想法', text: 'a(一)+vailable(微信)→一个微信说明有空' }, example: 'Are you available tomorrow?' }
      ],
      listen: [
        { title: '办公室一天', text: 'I arrived at the office at nine. I checked my emails and made a schedule for the day. At noon, I had lunch with a colleague. In the afternoon, we had a meeting about the new project.', translation: '我九点到办公室。我查看了邮件并制定了日程。中午和同事吃午饭。下午我们开了一个关于新项目的会议。', questions: [
          { q: 'When did the speaker arrive at the office?', options: ['At eight', 'At nine', 'At ten'], answer: 1 },
          { q: 'What did the speaker do first?', options: ['Had lunch', 'Checked emails', 'Had a meeting'], answer: 1 },
          { q: 'Who did the speaker have lunch with?', options: ['A client', 'A colleague', 'A friend'], answer: 1 }
        ]},
        { title: '餐厅订位', text: 'I would like to book a table for two at 7 PM. Do you have any seats near the window? Also, is there a vegetarian menu?', translation: '我想订晚上7点两人的桌。有靠窗的位置吗？另外有素食菜单吗？', questions: [
          { q: 'How many people is the table for?', options: ['One', 'Two', 'Three'], answer: 1 },
          { q: 'What time is the booking?', options: ['6 PM', '7 PM', '8 PM'], answer: 1 },
          { q: 'What special menu does the speaker ask about?', options: ['Vegetarian', 'Seafood', 'Dessert'], answer: 0 }
        ]}
      ]
    },
    中级: {
      words: [
        { en: 'cooperation', phonetic: '/kəʊˌɒp.ərˈeɪ.ʃən/', mean: '合作', image: '🤝', memoryTip: { type: '拆词法', text: 'co(共同)+operation(操作)→共同操作=合作' }, example: 'We need close cooperation.' },
        { en: 'deadline', phonetic: '/ˈded.laɪn/', mean: '截止日期', image: '⏰', memoryTip: { type: '拆词法', text: 'dead(死)+line(线)→死线=截止日期' }, example: 'The deadline is next Friday.' },
        { en: 'negotiate', phonetic: '/nɪˈɡəʊ.ʃi.eɪt/', mean: '谈判', image: '⚖️', memoryTip: { type: '谐音法', text: 'negotiate→你够谁特→你够谁谈判' }, example: 'We need to negotiate the price.' },
        { en: 'responsibility', phonetic: '/rɪˌspɒn.sɪˈbɪl.ɪ.ti/', mean: '责任', image: '📋', memoryTip: { type: '拆词法', text: 'response(回应)+ibility→能回应=有责任' }, example: 'It is my responsibility.' },
        { en: 'confidence', phonetic: '/ˈkɒn.fɪ.dəns/', mean: '自信', image: '💪', memoryTip: { type: '谐音法', text: 'confidence→看非等死→自信地看' }, example: 'I have confidence in you.' },
        { en: 'opportunity', phonetic: '/ˌɒp.əˈtʃuː.nɪ.ti/', mean: '机会', image: '🚪', memoryTip: { type: '谐音法', text: 'opportunity→我扑推你蒂→抓住机会' }, example: 'This is a great opportunity.' },
        { en: 'environment', phonetic: '/ɪnˈvaɪ.rən.mənt/', mean: '环境', image: '🌍', memoryTip: { type: '拆词法', text: 'en(使)+viron(周围)+ment→周围的一切=环境' }, example: 'We should protect the environment.' },
        { en: 'contribution', phonetic: '/ˌkɒn.trɪˈbjuː.ʃən/', mean: '贡献', image: '🎁', memoryTip: { type: '拆词法', text: 'con(一起)+tribute(给予)+tion→一起给予=贡献' }, example: 'Your contribution is valuable.' },
        { en: 'presentation', phonetic: '/ˌprez.ənˈteɪ.ʃən/', mean: '演示', image: '📊', memoryTip: { type: '谐音法', text: 'presentation→破阵特神→演示破阵' }, example: 'I will give a presentation.' },
        { en: 'performance', phonetic: '/pəˈfɔː.məns/', mean: '表现', image: '📈', memoryTip: { type: '谐音法', text: 'performance→破佛慢死→表现慢吞吞' }, example: 'His performance was excellent.' },
        { en: 'suggestion', phonetic: '/səˈdʒestʃ.ən/', mean: '建议', image: '💡', memoryTip: { type: '谐音法', text: 'suggestion→色个神→给个好建议' }, example: 'Do you have any suggestion?' },
        { en: 'evaluation', phonetic: '/ɪˌvæl.juˈeɪ.ʃən/', mean: '评估', image: '📉', memoryTip: { type: '拆词法', text: 'e(出)+value(价值)+ation→评估价值' }, example: 'We need an evaluation report.' },
        { en: 'commitment', phonetic: '/kəˈmɪt.mənt/', mean: '承诺', image: '🤝', memoryTip: { type: '谐音法', text: 'commitment→可迷特门特→承诺迷住门特' }, example: 'I keep my commitment.' },
        { en: 'strategy', phonetic: '/ˈstræt.ə.dʒi/', mean: '策略', image: '♟️', memoryTip: { type: '谐音法', text: 'strategy→死抓特吉→死抓策略' }, example: 'What is our strategy?' },
        { en: 'efficiency', phonetic: '/ɪˈfɪʃ.ən.si/', mean: '效率', image: '⚡', memoryTip: { type: '谐音法', text: 'efficiency→一飞神戏→效率一飞冲天' }, example: 'We should improve efficiency.' },
        { en: 'perspective', phonetic: '/pəˈspek.tɪv/', mean: '视角', image: '🔭', memoryTip: { type: '谐音法', text: 'perspective→婆死拍特务→换个视角' }, example: 'From my perspective...' },
        { en: 'innovation', phonetic: '/ˌɪn.əˈveɪ.ʃən/', mean: '创新', image: '💡', memoryTip: { type: '拆词法', text: 'in(进入)+nov(新)+ation→进入新的=创新' }, example: 'Innovation drives progress.' },
        { en: 'acquisition', phonetic: '/ˌæk.wɪˈzɪʃ.ən/', mean: '获得；收购', image: '📦', memoryTip: { type: '谐音法', text: 'acquisition→爱可亏贼神→获得爱' }, example: 'The company made an acquisition.' },
        { en: 'sustainability', phonetic: '/səˌsteɪ.nəˈbɪl.ɪ.ti/', mean: '可持续性', image: '🌱', memoryTip: { type: '拆词法', text: 'sus(下)+tain(拿)+ability→能持续拿=可持续' }, example: 'Sustainability is important.' },
        { en: 'entrepreneur', phonetic: '/ˌɒn.trə.prəˈnɜːr/', mean: '企业家', image: '💼', memoryTip: { type: '谐音法', text: 'entrepreneur→昂特婆润牛→企业家很牛' }, example: 'He is a young entrepreneur.' }
      ],
      listen: [
        { title: '项目汇报', text: 'Our team has finished the first phase of the project. We met all deadlines and stayed within budget. The next step is user testing. I believe we can launch the product next month.', translation: '我们团队已完成项目第一阶段。我们按时完成并控制在预算内。下一步是用户测试。我相信下个月可以发布产品。', questions: [
          { q: 'What phase has the team finished?', options: ['The first', 'The second', 'The final'], answer: 0 },
          { q: 'What is the next step?', options: ['Marketing', 'User testing', 'Sales'], answer: 1 },
          { q: 'When can they launch?', options: ['This week', 'Next month', 'Next year'], answer: 1 }
        ]},
        { title: '职业选择', text: 'Choosing a career is not easy. You should consider your interests, skills, and market demand. Sometimes you need to try different jobs before finding the right one.', translation: '选择职业不容易。你应该考虑兴趣、技能和市场需求。有时你需要尝试不同工作才能找到合适的。', questions: [
          { q: 'What should you consider when choosing a career?', options: ['Only salary', 'Interests and skills', 'Location only'], answer: 1 },
          { q: 'What might you need to do before finding the right job?', options: ['Take a long vacation', 'Try different jobs', 'Move abroad'], answer: 1 },
          { q: 'What does the speaker think about career choice?', options: ['Easy', 'Difficult', 'Boring'], answer: 1 }
        ]}
      ]
    },
    高级: {
      words: [
        { en: 'sustainability', phonetic: '/səˌsteɪ.nəˈbɪl.ɪ.ti/', mean: '可持续性', image: '🌿', memoryTip: { type: '拆词法', text: 'sustain(维持)+ability(能力)→能维持=可持续' }, example: 'Corporate sustainability is key.' },
        { en: 'acquisition', phonetic: '/ˌæk.wɪˈzɪʃ.ən/', mean: '收购', image: '🏢', memoryTip: { type: '谐音法', text: 'acquisition→阿亏贼神→收购亏了贼神' }, example: 'The acquisition was successful.' },
        { en: 'strategic', phonetic: '/strəˈtiː.dʒɪk/', mean: '战略的', image: '♟️', memoryTip: { type: '拆词法', text: 'strategy(策略)+ic→策略的=战略的' }, example: 'This is a strategic decision.' },
        { en: 'perspective', phonetic: '/pəˈspek.tɪv/', mean: '视角', image: '👁️', memoryTip: { type: '谐音法', text: 'perspective→婆死拍特务→换个视角' }, example: 'From a global perspective...' },
        { en: 'controversial', phonetic: '/ˌkɒn.trəˈvɜː.ʃəl/', mean: '有争议的', image: '⚡', memoryTip: { type: '拆词法', text: 'contro(反)+vers(转)+ial→反转的=有争议的' }, example: 'It is a controversial topic.' },
        { en: 'entrepreneur', phonetic: '/ˌɒn.trə.prəˈnɜːr/', mean: '企业家', image: '🚀', memoryTip: { type: '谐音法', text: 'entrepreneur→昂特婆润牛→企业家很牛' }, example: 'The entrepreneur took risks.' },
        { en: 'infrastructure', phonetic: '/ˈɪn.frəˌstrʌk.tʃər/', mean: '基础设施', image: '🌉', memoryTip: { type: '拆词法', text: 'infra(下)+structure(结构)→下面的结构=基础设施' }, example: 'We need better infrastructure.' },
        { en: 'optimization', phonetic: '/ˌɒp.tɪ.maɪˈzeɪ.ʃən/', mean: '优化', image: '⚙️', memoryTip: { type: '拆词法', text: 'optim(最好)+ization→做到最好=优化' }, example: 'Process optimization saves time.' },
        { en: 'differentiation', phonetic: '/ˌdɪf.ər.en.ʃiˈeɪ.ʃən/', mean: '差异化', image: '🎨', memoryTip: { type: '拆词法', text: 'different(不同)+iation→差异化' }, example: 'Product differentiation matters.' },
        { en: 'diversification', phonetic: '/daɪˌvɜː.sɪ.fɪˈkeɪ.ʃən/', mean: '多元化', image: '🌈', memoryTip: { type: '拆词法', text: 'diverse(多样)+ification→多元化' }, example: 'Diversification reduces risk.' },
        { en: 'accountability', phonetic: '/əˌkaʊn.təˈbɪl.ɪ.ti/', mean: '问责制', image: '⚖️', memoryTip: { type: '拆词法', text: 'account(账户)+ability→能算清账=问责' }, example: 'Accountability builds trust.' },
        { en: 'sophisticated', phonetic: '/səˈfɪs.tɪ.keɪ.tɪd/', mean: '复杂的；精密的', image: '🤖', memoryTip: { type: '谐音法', text: 'sophisticated→输飞思替Kated→复杂到输' }, example: 'It is a sophisticated system.' },
        { en: 'disruptive', phonetic: '/dɪsˈrʌp.tɪv/', mean: '颠覆性的', image: '💥', memoryTip: { type: '拆词法', text: 'dis(分开)+rupt(断裂)+ive→断裂的=颠覆' }, example: 'Disruptive technology changes markets.' },
        { en: 'stakeholder', phonetic: '/ˈsteɪkˌhəʊl.dər/', mean: '利益相关者', image: '🧑‍🤝‍🧑', memoryTip: { type: '拆词法', text: 'stake(赌注)+holder(持有者)→利益相关者' }, example: 'We must consider all stakeholders.' },
        { en: 'benchmark', phonetic: '/ˈbentʃ.mɑːk/', mean: '基准', image: '📏', memoryTip: { type: '拆词法', text: 'bench(长凳)+mark(标记)→板凳上的标记=基准' }, example: 'This is the industry benchmark.' },
        { en: 'synergy', phonetic: '/ˈsɪn.ə.dʒi/', mean: '协同效应', image: '🔗', memoryTip: { type: '谐音法', text: 'synergy→吸拿鸡→协同效应吸金' }, example: 'The merger created synergy.' },
        { en: 'scalability', phonetic: '/ˌskeɪ.ləˈbɪl.ɪ.ti/', mean: '可扩展性', image: '📈', memoryTip: { type: '拆词法', text: 'scale(规模)+ability→能规模化=可扩展' }, example: 'Scalability is crucial for startups.' },
        { en: 'resilience', phonetic: '/rɪˈzɪl.i.əns/', mean: '韧性', image: '🌲', memoryTip: { type: '谐音法', text: 'resilience→瑞贼林思→韧性十足' }, example: 'Resilience helps us recover.' },
        { en: 'proposition', phonetic: '/ˌprɒp.əˈzɪʃ.ən/', mean: '主张；提案', image: '📄', memoryTip: { type: '拆词法', text: 'pro(向前)+position(位置)→向前放=提案' }, example: 'What is your value proposition?' },
        { en: 'marginal', phonetic: '/ˈmɑː.dʒɪ.nəl/', mean: '边缘的；微小的', image: '↔️', memoryTip: { type: '拆词法', text: 'margin(边缘)+al→边缘的' }, example: 'The improvement is marginal.' },
        { en: 'volatile', phonetic: '/ˈvɒl.ə.taɪl/', mean: '波动的', image: '📉', memoryTip: { type: '谐音法', text: 'volatile→我来太哦→市场波动我来' }, example: 'The market is volatile.' },
        { en: 'pragmatic', phonetic: '/præɡˈmæt.ɪk/', mean: '务实的', image: '🛠️', memoryTip: { type: '谐音法', text: 'pragmatic→扑来个Matt→务实的Matt' }, example: 'We need a pragmatic approach.' },
        { en: 'consolidate', phonetic: '/kənˈsɒl.ɪ.deɪt/', mean: '巩固；合并', image: '🧱', memoryTip: { type: '拆词法', text: 'con(一起)+solid(固体)+ate→变 solid=巩固' }, example: 'We need to consolidate gains.' },
        { en: 'compliance', phonetic: '/kəmˈplaɪ.əns/', mean: '合规', image: '📜', memoryTip: { type: '谐音法', text: 'compliance→看扑来安斯→合规才安心' }, example: 'Compliance is mandatory.' },
        { en: 'differentiate', phonetic: '/ˌdɪf.əˈren.ʃi.eɪt/', mean: '区分', image: '🔍', memoryTip: { type: '拆词法', text: 'different(不同)+iate→使不同=区分' }, example: 'How do you differentiate?' }
      ],
      listen: [
        { title: '全球化战略', text: 'Globalization offers both opportunities and challenges. Companies must adapt to local cultures while maintaining global standards. Those who balance these two forces often gain a competitive advantage.', translation: '全球化既带来机遇也带来挑战。公司必须适应本地文化同时保持全球标准。能平衡这两者的公司往往获得竞争优势。', questions: [
          { q: 'What does globalization offer?', options: ['Only risks', 'Opportunities and challenges', 'Only profits'], answer: 1 },
          { q: 'What must companies do?', options: ['Ignore local culture', 'Adapt to local cultures', 'Close local offices'], answer: 1 },
          { q: 'What can balanced companies gain?', options: ['Competitive advantage', 'Lower quality', 'Higher costs'], answer: 0 }
        ]},
        { title: '领导力', text: 'Leadership is not about titles. It is about influence, vision, and the ability to inspire others. Great leaders listen more than they speak and empower their teams to grow.', translation: '领导力不在于头衔。它关乎影响力、愿景和激励他人的能力。伟大的领导者多听少说，赋能团队成长。', questions: [
          { q: 'What is leadership about?', options: ['Titles only', 'Influence and vision', 'Working alone'], answer: 1 },
          { q: 'What do great leaders do more?', options: ['Speak', 'Listen', 'Rest'], answer: 1 },
          { q: 'What do great leaders do for their teams?', options: ['Control everything', 'Empower them to grow', 'Ignore them'], answer: 1 }
        ]}
      ]
    }
  };

  const speakScenarios = {
    reception: { title: '前台接待', icon: '🏢', difficulty: '入门', time: '约5分钟', steps: [
      { ai: 'Good morning, welcome to our company.', keywords: ['good', 'morning', 'welcome', 'company'], highlight: '问候语使用正确', improve: '可补充自我介绍，如 I am XXX', bonus: 'Nice to meet you' },
      { ai: 'May I have your name, please?', keywords: ['name', 'i am', 'my name', 'call'], highlight: '回答清楚', improve: '可补充来访目的，如 I am here for the meeting', bonus: 'Nice to meet you too' },
      { ai: 'Nice to meet you, have a seat.', keywords: ['nice', 'meet', 'seat', 'thank'], highlight: '回应礼貌', improve: '可补充感谢，如 Thank you', bonus: 'Have a nice day' }
    ]},
    email: { title: '邮件沟通', icon: '📧', difficulty: '初级', time: '约8分钟', steps: [
      { ai: 'I hope this email finds you well.', keywords: ['hope', 'email', 'well'], highlight: '邮件开头礼貌', improve: '可说明写信目的，如 I am writing to ask about...', bonus: 'I look forward to your reply' },
      { ai: 'Could you please send me the report by Friday?', keywords: ['report', 'friday', 'send'], highlight: '请求清楚', improve: '可确认截止时间，如 by 5 PM Friday', bonus: 'Thank you in advance' },
      { ai: 'Sure, I will send it this afternoon.', keywords: ['send', 'afternoon', 'will'], highlight: '回复明确', improve: '可补充附件说明，如 Please find the attachment', bonus: 'Best regards' }
    ]},
    blogger: { title: '博主连线', icon: '📹', difficulty: '初级', time: '约8分钟', steps: [
      { ai: 'Hi, thanks for joining this live stream!', keywords: ['hi', 'thanks', 'live'], highlight: '开场自然', improve: '可自我介绍，如 I am a lifestyle blogger', bonus: 'Nice to connect with you' },
      { ai: 'What kind of content do you usually create?', keywords: ['content', 'create', 'usually'], highlight: '问题表达清楚', improve: '可举例，如 makeup, vlog or review', bonus: 'That sounds interesting' },
      { ai: 'I mostly share daily skincare and makeup tips.', keywords: ['skincare', 'makeup', 'tips'], highlight: '回答具体', improve: '可邀请互动，如 Feel free to ask me anything', bonus: 'Let us stay in touch' }
    ]},
    travel: { title: '出差旅行', icon: '✈️', difficulty: '入门', time: '约5分钟', steps: [
      { ai: 'Hello, I would like to check in, please.', keywords: ['check', 'in', 'like'], highlight: '表达清楚', improve: '可给出姓名和预订号，如 My name is...', bonus: 'I have a reservation' },
      { ai: 'May I see your passport?', keywords: ['passport', 'here', 'is'], highlight: '回应得体', improve: '可主动递上，如 Here you are', bonus: 'Thank you so much' },
      { ai: 'Here is your room key. Have a nice stay.', keywords: ['room', 'key', 'stay'], highlight: '礼貌回应', improve: '可询问早餐时间，如 What time is breakfast?', bonus: 'Have a wonderful day' }
    ]},
    chat: { title: '自由聊天', icon: '💬', difficulty: '进阶', time: '约10分钟', steps: [
      { ai: 'What do you usually do in your free time?', keywords: ['free', 'time', 'usually', 'do'], highlight: '问题自然', improve: '可更具体，如 Do you prefer reading or sports?', bonus: 'That is a great hobby' },
      { ai: 'I enjoy taking photos and learning new things.', keywords: ['enjoy', 'photos', 'learning'], highlight: '表达流畅', improve: '可补充原因，如 because it helps me relax', bonus: 'We have a lot in common' },
      { ai: 'That is cool. What is your favorite city?', keywords: ['favorite', 'city', 'like'], highlight: '回应积极', improve: '可反问对方，如 How about you?', bonus: 'I would love to visit someday' }
    ]}
  };

  function engMapColorClass(pct) {
    if (pct <= 0) return 'map-gray';
    if (pct <= 30) return 'map-red';
    if (pct <= 70) return 'map-orange';
    if (pct < 100) return 'map-blue';
    return 'map-green';
  }
  function engIcon(k) { return { 词汇: 'A', 听力: '🎧', 默写: '✍️', 口语: '💬', 语法: '∠', 综合: '🎯' }[k] || '•'; }

  function checkEngLevelAdjust(accuracy) {
    const s = getEngState();
    s.history.push({ date: todayKey(), acc: accuracy });
    if (s.history.length > 10) s.history.shift();
    const recent = s.history.slice(-3);
    if (recent.length >= 3 && recent.every(x => x.acc >= 90) && s.level < 3) { s.level += 1; s.history = []; toast('🎉 连续3天高正确率，难度升级！'); }
    else if (recent.length >= 3 && recent.every(x => x.acc <= 50) && s.level > 0) { s.level -= 1; s.history = []; toast('难度降低，先巩固基础 💪'); }
    setEngState(s);
  }

  function reviewIntervals(round) {
    const intervals = [1, 3, 7, 15, 30, 60];
    return intervals[Math.min(round, intervals.length - 1)];
  }
  function reviewQuestionType(round) {
    const types = ['看中文默写英文', '听发音默写英文', '补全单词（给首字母）', '看英文默写中文', '听发音默写英文+中文', '随机题型'];
    return types[Math.min(round, types.length - 1)];
  }

  function generateDailyTasks(force = false) {
    const today = todayKey();
    const stored = getWB(WB_ENGLISH_TASKS, null);
    if (!force && stored && stored.date === today) return stored.tasks;
    const s = getEngState();
    const all = getAllWordStates();
    const levelName = ENGLISH_LEVELS[s.level];
    const levelWords = englishCurriculum[levelName].words;
    const now = Date.now();
    const tasks = [];
    const used = new Set();
    all.filter(w => !w.mastered && w.consecutiveCorrect < 3 && w.lastPracticed !== today).sort((a, b) => b.wrongCount - a.wrongCount).slice(0, 5).forEach(w => { tasks.push({ type: 'dictation', en: w.en, source: 'error' }); used.add(w.en); });
    all.filter(w => w.mastered && w.nextReview && w.nextReview <= now).slice(0, 3).forEach(w => { if (!used.has(w.en)) { tasks.push({ type: 'review', en: w.en, round: w.reviewRound }); used.add(w.en); } });
    const learned = new Set(all.map(w => w.en));
    let idx = 0;
    while (tasks.length < 10 && idx < levelWords.length) {
      const w = levelWords[idx];
      if (!learned.has(w.en) && !used.has(w.en)) { tasks.push({ type: 'new', en: w.en }); used.add(w.en); }
      idx++;
    }
    idx = 0;
    while (tasks.length < 10 && idx < levelWords.length) {
      const w = levelWords[idx];
      if (!used.has(w.en)) { tasks.push({ type: 'dictation', en: w.en, source: 'fill' }); used.add(w.en); }
      idx++;
    }
    setWB(WB_ENGLISH_TASKS, { date: today, tasks });
    s.lastStudyDate = today; setEngState(s);
    return tasks;
  }
  function dueReviewCount() {
    const now = Date.now();
    return getAllWordStates().filter(w => w.mastered && w.nextReview && w.nextReview <= now).length;
  }
  function errorWordCount() {
    return getAllWordStates().filter(w => !w.mastered).length;
  }
  function getWordInfo(en) {
    for (const lv of ENGLISH_LEVELS) { const w = englishCurriculum[lv].words.find(x => x.en === en); if (w) return { ...w, levelName: lv, levelIdx: ENGLISH_LEVELS.indexOf(lv) }; }
    return null;
  }

  /* ---------- 英语 UI ---------- */
  function renderEnglish() {
    const s = getEngState();
    const due = dueReviewCount();
    const err = errorWordCount();
    const mapKeys = ENGLISH_KEYS;
    openSubpage('英语学习 🌍', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>英语学习 🌍</h2><p>场景化闯关 · 当前难度「${ENGLISH_LEVELS[s.level]}」</p></div>
      <div class="clover-card">
        <div class="clover-section clover-cut-left"><div class="clover-icon">🔥</div><div class="clover-num">${s.streak}</div><div class="clover-label">连续天</div></div>
        <div class="clover-section clover-cut-mid"><div class="clover-icon">⭐</div><div class="clover-num">${s.xp}</div><div class="clover-label">经验值</div></div>
        <div class="clover-section clover-cut-right"><div class="clover-icon">❤️</div><div class="clover-num">${s.hp}</div><div class="clover-label">生命值</div></div>
      </div>
      <div style="font-size:13px;font-weight:700;margin:0 0 8px 4px;">难度等级</div>
      <div class="diff-tabs">${ENGLISH_LEVELS.map((l, i) => `<button class="diff-tab ${i === s.level ? 'active' : ''}" data-el="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">🗺️ 学习地图（点击打卡）</h4>
        <div class="map-row eng-map">${mapKeys.slice(0, 3).map(k => engMapCircle(k, s.map[k])).join('')}</div>
        <div class="map-row eng-map">${mapKeys.slice(3).map(k => engMapCircle(k, s.map[k])).join('')}</div>
      </div>
      ${!s.placementDone ? '<div class="card" style="background:linear-gradient(90deg,#E1BEE7,#C5CAE9);color:#4A148C;"><h4 style="margin:0 0 6px;">🎯 开局自测定级</h4><p style="font-size:13px;margin:0;">3道题测出你的真实水平，学习更高效。</p><button class="btn-primary" data-epage="placement" style="width:100%;margin-top:10px;background:#fff;color:#4A148C;">开始自测</button></div>' : ''}
      <div class="eng-menu-row" data-epage="tasks"><div class="eng-menu-left"><div class="eng-menu-icon">📖</div><div><div class="eng-menu-title">今日学习任务</div><div class="eng-menu-sub">每日10题 · 错题优先</div></div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="eng-menu-row" data-epage="listen"><div class="eng-menu-left"><div class="eng-menu-icon">🎧</div><div><div class="eng-menu-title">听力训练</div><div class="eng-menu-sub">短文+选择题 · 每难度2篇</div></div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="eng-menu-row" data-epage="speak"><div class="eng-menu-left"><div class="eng-menu-icon">💬</div><div><div class="eng-menu-title">AI口语对练</div><div class="eng-menu-sub">场景对话 · 关键词评分</div></div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="eng-menu-row" data-epage="errors"><div class="eng-menu-left"><div class="eng-menu-icon">✍️</div><div><div class="eng-menu-title">默写错题本</div><div class="eng-menu-sub">连续3天正确才掌握</div></div></div><div class="eng-menu-right">${err ? `<span class="due-badge">${err}</span>` : ''}<span style="color:var(--text-tertiary);">›</span></div></div>
      <div class="eng-menu-row" data-epage="review"><div class="eng-menu-left"><div class="eng-menu-icon">🔄</div><div><div class="eng-menu-title">艾宾浩斯回顾</div><div class="eng-menu-sub">6轮间隔重复 · 永久掌握</div></div></div><div class="eng-menu-right">${due ? `<span class="due-badge">${due}</span>` : ''}<span style="color:var(--text-tertiary);">›</span></div></div>
    `);
  }
  function engMapCircle(k, pct) {
    const cls = engMapColorClass(pct);
    const check = pct >= 100 ? '<div class="map-check">✓</div>' : '';
    return `<div class="map-circle ${cls}" data-map="eng:${k}"><div class="map-icon">${engIcon(k)}</div><div class="map-label">${k}</div>${check}<div class="map-pct">${pct}%</div></div>`;
  }

  function renderEnglishModule(type) {
    const s = getEngState();
    const infos = {
      词汇: { i: 'A', t: '词汇积累', desc: '每天学习新单词，用谐音/联想/拆词法记忆，连续3天正确即掌握。', action: '去背单词' },
      听力: { i: '🎧', t: '听力训练', desc: '听短文，做3道选择题。听完对照原文和译文。', action: '去练听力' },
      默写: { i: '✍️', t: '默写拼写', desc: '看中文写英文，错1个字母以内给提示，错2个以上清零重新背。', action: '去默写' },
      口语: { i: '💬', t: '口语对练', desc: '选择场景和AI对话，关键词匹配+Web Speech评分。', action: '去对话' },
      语法: { i: '∠', t: '语法要点', desc: '掌握当前难度的核心语法规则。', action: '去学语法' },
      综合: { i: '🎯', t: '综合测评', desc: '完成自测定级，检验真实水平。', action: '去自测' }
    };
    const info = infos[type];
    openSubpage(`${info.t} 🌍`, `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>${info.i} ${info.t}</h2><p>${ENGLISH_LEVELS[s.level]} · 当前进度 ${s.map[type]}%</p></div>
      <div class="card"><p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin:0;">${info.desc}</p></div>
      ${type === '词汇' ? '<button class="btn-primary" data-epage="tasks" style="width:100%;margin-bottom:10px;">'+info.action+'</button>' : ''}
      ${type === '听力' ? '<button class="btn-primary" data-epage="listen" style="width:100%;margin-bottom:10px;">'+info.action+'</button>' : ''}
      ${type === '默写' ? '<button class="btn-primary" data-epage="errors" style="width:100%;margin-bottom:10px;">'+info.action+'</button>' : ''}
      ${type === '口语' ? '<button class="btn-primary" data-epage="speak" style="width:100%;margin-bottom:10px;">'+info.action+'</button>' : ''}
      ${type === '语法' ? grammarHTML(s.level) : ''}
      ${type === '综合' ? '<button class="btn-primary" data-epage="placement" style="width:100%;margin-bottom:10px;">'+info.action+'</button>' : ''}
      <button class="btn-outline" data-mapcheck="eng:${type}" style="width:100%;">✅ 完成打卡，${type} +10%</button>
    `);
  }
  function grammarHTML(level) {
    const tips = [
      { title: 'a/an 用法', content: 'a 用于辅音音素开头的单词前；an 用于元音音素开头的单词前。', ex: 'an apple, a book' },
      { title: '一般现在时', content: '表示经常性、习惯性的动作。主语是第三人称单数时，动词加 -s/-es。', ex: 'She goes to work by bus.' },
      { title: '形容词比较级', content: '单音节形容词加 -er；多音节前加 more。', ex: 'taller, more beautiful' },
      { title: '过去时', content: '表示过去发生的动作。规则动词加 -ed，不规则动词需记忆。', ex: 'I worked yesterday. I went home.' }
    ];
    const t = tips[level] || tips[0];
    return `<div class="card"><h4 style="margin:0 0 8px;">📐 ${t.title}</h4><p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 8px;">${t.content}</p><p style="font-size:13px;color:var(--primary);margin:0;">例：${t.ex}</p></div>`;
  }

  function renderEnglishTasks() {
    const tasks = generateDailyTasks();
    openSubpage('今日学习任务 📖', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>📖 今日学习任务</h2><p>共 ${tasks.length} 题 · 错题优先 · 新词补齐</p></div>
      ${tasks.length ? tasks.map((t, i) => `<div class="eng-menu-row" data-dotask="${i}"><div class="eng-menu-left"><div class="eng-menu-icon">${t.type === 'new' ? '🆕' : t.type === 'review' ? '🔄' : '✍️'}</div><div><div class="eng-menu-title">${i + 1}. ${esc(t.en)}</div><div class="eng-menu-sub">${t.type === 'new' ? '新词学习' : t.type === 'review' ? `艾宾浩斯第${(t.round || 0) + 1}轮回顾` : '错题巩固'}</div></div></div><span style="color:var(--text-tertiary);">›</span></div>`).join('') : '<div class="empty">今日任务已清空，明天见！</div>'}
    `);
  }

  function renderEnglishWord(en, backToTasks = false) {
    const info = getWordInfo(en);
    const ws = ensureWordState(info, info.levelIdx);
    openSubpage(`${en} · 新词学习`, `
      <button class="back-row" data-engback>${backToTasks ? '← 返回任务列表' : '← 返回英语学习'}</button>
      <div class="sub-header"><h2>📖 新词学习</h2><p>${ENGLISH_LEVELS[info.levelIdx]} · ${esc(info.en)}</p></div>
      <div class="word-card">
        <div class="word-en">${info.image} ${info.en}</div>
        <div class="word-phonetic">${info.phonetic} <button class="btn-outline" data-speak="${esc(info.en)}" style="padding:4px 10px;font-size:12px;">🔊 朗读</button></div>
        <div class="word-meaning">${info.mean}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:10px;">例句：${info.example}</div>
      </div>
      <div class="card"><h4 style="margin:0 0 8px;">💡 记忆口诀 · ${info.memoryTip.type}</h4><p style="font-size:13px;color:var(--text-secondary);margin:0;">${info.memoryTip.text}</p></div>
      <button class="btn-primary" data-knownew="${esc(en)}" style="width:100%;">✅ 我记住了，+5经验</button>
    `);
  }

  function renderEnglishDictation(en, backToTasks = false) {
    const info = getWordInfo(en);
    const ws = ensureWordState(info, info.levelIdx);
    openSubpage(`${en} · 默写`, `
      <button class="back-row" data-engback>${backToTasks ? '← 返回任务列表' : '← 返回英语学习'}</button>
      <div class="sub-header"><h2>✍️ 单词默写</h2><p>${ENGLISH_LEVELS[info.levelIdx]} · 连续3天正确才掌握</p></div>
      <div class="dictation-card">
        <div class="dictation-word">${info.image} ${info.mean}</div>
        <div class="dictation-tip">${info.phonetic} <button class="btn-outline" data-speak="${esc(info.en)}" style="padding:4px 10px;font-size:12px;">🔊 听发音</button></div>
        <input id="dictInput" class="dictation-input" placeholder="输入英文拼写" autocomplete="off" />
        <div id="dictFeedback" style="margin-top:12px;display:none;"></div>
        <button class="btn-primary" data-checkspell="${esc(en)}" style="width:100%;margin-top:12px;">提交</button>
      </div>
      <div class="card"><h4 style="margin:0 0 8px;">📊 当前状态</h4><p style="font-size:13px;color:var(--text-secondary);margin:0;">连续正确 ${ws.consecutiveCorrect}/3 · 错误 ${ws.wrongCount} 次</p><div class="progress-mini"><div class="progress-mini-fill" style="width:${Math.min(100, ws.consecutiveCorrect / 3 * 100)}%"></div></div></div>
    `);
  }

  function renderEnglishListen(idx) {
    const s = getEngState();
    const items = englishCurriculum[ENGLISH_LEVELS[s.level]].listen;
    const i = Math.min(idx, items.length - 1);
    const item = items[i];
    openSubpage(`听力训练 ${i + 1}/${items.length} 🎧`, `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>🎧 ${esc(item.title)}</h2><p>${ENGLISH_LEVELS[s.level]} · 听短文做选择题</p></div>
      <div class="card"><button class="btn-primary" data-listenplay="${i}" style="width:100%;">🔊 播放短文（Web Speech）</button></div>
      <div class="card"><h4 style="margin:0 0 10px;">原文</h4><p style="font-size:14px;line-height:1.7;margin:0;">${esc(item.text)}</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">译文</h4><p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0;">${esc(item.translation)}</p></div>
      <div id="listenQuestions">${item.questions.map((q, qi) => `<div class="card" data-qidx="${qi}"><h4 style="margin:0 0 10px;">${qi + 1}. ${esc(q.q)}</h4><div class="option-list">${q.options.map((opt, oi) => `<button class="option-chip" data-answer="${qi}:${oi}">${esc(opt)}</button>`).join('')}</div></div>`).join('')}</div>
      <button class="btn-primary" id="engListenDone" data-listendone="${i}" style="width:100%;margin-top:10px;">完成听力打卡</button>
      ${i < items.length - 1 ? `<button class="btn-outline" data-epage="listen:${i + 1}" style="width:100%;margin-top:10px;">下一篇 →</button>` : ''}
    `);
  }

  function renderEnglishSpeak() {
    const ids = Object.keys(speakScenarios);
    openSubpage('AI口语对练 💬', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>💬 AI口语对练</h2><p>选一个场景开始对话</p></div>
      <div class="scene-card" style="background:linear-gradient(90deg,#F3E5F5,#fff);">
        <div class="scene-icon">🎙️</div>
        <div class="scene-info"><div class="scene-title">AI口语对练</div><div class="scene-meta">关键词匹配评分 · Web Speech语音输入</div></div>
      </div>
      ${ids.map(id => {
        const sc = speakScenarios[id];
        return `<div class="scene-card" data-speakscene="${esc(id)}"><div class="scene-icon">${sc.icon}</div><div class="scene-info"><div class="scene-title">${esc(sc.title)}</div><div class="scene-meta">${sc.difficulty} · ${sc.time} · ${sc.steps.length}轮对话</div><div class="scene-script">${sc.steps[0].ai}</div></div><span style="color:var(--text-tertiary);">›</span></div>`;
      }).join('')}
    `);
  }

  function renderEnglishSpeakScene(sceneId) {
    const sc = speakScenarios[sceneId];
    openSubpage(`${sc.title} 💬`, `
      <button class="back-row" data-engback>← 返回场景选择</button>
      <div class="sub-header"><h2>${sc.icon} ${sc.title}</h2><p>${sc.difficulty} · 完成 ${sc.steps.length} 轮对话</p></div>
      <div id="speakChat" class="chat-wrap">
        <div class="chat-bubble chat-ai">${esc(sc.steps[0].ai)}</div>
      </div>
      <div class="chat-input-row">
        <input id="speakInput" placeholder="输入你的回复，或点麦克风说话…" />
        <button id="speakMic" class="mic-btn" data-micscene="${esc(sceneId)}">🎙️</button>
        <button id="speakSend" data-sendscene="${esc(sceneId)}">➤</button>
      </div>
      <div id="speakResult" class="chat-feedback" style="display:none;"></div>
    `);
    window.__speakScene = sceneId;
    window.__speakStep = 0;
    window.__speakStars = 0;
  }

  function speakFeedback(sceneId, userText) {
    const sc = speakScenarios[sceneId];
    const step = sc.steps[window.__speakStep];
    const chat = $('#speakChat');
    const userBubble = document.createElement('div'); userBubble.className = 'chat-bubble chat-user'; userBubble.textContent = userText || '…'; chat.appendChild(userBubble);
    const lower = (userText || '').toLowerCase();
    let stars = 0;
    step.keywords.forEach(kw => { if (lower.includes(kw.toLowerCase())) stars++; });
    if (lower.includes(step.bonus.toLowerCase())) stars++;
    stars = Math.min(5, Math.max(1, stars));
    window.__speakStars += stars;
    const hasKw = step.keywords.some(kw => lower.includes(kw.toLowerCase()));
    const hasBonus = lower.includes(step.bonus.toLowerCase());
    const fb = `<b>⭐ ${stars}/5</b><br/>${hasKw ? '✅ ' + esc(step.highlight) : '💡 ' + esc(step.improve)}${hasBonus ? '<br/>🎉 加分表达：' + esc(step.bonus) : ''}`;
    const fbDiv = document.createElement('div'); fbDiv.className = 'chat-feedback'; fbDiv.innerHTML = fb; chat.appendChild(fbDiv);
    window.__speakStep++;
    if (window.__speakStep < sc.steps.length) {
      setTimeout(() => { const next = document.createElement('div'); next.className = 'chat-bubble chat-ai'; next.textContent = sc.steps[window.__speakStep].ai; chat.appendChild(next); chat.scrollTop = chat.scrollHeight; }, 800);
    } else {
      const total = window.__speakStars;
      const avg = Math.round(total / sc.steps.length);
      setTimeout(() => {
        const end = document.createElement('div'); end.className = 'chat-feedback';
        end.innerHTML = `<b>🎉 对话结束</b><br/>总星数：${total} ⭐ · 平均 ${avg}/5<br/>${avg >= 4 ? '表现很棒，继续加油！' : avg >= 3 ? '还不错，注意关键词匹配。' : '建议多练基础句型。'}`;
        chat.appendChild(end);
        const s = getEngState(); s.xp += 10; s.map['口语'] = Math.min(100, s.map['口语'] + 10); if (avg >= 4) s.streak += 1; setEngState(s);
        toast('口语对练完成 +10经验');
        chat.scrollTop = chat.scrollHeight;
      }, 800);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function renderEnglishErrors() {
    const all = getAllWordStates().filter(w => !w.mastered).sort((a, b) => {
      if (a.lastPracticed !== todayKey() && b.lastPracticed === todayKey()) return -1;
      if (a.lastPracticed === todayKey() && b.lastPracticed !== todayKey()) return 1;
      return b.wrongCount - a.wrongCount;
    });
    openSubpage('默写错题本 ✍️', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>✍️ 默写错题本</h2><p>连续3天正确才能移出</p></div>
      ${all.length ? `<button class="btn-primary" data-practiceerrors style="width:100%;margin-bottom:12px;">巩固练习（${all.length}个）</button>` + all.map(w => {
        let status = '', cls = '';
        if (w.consecutiveCorrect === 0) { status = '🔴 连续0天'; cls = 'status-red'; }
        else if (w.consecutiveCorrect === 1) { status = '🟡 连续1天'; cls = 'status-yellow'; }
        else if (w.consecutiveCorrect === 2) { status = '🟢 连续2天'; cls = 'status-lightgreen'; }
        else { status = '✅ 已掌握'; cls = 'status-green'; }
        const info = getWordInfo(w.en);
        return `<div class="error-card"><div class="error-top"><span class="error-en">${esc(w.en)}</span><span class="word-status ${cls}">${status}</span></div><p style="font-size:12px;color:var(--text-secondary);margin:0;">${info ? info.mean : ''} · 错误 ${w.wrongCount} 次</p><p style="font-size:12px;color:var(--text-tertiary);margin:6px 0 0;">💡 ${info ? info.memoryTip.text : ''}</p></div>`;
      }).join('') : '<div class="empty">暂无错题，继续保持！</div>'}
    `);
  }

  function renderEnglishReview() {
    const now = Date.now();
    const due = getAllWordStates().filter(w => w.mastered && w.nextReview && w.nextReview <= now);
    openSubpage('艾宾浩斯回顾 🔄', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>🔄 艾宾浩斯回顾</h2><p>今日到期：${due.length} 个</p></div>
      ${due.length ? due.map(w => `<div class="eng-menu-row" data-doreview="${esc(w.en)}"><div class="eng-menu-left"><div class="eng-menu-icon">🔄</div><div><div class="eng-menu-title">${esc(w.en)}</div><div class="eng-menu-sub">第 ${w.reviewRound + 1} 轮 · ${reviewQuestionType(w.reviewRound)}</div></div></div><span style="color:var(--text-tertiary);">›</span></div>`).join('') : '<div class="empty">没有到期复习的单词，继续学习新词吧！</div>'}
    `);
  }

  function renderEnglishReviewQuiz(en) {
    const w = getWordState(en);
    const info = getWordInfo(en);
    const round = w.reviewRound || 0;
    const type = reviewQuestionType(round);
    let q = '', hint = '';
    if (round % 6 === 0) { q = `看中文写英文：${info.mean}`; }
    else if (round % 6 === 1) { q = '听发音写英文'; hint = `<button class="btn-outline" data-speak="${esc(en)}" style="padding:4px 10px;font-size:12px;">🔊 播放发音</button>`; }
    else if (round % 6 === 2) { q = `补全单词：${en[0]}${'_'.repeat(en.length - 1)}`; }
    else if (round % 6 === 3) { q = `看英文写中文：${en}`; }
    else { q = '听发音写英文+中文'; hint = `<button class="btn-outline" data-speak="${esc(en)}" style="padding:4px 10px;font-size:12px;">🔊 播放发音</button>`; }
    openSubpage(`回顾 · ${en} 🔄`, `
      <button class="back-row" data-engback>← 返回回顾列表</button>
      <div class="sub-header"><h2>🔄 第 ${round + 1} 轮回顾</h2><p>${type}</p></div>
      <div class="dictation-card"><div class="dictation-word">${q}</div>${hint}<input id="reviewInput" class="dictation-input" placeholder="输入答案" autocomplete="off" /></div>
      <button class="btn-primary" data-checkreview="${esc(en)}" style="width:100%;">提交答案</button>
    `);
  }

  function renderEnglishPlacement() {
    const questions = [
      { q: '苹果的英语是？', audio: 'apple', answer: 'apple' },
      { q: '书的英语是？', audio: 'book', answer: 'book' },
      { q: '请听发音，写出这个单词', audio: 'water', answer: 'water' }
    ];
    openSubpage('开局自测定级 🎯', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>🎯 开局自测定级</h2><p>3道题 · 纯默写 · 答完自动定级</p></div>
      ${questions.map((q, i) => `<div class="dictation-card" style="margin-bottom:10px;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">${i + 1}. ${q.q}</div><button class="btn-outline" data-speak="${esc(q.audio)}" style="margin-bottom:10px;">🔊 播放发音</button><input class="dictation-input placement-ans" data-idx="${i}" data-ans="${esc(q.answer)}" placeholder="输入英文" autocomplete="off" /></div>`).join('')}
      <button class="btn-primary" id="engPlacementSubmit" style="width:100%;">提交定级</button>
    `);
  }

  /* 旧的兼容数据迁移 */
  (function migrateOldEng() {
    const p = load(LS.personal, {});
    if (p.english && !getWB(WB_ENGLISH_STATE, null)) {
      const old = p.english;
      setEngState({ level: old.level || 0, streak: old.streak || 0, xp: old.xp || 0, hp: old.hp || 5, history: old.history || [], map: old.map || initEngState().map, lastStudyDate: '', placementDone: false });
    }
  })();

  /* ---------- 运动 ---------- */
  function renderSport() {
    openSubpage('运动计划 💪', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>运动计划 💪</h2><p>八段锦 · 力量拉伸 · 姨妈期友好</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🌅 晨起 · 八段锦 12分钟</h4><p style="font-size:13px;color:var(--text-secondary);">温和唤醒身体，适合每天打卡。</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🌙 晚间 · 拉伸 10分钟</h4><p style="font-size:13px;color:var(--text-secondary);">放松肩颈、腰背，久坐党必做。</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🩸 姨妈期 · 舒缓版</h4><p style="font-size:13px;color:var(--text-secondary);">只练呼吸+轻柔拉伸，不压迫腹部。</p></div>
      <button class="btn-primary" id="sportCheck" style="width:100%;">今日运动打卡</button>
    `);
  }

  /* ---------- 滚动拉杆 + 回到顶部 ---------- */
  const content = $('#content');
  const track = $('#scrollTrack');
  const thumb = $('#scrollThumb');
  const backTop = $('#backTop');
  function updateScrollUI() {
    const active = $('#subpage').classList.contains('hidden') ? content : $('#subpage');
    const sh = active.scrollHeight, ch = active.clientHeight;
    if (sh <= ch + 10) { track.style.display = 'none'; backTop.style.display = 'none'; return; }
    track.style.display = 'block';
    const h = Math.max(40, ch / sh * ch);
    thumb.style.height = h + 'px';
    const maxY = ch - h;
    const top = active.scrollTop / (sh - ch) * maxY;
    thumb.style.top = top + 'px';
    backTop.style.display = active.scrollTop > 200 ? 'flex' : 'none';
    track.style.top = active.offsetTop + 'px';
    track.style.height = ch + 'px';
  }
  function scrollToTop() { const active = $('#subpage').classList.contains('hidden') ? content : $('#subpage'); active.scrollTo({ top: 0, behavior: 'smooth' }); }
  content.addEventListener('scroll', updateScrollUI);
  $('#subpage').addEventListener('scroll', updateScrollUI);
  backTop.addEventListener('click', scrollToTop);
  let drag = false, sy = 0, st0 = 0;
  thumb.addEventListener('touchstart', e => { drag = true; sy = e.touches[0].clientY; st0 = content.scrollTop; e.preventDefault(); }, { passive: false });
  thumb.addEventListener('mousedown', e => { drag = true; sy = e.clientY; st0 = content.scrollTop; e.preventDefault(); });
  document.addEventListener('touchmove', e => { if (!drag) return; const active = $('#subpage').classList.contains('hidden') ? content : $('#subpage'); const dy = e.touches[0].clientY - sy; const ratio = active.scrollHeight / active.clientHeight; active.scrollTop = st0 + dy * ratio; updateScrollUI(); }, { passive: false });
  document.addEventListener('mousemove', e => { if (!drag) return; const active = $('#subpage').classList.contains('hidden') ? content : $('#subpage'); const dy = e.clientY - sy; const ratio = active.scrollHeight / active.clientHeight; active.scrollTop = st0 + dy * ratio; updateScrollUI(); });
  document.addEventListener('touchend', () => drag = false);
  document.addEventListener('mouseup', () => drag = false);

  /* ---------- 导航 + 启动 ---------- */
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  function init() {
    $('#todayDate').textContent = todayKey();
    renderPlan();
    fetch('./daily.json').then(r => r.ok ? r.json() : null).then(d => {
      if (d && d.date && daily.date !== d.date) {
        daily = d; save(LS.daily, daily); hidden = []; save(LS.hidden, hidden);
        toast('已更新到 ' + d.date + ' 数据');
        if (currentView === 'topic') renderTopics(); if (currentView === 'repost') renderReposts();
      }
    }).catch(() => {});
    fetch('./archive.json').then(r => r.ok ? r.json() : null).then(a => {
      if (a) { archive = a; save(LS.archive, archive); }
    }).catch(() => {});
    setTimeout(updateScrollUI, 100);
  }
  init();
})();
