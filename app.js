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
    $('#viewTitle').textContent = title;
    $('#backBtn').classList.add('show');
    $('#subpageBody').innerHTML = html;
    $('#subpage').classList.remove('hidden');
    $('#content').scrollTop = 0;
    $('#subpage').scrollTop = 0;
    setTimeout(updateScrollUI, 60);
  }
  function closeSubpage() {
    $('#subpage').classList.add('hidden');
    $('#subpageBody').innerHTML = '';
    $('#viewTitle').textContent = titles[currentView];
    $('#backBtn').classList.remove('show');
    setTimeout(updateScrollUI, 60);
  }
  $('#backBtn').addEventListener('click', () => {
    if (!$('#subpage').classList.contains('hidden')) closeSubpage();
  });

  /* 个人日常入口 */
  $$('.pd-card').forEach(c => c.addEventListener('click', () => {
    const sub = c.dataset.sub;
    if (sub === 'skincare') renderSkincare();
    else if (sub === 'piano') renderPiano();
    else if (sub === 'singing') renderSinging();
    else if (sub === 'english') renderEnglish();
    else if (sub === 'sport') renderSport();
  }));

  /* ---------- 护肤日常 ---------- */
  function getSkinData() { const p = load(LS.personal, {}); return p.skincare || { products: [], diary: [], quiz: null, routine: [] }; }
  function setSkinData(s) { const p = load(LS.personal, {}); p.skincare = s; save(LS.personal, p); }
  function renderSkincare(tab = 'routine') {
    const tabs = [{ k: 'routine', l: '日程' }, { k: 'products', l: '护肤品' }, { k: 'quiz', l: '肤质测试' }, { k: 'diary', l: '皮肤日记' }, { k: 'massage', l: '面部按摩' }];
    openSubpage('护肤日常 ✨', `
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
      </div>`;
  }

  /* 护肤子页交互 */
  $('#subpageBody').addEventListener('click', e => {
    const tab = e.target.closest('[data-skintab]');
    if (tab) { $$('[data-skintab]').forEach(b => b.classList.toggle('active', b === tab)); renderSkinTab(tab.dataset.skintab); return; }
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
    const mass = e.target.closest('[data-massage]');
    if (mass) { openMassagePlay(mass.dataset.massage); return; }
    const match = e.target.closest('#massageMatch');
    if (match) { toast('已为你匹配「去水肿+提亮」组合方案'); return; }
  });
  function openMassagePlay(name) {
    const steps = [
      { t: '眼周放松', s: '无名指从内眼角轻点滑到太阳穴，重复5次。', tip: '只用无名指，力道最轻。', sec: 30 },
      { t: '法令纹提拉', s: '从鼻翼两侧沿颧骨向上提拉至太阳穴，重复8次。', tip: '保持手部润滑，不要干搓。', sec: 30 },
      { t: '下颌线收紧', s: '从下巴中心沿下颌线推至耳后，重复10次。', tip: '稍微加大力度，感受到淋巴引流。', sec: 40 },
      { t: '额头舒展', s: '从眉心向上推至发际线，再向两侧分开，重复8次。', tip: '动作慢而稳，配合呼吸。', sec: 30 }
    ];
    openSubpage(`${name} · 跟练`, `
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
  function getPianoData() { const p = load(LS.personal, {}); return p.piano || { level: 0, streak: 0, xp: 0, hp: 5, progress: { 音阶: 0, 音调: 0, 简单曲目: 0, 和弦: 0 } }; }
  function setPianoData(d) { const p = load(LS.personal, {}); p.piano = d; save(LS.personal, p); }
  function renderPiano() {
    const d = getPianoData();
    const levels = ['零基础', '入门', '进阶', '熟练'];
    const units = [{ k: '音阶', i: '🎹' }, { k: '音调', i: '🎵' }, { k: '简单曲目', i: '🎼' }, { k: '和弦', i: '🎸' }];
    openSubpage('电子琴学习 🎹', `
      <div class="sub-header"><h2>电子琴学习 🎹</h2><p>0基础小白 · 从C大调音阶开始</p></div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-icon">🔥</div><div class="stat-num">${d.streak}</div><div class="stat-label">连续天</div></div>
        <div class="stat-item"><div class="stat-icon">⭐</div><div class="stat-num">${d.xp}</div><div class="stat-label">经验值</div></div>
        <div class="stat-item"><div class="stat-icon">❤️</div><div class="stat-num">${d.hp}</div><div class="stat-label">生命值</div></div>
      </div>
      <div class="diff-tabs">${levels.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-pl="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">📚 学习地图</h4><div class="map-row">${units.map(u => `<div class="map-circle ${d.progress[u.k] >= 100 ? 'done' : ''}"><div class="map-icon">${u.i}</div><div class="map-label">${u.k}</div><div class="map-pct">${d.progress[u.k]}%</div></div>`).join('')}</div></div>
      <div class="card"><h4 style="margin:0 0 10px;">▶️ 今日教学视频</h4>
        <div class="vp-wrap"><iframe class="vp-iframe" src="https://www.bilibili.com/video/BV1Xs411Q7CH" allowfullscreen></iframe></div>
        <div class="vp-controls">
          <button class="vp-btn" id="pFlip">↔ 翻转</button>
          <button class="vp-btn" id="pZoom">🔍 放大</button>
          <button class="vp-btn" id="pJump">⏭ 跳转</button>
        </div>
      </div>
      <div class="ai-form">
        <label>🎹 AI 钢琴老师 · 上传/描述你弹的问题<input id="pianoInput" placeholder="如：手指跨不开、左右手不协调、节奏不稳…" /></label>
        <button class="btn-primary" style="width:100%;margin-top:10px;" id="pianoAsk">让 AI 老师看看</button>
        <div id="pianoResult" class="ai-result hidden" style="margin-top:12px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="pianoNext">打卡完成，更新下一课 →</button>
    `);
    bindPianoEvents();
  }
  function bindPianoEvents() {
    $('#subpageBody').addEventListener('click', e => {
      const tab = e.target.closest('[data-pl]');
      if (tab) { const d = getPianoData(); d.level = Number(tab.dataset.pl); setPianoData(d); renderPiano(); }
      const flip = e.target.closest('#pFlip');
      if (flip) { const f = $('.vp-iframe'); f.style.transform = f.style.transform === 'scaleX(-1)' ? 'scaleX(1)' : 'scaleX(-1)'; toast('已翻转画面'); }
      const zoom = e.target.closest('#pZoom');
      if (zoom) { const f = $('.vp-iframe'); f.style.height = f.clientHeight === 220 ? '360px' : '220px'; }
      const jump = e.target.closest('#pJump');
      if (jump) { const t = prompt('跳转到第几秒？', '30'); if (t) { const f = $('.vp-iframe'); f.src = f.src.replace(/\?t=\d+/, '') + '?t=' + t; } }
      const ask = e.target.closest('#pianoAsk');
      if (ask) {
        const q = $('#pianoInput').value.trim(); if (!q) { toast('请先描述你的问题'); return; }
        const res = $('#pianoResult'); res.classList.remove('hidden');
        res.innerHTML = `<b>AI 钢琴老师反馈：</b><br/>针对「${esc(q)}」，建议：<br/>① 先分手慢练，节拍器设 60 BPM；<br/>② 把困难小节循环 5 遍，再串起来；<br/>③ 录下来自己听，比老师说的更直观。`;
      }
      const next = e.target.closest('#pianoNext');
      if (next) {
        const d = getPianoData(); d.streak += 1; d.xp += 10; d.hp = Math.min(5, d.hp + 1);
        const keys = Object.keys(d.progress); const k = keys[d.xp % keys.length];
        d.progress[k] = Math.min(100, d.progress[k] + 20); setPianoData(d);
        toast('打卡成功！已解锁下一课'); renderPiano();
      }
    }, { once: true });
  }

  /* ---------- 唱歌 ---------- */
  function getSingData() { const p = load(LS.personal, {}); return p.singing || { streak: 0, xp: 0, hp: 5, level: 0, progress: { 练声: 0, 音准: 0, 气息: 0, 节奏: 0 } }; }
  function setSingData(d) { const p = load(LS.personal, {}); p.singing = d; save(LS.personal, p); }
  function renderSinging() {
    const d = getSingData();
    const levels = ['五音不全', '入门', '进阶', '熟练'];
    const units = [{ k: '练声', i: '🎤' }, { k: '音准', i: '🎵' }, { k: '气息', i: '💨' }, { k: '节奏', i: '🥁' }];
    openSubpage('唱歌 🎤', `
      <div class="sub-header"><h2>唱歌 🎤</h2><p>每天先练声，再学一首歌</p></div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-icon">🔥</div><div class="stat-num">${d.streak}</div><div class="stat-label">连续天</div></div>
        <div class="stat-item"><div class="stat-icon">⭐</div><div class="stat-num">${d.xp}</div><div class="stat-label">经验值</div></div>
        <div class="stat-item"><div class="stat-icon">❤️</div><div class="stat-num">${d.hp}</div><div class="stat-label">生命值</div></div>
      </div>
      <div class="diff-tabs">${levels.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-sl="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">🌅 今日练声（5分钟）</h4><div class="vp-wrap"><iframe class="vp-iframe" src="https://www.bilibili.com/video/BV1zA411b7cR" allowfullscreen></iframe></div></div>
      <div class="card"><h4 style="margin:0 0 10px;">🎵 今日教学</h4><p style="font-size:13px;color:var(--text-secondary);">零基础从「ma-ma-ma」音阶练习开始，再跟唱《小星星》C调版。</p><button class="btn-outline" id="singRefresh" style="width:100%;margin-top:10px;">🔄 根据进度换一首歌</button></div>
      <div class="ai-form">
        <label>🎤 AI 唱歌老师 · 描述你练声/发声的问题<input id="singInput" placeholder="如：高音上不去、气息短、跑调…" /></label>
        <button class="btn-primary" style="width:100%;margin-top:10px;" id="singAsk">让 AI 老师听听</button>
        <div id="singResult" class="ai-result hidden" style="margin-top:12px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="singNext">练完打卡，更新进度 →</button>
    `);
    bindSingEvents();
  }
  function bindSingEvents() {
    $('#subpageBody').addEventListener('click', e => {
      const tab = e.target.closest('[data-sl]');
      if (tab) { const d = getSingData(); d.level = Number(tab.dataset.sl); setSingData(d); renderSinging(); }
      const refresh = e.target.closest('#singRefresh'); if (refresh) { toast('已根据你的进度推荐下一首练习曲'); }
      const ask = e.target.closest('#singAsk');
      if (ask) {
        const q = $('#singInput').value.trim(); if (!q) { toast('请先描述问题'); return; }
        const res = $('#singResult'); res.classList.remove('hidden');
        res.innerHTML = `<b>AI 唱歌老师反馈：</b><br/>针对「${esc(q)}」：<br/>① 每天做「打嘟」唇颤音 2 分钟放松声带；<br/>② 用钢琴或 App 找基准音，跟唱 do-re-mi；<br/>③ 录下来对比原唱，找出偏差的音。`;
      }
      const next = e.target.closest('#singNext');
      if (next) {
        const d = getSingData(); d.streak += 1; d.xp += 10; d.hp = Math.min(5, d.hp + 1);
        const keys = Object.keys(d.progress); const k = keys[d.xp % keys.length];
        d.progress[k] = Math.min(100, d.progress[k] + 20); setSingData(d);
        toast('练声打卡成功！'); renderSinging();
      }
    }, { once: true });
  }

  /* ---------- 英语 ---------- */
  const WORD_BANK = {
    入门: [
      { en: 'apple', phonetic: '/ˈæp.əl/', mean: '苹果' }, { en: 'book', phonetic: '/bʊk/', mean: '书' },
      { en: 'cat', phonetic: '/kæt/', mean: '猫' }, { en: 'dog', phonetic: '/dɒɡ/', mean: '狗' },
      { en: 'water', phonetic: '/ˈwɔː.tər/', mean: '水' }, { en: 'hello', phonetic: '/həˈləʊ/', mean: '你好' },
      { en: 'thank', phonetic: '/θæŋk/', mean: '感谢' }, { en: 'happy', phonetic: '/ˈhæp.i/', mean: '开心的' }
    ],
    初级: [
      { en: 'weather', phonetic: '/ˈweð.ər/', mean: '天气' }, { en: 'journey', phonetic: '/ˈdʒɜː.ni/', mean: '旅行' },
      { en: 'delicious', phonetic: '/dɪˈlɪʃ.əs/', mean: '美味的' }, { en: 'friendship', phonetic: '/ˈfrend.ʃɪp/', mean: '友谊' }
    ],
    中级: [
      { en: 'environment', phonetic: '/ɪnˈvaɪ.rən.mənt/', mean: '环境' }, { en: 'opportunity', phonetic: '/ˌɒp.əˈtʃuː.nɪ.ti/', mean: '机会' },
      { en: 'responsibility', phonetic: '/rɪˌspɒn.sɪˈbɪl.ɪ.ti/', mean: '责任' }, { en: 'confidence', phonetic: '/ˈkɒn.fɪ.dəns/', mean: '自信' }
    ],
    高级: [
      { en: 'sustainable', phonetic: '/səˈsteɪ.nə.bəl/', mean: '可持续的' }, { en: 'perspective', phonetic: '/pəˈspek.tɪv/', mean: '视角' },
      { en: 'controversial', phonetic: '/ˌkɒn.trəˈvɜː.ʃəl/', mean: '有争议的' }, { en: 'entrepreneur', phonetic: '/ˌɒn.trə.prəˈnɜːr/', mean: '企业家' }
    ]
  };
  const ENGLISH_LEVELS = ['入门', '初级', '中级', '高级'];
  function getEngData() { const p = load(LS.personal, {}); return p.english || { level: 0, streak: 0, xp: 0, hp: 5, map: { 词汇: 0, 听力: 0, 默写: 0, 口语: 0, 语法: 0, 综合: 0 }, today: { done: false, words: [] }, srs: [] }; }
  function setEngData(d) { const p = load(LS.personal, {}); p.english = d; save(LS.personal, p); }
  function renderEnglish() {
    const d = getEngData();
    const mapKeys = Object.keys(d.map);
    openSubpage('英语学习 🌍', `
      <div class="sub-header"><h2>英语学习 🌍</h2><p>场景化闯关 · 当前难度「${ENGLISH_LEVELS[d.level]}」</p></div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-icon">🔥</div><div class="stat-num">${d.streak}</div><div class="stat-label">连续天</div></div>
        <div class="stat-item"><div class="stat-icon">⭐</div><div class="stat-num">${d.xp}</div><div class="stat-label">经验值</div></div>
        <div class="stat-item"><div class="stat-icon">❤️</div><div class="stat-num">${d.hp}</div><div class="stat-label">生命值</div></div>
      </div>
      <div style="font-size:13px;font-weight:700;margin:0 0 8px 4px;">难度等级</div>
      <div class="diff-tabs">${ENGLISH_LEVELS.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-el="${i}">${l}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">🗺️ 学习地图</h4><div class="map-row">${mapKeys.map(k => `<div class="map-circle ${d.map[k] >= 100 ? 'done' : ''}"><div class="map-icon">${engIcon(k)}</div><div class="map-label">${k}</div><div class="map-pct">${d.map[k]}%</div></div>`).join('')}</div></div>
      <div class="menu-row" data-epage="word"><div class="menu-row-left"><div class="menu-row-icon">📖</div><div class="menu-row-title">今日学习任务</div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="menu-row" data-epage="listen"><div class="menu-row-left"><div class="menu-row-icon">🎧</div><div class="menu-row-title">听力训练</div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="menu-row" data-epage="speak"><div class="menu-row-left"><div class="menu-row-icon">💬</div><div class="menu-row-title">口语对练</div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="menu-row" data-epage="write"><div class="menu-row-left"><div class="menu-row-icon">✍️</div><div class="menu-row-title">默写错题本</div></div><span style="color:var(--text-tertiary);">›</span></div>
      <div class="menu-row" data-epage="srs"><div class="menu-row-left"><div class="menu-row-icon">🔄</div><div class="menu-row-title">间隔重复复习</div></div><span style="color:var(--text-tertiary);">›</span></div>
    `);
    bindEnglishEvents();
  }
  function engIcon(k) { return { 词汇: 'A', 听力: '🎧', 默写: '✍️', 口语: '💬', 语法: '∠', 综合: '🎯' }[k] || '•'; }
  function bindEnglishEvents() {
    $('#subpageBody').addEventListener('click', e => {
      const tab = e.target.closest('[data-el]');
      if (tab) { const d = getEngData(); d.level = Number(tab.dataset.el); setEngData(d); renderEnglish(); }
      const page = e.target.closest('[data-epage]');
      if (page) renderEnglishPage(page.dataset.epage);
    }, { once: true });
  }
  function renderEnglishPage(page) {
    const d = getEngData();
    if (page === 'word') {
      const words = WORD_BANK[ENGLISH_LEVELS[d.level]] || WORD_BANK['入门'];
      const idx = d.xp % words.length; const w = words[idx];
      openSubpage('今日学习任务', `
        <div class="sub-header"><h2>📖 今日学习任务</h2><p>${ENGLISH_LEVELS[d.level]} · 间隔重复 · 循序渐进</p></div>
        <div class="word-card">
          <div class="word-en">${w.en}</div>
          <div class="word-phonetic">${w.phonetic}</div>
          <div class="word-meaning word-reveal" id="wordMean">${w.mean}</div>
          <button class="btn-outline" id="wordReveal" style="width:100%;">👀 显示释义</button>
        </div>
        <div class="card"><h4 style="margin:0 0 8px;">📝 例句</h4><p style="font-size:13px;color:var(--text-secondary);">This is a simple sentence using the word <b>${w.en}</b>.</p></div>
        <div style="display:flex;gap:10px;">
          <button class="btn-outline" id="engAgain" style="flex:1;">😵 陌生</button>
          <button class="btn-primary" id="engKnow" style="flex:1;">✅ 认识</button>
        </div>
        <p class="plan-tip">词库覆盖小学、BBC、英语三四六级及雅思核心词，难度随等级提升。</p>
      `);
      $('#subpageBody').addEventListener('click', e => {
        if (e.target.closest('#wordReveal')) $('#wordMean').classList.add('show');
        if (e.target.closest('#engAgain')) { const d = getEngData(); d.srs.push({ en: w.en, level: d.level, next: Date.now() + 60000 }); setEngData(d); toast('已加入1分钟后复习'); renderEnglishPage('word'); }
        if (e.target.closest('#engKnow')) {
          const d = getEngData(); d.xp += 5; d.map['词汇'] = Math.min(100, d.map['词汇'] + 5); d.today.done = true;
          d.srs.push({ en: w.en, level: d.level, next: Date.now() + 24 * 3600 * 1000 });
          if (d.map['词汇'] >= 100 && d.level < 3) { d.level += 1; d.map['词汇'] = 0; toast('恭喜升级！'); }
          setEngData(d); toast('太棒了，已记录进度'); renderEnglishPage('word');
        }
      }, { once: true });
    } else if (page === 'listen') {
      openSubpage('听力训练', `
        <div class="sub-header"><h2>🎧 听力训练</h2><p>从慢速短句开始</p></div>
        <div class="card"><h4 style="margin:0 0 10px;">今日听力</h4><p style="font-size:14px;line-height:1.7;">播放三遍，写下你听到的关键词。</p><p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">"The weather is nice today, so I decided to take a walk in the park."</p></div>
        <div class="vp-wrap"><iframe class="vp-iframe" src="https://www.bilibili.com/video/BV1u4411K7jN" allowfullscreen></iframe></div>
        <button class="btn-primary" id="engListenDone" style="width:100%;margin-top:10px;">完成听力打卡</button>
      `);
      $('#subpageBody').addEventListener('click', e => {
        if (e.target.closest('#engListenDone')) { const d = getEngData(); d.map['听力'] = Math.min(100, d.map['听力'] + 10); d.xp += 5; setEngData(d); toast('听力打卡成功'); renderEnglish(); }
      }, { once: true });
    } else if (page === 'speak') {
      openSubpage('口语对练', `
        <div class="sub-header"><h2>💬 口语对练</h2><p>跟读 + 录音 + AI 打分</p></div>
        <div class="card"><h4 style="margin:0 0 8px;">今日跟读句</h4><p style="font-size:16px;font-weight:700;">I would like a cup of tea, please.</p><p style="font-size:13px;color:var(--text-secondary);">我想要一杯茶，谢谢。</p></div>
        <button class="btn-primary" style="width:100%;margin-bottom:10px;" id="engRecord">🎙️ 开始录音</button>
        <div class="ai-result" id="speakResult" style="display:none;"></div>
        <button class="btn-outline" id="engSpeakDone" style="width:100%;margin-top:10px;">完成口语打卡</button>
      `);
      $('#subpageBody').addEventListener('click', e => {
        if (e.target.closest('#engRecord')) { $('#speakResult').style.display = 'block'; $('#speakResult').innerHTML = '<b>AI 口语反馈：</b><br/>发音清晰，重音在「would like」上。建议把「please」读得更轻一些。'; }
        if (e.target.closest('#engSpeakDone')) { const d = getEngData(); d.map['口语'] = Math.min(100, d.map['口语'] + 10); d.xp += 5; setEngData(d); toast('口语打卡成功'); renderEnglish(); }
      }, { once: true });
    } else if (page === 'write') {
      openSubpage('默写错题本', `
        <div class="sub-header"><h2>✍️ 默写错题本</h2><p>拼写不过关的单词自动收录</p></div>
        <div id="writeList">${(d.srs || []).filter(x => x.next <= Date.now()).map(x => `<div class="product-card"><div class="product-info"><h4>${esc(x.en)}</h4><p>难度：${ENGLISH_LEVELS[x.level]}</p></div></div>`).join('') || '<div class="empty">暂无错题</div>'}</div>
        <button class="btn-primary" id="engWriteDone" style="width:100%;margin-top:10px;">完成默写打卡</button>
      `);
      $('#subpageBody').addEventListener('click', e => {
        if (e.target.closest('#engWriteDone')) { const d = getEngData(); d.map['默写'] = Math.min(100, d.map['默写'] + 10); d.xp += 5; setEngData(d); toast('默写打卡成功'); renderEnglish(); }
      }, { once: true });
    } else if (page === 'srs') {
      const now = Date.now();
      const due = (d.srs || []).filter(x => x.next <= now);
      openSubpage('间隔重复复习', `
        <div class="sub-header"><h2>🔄 间隔重复</h2><p>到期的单词：${due.length} 个</p></div>
        ${due.length ? due.map(x => `<div class="product-card"><div class="product-info"><h4>${esc(x.en)}</h4><p>${ENGLISH_LEVELS[x.level]}</p></div><button class="btn-outline" data-srsdone="${esc(x.en)}">记住了</button></div>`).join('') : '<div class="empty">没有到期复习的单词，继续学习新词吧！</div>'}
      `);
      $('#subpageBody').addEventListener('click', e => {
        const btn = e.target.closest('[data-srsdone]');
        if (btn) { const en = btn.dataset.srsdone; const d = getEngData(); d.srs = d.srs.filter(x => x.en !== en); setEngData(d); renderEnglishPage('srs'); toast('复习完成'); }
      }, { once: true });
    }
  }

  /* ---------- 运动 ---------- */
  function renderSport() {
    openSubpage('运动计划 💪', `
      <div class="sub-header"><h2>运动计划 💪</h2><p>八段锦 · 力量拉伸 · 姨妈期友好</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🌅 晨起 · 八段锦 12分钟</h4><p style="font-size:13px;color:var(--text-secondary);">温和唤醒身体，适合每天打卡。</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🌙 晚间 · 拉伸 10分钟</h4><p style="font-size:13px;color:var(--text-secondary);">放松肩颈、腰背，久坐党必做。</p></div>
      <div class="card"><h4 style="margin:0 0 10px;">🩸 姨妈期 · 舒缓版</h4><p style="font-size:13px;color:var(--text-secondary);">只练呼吸+轻柔拉伸，不压迫腹部。</p></div>
      <button class="btn-primary" id="sportCheck" style="width:100%;">今日运动打卡</button>
    `);
    $('#subpageBody').addEventListener('click', e => { if (e.target.closest('#sportCheck')) toast('运动打卡成功！'); }, { once: true });
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
