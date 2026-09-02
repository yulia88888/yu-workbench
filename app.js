(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const todayKeyCN = () => {
    const d = new Date();
    const cn = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    return cn.toISOString().slice(0, 10);
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copyLink = (url) => { if (!url || url === '#') return; navigator.clipboard.writeText(url).then(() => toast('链接已复制 📋')).catch(() => toast('复制失败，请手动复制')); };
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2200); };

  const LS = {
    tasks: 'yu_tasks', check: 'yu_check', daily: 'yu_daily', archive: 'yu_archive', hidden: 'yu_hidden',
    userTopics: 'yu_userTopics', userReposts: 'yu_userReposts', reviews: 'yu_reviews',
    personal: 'yu_personal', historyExtra: 'yu_historyExtra', aipHistory: 'yu_aipHistory', contentHistory: 'yu_contentHistory',
    wardrobe: 'yu_wardrobe'
  };
  const load = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let daily = __EMBEDDED_JSON__;
  let archive = load(LS.archive, { topics: [], reposts: [] });
  let contentHistory = __HISTORY_EMBED__ || {};   // build.py 会把最近历史内联进页面，保证首屏/离线也能看到；网络正常时 fetchHistory 会在后台补齐/更新
  let historyIndex = [];
  let wardrobe = load(LS.wardrobe, []);
  let historyLoading = false, historyError = false, historyDone = false, _idxFetched = false;
  let hidden = load(LS.hidden, []);
  let userTopics = load(LS.userTopics, []);
  let userReposts = load(LS.userReposts, []);

  let topicFilter = '全部', repostFilter = '全部';
  let topicMode = 'today', repostMode = 'today';
  let topicBatch = false, repostBatch = false;
  let topicSel = new Set(), repostSel = new Set();
  let currentView = 'plan';
  let subStack = [];
  let outfitTab = 'today';
  let outfitPref = 'normal'; // cold/normal/hot
  let outfitPendingImg = null;   // 添加衣物时暂存的照片缩略图（dataURL）
  let outfitAiImg = null;        // AI搭配师里随问上传的参考图（dataURL）

  const titles = { plan: '每日计划', topic: '选题灵感', repost: '爆款二创', review: '内容复盘', aiproduct: 'AI爆品', news: '新闻📰', outfit: '穿搭衣橱' };
  const PLATFORMS = ['全部', '抖音', '小红书', '快手', '微博', 'B站'];

  function mergeHist(list, type) {
    const extra = load(LS.historyExtra, { topics: [], reposts: [] })[type] || [];
    const hist = [...(archive[type] || []), ...extra]
      .filter(t => !hidden.includes(t.id)).map(t => ({ ...t, _hist: true }));
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
    if (v === 'aiproduct') renderAiproduct();
    if (v === 'news') renderNews();
    if (v === 'outfit') renderOutfit();
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
    return `<div class="note-card topic-card" data-tid="${esc(t.id)}">
      <div class="note-header">
        <div class="note-num">${num}</div>
        <div class="note-title-wrap">
          <div class="note-title">${esc(t.title)} ${hist}</div>
          <div class="note-tags"><span class="mod-pill topic-pill">🌐 广撒网·全平台热点</span>${pfTag}${tag}</div>
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
    $('#topicTools').classList.toggle('hidden', topicMode !== 'today');
    $('#topicFoot').classList.toggle('hidden', topicMode !== 'today');
    $('#topicBatchBtn').classList.toggle('hidden', topicMode !== 'history');
    if (topicMode === 'history') { renderTopicHistory(); return; }
    const list = allTopics().filter(t => topicFilter === '全部' || t.platform === topicFilter);
    $('#topicCount').textContent = `共 ${list.length} 条`;
    if (!list.length) { $('#topicList').innerHTML = '<div class="empty">暂无内容</div>'; updateBatch('topic'); return; }
    $('#topicList').innerHTML = list.map((t, i) => topicCard(t, i + 1)).join('');
    updateBatch('topic');
    prefetchHistoryIndex(); // 仅预热日期索引（极小），切到「历史」时再按天加载正文
  }
  function renderTopicHistory() {
    const dates = Object.keys(contentHistory || {}).sort().reverse();
    if (dates.length) {
      let html = '';
      dates.forEach(d => {
        const items = (contentHistory[d].topics || []).filter(t => !hidden.includes(t.id));
        if (items.length) html += `<div class="aip-hist-date">📅 ${esc(d)} · 选题 ${items.length} 条</div>` + items.map((t, i) => topicCard({ ...t, _hist: true, seen_date: d }, i + 1)).join('');
      });
      const extra = (load(LS.historyExtra, { topics: [], reposts: [] }).topics) || [];
      if (extra.length) html += `<div class="aip-hist-date">📌 我的收藏（手动存为灵感）</div>` + extra.filter(t => !hidden.includes(t.id)).map((t, i) => topicCard({ ...t, _hist: true }, i + 1)).join('');
      $('#topicCount').textContent = `共 ${dates.length} 天记录`;
      $('#topicList').innerHTML = html || '<div class="empty">暂无历史</div>';
      updateBatch('topic');
      return;
    }
    if (historyLoading) {
      $('#topicList').innerHTML = '<div class="empty">⏳ 正在按天加载历史归档…（每个文件很小，手机秒开）</div>';
      $('#topicCount').textContent = '加载中…';
      updateBatch('topic');
      return;
    }
    if (historyError) {
      $('#topicList').innerHTML = '<div class="empty">⚠️ 历史加载失败（网络波动）。<br><button id="histRetry" class="btn-primary" style="margin-top:10px;">↻ 点此重试</button></div>';
      $('#topicCount').textContent = '加载失败';
      const rb = $('#histRetry'); if (rb) rb.onclick = () => { historyError = false; fetchHistory(true); };
      updateBatch('topic');
      return;
    }
    if (historyDone) {
      $('#topicList').innerHTML = '<div class="empty">暂无历史记录（从今天起每天自动归档，半年可查）</div>';
      $('#topicCount').textContent = '共 0 天';
      updateBatch('topic');
      return;
    }
    fetchHistory(true);
    $('#topicList').innerHTML = '<div class="empty">⏳ 正在按天加载历史归档…（每个文件很小，手机秒开）</div>';
    $('#topicCount').textContent = '加载中…';
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
    return `<div class="note-card repost-card" data-rid="${esc(t.id)}">
      <div class="note-header">
        <div class="note-num">${num}</div>
        <div class="note-title-wrap">
          <div class="note-title">${esc(t.title)} ${hist}</div>
          <div class="note-tags"><span class="mod-pill repost-pill">🎯 为你筛选·二创方案</span>${pfTag}${tag}</div>
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
    $('#repostFoot').classList.toggle('hidden', repostMode !== 'today');
    $('#repostBatchBtn').classList.toggle('hidden', repostMode !== 'history');
    if (repostMode === 'history') { renderRepostHistory(); return; }
    const list = allReposts().filter(t => repostFilter === '全部' || t.platform === repostFilter);
    $('#repostCount').textContent = `共 ${list.length} 条`;
    if (!list.length) { $('#repostList').innerHTML = '<div class="empty">暂无内容</div>'; updateBatch('repost'); return; }
    $('#repostList').innerHTML = list.map((t, i) => repostCard(t, i + 1)).join('');
    updateBatch('repost');
    prefetchHistoryIndex(); // 仅预热日期索引（极小），切到「历史」时再按天加载正文
  }
  function renderRepostHistory() {
    const dates = Object.keys(contentHistory || {}).sort().reverse();
    if (dates.length) {
      let html = '';
      dates.forEach(d => {
        const items = (contentHistory[d].reposts || []).filter(t => !hidden.includes(t.id));
        if (items.length) html += `<div class="aip-hist-date">📅 ${esc(d)} · 二创 ${items.length} 条</div>` + items.map((t, i) => repostCard({ ...t, _hist: true, seen_date: d }, i + 1)).join('');
      });
      const extra = (load(LS.historyExtra, { topics: [], reposts: [] }).reposts) || [];
      if (extra.length) html += `<div class="aip-hist-date">📌 我的收藏（手动存为灵感）</div>` + extra.filter(t => !hidden.includes(t.id)).map((t, i) => repostCard({ ...t, _hist: true }, i + 1)).join('');
      $('#repostCount').textContent = `共 ${dates.length} 天记录`;
      $('#repostList').innerHTML = html || '<div class="empty">暂无历史</div>';
      updateBatch('repost');
      return;
    }
    if (historyLoading) {
      $('#repostList').innerHTML = '<div class="empty">⏳ 正在按天加载历史归档…（每个文件很小，手机秒开）</div>';
      $('#repostCount').textContent = '加载中…';
      updateBatch('repost');
      return;
    }
    if (historyError) {
      $('#repostList').innerHTML = '<div class="empty">⚠️ 历史加载失败（网络波动）。<br><button id="histRetryR" class="btn-primary" style="margin-top:10px;">↻ 点此重试</button></div>';
      $('#repostCount').textContent = '加载失败';
      const rb = $('#histRetryR'); if (rb) rb.onclick = () => { historyError = false; fetchHistory(true); };
      updateBatch('repost');
      return;
    }
    if (historyDone) {
      $('#repostList').innerHTML = '<div class="empty">暂无历史记录（从今天起每天自动归档，半年可查）</div>';
      $('#repostCount').textContent = '共 0 天';
      updateBatch('repost');
      return;
    }
    fetchHistory(true);
    $('#repostList').innerHTML = '<div class="empty">⏳ 正在按天加载历史归档…（每个文件很小，手机秒开）</div>';
    $('#repostCount').textContent = '加载中…';
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
    const otab = e.target.closest('[data-otab]');
    if (otab) { renderOutfitTab(otab.dataset.otab); return; }
    const opref = e.target.closest('[data-opref]');
    if (opref) { outfitPref = opref.dataset.opref; renderOutfitTab('today'); return; }
    if (e.target.closest('[data-ogen]')) { generateOutfitByTemp(); return; }
    if (e.target.closest('[data-oadd]')) { addOutfitItem(); return; }
    if (e.target.closest('[data-obasic]')) { generateBasicWardrobe(); return; }
    const odel = e.target.closest('[data-odel]');
    if (odel) { deleteOutfitItem(odel.dataset.odel); return; }
    if (e.target.closest('[data-orefresh]')) { renderOutfitTab('fitting'); return; }
    if (e.target.closest('[data-oaiask]')) { outfitAIAsk(); return; }
    const oimgc = e.target.closest('[data-oimgclear]');
    if (oimgc) { outfitPendingImg = null; const w = $('#outfitImgPreview'); if (w) { w.style.display = 'none'; w.innerHTML = ''; } const fi = $('#outfitImg'); if (fi) fi.value = ''; return; }
    const oaiimgc = e.target.closest('[data-oaiimgclear]');
    if (oaiimgc) { outfitAiImg = null; const w = $('#outfitAiImgPreview'); if (w) { w.style.display = 'none'; w.innerHTML = ''; } const fi = $('#outfitAiImg'); if (fi) fi.value = ''; return; }
    // 穿搭页内嵌 AI 设置：直接保存到 yu_ai_cfg（与唱歌模块共用同一份配置）
    if (e.target.closest('[data-oaisave]')) {
      const base = ($('#oaiBase')?.value || '').trim();
      const key = ($('#oaiKey')?.value || '').trim();
      const model = ($('#oaiModel')?.value || '').trim();
      const visionModel = ($('#oaiVisionModel')?.value || '').trim();
      if (!key) { toast('请先把 Key 粘进第二行'); return; }
      if (!base) { toast('请填写 API 地址'); return; }
      if (!model) { toast('请填写文字模型名'); return; }
      localStorage.setItem('yu_ai_cfg', JSON.stringify({ base, key, model, visionModel }));
      const tip = $('#oaiSaveTip');
      if (tip) tip.innerHTML = '✅ 已保存到本机浏览器（唱歌模块共用同一份，不用再填一次）<br/>🧠 文字：<b>' + esc(model) + '</b>　👁️ 看图：<b>' + esc(visionModel || model) + '</b>';
      toast('AI 设置已保存 ✅');
      return;
    }
    // 穿搭页「一键打开 AI 设置」：自动进唱歌子页 → 切到「AI 点评」标签 → 展开折叠面板 → 滚过去
    if (e.target.closest('[data-oaisettings]')) {
      try { renderSinging(); } catch (err) { console.warn('open sing failed', err); }
      setTimeout(() => {
        try { switchSingTab('review'); } catch (err) {}
        const det = document.querySelector('.ai-settings');
        if (det) { det.open = true; try { det.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) {} }
      }, 150);
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'outfitName') { addOutfitItem(); return; }
    if (e.target.id === 'outfitTemp') { generateOutfitByTemp(); return; }
    if (e.target.id === 'outfitAiInput') { outfitAIAsk(); return; }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'outfitImg') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      fileToThumb(f, url => {
        outfitPendingImg = url;
        const wrap = $('#outfitImgPreview');
        if (wrap) { wrap.style.display = ''; wrap.innerHTML = url ? `<img class="outfit-thumb" src="${url}" alt="" /><button class="outfit-thumb-del" data-oimgclear>✕</button>` : ''; }
      });
    } else if (e.target.id === 'outfitAiImg') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      fileToThumb(f, url => {
        outfitAiImg = url;
        const wrap = $('#outfitAiImgPreview');
        if (wrap) { wrap.style.display = ''; wrap.innerHTML = url ? `<img class="outfit-thumb" src="${url}" alt="" /><button class="outfit-thumb-del" data-oaiimgclear>✕</button>` : ''; }
      });
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
    stopAllAISessions();
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
  function replaceSubpage(title, html) {
    if (subStack.length) subStack.pop();
    subStack.push({ title, html });
    $('#viewTitle').textContent = title;
    $('#subpageBody').innerHTML = html;
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
    stopAllAISessions();
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
  $('#content').addEventListener('click', e => {
    const t = e.target.closest('[data-aiptime]');
    if (t) { aipTime = t.dataset.aiptime; renderAiproduct(); return; }
    const p = e.target.closest('[data-aipplat]');
    if (p) { aipPlat = p.dataset.aipplat; renderAiproduct(); return; }
    const n = e.target.closest('[data-newscat]');
    if (n) { newsCat = n.dataset.newscat; renderNews(); return; }
    const newsCheckin = e.target.closest('#newsCheckin');
    if (newsCheckin) {
      newsCheckin.textContent = '✅ 今日已打卡';
      newsCheckin.disabled = true;
      newsCheckin.classList.add('disabled');
      toast('今日要闻打卡成功！坚持读报，眼界更开阔～');
      const d = load(LS.plan, {});
      d.newsCheckin = daily.date;
      save(LS.plan, d);
      return;
    }
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
    attachSkinEvents(tab);
  }
  function attachSkinEvents(tab) {
    if (tab === 'products') {
      const add = $('#skinAddProd');
      if (add) add.addEventListener('click', (e) => { e.stopPropagation(); openSkinAddSheet(); });
      $$('#skinBody [data-delprod]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.delprod;
        const s = getSkinData(); s.products = s.products.filter(p => p.id !== id); setSkinData(s); renderSkinTab('products'); toast('已删除');
      }));
      const gen2 = $('#skinGenRoutine2');
      if (gen2) gen2.addEventListener('click', (e) => { e.stopPropagation(); generateSkinRoutine(); });
      const gen1 = $('#skinGenRoutine');
      if (gen1) gen1.addEventListener('click', (e) => { e.stopPropagation(); generateSkinRoutine(); });
    }
    if (tab === 'quiz') {
      const start = $('#skinStartQuiz');
      if (start) start.addEventListener('click', (e) => { e.stopPropagation(); openSkinQuizSheet(); });
    }
    if (tab === 'diary') {
      $$('#skinBody .mood-item').forEach(el => el.addEventListener('click', (e) => {
        e.stopPropagation();
        $$('#skinBody .mood-item').forEach(x => x.classList.toggle('active', x === el));
        $('#skinBody').dataset.mood = el.dataset.mood;
      }));
      $$('#skinBody [data-dtag]').forEach(el => el.addEventListener('click', (e) => {
        e.stopPropagation(); el.classList.toggle('active');
      }));
      const save = $('#skinSaveDiary');
      if (save) save.addEventListener('click', (e) => { e.stopPropagation(); saveSkinDiary(); });
    }
    if (tab === 'massage') {
      $$('#skinBody .massage-item').forEach(el => el.addEventListener('click', (e) => {
        e.stopPropagation(); openMassagePlay(el.dataset.massage);
      }));
      const match = $('#massageMatch');
      if (match) match.addEventListener('click', (e) => { e.stopPropagation(); toast('已为你匹配「去水肿+提亮」组合方案'); });
    }
  }
  function generateSkinRoutine() {
    const s = getSkinData(); const prods = s.products || [];
    s.routine = prods.length ? prods.map(p => `${p.freq}：${p.name}`) : ['晨间：清水→精华→防晒', '晚间：卸妆→洁面→保湿→眼霜'];
    setSkinData(s); renderSkinTab('routine'); toast('已生成一周模式 ✨');
  }
  function openSkinAddSheet() {
    openSheet('添加护肤品', `
      <form id="prodForm">
        <div class="sheet-field"><label>产品名称<input name="name" required placeholder="如：珀莱雅双抗精华" /></label></div>
        <div class="sheet-field"><label>类型<input name="type" placeholder="如：精华 / 面霜 / 防晒" /></label></div>
        <div class="sheet-field"><label>使用频率<input name="freq" placeholder="如：每日早晚 / 每周2次" /></label></div>
        <button type="button" id="sheetSave" class="sheet-save">保存</button>
      </form>
    `);
    const btn = $('#sheetSave');
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      const form = $('#prodForm');
      if (form && !form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      const s = getSkinData(); s.products = s.products || [];
      s.products.push({ id: uid(), name: fd.get('name'), type: fd.get('type'), freq: fd.get('freq') });
      setSkinData(s); renderSkinTab('products'); toast('已添加'); closeSheet();
    };
  }
  function openSkinQuizSheet() {
    openSheet('肤质测试', `
      <form id="quizForm">
        <div class="sheet-field"><label>洗完脸后不涂护肤品，1小时后感觉？<select name="q1"><option>紧绷、起皮</option><option>T区油、两颊干</option><option>全脸都油</option><option>没什么感觉</option></select></label></div>
        <div class="sheet-field"><label>换季或换产品时容易泛红刺痛？<select name="q2"><option>经常</option><option>偶尔</option><option>很少</option></select></label></div>
        <div class="sheet-field"><label>最困扰你的皮肤问题？<select name="q3"><option>干燥细纹</option><option>出油痘痘</option><option>敏感泛红</option><option>暗沉暗黄</option></select></label></div>
        <button type="button" id="sheetSave" class="sheet-save">查看结果</button>
      </form>
    `);
    const btn = $('#sheetSave');
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      const form = $('#quizForm');
      if (form && !form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      const a1 = fd.get('q1'), a2 = fd.get('q2'), a3 = fd.get('q3');
      let result = '混合偏干敏感肌', advice = '早晚分区护理：T区控油、两颊保湿，选无酒精、含神经酰胺的产品，慎用高浓度酸。';
      if (a1.includes('全脸都油')) { result = '油性耐受肌'; advice = '注重清洁+控油+防晒，可适度用酸，避免过度封闭的面霜。'; }
      else if (a1.includes('紧绷')) { result = '干性敏感肌'; advice = '以保湿修护为主，避免皂基洁面，叠加面霜/油类产品锁水。'; }
      else if (a2 === '经常') { result = '敏感性肌肤'; advice = '精简护肤，停用功效型产品，优先修护屏障。'; }
      const s = getSkinData(); s.quiz = { result, advice, date: todayKeyCN() }; setSkinData(s); renderSkinTab('quiz'); toast('测试完成'); closeSheet();
    };
  }
  function saveSkinDiary() {
    const mood = Number($('#skinBody').dataset.mood || 3);
    const tags = $$('#skinBody .chip.active').map(c => c.dataset.dtag);
    const note = $('#diaryNote').value.trim();
    const s = getSkinData(); s.diary = s.diary || [];
    s.diary.push({ date: todayKeyCN(), mood, tags, note });
    setSkinData(s); renderSkinTab('diary'); toast('日记已保存');
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
    // 返回按钮：统一返回上一步（pop 子页面栈）
    const back = e.target.closest('[data-back], [data-mback], [data-engback], [data-plback], [data-slback]');
    if (back) { $('#backBtn').click(); return; }
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
        const s = getSkinData(); s.quiz = { result, advice, date: todayKeyCN() }; setSkinData(s); renderSkinTab('quiz'); toast('测试完成');
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
      const s = getSkinData(); s.diary = s.diary || []; s.diary.push({ date: todayKeyCN(), mood, tags, note });
      setSkinData(s); renderSkinTab('diary'); toast('日记已保存'); return;
    }
    if (handleVideoControls(e)) return;
    const mass = e.target.closest('[data-massage]');
    if (mass) { openMassagePlay(mass.dataset.massage); return; }
    const match = e.target.closest('#massageMatch');
    if (match) { toast('已为你匹配「去水肿+提亮」组合方案'); return; }

    // ---------- 电子琴 ----------
    const pTab = e.target.closest('[data-pl]');
    if (pTab) {
      const lv = Number(pTab.dataset.pl); const d = getPianoData();
      if (lv > d.level) { toast('🔒 继续练习当前阶段，练满后自动解锁下一阶'); return; }
      d.level = lv; setPianoData(d); renderPiano(); return;
    }
    const pianoMic = e.target.closest('#pianoMic');
    if (pianoMic) {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { toast('当前浏览器不支持语音输入'); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = ev => { const t = ev.results[0][0].transcript; aiCoachReply(t, $('#pianoResult'), 'piano'); };
      rec.onerror = () => toast('语音识别失败，请重试');
      toast('请说出你的问题…'); rec.start(); return;
    }
    const pianoGuide = e.target.closest('#pianoGuide');
    if (pianoGuide) { voiceGuideOn = !voiceGuideOn; pianoGuide.textContent = voiceGuideOn ? '🔊 语音指导：开' : '🔇 语音指导：关'; if (voiceGuideOn) speakGuide('语音指导已开启'); return; }
    const pianoListen = e.target.closest('#pianoListen');
    if (pianoListen) { startPianoListen(); return; }
    const pianoStop = e.target.closest('#pianoStop');
    if (pianoStop) { stopPianoListen(); return; }
    const pianoCamStart = e.target.closest('#pianoCamStart');
    if (pianoCamStart) { startPianoCam(); return; }
    const pianoCamStop = e.target.closest('#pianoCamStop');
    if (pianoCamStop) { stopPianoCam(); return; }
    const vkKey = e.target.closest('.vk-white, .vk-black');
    if (vkKey) {
      playNote(Number(vkKey.dataset.freq));
      vkKey.classList.add('active'); setTimeout(() => vkKey.classList.remove('active'), 150);
      if (window.__vkTarget) {
        const hint = $('#vkHint'); window.__vkInput.push(vkKey.dataset.note);
        if (window.__vkInput.length >= window.__vkTarget.length) {
          const ok = window.__vkInput.every((n, i) => n === window.__vkTarget[i]);
          hint.innerHTML = ok ? '🎉 完全正确！音阶弹对了～' : '❌ 顺序或音错了，正确答案是 C→D→E→F→G，再试一次';
          if (!ok) window.__vkInput = [];
        } else { hint.innerHTML = '继续弹：<b>' + window.__vkTarget.slice(window.__vkInput.length).join(' → ') + '</b>'; }
      }
      return;
    }
    const vkTest = e.target.closest('#vkTest');
    if (vkTest) { window.__vkTarget = ['C4', 'D4', 'E4', 'F4', 'G4']; window.__vkInput = []; $('#vkHint').innerHTML = '请依次弹：<b>C → D → E → F → G</b>'; return; }
    const pMap = e.target.closest('[data-map^="piano:"]');
    if (pMap) { const k = pMap.dataset.map.split(':')[1]; renderPianoModule(k); return; }
    const pModCheck = e.target.closest('[data-modcheck^="piano:"]');
    if (pModCheck) { const k = pModCheck.dataset.modcheck.split(':')[1]; const d = getPianoData(); d.progress[k] = Math.min(100, (d.progress[k] || 0) + 15); d.xp += 5; setPianoData(d); toast(`${k} +15%`); renderPianoModule(k); return; }
    // 钢琴「看/听」与语音问逻辑见上方 #pianoMic / #pianoListen / #pianoCamStart；文字回复统一由 aiCoachReply 处理
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
    const sModCheck = e.target.closest('[data-modcheck^="sing:"]');
    if (sModCheck) { const k = sModCheck.dataset.modcheck.split(':')[1]; const d = getSingData(); d.progress[k] = Math.min(100, (d.progress[k] || 0) + 15); d.xp += 5; setSingData(d); toast(`${k} +15%`); renderSingModule(k); return; }
    const singTabBtn = e.target.closest('[data-singtab]');
    if (singTabBtn) { switchSingTab(singTabBtn.dataset.singtab); return; }
    const sTarget = e.target.closest('[data-singtarget]');
    if (sTarget) { setSingTarget(Number(sTarget.dataset.singtarget), sTarget); return; }
    const singListen = e.target.closest('#singListen');
    if (singListen) { startSingListen(); return; }
    const singStop = e.target.closest('#singStop');
    if (singStop) { stopSingListen(); return; }
    const singCamStart = e.target.closest('#singCamStart');
    if (singCamStart) { startSingCam(); return; }
    const singCamStop = e.target.closest('#singCamStop');
    if (singCamStop) { stopSingCam(); return; }
    const scaleMode = e.target.closest('[data-scalemode]');
    if (scaleMode) {
      const st = window.__aiState.sing;
      if (st.scaleOn) stopScaleTrain(false);
      st.mode = scaleMode.dataset.scalemode;
      $$('[data-scalemode]').forEach(b => b.classList.toggle('active', b === scaleMode));
      $('#scaleRangeBox').style.display = (st.mode === 'song' || st.mode === 'custom') ? 'none' : '';
      $('#customBox').classList.toggle('hidden', st.mode !== 'custom');
      rebuildScaleTrack();
      return;
    }
    const scaleRange = e.target.closest('[data-scaling]');
    if (scaleRange) {
      const st = window.__aiState.sing;
      if (st.scaleOn) stopScaleTrain(false);
      st.range = scaleRange.dataset.scaling;
      $$('[data-scaling]').forEach(b => b.classList.toggle('active', b === scaleRange));
      rebuildScaleTrack();
      return;
    }
    const customLoad = e.target.closest('#customLoad');
    if (customLoad) {
      const st = window.__aiState.sing;
      const text = $('#customSongInput') && $('#customSongInput').value.trim();
      if (!text) { toast('请先粘贴「歌名 + 简谱」'); return; }
      const r = parseCustomSong(text);
      if (!r.seq.length) { toast('没解析到音符，检查格式（每行：歌词 空格 数字）'); return; }
      st.customList = r.seq; st.mode = 'custom';
      $('#customBox').classList.add('hidden');
      $('#customName').classList.remove('hidden');
      $('#customName').innerHTML = '🎵 正在练：<b>' + esc(r.name) + '</b>（共 ' + r.seq.length + ' 个字，自动按较少的一方对齐）';
      startScaleTrain();
      return;
    }
    const scaleStart = e.target.closest('#scaleStart');
    if (scaleStart) { startScaleTrain(); return; }
    const scaleStop = e.target.closest('#scaleStop');
    if (scaleStop) { stopScaleTrain(false);  return; }
    const singAsk = e.target.closest('#singAsk');
    if (singAsk) {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { toast('当前浏览器不支持语音输入'); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = ev => { const t = ev.results[0][0].transcript; aiCoachReply(t, $('#singResult'), 'sing'); };
      rec.onerror = () => toast('语音识别失败，请重试');
      toast('请说出你的问题…'); rec.start(); return;
    }
    const singGuide = e.target.closest('#singGuide');
    if (singGuide) { voiceGuideOn = !voiceGuideOn; singGuide.textContent = voiceGuideOn ? '🔊 语音指导：开' : '🔇 语音指导：关'; if (voiceGuideOn) speakGuide('语音指导已开启'); return; }
    const aiSave = e.target.closest('#aiSave');
    if (aiSave) { saveAiConfig(); return; }
    const reviewMode = e.target.closest('[data-reviewmode]');
    if (reviewMode) {
      const st = window.__aiState.sing;
      st.mode = reviewMode.dataset.reviewmode;
      $$('[data-reviewmode]').forEach(b => b.classList.toggle('active', b === reviewMode));
      $('#reviewCustomBox').classList.toggle('hidden', st.mode !== 'custom');
      const rn = $('#reviewName'); rn.classList.remove('hidden');
      if (st.mode === 'scale') rn.innerHTML = '🎼 曲目：音阶 do-re-mi（中音区）';
      else if (st.mode === 'song') rn.innerHTML = '🎵 曲目：小星星';
      else rn.innerHTML = '✏️ 请在上方粘贴「歌名 + 简谱」后点载入';
      st.reviewName = st.mode === 'custom' ? '自定义歌曲' : (st.mode === 'song' ? '小星星' : '音阶练习');
      return;
    }
    const reviewCustomLoad = e.target.closest('#reviewCustomLoad');
    if (reviewCustomLoad) {
      const st = window.__aiState.sing;
      const text = $('#reviewCustomInput') && $('#reviewCustomInput').value.trim();
      if (!text) { toast('请先粘贴「歌名 + 简谱」'); return; }
      const r = parseCustomSong(text);
      if (!r.seq.length) { toast('没解析到音符，检查格式（每行：歌词 空格 数字）'); return; }
      st.customList = r.seq; st.mode = 'custom'; st.reviewName = r.name;
      $('#reviewName').classList.remove('hidden');
      $('#reviewName').innerHTML = '🎵 正在评：<b>' + esc(r.name) + '</b>（共 ' + r.seq.length + ' 个字）';
      return;
    }
    const reviewCustomAi = e.target.closest('#reviewCustomAi');
    if (reviewCustomAi) { aiGenerateCustomSong(reviewCustomAi); return; }
    const reviewStart = e.target.closest('#reviewStart');
    if (reviewStart) { startReview(); return; }
    const reviewStop = e.target.closest('#reviewStop');
    if (reviewStop) { stopReview(); return; }
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
      window.__dailyTasks = tasks;
      const idx = Number(doTask.dataset.dotask);
      const t = tasks[idx];
      if (!t) return;
      if (t.type === 'new') renderEnglishWord(t.en, idx, true);
      else if (t.type === 'review') renderEnglishReviewQuiz(t.en, idx, true);
      else renderEnglishDictation(t.en, idx, true);
      return;
    }
    const knowNew = e.target.closest('[data-knownew]');
    if (knowNew) {
      const en = knowNew.dataset.knownew;
      const taskIdx = Number(knowNew.dataset.taskidx || -1);
      const info = getWordInfo(en);
      ensureWordState(info, info.levelIdx);
      updateWordState(en, w => { w.lastPracticed = todayKey(); });
      const s = getEngState(); s.xp += 5; s.map['词汇'] = Math.min(100, s.map['词汇'] + 5); setEngState(s);
      checkEngLevelAdjust(85);
      toast('太棒了，已记录进度');
      if (taskIdx >= 0) goNextTask(taskIdx);
      else renderEnglishTasks();
      return;
    }
    const speakBtn = e.target.closest('[data-speak]');
    if (speakBtn) { speakText(speakBtn.dataset.speak); return; }
    const goNextBtn = e.target.closest('[data-gonext]');
    if (goNextBtn) { goNextTask(Number(goNextBtn.dataset.gonext)); return; }
    const checkSpell = e.target.closest('[data-checkspell]');
    if (checkSpell) {
      const en = checkSpell.dataset.checkspell;
      const taskIdx = Number(checkSpell.dataset.taskidx || -1);
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
        if (taskIdx >= 0) { setTimeout(() => goNextTask(taskIdx), 500); return; }
      } else if (diff <= 1) {
        fb.innerHTML = `<b>差一点点！</b><br/>正确拼写是 <b>${correct}</b><br/>💡 ${info.memoryTip.text}`;
        updateWordState(en, w => { w.lastPracticed = todayKey(); });
        accuracy = 70;
        checkSpell.textContent = '继续下一个 →';
        checkSpell.dataset.gonext = taskIdx;
        delete checkSpell.dataset.checkspell;
      } else {
        fb.innerHTML = `<b style="color:#C62828;">❌ 拼写错误</b><br/>正确拼写是 <b>${correct}</b><br/>💡 ${info.memoryTip.text}<br/>常见错误：漏字母或多字母`;
        updateWordState(en, w => { w.consecutiveCorrect = 0; w.wrongCount++; w.lastPracticed = todayKey(); w.wrongSpellings.push(val); });
        const s = getEngState(); s.hp = Math.max(1, s.hp - 1); setEngState(s);
        accuracy = 30;
        checkSpell.textContent = '继续下一个 →';
        checkSpell.dataset.gonext = taskIdx;
        delete checkSpell.dataset.checkspell;
      }
      checkEngLevelAdjust(accuracy);
      return;
    }
    const listenPlay = e.target.closest('[data-listenplay]');
    if (listenPlay) {
      const idx = Number(listenPlay.dataset.listenplay);
      const s = getEngState();
      const item = englishCurriculum[ENGLISH_LEVELS[s.level]].listen[idx];
      speakText(item.text, 'en-US', 0.85);
      toast('正在朗读…');
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
    const speakStart = e.target.closest('#speakStart');
    if (speakStart) {
      window.__speakPhase = 'dialog';
      const inp = $('#speakInput'); inp.disabled = false; inp.placeholder = '输入你的回复，或点麦克风说话…';
      $('#speakMic').disabled = false; $('#speakSend').disabled = false;
      speakStart.style.display = 'none';
      const sc = speakScenarios[window.__speakScene];
      const chat = $('#speakChat');
      const b = document.createElement('div'); b.className = 'chat-bubble chat-ai'; b.textContent = sc.steps[0].ai; chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
      inp.focus();
      return;
    }
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
      renderEnglishDictation(all[0].en, -1);
      return;
    }
    const doReview = e.target.closest('[data-doreview]');
    if (doReview) { renderEnglishReviewQuiz(doReview.dataset.doreview, -1); return; }
    const checkReview = e.target.closest('[data-checkreview]');
    if (checkReview) {
      const en = checkReview.dataset.checkreview;
      const taskIdx = Number(checkReview.dataset.taskidx || -1);
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
      if (taskIdx >= 0) setTimeout(() => goNextTask(taskIdx), 500);
      else renderEnglishReview();
      return;
    }
    const completeBtn = e.target.closest('[data-complete]');
    if (completeBtn) {
      const words = window.__dailyNewWords || [];
      if (!words.length) { toast('今天没有新词可巩固'); return; }
      const mode = completeBtn.dataset.complete;
      if (mode === 'dictation') renderEnglishDailyDictation(words, 0, true);
      else if (mode === 'listen') renderEnglishDailyListen(words, 0, true);
      else if (mode === 'grammar') renderEnglishDailyGrammar(words, 0, true);
      return;
    }
    const dailyDict = e.target.closest('[data-dailydict]');
    if (dailyDict) {
      const en = dailyDict.dataset.dailydict;
      const idx = Number(dailyDict.dataset.idx);
      const total = Number(dailyDict.dataset.total);
      const input = $('#dailyDictInput');
      const fb = $('#dailyDictFeedback');
      const val = input ? input.value.trim().toLowerCase() : '';
      fb.style.display = 'block';
      if (val === en.toLowerCase()) {
        fb.innerHTML = '<b style="color:#2E7D32;">✅ 正确</b>';
        const s = getEngState(); s.xp += 3; setEngState(s);
        checkEngLevelAdjust(90);
        if (idx + 1 < total) setTimeout(() => renderEnglishDailyDictation(window.__dailyNewWords, idx + 1), 500);
        else { toast('默写巩固完成'); setTimeout(() => renderEnglishDailyComplete(), 500); }
      } else {
        fb.innerHTML = `<b style="color:#C62828;">❌ 正确拼写是 ${en}</b>`;
        const s = getEngState(); s.hp = Math.max(1, s.hp - 1); setEngState(s);
      }
      return;
    }
    const dailyListen = e.target.closest('[data-dailylisten]');
    if (dailyListen) {
      const en = dailyListen.dataset.dailylisten;
      const idx = Number(dailyListen.dataset.idx);
      const total = Number(dailyListen.dataset.total);
      const input = $('#dailyListenInput');
      const fb = $('#dailyListenFeedback');
      const val = input ? input.value.trim().toLowerCase() : '';
      fb.style.display = 'block';
      if (val === en.toLowerCase()) {
        fb.innerHTML = '<b style="color:#2E7D32;">✅ 正确</b>';
        const s = getEngState(); s.xp += 3; setEngState(s);
        checkEngLevelAdjust(90);
        if (idx + 1 < total) setTimeout(() => renderEnglishDailyListen(window.__dailyNewWords, idx + 1), 500);
        else { toast('听写巩固完成'); setTimeout(() => renderEnglishDailyComplete(), 500); }
      } else {
        fb.innerHTML = `<b style="color:#C62828;">❌ 正确是 ${en}</b>`;
        const s = getEngState(); s.hp = Math.max(1, s.hp - 1); setEngState(s);
      }
      return;
    }
    const dailyGrammar = e.target.closest('[data-dailygrammar]');
    if (dailyGrammar) {
      const en = dailyGrammar.dataset.dailygrammar;
      const idx = Number(dailyGrammar.dataset.idx);
      const total = Number(dailyGrammar.dataset.total);
      const input = $('#dailyGrammarInput');
      const fb = $('#dailyGrammarFeedback');
      const val = input ? input.value.trim().toLowerCase() : '';
      fb.style.display = 'block';
      if (val === en.toLowerCase()) {
        fb.innerHTML = '<b style="color:#2E7D32;">✅ 正确</b>';
        const s = getEngState(); s.xp += 3; s.map['语法'] = Math.min(100, s.map['语法'] + 5); setEngState(s);
        checkEngLevelAdjust(90);
        if (idx + 1 < total) setTimeout(() => renderEnglishDailyGrammar(window.__dailyNewWords, idx + 1), 500);
        else { toast('语法运用完成'); setTimeout(() => renderEnglishDailyComplete(), 500); }
      } else {
        fb.innerHTML = `<b style="color:#C62828;">❌ 正确是 ${en}</b>`;
        const s = getEngState(); s.hp = Math.max(1, s.hp - 1); setEngState(s);
      }
      return;
    }
    const placementSubmit = e.target.closest('#engPlacementSubmit');
    if (placementSubmit) {
      let score = 0;
      $$('.placement-ans').forEach(inp => {
        if (inp.value.trim().toLowerCase() === inp.dataset.ans.toLowerCase()) score++;
      });
      const s = getEngState();
      // 自测只升不降：根据答对题数给出建议等级，但不会把已手动/自动升到的高级降回去
      const recommended = score === 3 ? 2 : score === 2 ? 1 : 0;
      const oldLevel = s.level;
      s.level = Math.max(oldLevel, recommended);
      s.placementDone = true;
      s.xp += score * 2;
      // 记录一次学习历史，帮助后续连续升级判断
      s.history.push({ date: todayKey(), acc: score === 0 ? 30 : score === 1 ? 60 : score === 2 ? 85 : 95 });
      if (s.history.length > 10) s.history.shift();
      setEngState(s);
      toast(`自测得分 ${score}/3，难度自动调整为 ${ENGLISH_LEVELS[s.level]}`);
      renderEnglish();
      return;
    }

    // ---------- 运动 ----------
    const sportToggle = e.target.closest('#sportToggle');
    if (sportToggle) { const d = getSportData(); d.periodMode = !d.periodMode; d.date = ''; setSportData(d); renderSport(); return; }
    const sportChange = e.target.closest('#sportChange');
    if (sportChange) { sportDailyPick(true); renderSport(); return; }
    const feel = e.target.closest('[data-feel]');
    if (feel) { feel.classList.toggle('active'); return; }
    const sportCoach = e.target.closest('#sportCoach');
    if (sportCoach) {
      const feels = $$('#sportFeel .chip.active').map(c => c.dataset.feel);
      const res = $('#sportCoachResult'); res.classList.remove('hidden');
      const d = getSportData(); d.feedback = feels; setSportData(d);
      let plan = '今天建议以<b>低强度有氧+拉伸</b>为主，' + (d.periodMode ? '姨妈期避免卷腹和倒置动作，' : '');
      const prec = [];
      if (feels.includes('腰酸')) { plan += '加入猫牛式放松腰部；'; prec.push('避免久坐，每小时起身活动'); }
      if (feels.includes('腿软')) { plan += '减少腿部力量，改靠墙静蹲或散步；'; prec.push('运动后补蛋白质+电解质'); }
      if (feels.includes('乏力')) { plan += '时长缩至 15 分钟内，以八段锦/呼吸为主；'; prec.push('保证睡眠，避免超负荷'); }
      if (feels.includes('膝盖不适')) { plan += '跳过深蹲/箭步蹲，改游泳或骑车；'; prec.push('膝盖不超脚尖，可戴护膝'); }
      if (feels.includes('肩颈酸')) { plan += '加做肩颈拉伸；'; prec.push('手机抬高至视线，减少低头'); }
      if (!feels.length || feels.includes('状态很好')) { plan += '可正常完成今日推荐，并加一组核心；'; }
      res.innerHTML = `<b>AI 运动教练建议</b><br/>${plan}<br/><br/>⚠️ 注意事项：${prec.length ? prec.join('；') : '量力而行，循序渐进'}。<br/><br/>📺 跟练：去 B站搜「${d.periodMode ? '经期瑜伽' : '八段锦 拉伸'}」。`;
      toast('已生成专属计划'); return;
    }
  });
  function faceAnimHTML(step) {
    const t = step.t || '', s = step.s || '';
    let path = '', dur = 2, pulse = false;
    if (/锁骨引流|淋巴/.test(t)) { path = 'M 172 95 Q 152 155 120 215'; dur = 2.2; }
    else if (/眼下|眼周|睛明|太阳穴/.test(t)) { path = 'M 82 118 Q 110 108 148 112'; dur = 1.8; }
    else if (/脸颊提升|颧骨|提亮|安抚/.test(t)) { path = 'M 75 165 Q 95 130 150 118'; dur = 2; }
    else if (/下巴推提|下颌线|咬肌/.test(t)) { path = 'M 108 185 Q 140 155 162 132'; dur = 2; }
    else if (/颈部拉伸|横向抚纹|竖向提拉|颈纹|纹路/.test(t)) {
      if (/横向/.test(t) || /横向/.test(s)) { path = 'M 110 215 L 110 160'; dur = 2; }
      else if (/竖向/.test(t) || /竖向/.test(s)) { path = 'M 80 215 L 90 165'; dur = 2; }
      else if (/纹路透润|小圈|打圈/.test(t) || /纹路透润|小圈|打圈/.test(s)) { path = 'M 124 185 A 14 14 0 1 1 123.9 185'; dur = 1.8; }
      else { path = 'M 110 215 L 110 160'; dur = 2; }
    }
    else if (/全脸按压|点穴|按压/.test(t) || /全脸按压|点穴/.test(s)) { path = 'M 110 95 L 70 150 L 110 185 L 150 150 Z'; dur = 3.5; }
    else if (/全脸激活|呼吸收尾|搓热|捂脸/.test(t) || /全脸激活|呼吸收尾|捂脸/.test(s)) { pulse = true; }
    else if (/额头唤醒|眉心|眉尾/.test(t)) { path = 'M 110 105 L 110 72 L 88 62'; dur = 2.2; }
    else { path = 'M 70 150 Q 110 120 150 150'; dur = 2; }
    const motion = pulse ? `
      <circle cx='110' cy='130' r='55' fill='#ff4081' opacity='0.12'>
        <animate attributeName='r' values='55;72;55' dur='2.2s' repeatCount='indefinite' />
        <animate attributeName='opacity' values='0.12;0.04;0.12' dur='2.2s' repeatCount='indefinite' />
      </circle>
      <circle cx='110' cy='130' r='40' fill='none' stroke='#ff4081' stroke-width='2' opacity='0.25'>
        <animate attributeName='r' values='40;65;40' dur='2.2s' repeatCount='indefinite' />
      </circle>
    ` : `
      <g class='massage-hand'>
        <circle r='8' fill='url(#massageGrad)' opacity='0.95'>
          <animateMotion dur='${dur}s' repeatCount='indefinite' path='${path}' />
        </circle>
        <circle r='13' fill='none' stroke='#ff4081' stroke-width='1.5' opacity='0.35'>
          <animateMotion dur='${dur}s' repeatCount='indefinite' path='${path}' />
        </circle>
      </g>
    `;
    return `<svg viewBox='0 0 220 260' class='face-anim' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <radialGradient id='massageGrad' cx='50%' cy='50%' r='50%'>
          <stop offset='0%' stop-color='#ff8fb3' />
          <stop offset='100%' stop-color='#ff4081' stop-opacity='0.6' />
        </radialGradient>
      </defs>
      <path d='M 68 182 Q 68 232 78 252 L 142 252 Q 152 232 152 182' fill='#ffe4e6' />
      <path d='M 38 120 Q 38 42 110 32 Q 182 42 182 120 Q 182 72 110 58 Q 38 72 38 120' fill='#6d5e78' />
      <ellipse cx='110' cy='130' rx='74' ry='88' fill='#ffe4e6' />
      <circle cx='70' cy='152' r='12' fill='#ffb7c5' opacity='0.4' />
      <circle cx='150' cy='152' r='12' fill='#ffb7c5' opacity='0.4' />
      <path d='M 74 120 Q 84 115 96 120' stroke='#6d5e78' stroke-width='2.5' fill='none' stroke-linecap='round' />
      <path d='M 124 120 Q 134 115 146 120' stroke='#6d5e78' stroke-width='2.5' fill='none' stroke-linecap='round' />
      <path d='M 68 108 Q 84 102 98 108' stroke='#6d5e78' stroke-width='2' fill='none' stroke-linecap='round' />
      <path d='M 122 108 Q 136 102 152 108' stroke='#6d5e78' stroke-width='2' fill='none' stroke-linecap='round' />
      <path d='M 110 130 L 106 155 L 114 155' stroke='#dcb0a6' stroke-width='2' fill='none' stroke-linecap='round' />
      <path d='M 94 174 Q 110 182 126 174' stroke='#d68a8a' stroke-width='2.5' fill='none' stroke-linecap='round' />
      ${motion}
    </svg>`;
  }
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
    openSubpage(`${esc(name)} · 跟练`, `
      <div class='massage-play'>
        <div class='massage-play-header'>
          <button class='massage-play-close' data-mback>×</button>
          <div class='massage-play-title'>😼 ${esc(name)}</div>
        </div>
        <div class='massage-play-face' id='massageFace'>${faceAnimHTML(steps[0])}</div>
        <div class='massage-step-row'>
          <span class='massage-step-badge' id='massageStepBadge'>第 1/${steps.length} 步</span>
          <span class='massage-step-label'>💧 ${esc(name)}</span>
        </div>
        <div class='massage-desc' id='massageDesc'>${esc(steps[0].s)}</div>
        <div class='massage-tip'><span class='massage-tip-icon'>💡</span><span id='massageTip'>${esc(steps[0].tip)}</span></div>
        <div class='massage-timer-bar'><div class='massage-timer-fill' id='massageTimerFill' style='width:0%'></div></div>
        <div class='massage-time' id='massageTime'>${steps[0].sec}s</div>
        <div class='massage-controls'>
          <button class='btn-outline' id='msPrev'>上一步</button>
          <button class='btn-primary' id='msStart'>▶ 开始</button>
          <button class='btn-outline' id='msNext'>下一步</button>
        </div>
        <div class='massage-video'>
          <h4>📺 推荐跟练视频</h4>
          <div class='video-item' data-bv='${esc(plan.video.bv)}' data-page='1' data-title='${esc(plan.video.title)}'>
            <div class='video-info'><div class='video-title'>${esc(plan.video.title)}</div><div class='video-meta'>📚 真实跟练视频</div></div>
            <div class='video-actions'>
              ${hasBv ? '<button class="btn-outline video-play" data-action="play">本页播放</button>' : ''}
              <a href='${hasBv ? bvidUrl(plan.video.bv) : '#'}' target='_blank' rel='noopener' class='btn-outline'>跳转原视频 ↗</a>
            </div>
            <div class='video-player'></div>
          </div>
        </div>
      </div>
    `);
    let cur = 0, timer = null, running = false, left = steps[0].sec;
    function showStep() {
      const face = $('#massageFace'); if (face) face.innerHTML = faceAnimHTML(steps[cur]);
      const badge = $('#massageStepBadge'); if (badge) badge.textContent = `第 ${cur + 1}/${steps.length} 步`;
      const desc = $('#massageDesc'); if (desc) desc.textContent = steps[cur].s;
      const tip = $('#massageTip'); if (tip) tip.textContent = steps[cur].tip;
      left = steps[cur].sec;
      updateTimer();
    }
    function updateTimer() {
      const pct = (1 - left / steps[cur].sec) * 100;
      const fill = $('#massageTimerFill'); if (fill) fill.style.width = pct + '%';
      const time = $('#massageTime'); if (time) time.textContent = Math.ceil(left) + 's';
    }
    function startTimer() {
      if (running) { clearInterval(timer); running = false; return false; }
      running = true;
      timer = setInterval(() => {
        left -= 0.1;
        if (left <= 0) {
          clearInterval(timer); running = false;
          if (cur < steps.length - 1) { cur++; showStep(); }
        }
        updateTimer();
      }, 100);
      return true;
    }
    function stopTimer() { if (running) { clearInterval(timer); running = false; return true; } return false; }
    function refreshBtnText() {
      const txt = running ? '⏸ 暂停' : (left >= steps[cur].sec - 0.2 ? '▶ 开始' : '▶ 继续');
      const main = $('#msStart'); if (main) main.textContent = txt;
    }
    const msStart = $('#msStart'), msPrev = $('#msPrev'), msNext = $('#msNext');
    if (msStart) msStart.addEventListener('click', () => { if (startTimer()) refreshBtnText(); else { stopTimer(); refreshBtnText(); } });
    if (msPrev) msPrev.addEventListener('click', () => { if (cur > 0) { cur--; showStep(); refreshBtnText(); } });
    if (msNext) msNext.addEventListener('click', () => { if (cur < steps.length - 1) { cur++; showStep(); refreshBtnText(); } });
    showStep();
  }

  /* ---------- 电子琴 ---------- */
  const PIANO_VIDEOS = {
    0: [
      { title: '电子琴新手教学：认识键盘与基本操作（坐姿/手型）', bv: 'BV1KE41157m9', t: 13 },
      { title: '电子琴指法教学：正确手型与运指', bv: 'BV1Hq4y127um', t: 11 },
      { title: '乐理入门（音律屋）：识谱/音名/唱名', bv: 'BV1Hg411w7n2', t: 10 }
    ],
    1: [
      { title: '电子琴入门：从零开始学弹奏（C大调音阶）', bv: 'BV1Ct4y1v7Ac', t: 12 },
      { title: '📚 零基础学电子琴·完整系统课合集（112课）', url: 'https://b23.tv/NI2PuJM', t: 0 },
      { title: '电子琴指法练习：双手协调训练', bv: 'BV1Hq4y127um', t: 11 }
    ],
    2: [
      { title: '📚 完整系统课合集（进阶曲目：小白船/樱花/送别…）', url: 'https://b23.tv/NI2PuJM', t: 0 },
      { title: '电子琴入门：从零开始学弹奏（巩固）', bv: 'BV1Ct4y1v7Ac', t: 12 },
      { title: '认识键盘与基本操作（进阶巩固）', bv: 'BV1KE41157m9', t: 13 }
    ],
    3: [
      { title: '📚 完整系统课合集（熟练曲目：致野玫瑰/献给爱丽丝/国际歌…）', url: 'https://b23.tv/NI2PuJM', t: 0 },
      { title: '乐理入门（音律屋）：和声与编配', bv: 'BV1Hg411w7n2', t: 10 },
      { title: '电子琴演奏技巧提升', bv: 'BV1Ct4y1v7Ac', t: 12 }
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
        box.innerHTML = `<div class="vp-tip">加载后点播放器内 ▶ 播放。若仍黑屏请用「跳转原视频」在 B 站 App 看。</div>
          <div class="vp-wrap"><iframe class="vp-iframe" src="${bvidPlayer(bv, null, page)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen="true" frameborder="0" scrolling="no" referrerpolicy="no-referrer-when-downgrade" loading="lazy"></iframe></div>
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
            <div class="video-meta">${v.teacher ? '🎓 ' + esc(v.teacher) + ' · ' : ''}${!v.t ? '📚 完整系统课合集' : '⏱ ' + v.t + '分钟 · ' + esc(levelName)}</div>
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
  let _audioCtx = null;
  function playNote(freq) {
    try {
      _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = _audioCtx.createOscillator(); const g = _audioCtx.createGain();
      o.frequency.value = freq; o.type = 'sine'; o.connect(g); g.connect(_audioCtx.destination);
      g.gain.setValueAtTime(0.2, _audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.6);
      o.start(); o.stop(_audioCtx.currentTime + 0.6);
    } catch (e) {}
  }
  function buildKeyboard() {
    const vk = $('#vk'); if (!vk) return;
    const whites = [['C4', 261.63], ['D4', 293.66], ['E4', 329.63], ['F4', 349.23], ['G4', 392.00], ['A4', 440.00], ['B4', 493.88], ['C5', 523.25]];
    const blacks = { 0: ['C#4', 277.18], 1: ['D#4', 311.13], 3: ['F#4', 369.99], 4: ['G#4', 415.30], 5: ['A#4', 466.16] };
    // 自适应宽度：按容器宽度算白键宽（手机也能铺满、不溢出）
    const wrapW = Math.max(220, (vk.clientWidth || 320));
    const whiteW = Math.max(26, Math.min(46, Math.floor((wrapW - 6) / 8)));
    const blackW = Math.round(whiteW * 0.62);
    let html = '';
    whites.forEach((w, i) => {
      html += `<div class="vk-white" data-note="${w[0]}" data-freq="${w[1]}" style="width:${whiteW}px">${w[0]}</div>`;
      if (blacks[i]) html += `<div class="vk-black" data-note="${blacks[i][0]}" data-freq="${blacks[i][1]}" style="left:${i * whiteW + whiteW - Math.round(blackW / 2)}px;width:${blackW}px">${blacks[i][0][0]}</div>`;
    });
    vk.innerHTML = html;
  }
  function renderPiano() {
    window.__aiState = window.__aiState || {};
    window.__aiState.piano = { hits: 0, tries: 0, active: false, lastSpeak: 0, cam: null, trainer: null, camLast: 0 };
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
      <div class="diff-tabs">${levels.map((l, i) => `<button class="diff-tab ${i === d.level ? 'active' : ''}" data-pl="${i}">${l}${i > d.level ? ' 🔒' : ''}</button>`).join('')}</div>
      <div class="card"><h4 style="margin:0 0 10px;">📚 学习地图（点击打卡）</h4><div class="map-row">${units.map(u => `<div class="map-circle ${d.progress[u.k] >= 100 ? 'done' : ''}" data-map="piano:${u.k}"><div class="map-icon">${u.i}</div><div class="map-label">${u.k}</div><div class="map-pct">${d.progress[u.k]}%</div></div>`).join('')}</div></div>
      ${videoListHTML(PIANO_VIDEOS[d.level], levels[d.level])}
      <div class="card"><h4 style="margin:0 0 8px;">🎹 虚拟键盘（弹一弹）</h4>
        <div class="vk-wrap"><div class="vk" id="vk"></div></div>
        <div class="vk-hint" id="vkHint">点击琴键听音；点「跟弹练习」考你 C-D-E-F-G 音阶</div>
        <button class="btn-outline" id="vkTest" style="width:100%;margin-top:8px;">🎯 跟弹练习：弹 C→D→E→F→G</button>
      </div>
      <div class="ai-teacher">
        <div class="ai-tch-head">
          <div class="ai-tch-title">🎹 AI 钢琴教练 · 现场陪练</div>
          <div class="ai-tch-tip">不用打字，老师直接听你弹的音准、看你的手型，实时语音指导</div>
        </div>
        <div class="ai-tabs">
          <button class="ai-tab active" data-piantab="pitch">🎯 听音准</button>
          <button class="ai-tab" data-piantab="hand">👀 看手型</button>
        </div>
        <div id="pianoPitch" class="ai-panel">
          <div class="ai-pitch">
            <div class="ai-pitch-bar">
              <div class="ai-pitch-needle" id="pianoNeedle" style="left:50%"></div>
            </div>
            <div class="ai-pitch-read"><span id="pianoNoteName" class="ai-note-name">—</span><span id="pianoDev" class="ai-dev">偏差 —</span></div>
          </div>
          <div class="ai-stat">命中 <b id="pianoHit">0</b>/<b id="pianoTry">0</b>（<b id="pianoRate">0%</b>）</div>
          <div class="ai-actions">
            <button class="btn-primary" id="pianoListen">🎙️ 开始听我弹</button>
            <button class="btn-outline hidden" id="pianoStop">⏹ 停止并总结</button>
          </div>
          <div id="pianoLive" class="ai-live hidden"></div>
          <div class="ai-hint">在虚拟键盘或真实电子琴上弹一个音，老师听音准。也可先用上方「跟弹练习」弹 C→D→E→F→G。</div>
        </div>
        <div id="pianoHand" class="ai-panel hidden">
          <video id="pianoCam" class="ai-cam" playsinline muted></video>
          <div id="pianoCamTip" class="ai-live hidden"></div>
          <div class="ai-hint">把手放在键盘上，老师看手指是否立起、手腕是否放平。基础动作感知，无需联网。</div>
          <div class="ai-actions">
            <button class="btn-primary" id="pianoCamStart">📷 开启摄像头看手型</button>
            <button class="btn-outline hidden" id="pianoCamStop">⏹ 关闭</button>
          </div>
        </div>
        <div class="ai-ask">
          <button class="btn-outline" id="pianoMic">🎙️ 语音问教练</button>
          <button class="btn-outline" id="pianoGuide">🔊 语音指导：开</button>
        </div>
        <div id="pianoResult" class="ai-result hidden" style="margin-top:10px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="pianoNext">打卡完成，更新下一课 →</button>
    `);
    buildKeyboard();
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
      { title: '南门声乐·每日练声（15分钟零基础开声）', bv: 'BV1QG4y1G7Fk', page: 1, t: 0, teacher: '南门声乐' },
      { title: '郭潇雨·从零开始学唱歌（全集）', bv: 'BV1o3TuzHEEu', page: 1, t: 0, teacher: '郭潇雨' },
      { title: '南门声乐·气息训练（腹式呼吸）', bv: 'BV1Z64y157fM', page: 1, t: 0, teacher: '南门声乐' }
    ],
    1: [
      { title: '南门声乐·音准矫正（跟唱 do-re-mi）', bv: 'BV1iV1rB9Edj', page: 1, t: 0, teacher: '南门声乐' },
      { title: '宋伶俐·零基础轻松学唱歌', bv: 'BV18ZhgzGE8t', page: 1, t: 0, teacher: '宋伶俐' },
      { title: '南门声乐·气息训练（腹式呼吸）', bv: 'BV1Z64y157fM', page: 1, t: 0, teacher: '南门声乐' }
    ],
    2: [
      { title: '南门声乐·混声技巧（换声区过渡）', bv: 'BV1yP411r78z', page: 1, t: 0, teacher: '南门声乐' },
      { title: '南门声乐·音域拓展测试', bv: 'BV1bW421R7AH', page: 1, t: 0, teacher: '南门声乐' },
      { title: 'Jason·零基础唱歌系统课（进阶篇）', bv: 'BV1VN1iYLExq', page: 50, t: 0, teacher: 'Jason' }
    ],
    3: [
      { title: 'Jason·高音突破教程（第80集起）', bv: 'BV1Ae411B7Dm', page: 80, t: 0, teacher: 'Jason' },
      { title: '南门声乐·混声技巧（巩固）', bv: 'BV1yP411r78z', page: 1, t: 0, teacher: '南门声乐' },
      { title: '官方99集·Jason零基础唱歌系统课', bv: 'BV1okAVeaELv', page: 80, t: 0, teacher: 'Jason' }
    ]
  };
  function getSingData() { const p = load(LS.personal, {}); return p.singing || { streak: 0, xp: 0, hp: 5, level: 0, history: [], progress: { 练声: 0, 音准: 0, 气息: 0, 节奏: 0 } }; }
  function setSingData(d) { const p = load(LS.personal, {}); p.singing = d; save(LS.personal, p); }
  function renderSinging() {
    window.__aiState = window.__aiState || {};
    const _ac = loadAiConfig();
    const _qv = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    window.__aiState.sing = { target: null, hits: 0, tries: 0, active: false, lastSpeak: 0, cam: null, trainer: null, camLast: 0, scaleOn: false, scaleIdx: 0, scalePassed: 0, scaleLocked: false, mode: 'scale', range: 'mid', customList: [], reviewOn: false, reviewSamples: [], reviewTranscript: '', reviewRec: null, reviewStartT: 0, reviewName: '' };
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
      <div class="ai-teacher">
        <div class="ai-tch-head">
          <div class="ai-tch-title">🎤 AI 唱歌老师 · 现场陪练</div>
          <div class="ai-tch-tip">不用打字，老师直接听你唱、看你口型，实时语音指导</div>
        </div>
        <div class="ai-tabs">
          <button class="ai-tab active" data-singtab="pitch">🎯 听音准</button>
          <button class="ai-tab" data-singtab="scale">🎼 逐音带练</button>
          <button class="ai-tab" data-singtab="mouth">👄 看口型</button>
          <button class="ai-tab" data-singtab="review">🤖 AI 点评</button>
        </div>
        <div id="singPitch" class="ai-panel">
          <div class="ai-tline">先选目标音，老师先弹给你听，你跟着唱：</div>
          <div class="ai-notes">${[['C4',261.63,'哆'],['D4',293.66,'来'],['E4',329.63,'咪'],['F4',349.23,'发'],['G4',392.00,'嗦'],['A4',440.00,'拉']].map(n=>`<button class="ai-note" data-singtarget="${n[1]}">${n[0]}<small>${n[2]}</small></button>`).join('')}</div>
          <div class="ai-pitch">
            <div class="ai-pitch-bar">
              <div class="ai-pitch-target" id="singTarget" style="left:50%"></div>
              <div class="ai-pitch-needle" id="singNeedle" style="left:50%"></div>
            </div>
            <div class="ai-pitch-read"><span id="singNoteName" class="ai-note-name">—</span><span id="singDev" class="ai-dev">偏差 —</span></div>
          </div>
          <div class="ai-stat">命中 <b id="singHit">0</b>/<b id="singTry">0</b>（<b id="singRate">0%</b>）</div>
          <div class="ai-actions">
            <button class="btn-primary" id="singListen">🎙️ 开始听我唱</button>
            <button class="btn-outline hidden" id="singStop">⏹ 停止并总结</button>
          </div>
          <div id="singLive" class="ai-live hidden"></div>
        </div>
        <div id="singMouth" class="ai-panel hidden">
          <video id="singCam" class="ai-cam" playsinline muted></video>
          <div id="singCamTip" class="ai-live hidden"></div>
          <div class="ai-hint">对着镜头发声，老师看你在唱、口型是否打开。基础动作感知，无需联网。</div>
          <div class="ai-actions">
            <button class="btn-primary" id="singCamStart">📷 开启摄像头看口型</button>
            <button class="btn-outline hidden" id="singCamStop">⏹ 关闭</button>
          </div>
        </div>
        <div id="singScale" class="ai-panel hidden">
          <div class="ai-tline">老师一个音一个音带你唱 👇 先听标准音，再跟着唱，唱准了自动进下一个。</div>
          <div class="ai-subtabs">
            <button class="ai-subtab active" data-scalemode="scale">🎼 音阶 do-re-mi</button>
            <button class="ai-subtab" data-scalemode="song">🎵 逐字带唱·小星星</button>
            <button class="ai-subtab" data-scalemode="custom">✏️ 自定义歌曲</button>
          </div>
          <div class="ai-subtabs" id="scaleRangeBox">
            <span class="ai-subtab-label">音区</span>
            <button class="ai-subtab active" data-scaling="mid">中 C4-C5</button>
            <button class="ai-subtab" data-scaling="low">低 C3-C4</button>
            <button class="ai-subtab" data-scaling="high">高 C5-C6</button>
          </div>
          <div class="scale-track" id="scaleTrack"></div>
          <div id="customBox" class="ai-subpanel hidden">
            <div class="ai-tline">把「歌名 + 简谱」粘贴进来，老师逐字带你唱 👇</div>
            <textarea id="customSongInput" class="ai-textarea" placeholder="歌名：小星星&#10;一闪一闪亮晶晶 1155665&#10;满天都是小星星 4433221&#10;&#10;数字 1-7 = do re mi fa sol la si，0 = 停顿，数字后加 ' 是高八度、加 . 是低八度"></textarea>
            <div class="ai-actions"><button class="btn-primary" id="customLoad">📥 载入并开始</button></div>
            <div id="customName" class="ai-live hidden"></div>
          </div>
          <div class="ai-pitch">
            <div class="ai-pitch-bar">
              <div class="ai-pitch-target" id="scaleTarget" style="left:50%"></div>
              <div class="ai-pitch-needle" id="scaleNeedle" style="left:50%"></div>
            </div>
            <div class="ai-pitch-read"><span id="scaleNoteName" class="ai-note-name">—</span><span id="scaleDev" class="ai-dev">偏差 —</span></div>
          </div>
          <div id="scalePrompt" class="ai-live hidden"></div>
          <div class="ai-actions">
            <button class

="btn-primary" id="scaleStart">🎼 开始逐音带练</button>
            <button class="btn-outline hidden" id="scaleStop">⏹ 结束</button>
          </div>
        </div>
        <div id="singReview" class="ai-panel hidden">
          <div class="ai-tline">连上你自己的免费大模型（DeepSeek / 通义 / 智谱等，注册送额度不花钱），唱一段后老师<b>逐句点评</b>音准、气息、咬字。</div>
          <details class="ai-settings">
            <summary>⚙️ AI 设置（填你自己的免费 Key，仅存本机）</summary>
            <div class="ai-set-box">
              <div class="ai-set-row"><label>API 地址</label><input id="aiBase" placeholder="https://api.deepseek.com/v1" value="${_qv(_ac.base)}"></div>
              <div class="ai-set-row"><label>API Key</label><input id="aiKey" type="password" placeholder="粘贴你的 Key（不会显示明文）" value="${_qv(_ac.key)}"></div>
              <div class="ai-set-row"><label>🧠 文字模型<br/><span style="font-weight:400;opacity:.7;">唱歌点评、文字建议</span></label><input id="aiModel" placeholder="glm-4.7-flash" value="${_qv(_ac.model)}"></div>
              <div class="ai-set-row"><label>👁️ 看图模型<br/><span style="font-weight:400;opacity:.7;">穿搭上传照片时用</span></label><input id="aiVisionModel" placeholder="glm-4.6v-flash" value="${_qv(_ac.visionModel || _ac.model)}"></div>
              <div class="ai-hint" style="margin:8px 0 2px;line-height:1.7;">
                💡 <b>两个模型各司其职</b>（都用智谱免费模型，一套 Key 就够）：<br/>
                🧠 文字模型填 <code>glm-4.7-flash</code>（免费，200K，说话更聪明）<br/>
                👁️ 看图模型填 <code>glm-4.6v-flash</code>（免费，能看懂照片）<br/>
                地址 <code>https://open.bigmodel.cn/api/paas/v4</code>　（Key 去 bigmodel.cn 注册领取）
              </div>
              <button class="btn-primary" id="aiSave" style="margin-top:6px;">💾 保存设置</button>
              <div id="aiSaveTip" class="ai-hint"></div>
            </div>
          </details>
          <div class="ai-subtabs">
            <span class="ai-subtab-label">曲目</span>
            <button class="ai-subtab active" data-reviewmode="scale">🎼 音阶</button>
            <button class="ai-subtab" data-reviewmode="song">🎵 小星星</button>
            <button class="ai-subtab" data-reviewmode="custom">✏️ 自定义</button>
          </div>
          <div id="reviewCustomBox" class="ai-subpanel hidden">
            <textarea id="reviewCustomInput" class="ai-textarea" placeholder="两种用法：&#10;① 只输入歌名（如：晚风心里吹），点下面「✨ 只给歌名，AI 生成」&#10;② 或粘贴「歌名 + 简谱」（每行：歌词 空格 数字 1-7，0=停顿）"></textarea>
            <div class="ai-actions"><button class="btn-primary" id="reviewCustomLoad">📥 载入并开始</button> <button class="btn-outline" id="reviewCustomAi">✨ 只给歌名，AI 生成</button></div>
            <div id="reviewCustomAiHint" class="ai-hint"></div>
          </div>
          <div id="reviewName" class="ai-live hidden"></div>
          <div class="ai-actions">
            <button class="btn-primary" id="reviewStart">🎙️ 录音并点评</button>
            <button class="btn-outline hidden" id="reviewStop">⏹ 停止</button>
          </div>
          <div id="reviewLive" class="ai-live hidden"></div>
          <div id="singReviewResult" class="ai-review-result hidden"></div>
        </div>
        <div class="ai-ask">
          <button class="btn-outline" id="singAsk">🎙️ 语音问老师</button>
          <button class="btn-outline" id="singGuide">🔊 语音指导：开</button>
        </div>
        <div id="singResult" class="ai-result hidden" style="margin-top:10px;"></div>
      </div>
      <button class="btn-primary" style="width:100%;" id="singNext">练完打卡，更新进度 →</button>
    `);
  }
  function renderSingModule(k) {
    const d = getSingData();
    const guides = {
      练声: { i: '🎤', t: '打嘟唇颤音 2 分钟', s: '双唇放松，发出「嘟——」的声音，像摩托车启动。从低音滑到高音再滑下来，每天 2 分钟。', video: { title: '南门声乐·每日练声（开声）', bv: 'BV1QG4y1G7Fk', page: 1 } },
      音准: { i: '🎵', t: '跟唱 do-re-mi', s: '用钢琴或手机 App 弹一个音，跟唱「do」，依次弹 do-re-mi-fa-sol-la-si-do，跟着唱。', video: { title: '南门声乐·音准矫正', bv: 'BV1iV1rB9Edj', page: 1 } },
      气息: { i: '💨', t: '腹式呼吸 3 分钟', s: '手放肚子上，吸气时肚子鼓起，呼气时慢慢收紧。发「嘶——」声，尽量拖长。', video: { title: '南门声乐·气息训练', bv: 'BV1Z64y157fM', page: 1 } },
      节奏: { i: '🥁', t: '拍手打拍子', s: '选一首慢歌，用手打拍子：1-2-3-4，嘴里念节奏型 ta-ta-ta-ta。', video: { title: '南门声乐·混声与节奏', bv: 'BV1yP411r78z', page: 1 } }
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
  function speakText(text, lang = 'en-US', rate = 0.9) {
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音朗读'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function autoSpeakWord(en) { setTimeout(() => speakText(en), 300); }

  /* ============ AI 老师：麦克风音高检测 + 摄像头动作感知（纯前端·零依赖） ============ */
  window.__aiSessions = window.__aiSessions || [];
  function registerAISession(obj) { window.__aiSessions.push(obj); }
  function stopAllAISessions() {
    (window.__aiSessions || []).forEach(s => { try { s.stop && s.stop(); } catch (e) {} });
    window.__aiSessions = [];
  }
  let voiceGuideOn = true;
  function speakGuide(text) { if (voiceGuideOn && text) speakText(text, 'zh-CN', 0.98); }

  // autocorrelation 自相关音高检测：时域 Float32 → 基频 Hz（无音/噪声返回 -1）
  function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) { const v = buf[i]; rms += v * v; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.008) return -1;
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
    for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; } }
    buf = buf.slice(r1, r2); SIZE = buf.length;
    if (SIZE < Math.floor(sampleRate / 1000)) return -1;
    const c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) { let sum = 0; for (let j = 0; j < SIZE - i; j++) sum += buf[j] * buf[j + i]; c[i] = sum; }
    let d = 0; while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    let T0 = maxpos;
    if (T0 > 0 && T0 < SIZE - 1) {
      const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
      if (a) T0 = T0 - b / (2 * a);
    }
    if (T0 <= 0 || !isFinite(T0)) return -1;
    return sampleRate / T0;
  }
  const _NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function noteFromFreq(freq) {
    if (!(freq > 0)) return { name: '—', cents: 0, midi: 0 };
    const midi = Math.round(12 * Math.log2(freq / 440)) + 69;
    const name = _NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    const fExact = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / fExact));
    return { name, cents, midi };
  }
  // 麦克风实时音高训练器
  function createPitchTrainer(onPitch) {
    let audioCtx, analyser, stream, raf, data, running = false;
    return {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        window.__micCtx = window.__micCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx = window.__micCtx;
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.1;
        src.connect(analyser);
        data = new Float32Array(analyser.fftSize);
        running = true; loop();
      },
      stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(t => t.stop());
        try { analyser && analyser.disconnect(); } catch (e) {}
      },
      isRunning() { return running; }
    };
    function loop() {
      if (!running) return;
      analyser.getFloatTimeDomainData(data);
      const f = autoCorrelate(data, audioCtx.sampleRate);
      if (f > 60 && f < 1500) onPitch(f, noteFromFreq(f));
      else onPitch(0, { name: '—', cents: 0 });
      raf = requestAnimationFrame(loop);
    }
  }
  // 摄像头动作感知（纯 Canvas 帧差，零依赖）
  function createCamWatcher(videoEl, opts) {
    opts = opts || {};
    let stream, raf, running = false, prevGray = null, motionHistory = [];
    return {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
        videoEl.srcObject = stream;
        try { await videoEl.play(); } catch (e) {}
        running = true; loop();
      },
      stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null; prevGray = null; motionHistory = [];
      },
      isRunning() { return running; }
    };
    function loop() {
      if (!running) return;
      const w = videoEl.videoWidth || 320, h = videoEl.videoHeight || 240;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      try { ctx.drawImage(videoEl, 0, 0, w, h); } catch (e) { return; }
      const img = ctx.getImageData(0, 0, w, h).data;
      const gray = new Float32Array(w * h);
      for (let i = 0, p = 0; i < img.length; i += 4, p++) gray[p] = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
      let motion = 0;
      if (prevGray) { for (let i = 0; i < gray.length; i++) { const dd = gray[i] - prevGray[i]; motion += dd * dd; } motion = Math.sqrt(motion / gray.length); }
      prevGray = gray;
      motionHistory.push(motion); if (motionHistory.length > 20) motionHistory.shift();
      const avg = motionHistory.reduce((a, b) => a + b, 0) / motionHistory.length;
      if (opts.onFrame) opts.onFrame({ motion, avg, active: avg > 6, ctx, w, h });
      raf = requestAnimationFrame(loop);
    }
  }
  // AI 老师文字/语音回复（关键词匹配针对性建议）
  function aiCoachReply(q, el, subject) {
    if (!q) { toast('没听清，请再说一次'); return; }
    el.classList.remove('hidden');
    let reply;
    if (subject === 'sing') {
      if (/高音|上不去|破音|喊/.test(q)) reply = '高音上不去别硬顶，用混声：气声起头、找「呜」的位置往上滑，多做哼鸣过渡。每天打嘟唇颤音 2 分钟放松声带。';
      else if (/低音|下不来|压/.test(q)) reply = '低音要放松喉咙，像叹气一样把声音往下沉，别压喉。';
      else if (/气息|气短|喘|憋/.test(q)) reply = '练腹式呼吸：吸气肚子鼓、呼气发「嘶」尽量拖长，每天 3 分钟。唱歌用气的流动推声音，不要憋。';
      else if (/跑调|音准|不在调|走音/.test(q)) reply = '先跟钢琴慢练 do-re-mi，用手机录下来对比原唱；音准能练出来，关键是先听准再唱准。';
      else if (/节奏|抢拍|拖拍|跟不上/.test(q)) reply = '用节拍器从 60 速度开始，手打拍子嘴念节奏，先稳再快。';
      else reply = '坚持每天练声 15 分钟，先打嘟开嗓再练音阶。把今天练的录下来和昨天对比，进步会很明显。';
    } else {
      if (/手型|手指|僵硬|跨不开|立/.test(q)) reply = '手型保持「握鸡蛋」弧度，指尖立起来触键，手腕与键盘基本平齐、别太高也别塌。跨不开就放慢、分手练。';
      else if (/左右手|协调|配合|合手/.test(q)) reply = '先分手慢练到熟练，再合手；合手时把速度降到能跟上的最慢，节拍器从 60 起。';
      else if (/节奏|不稳|抢|慢/.test(q)) reply = '节拍器设 60，先只练右手旋律稳住节奏，再加左手。';
      else if (/音准|不准|跑音|错音/.test(q)) reply = '弹前先听标准音，弹错音就慢下来单练那一小节，用耳朵核对每个音。';
      else if (/和弦|同时|按/.test(q)) reply = '和弦先分别按准每个音再一起落下，手腕放松，保持 2 秒找站稳的感觉。';
      else reply = '每天先慢练音阶 10 遍打基础，再练曲目。卡住的小节循环练 5 遍再串起来。';
    }
    el.innerHTML = `<b>${subject === 'sing' ? '🎤 AI 唱歌老师' : '🎹 AI 钢琴教练'}：</b><br/>针对「${esc(q)}」：${esc(reply)}`;
    speakGuide(reply);
  }

  /* ============ AI 老师：唱歌/钢琴 实时陪练控制 ============ */
  function setSingTarget(freq, btn) {
    const st = window.__aiState.sing; st.target = freq;
    $$('[data-singtarget]').forEach(b => b.classList.toggle('active', b === btn));
    playNote(freq);
    $('#singTarget').style.left = '50%';
    toast('目标音已设定，跟着唱～');
  }
  function startSingListen() {
    const st = window.__aiState.sing;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持麦克风'); return; }
    const btn = $('#singListen'), stop = $('#singStop'), live = $('#singLive');
    const trainer = createPitchTrainer((freq, nt) => {
      $('#singNoteName').textContent = nt.name;
      const live2 = $('#singLive');
      if (freq > 0) {
        const target = st.target || 261.63;
        const devCents = Math.round(1200 * Math.log2(freq / target));
        const pos = Math.max(2, Math.min(98, 50 + devCents / 2.4));
        $('#singNeedle').style.left = pos + '%';
        let devTxt, hit = false;
        if (Math.abs(devCents) <= 30) { devTxt = '✅ 很准'; hit = true; }
        else if (devCents < 0) devTxt = '⬇ 偏低 ' + (-devCents) + ' 音分';
        else devTxt = '⬆ 偏高 ' + devCents + ' 音分';
        $('#singDev').textContent = devTxt;
        if (st.active) {
          st.tries++; if (hit) st.hits++;
          $('#singHit').textContent = st.hits; $('#singTry').textContent = st.tries;
          $('#singRate').textContent = Math.round(st.hits / st.tries * 100) + '%';
          live2.classList.remove('hidden'); live2.innerHTML = '你唱出：<b>' + nt.name + '</b> · ' + devTxt;
          const now = Date.now();
          if (now - st.lastSpeak > 2600) {
            st.lastSpeak = now;
            if (hit) speakGuide('很准，保持这个音');
            else if (devCents < 0) speakGuide('刚才偏低了，声音再高一点点');
            else speakGuide('刚才偏高了，声音放低一点点');
          }
        }
      } else { $('#singDev').textContent = '偏差 —'; }
    });
    st.trainer = trainer; st.active = true; st.lastSpeak = 0;
    registerAISession(trainer);
    trainer.start().then(() => {
      btn.classList.add('hidden'); stop.classList.remove('hidden');
      live.classList.remove('hidden'); live.innerHTML = '老师在听…唱一个音试试' + (st.target ? '' : '（未选目标音，可先选一个）');
      if (st.target) playNote(st.target);
    }).catch(err => { toast('麦克风开启失败：' + ((err && err.message) || err)); });
  }
  function stopSingListen() {
    const st = window.__aiState.sing; st.active = false;
    if (st.trainer) { st.trainer.stop(); st.trainer = null; }
    $('#singListen').classList.remove('hidden'); $('#singStop').classList.add('hidden');
    const rate = st.tries ? Math.round(st.hits / st.tries * 100) : 0;
    speakGuide('练习结束，命中率 ' + rate + '%，' + (rate >= 70 ? '很棒，继续保持' : rate >= 40 ? '有进步，多练几遍' : '多跟着钢琴慢练，先听准再唱准'));
    $('#singLive').innerHTML = '本轮命中率 <b>' + rate + '%</b>（命中 ' + st.hits + '/' + st.tries + '）';
  }
  function startSingCam() {
    const st = window.__aiState.sing;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持摄像头'); return; }
    const video = $('#singCam'), tip = $('#singCamTip');
    const cam = createCamWatcher(video, {
      onFrame: ({ avg, active }) => {
        tip.classList.remove('hidden');
        if (active) { tip.innerHTML = '👄 检测到你在发声/动嘴，口型保持打开，咬字清楚～'; if (Date.now() - st.camLast > 5000) { st.camLast = Date.now(); speakGuide('口型打开了，继续保持'); } }
        else { tip.innerHTML = '👄 没检测到明显口型动作，对着镜头大声唱、把嘴张大'; }
      }
    });
    st.cam = cam; st.camLast = 0; registerAISession(cam);
    cam.start().then(() => { $('#singCamStart').classList.add('hidden'); $('#singCamStop').classList.remove('hidden'); }).catch(err => { toast('摄像头开启失败：' + ((err && err.message) || err)); });
  }
  function stopSingCam() {
    const st = window.__aiState.sing;
    if (st.cam) { st.cam.stop(); st.cam = null; }
    $('#singCamStart').classList.remove('hidden'); $('#singCamStop').classList.add('hidden');
    $('#singCamTip').classList.add('hidden');
  }

  /* ============ AI 逐句点评：用户自带免费大模型（OpenAI 兼容接口） ============ */
  function loadAiConfig() { try { return JSON.parse(localStorage.getItem('yu_ai_cfg') || '{}'); } catch (e) { return {}; } }
  function saveAiConfig() {
    const base = $('#aiBase').value.trim();
    const key = $('#aiKey').value.trim();
    const model = $('#aiModel').value.trim();
    const vmEl = $('#aiVisionModel');
    const visionModel = vmEl ? vmEl.value.trim() : '';
    localStorage.setItem('yu_ai_cfg', JSON.stringify({ base, key, model, visionModel }));
    const tip = $('#aiSaveTip');
    if (tip) tip.innerHTML = '已保存到本机浏览器（不会上传到本项目服务器，只有你填的 API 平台会收到请求）<br/>✅ 与「👗 穿搭 → AI搭配师」里的设置是<b>同一份</b>，改哪边都一样，不用填两次。<br/>🧠 文字用「' + esc(model || 'deepseek-chat') + '」，👁️ 看图用「' + esc(visionModel || model || '（未单独设置，同文字模型）') + '」。';
    toast('AI 设置已保存');
  }
  async function callLLM(messages, images) {
    window.__llmErr = '';   // 让 outfitAIAsk 等下游能读到具体原因
    const cfg = loadAiConfig();
    if (!cfg || !cfg.key) {
      window.__llmErr = '还没填写 Key。请先在上方「AI 设置」粘贴 Key → 点保存（地址和模型我已帮你填好）。';
      toast('请先在「⚙️ AI 设置」里填写你的免费 Key');
      return null;
    }
    // 【分模型】带图片（需要视觉）时用 visionModel，纯文字时用 model；没单独设 visionModel 就退回 model（向后兼容）
    const modelToUse = (images && images.length)
      ? (cfg.visionModel || cfg.model || 'glm-4.6v-flash')
      : (cfg.model || 'deepseek-chat');
    const base = (cfg.base || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
    const url = base + '/chat/completions';
    // 若带图片，把最后一条 user 消息转为多模态（图文混排）内容
    let msgs = messages;
    if (images && images.length) {
      msgs = messages.map(m => ({ ...m }));
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          const text = typeof msgs[i].content === 'string' ? msgs[i].content : '';
          msgs[i].content = [
            { type: 'text', text },
            ...images.map(u => ({ type: 'image_url', image_url: { url: u } }))
          ];
          break;
        }
      }
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: modelToUse, messages: msgs, temperature: 0.7, max_tokens: 1000 })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        let msg;
        if (res.status === 401) {
          msg = 'Key 无效或已过期（HTTP 401）。请去智谱后台核对 Key，或删掉重建一个新的。';
        } else if (res.status === 429) {
          msg = '请求太快被限流（HTTP 429）。等 10 秒再试，或把「看图模型」换成 glm-4.1v-thinking-flash / glm-4v-flash。';
        } else if (/image|vision|multimodal|not support|unsupported/i.test(t)) {
          msg = '模型「' + modelToUse + '」不支持看图。请把「看图模型」改成 glm-4.6v-flash（或 glm-4.1v-thinking-flash / glm-4v-flash）。';
        } else {
          msg = '大模型调用失败 HTTP ' + res.status + '。本次用的模型=' + modelToUse + '，地址=' + base;
        }
        window.__llmErr = msg;
        toast(msg);
        console.warn('LLM err', res.status, t, msg); return null;
      }
      const j = await res.json();
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    } catch (e) {
      window.__llmErr = '网络/CORS 错误：浏览器可能不允许直连该平台。智谱 BigModel 允许浏览器直连，应该是网络/防火墙问题，重试或换网络。';
      toast('网络/CORS 错误：换 DeepSeek/智谱等允许浏览器直连的平台');
      console.warn('LLM fetch err', e);
      return null;
    }
  }
  // 按实际发声边界切分：把"有声段"作为每个字的边界（拖拍/停顿不会错位），而非按时间硬切
  function splitVoices(samples) {
    const GAP = 0.18, MINLEN = 0.08; // 间隔>0.18s 视为换字；短于 0.08s 的声音忽略
    const raw = [];
    let cur = null;
    const pushSeg = (c) => { const len = c.t1 - c.t0; if (len >= MINLEN) raw.push({ t0: c.t0, t1: c.t1, sum: c.sum, n: c.n, avg: c.sum / c.n }); };
    for (const s of samples) {
      if (s.freq > 0) {
        if (!cur) cur = { t0: s.t, t1: s.t, sum: 0, n: 0 };
        cur.t1 = s.t; cur.sum += s.freq; cur.n++;
      } else if (cur) { pushSeg(cur); cur = null; }
    }
    if (cur) pushSeg(cur);
    // 合并间隔过近的相邻段（中间静音<GAP 视为同一字，避免长音被误拆）
    const merged = [];
    for (const sg of raw) {
      const last = merged[merged.length - 1];
      if (last && sg.t0 - last.t1 < GAP) {
        const sum = last.sum + sg.sum, n = last.n + sg.n;
        last.t1 = sg.t1; last.sum = sum; last.n = n; last.avg = sum / n;
      } else merged.push(sg);
    }
    return merged;
  }
  function buildReviewReport(seq, samples) {
    if (!seq.length) return '（无曲目）';
    const segs = splitVoices(samples);
    const label = (n) => (n[2] || n[0]);
    let out = '';
    seq.forEach((n, i) => {
      const seg = segs[i];
      if (!seg) { out += `${i + 1}. ${label(n)}（目标 ${n[0]} ${Math.round(n[1])}Hz）：未检测到声音/没唱出\n`; return; }
      const avg = seg.avg;
      const dev = Math.round(1200 * Math.log2(avg / n[1]));
      const ok = Math.abs(dev) <= 35;
      out += `${i + 1}. ${label(n)}（目标 ${n[0]} ${Math.round(n[1])}Hz）→ 实际约 ${Math.round(avg)}Hz，偏差 ${dev > 0 ? '+' : ''}${dev} 音分 ${ok ? '（准✅）' : '（偏' + (dev < 0 ? '低' : '高') + '）'}\n`;
    });
    out += `\n（已按你实际发声顺序对齐，共识别 ${segs.length} 个发声段）`;
    return out;
  }
  // 纯本地逐字点评（无需大模型/Key/额度）：基于音高偏差数据用规则生成文字 + 本地 TTS
  function buildLocalReview(seq, samples) {
    const segs = splitVoices(samples);
    let good = 0, high = 0, low = 0, miss = 0;
    const bad = [];
    seq.forEach((n, i) => {
      const seg = segs[i];
      const name = n[2] || n[0];
      if (!seg) { miss++; bad.push(name + '（没唱出）'); return; }
      const dev = Math.round(1200 * Math.log2(seg.avg / n[1]));
      if (Math.abs(dev) <= 35) good++;
      else if (dev < 0) { low++; bad.push(name + '（偏低）'); }
      else { high++; bad.push(name + '（偏高）'); }
    });
    let s = `本次共 ${seq.length} 个字：准 ${good} 个、偏高 ${high} 个、偏低 ${low} 个、没唱出 ${miss} 个。\n`;
    if (good === seq.length && miss === 0) s += '太棒了，每个字都音准到位！保持住～\n';
    else {
      if (bad.length) s += '重点练这几个：' + bad.slice(0, 6).join('、') + '。\n';
      if (high > low) s += '整体偏高，唱时气息下沉、别往上挤脖子；';
      else if (low > high) s += '整体偏低，把声音位置提起来、多给点气；';
      else if (good === 0 && miss < seq.length) s += '多数音准偏差，先放慢、一个字一个字对准；';
      s += '偏的字单独连唱 3 遍找感觉。\n';
    }
    s += '（本地点评·完全免费，未调用大模型；想更智能请到⚙️设置填免费 Key）';
    return s;
  }
  function startReview() {
    const st = window.__aiState.sing;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持麦克风'); return; }
    const cfg = loadAiConfig();
    if (!cfg || !cfg.key) { toast('未填 Key：将用「本地逐字点评」（完全免费，无需额度）'); }
    if (st.mode === 'custom' && !st.customList.length) { toast('请先载入自定义歌曲'); return; }
    const seq = getScaleSequence();
    if (!seq.length) { toast('没有曲目'); return; }
    st.reviewOn = true; st.reviewSamples = []; st.reviewTranscript = ''; st.reviewStartT = performance.now();
    $('#reviewStart').classList.add('hidden'); $('#reviewStop').classList.remove('hidden');
    const rl = $('#reviewLive'); rl.classList.remove('hidden'); rl.innerHTML = '🎙️ 录音中…请跟着唱《' + esc(st.reviewName || '曲目') + '》，唱完点「停止」';
    $('#singReviewResult').classList.add('hidden');
    const trainer = createPitchTrainer((freq) => { st.reviewSamples.push({ t: (performance.now() - st.reviewStartT) / 1000, freq: freq > 0 ? freq : 0 }); });
    st.trainer = trainer; registerAISession(trainer);
    trainer.start().catch(err => { toast('麦克风开启失败：' + ((err && err.message) || err)); });
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = true;
        rec.onresult = (ev) => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; st.reviewTranscript = t; };
        rec.onerror = () => {};
        st.reviewRec = rec; rec.start();
      } catch (e) {}
    }
  }
  async function stopReview() {
    const st = window.__aiState.sing;
    if (!st.reviewOn) return;
    st.reviewOn = false;
    if (st.trainer) { st.trainer.stop(); st.trainer = null; }
    if (st.reviewRec) { try { st.reviewRec.stop(); } catch (e) {} st.reviewRec = null; }
    $('#reviewStart').classList.remove('hidden'); $('#reviewStop').classList.add('hidden');
    const rl = $('#reviewLive'); rl.innerHTML = '🤔 正在生成逐字点评…';
    const seq = getScaleSequence();
    const report = buildReviewReport(seq, st.reviewSamples);
    const songName = st.reviewName || '曲目';
    const cfg = loadAiConfig();
    let content = null, source = '';
    if (cfg && cfg.key) {
      const sys = `你是一位专业、温和的声乐老师。下面是一名学生刚唱的一段《${songName}》的逐字音准分析（由前端音高检测得到，目标音为简谱对应频率，偏差单位为音分，±35 音分内算准）。请：1）逐字简评音准（哪几个字准、哪几个偏高低）；2）指出整体可能的问题（气息/咬字/节奏）并给 1-2 条针对性练习建议；3）用鼓励语气结尾。分点说明，控制在 200 字内。`;
      const user = `【逐字分析】\n${report}\n【识别到的歌词】${st.reviewTranscript || '（未启用语音识别）'}\n请点评。`;
      content = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }]);
      source = 'ai';
    }
    if (!content) { content = buildLocalReview(seq, st.reviewSamples); source = 'local'; }
    const box = $('#singReviewResult');
    if (content) {
      box.classList.remove('hidden');
      const title = source === 'ai' ? '🤖 AI 老师逐字点评' : '🎤 本地逐字点评（完全免费·无需 Key）';
      box.innerHTML = `<b>${title}</b><div class="ai-review-body">${esc(content).replace(/\n/g, '<br/>')}</div>`;
      speakGuide(content.slice(0, 110));
      rl.innerHTML = '✅ 点评完成';
    } else {
      rl.innerHTML = '⚠️ 点评失败，请重试';
    }
  }
  const SCALE_LIST = [['C4',261.63,'哆'],['D4',293.66,'来'],['E4',329.63,'咪'],['F4',349.23,'发'],['G4',392.00,'嗦'],['A4',440.00,'拉'],['B4',493.88,'西'],['C5',523.25,'哆']];
  const SCALE_LOW = [['C3',130.81,'哆'],['D3',146.83,'来'],['E3',164.81,'咪'],['F3',174.61,'发'],['G3',196.00,'嗦'],['A3',220.00,'拉'],['B3',246.94,'西'],['C4',261.63,'哆']];
  const SCALE_HIGH = [['C5',523.25,'哆'],['D5',587.33,'来'],['E5',659.25,'咪'],['F5',698.46,'发'],['G5',783.99,'嗦'],['A5',880.00,'拉'],['B5',987.77,'西'],['C6',1046.50,'哆']];
  const SONG_NOTES = [['C4',261.63,'一闪'],['C4',261.63,'一闪'],['G4',392.00,'亮晶'],['G4',392.00,'晶'],['A4',440.00,'满天'],['A4',440.00,'都'],['G4',392.00,'是星'],['F4',349.23,'挂在'],['F4',349.23,'天上'],['E4',329.63,'放光'],['E4',329.63,'明'],['D4',293.66,'好像'],['D4',293.66,'许'],['C4',261.63,'多星']];
  function getScaleSequence() {
    const st = window.__aiState.sing;
    if (st.mode === 'custom') return st.customList || [];
    if (st.mode === 'song') return SONG_NOTES;
    return (st.range === 'low' ? SCALE_LOW : st.range === 'high' ? SCALE_HIGH : SCALE_LIST);
  }
  function parseCustomSong(text) {
    let name = '我的歌';
    const seq = [];
    const BASE = { '1': 261.63, '2': 293.66, '3': 329.63, '4': 349.23, '5': 392.00, '6': 440.00, '7': 493.88 };
    const toFreq = (tok) => {
      if (!tok || tok[0] === '0') return 0;
      let f = BASE[tok[0]]; if (!f) return 0;
      if (tok.includes("'") || tok.includes('^')) f *= 2;
      else if (tok.includes('.') || tok.includes(',')) f /= 2;
      return f;
    };
    const toName = (f) => f > 0 ? noteFromFreq(f).name : '—';
    const lines = text.replace(/\r/g, '').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^(歌名|歌曲|曲名|歌)/.test(line) && line.includes(':')) {
        const m = line.match(/[:：]\s*(.+)$/); if (m) name = m[1].trim();
        continue;
      }
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const lyrics = Array.from(parts[0]);
      const nums = parts.slice(1).join('');
      const tokens = nums.match(/[0-7]['.^,]*|0/g) || [];
      const n = Math.min(lyrics.length, tokens.length);
      for (let i = 0; i < n; i++) { const f = toFreq(tokens[i]); seq.push([toName(f), f, lyrics[i]]); }
    }
    return { name, seq };
  }
  // 只给歌名，让 AI 生成歌词+简谱填到输入框（用户可编辑后再点「载入并开始」）
  async function aiGenerateCustomSong(btn) {
    const ta = $('#reviewCustomInput');
    const hint = $('#reviewCustomAiHint');
    const name = (ta?.value || '').trim();
    if (!name) { toast('请先在上面输入框写上歌名'); return; }
    if (btn) btn.disabled = true;
    if (hint) hint.innerHTML = '⏳ AI 正在为「' + esc(name) + '」生成歌词+简谱…';
    const sys = '你是华语流行歌曲助理。严格按指定格式输出，不要任何其他文字、不要 markdown 代码块、不要解释。';
    const usr = `歌名：${name}

输出要求（**严格**遵守）：

1. 第一行：歌名：<原歌名>
2. 之后每行 = 一个汉字 + 一个空格 + 一个数字
   数字 1=do, 2=re, 3=mi, 4=fa, 5=sol, 6=la, 7=si（均为中音）
   0 = 停顿/休止
3. 写你**记得的真实歌词**（一首热门歌的话你应该记得前 1-2 段主歌）
4. 旋律数字用你**记忆中最稳的近似**就行，不需要 100% 准确；若完全不确定，最后一行加 #approx
5. **完全不知道这首歌** → 只输出"歌名：<原歌名>"加单独一行 #unknown
6. 不要输出标点符号、不要输出引号、不要输出 markdown`;
    try {
      const out = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: usr }]);
      if (out && out.trim()) {
        // 去掉可能的 markdown 围栏、开头空白
        const clean = out.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        ta.value = clean;
        if (hint) hint.innerHTML = '✅ 已填入歌词+简谱，<b>旋律为 AI 推测可能不准</b>，建议对照原歌微调数字 → 然后点「📥 载入并开始」';
        toast('已生成，点「📥 载入并开始」即可练习');
      } else {
        if (hint) hint.innerHTML = '⚠️ ' + esc(window.__llmErr || 'AI 没返回内容，请检查 AI 设置');
        toast('AI 没生成出来，检查 AI 设置');
      }
    } catch (e) {
      if (hint) hint.innerHTML = '⚠️ 出错了：' + esc(String(e && e.message || e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function rebuildScaleTrack() {
    const st = window.__aiState.sing;
    const seq = getScaleSequence();
    $('#scaleTrack').innerHTML = seq.map((n, i) => `<div class="scale-note" data-i="${i}"><div class="scale-note-name">${n[2]}</div><div class="scale-note-freq">${n[0]}</div></div>`).join('');
  }
  function markScaleNote(idx, state) {
    $$('#scaleTrack .scale-note').forEach(el => {
      const i = Number(el.dataset.i);
      el.classList.toggle('done', i < window.__aiState.sing.scaleIdx || (state === 'done' && i === idx));
      el.classList.toggle('current', state === 'current' && i === idx);
    });
  }
  function startScaleTrain() {
    const st = window.__aiState.sing;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持麦克风'); return; }
    st.scaleList = getScaleSequence(); st.scaleIdx = 0; st.scalePassed = 0; st.scaleLocked = false; st.scaleLastSpeak = 0; st.scaleOn = true;
    rebuildScaleTrack();
    const trainer = createPitchTrainer((freq, nt) => {
      $('#scaleNoteName').textContent = freq > 0 ? nt.name : '—';
      if (freq > 0) {
        const target = st.scaleList[st.scaleIdx][1];
        const dev = Math.round(1200 * Math.log2(freq / target));
        $('#scaleNeedle').style.left = Math.max(2, Math.min(98, 50 + dev / 2.4)) + '%';
        $('#scaleDev').textContent = Math.abs(dev) <= 35 ? '✅ 很准' : (dev < 0 ? '⬇ 偏低 ' + (-dev) : '⬆ 偏高 ' + dev);
        if (!st.scaleLocked) {
          if (Math.abs(dev) <= 35) {
            st.scaleLocked = true; st.scalePassed++;
            markScaleNote(st.scaleIdx, 'done');
            $('#scalePrompt').classList.remove('hidden'); $('#scalePrompt').innerHTML = '✅ 「' + st.scaleList[st.scaleIdx][2] + '」很准！';
            speakGuide('很准，下一个：' + (st.scaleList[st.scaleIdx + 1] ? st.scaleList[st.scaleIdx + 1][2] : '完成'));
            setTimeout(() => {
              if (!st.scaleOn) return;
              st.scaleIdx++;
              if (st.scaleIdx >= st.scaleList.length) { stopScaleTrain(true); return; }
              st.scaleLocked = false;
              playNote(st.scaleList[st.scaleIdx][1]);
              $('#scalePrompt').innerHTML = '🎧 听老师唱：' + st.scaleList[st.scaleIdx][2] + '（然后跟着唱）';
              markScaleNote(st.scaleIdx, 'current');
            }, 1100);
          } else {
            const now = Date.now();
            if (now - st.scaleLastSpeak > 2500) {
              st.scaleLastSpeak = now;
              speakGuide(dev < 0 ? '再高一点点' : '再低一点点');
            }
          }
        }
      } else { $('#scaleDev').textContent = '偏差 —'; }
    });
    st.trainer = trainer; registerAISession(trainer);
    trainer.start().then(() => {
      $('#scaleStart').classList.add('hidden'); $('#scaleStop').classList.remove('hidden');
      $('#scalePrompt').classList.remove('hidden');
      markScaleNote(0, 'current'); playNote(st.scaleList[0][1]);
      $('#scalePrompt').innerHTML = '🎧 听老师唱：' + st.scaleList[0][2] + '（然后跟着唱）';
      speakGuide('我们先从哆开始，听我唱，然后你跟着唱');
    }).catch(err => { toast('麦克风开启失败：' + ((err && err.message) || err)); });
  }
  function stopScaleTrain(finished) {
    const st = window.__aiState.sing;
    st.scaleOn = false;
    if (st.trainer) { st.trainer.stop(); st.trainer = null; }
    $('#scaleStart').classList.remove('hidden'); $('#scaleStop').classList.add('hidden');
    if (finished) {
      $('#scalePrompt').innerHTML = '🎉 全部唱完！共唱准 <b>' + st.scalePassed + '</b> 个音，进步明显～';
      speakGuide('全部唱完啦，唱准了 ' + st.scalePassed + ' 个音，很棒');
      $$('#scaleTrack .scale-note').forEach(el => el.classList.add('done'));
    } else {
      $('#scalePrompt').innerHTML = '已暂停。已唱准 <b>' + st.scalePassed + '</b> 个音。';
      speakGuide('暂停，已唱准 ' + st.scalePassed + ' 个音');
    }
  }
  function switchSingTab(tab) {
    $$('[data-singtab]').forEach(b => b.classList.toggle('active', b.dataset.singtab === tab));
    $('#singPitch').classList.toggle('hidden', tab !== 'pitch');
    $('#singScale').classList.toggle('hidden', tab !== 'scale');
    $('#singMouth').classList.toggle('hidden', tab !== 'mouth');
    $('#singReview').classList.toggle('hidden', tab !== 'review');
    const st = window.__aiState.sing;
    if (tab !== 'review' && st.reviewOn) { st.reviewOn = false; if (st.trainer) { st.trainer.stop(); st.trainer = null; } if (st.reviewRec) { try { st.reviewRec.stop(); } catch (e) {} st.reviewRec = null; } $('#reviewStart').classList.remove('hidden'); $('#reviewStop').classList.add('hidden'); }
    if (tab !== 'pitch' && st.trainer && !st.scaleOn) { st.active = false; st.trainer.stop(); st.trainer = null; $('#singListen').classList.remove('hidden'); $('#singStop').classList.add('hidden'); }
    if (tab !== 'scale' && st.scaleOn) { stopScaleTrain(); }
    if (tab !== 'mouth' && st.cam) { st.cam.stop(); st.cam = null; $('#singCamStart').classList.remove('hidden'); $('#singCamStop').classList.add('hidden'); $('#singCamTip').classList.add('hidden'); }
  }
  function startPianoListen() {
    const st = window.__aiState.piano;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持麦克风'); return; }
    const btn = $('#pianoListen'), stop = $('#pianoStop'), live = $('#pianoLive');
    const trainer = createPitchTrainer((freq, nt) => {
      $('#pianoNoteName').textContent = nt.name;
      if (freq > 0) {
        const cents = nt.cents;
        const pos = Math.max(2, Math.min(98, 50 + cents / 2.4));
        $('#pianoNeedle').style.left = pos + '%';
        let devTxt, hit = false;
        if (Math.abs(cents) <= 35) { devTxt = '✅ 音准不错'; hit = true; }
        else if (cents < 0) devTxt = '⬇ 偏低 ' + (-cents);
        else devTxt = '⬆ 偏高 ' + cents;
        $('#pianoDev').textContent = devTxt;
        if (st.active) {
          st.tries++; if (hit) st.hits++;
          $('#pianoHit').textContent = st.hits; $('#pianoTry').textContent = st.tries;
          $('#pianoRate').textContent = Math.round(st.hits / st.tries * 100) + '%';
          live.classList.remove('hidden'); live.innerHTML = '你弹到：<b>' + nt.name + '</b> · ' + devTxt;
          const now = Date.now();
          if (now - st.lastSpeak > 2600) {
            st.lastSpeak = now;
            if (hit) speakGuide('这个音很准');
            else if (cents < 0) speakGuide('偏低了一点，手指再往右一点');
            else speakGuide('偏高了，往左一点');
          }
        }
      } else { $('#pianoDev').textContent = '偏差 —'; }
    });
    st.trainer = trainer; st.active = true; st.lastSpeak = 0;
    registerAISession(trainer);
    trainer.start().then(() => { btn.classList.add('hidden'); stop.classList.remove('hidden'); live.classList.remove('hidden'); live.innerHTML = '老师在听…弹一个音试试'; }).catch(err => { toast('麦克风开启失败：' + ((err && err.message) || err)); });
  }
  function stopPianoListen() {
    const st = window.__aiState.piano; st.active = false;
    if (st.trainer) { st.trainer.stop(); st.trainer = null; }
    $('#pianoListen').classList.remove('hidden'); $('#pianoStop').classList.add('hidden');
    const rate = st.tries ? Math.round(st.hits / st.tries * 100) : 0;
    speakGuide('练习结束，音准命中率 ' + rate + '%，' + (rate >= 70 ? '很稳，继续保持' : rate >= 40 ? '有进步，慢练找准每个音' : '多听标准音，慢下来单练'));
    $('#pianoLive').innerHTML = '本轮音准命中率 <b>' + rate + '%</b>（命中 ' + st.hits + '/' + st.tries + '）';
  }
  function startPianoCam() {
    const st = window.__aiState.piano;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('当前环境不支持摄像头'); return; }
    const video = $('#pianoCam'), tip = $('#pianoCamTip');
    const cam = createCamWatcher(video, {
      onFrame: ({ avg, active }) => {
        tip.classList.remove('hidden');
        if (active) { tip.innerHTML = '🤚 看到你的手在动，保持手指立起、手腕放平、像握鸡蛋～'; if (Date.now() - st.camLast > 5000) { st.camLast = Date.now(); speakGuide('手放得不错，手指立起来继续'); } }
        else { tip.innerHTML = '🤚 没检测到键盘上的手部动作，把手放在键盘上开始弹吧'; }
      }
    });
    st.cam = cam; st.camLast = 0; registerAISession(cam);
    cam.start().then(() => { $('#pianoCamStart').classList.add('hidden'); $('#pianoCamStop').classList.remove('hidden'); }).catch(err => { toast('摄像头开启失败：' + ((err && err.message) || err)); });
  }
  function stopPianoCam() {
    const st = window.__aiState.piano;
    if (st.cam) { st.cam.stop(); st.cam = null; }
    $('#pianoCamStart').classList.remove('hidden'); $('#pianoCamStop').classList.add('hidden');
    $('#pianoCamTip').classList.add('hidden');
  }

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
        { en: 'apple', phonetic: '/ˈæp.əl/', mean: '苹果', image: '🍎', memoryTip: { type: '谐音法', text: 'apple→阿婆→阿婆爱吃苹果' }, example: 'I eat an apple every day.', exampleCN: '我每天都吃一个苹果。' },
        { en: 'banana', phonetic: '/bəˈnɑː.nə/', mean: '香蕉', image: '🍌', memoryTip: { type: '联想法', text: 'banana→爸爸拿→爸爸拿香蕉' }, example: 'She likes bananas.', exampleCN: '她喜欢香蕉。' },
        { en: 'hello', phonetic: '/həˈləʊ/', mean: '你好', image: '👋', memoryTip: { type: '谐音法', text: 'hello→哈啰→见面说哈啰' }, example: 'Hello, nice to meet you.', exampleCN: '你好，很高兴见到你。' },
        { en: 'book', phonetic: '/bʊk/', mean: '书', image: '📖', memoryTip: { type: '拆词法', text: 'book→boo(600)+k→600K本书' }, example: 'This is my book.', exampleCN: '这是我的书。' },
        { en: 'cat', phonetic: '/kæt/', mean: '猫', image: '🐱', memoryTip: { type: '谐音法', text: 'cat→凯特→凯特养了一只猫' }, example: 'The cat is sleeping.', exampleCN: '猫正在睡觉。' },
        { en: 'dog', phonetic: '/dɒɡ/', mean: '狗', image: '🐶', memoryTip: { type: '谐音法', text: 'dog→多哥→多哥家养了狗' }, example: 'I have a dog.', exampleCN: '我有一只狗。' },
        { en: 'water', phonetic: '/ˈwɔː.tər/', mean: '水', image: '💧', memoryTip: { type: '联想法', text: 'water→沃特→沃特爱喝水' }, example: 'Please drink more water.', exampleCN: '请多喝点水。' },
        { en: 'happy', phonetic: '/ˈhæp.i/', mean: '开心的', image: '😊', memoryTip: { type: '谐音法', text: 'happy→嗨皮→嗨皮就是开心' }, example: 'I feel happy today.', exampleCN: '我今天感觉很开心。' },
        { en: 'thank', phonetic: '/θæŋk/', mean: '感谢', image: '🙏', memoryTip: { type: '谐音法', text: 'thank→三克→三克油=谢谢' }, example: 'Thank you very much.', exampleCN: '非常感谢你。' },
        { en: 'morning', phonetic: '/ˈmɔː.nɪŋ/', mean: '早晨', image: '🌅', memoryTip: { type: '拆词法', text: 'morning→mor(摸)+ning(宁)→早晨摸宁宁的头' }, example: 'Good morning!', exampleCN: '早上好！' }
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
        { en: 'schedule', phonetic: '/ˈʃedʒ.uːl/', mean: '日程表', image: '📅', memoryTip: { type: '谐音法', text: 'schedule→死车堵→死车堵了要改日程' }, example: 'What is your schedule today?', exampleCN: '你今天日程是什么？' },
        { en: 'colleague', phonetic: '/ˈkɒl.iːɡ/', mean: '同事', image: '👔', memoryTip: { type: '联想法', text: 'colleague→co(一起)+league(联盟)→一起联盟的同事' }, example: 'My colleague is very kind.', exampleCN: '我的同事很和蔼。' },
        { en: 'confirm', phonetic: '/kənˈfɜːm/', mean: '确认', image: '✅', memoryTip: { type: '谐音法', text: 'confirm→肯分→肯分给你才确认' }, example: 'Please confirm your order.', exampleCN: '请确认你的订单。' },
        { en: 'meeting', phonetic: '/ˈmiː.tɪŋ/', mean: '会议', image: '🤝', memoryTip: { type: '拆词法', text: 'meeting→meet(见面)+ing→见面就是开会' }, example: 'We have a meeting at 3 PM.', exampleCN: '我们下午三点有个会议。' },
        { en: 'invitation', phonetic: '/ˌɪn.vɪˈteɪ.ʃən/', mean: '邀请', image: '💌', memoryTip: { type: '联想法', text: 'in(里面)+vi(六)+tation→六张邀请函在里面' }, example: 'Thank you for the invitation.', exampleCN: '谢谢你的邀请。' },
        { en: 'restaurant', phonetic: '/ˈres.tər.ɒnt/', mean: '餐厅', image: '🍽️', memoryTip: { type: '谐音法', text: 'restaurant→瑞死特忍特→在餐厅忍住不吃' }, example: 'Let us go to a restaurant.', exampleCN: '我们去餐厅吧。' },
        { en: 'weather', phonetic: '/ˈweð.ər/', mean: '天气', image: '🌤️', memoryTip: { type: '联想法', text: 'wea(我们)+ther(ther)→我们聊天气' }, example: 'How is the weather?', exampleCN: '天气怎么样？' },
        { en: 'journey', phonetic: '/ˈdʒɜː.ni/', mean: '旅行', image: '✈️', memoryTip: { type: '谐音法', text: 'journey→ journeys→旅行的 journey' }, example: 'The journey was long but fun.', exampleCN: '旅程很长但很有趣。' },
        { en: 'delicious', phonetic: '/dɪˈlɪʃ.əs/', mean: '美味的', image: '😋', memoryTip: { type: '谐音法', text: 'delicious→地里舍斯→地里的食物 delicious' }, example: 'This cake is delicious.', exampleCN: '这个蛋糕很美味。' },
        { en: 'friendship', phonetic: '/ˈfrend.ʃɪp/', mean: '友谊', image: '❤️', memoryTip: { type: '拆词法', text: 'friend(朋友)+ship(船)→友谊的小船' }, example: 'Our friendship is important.', exampleCN: '我们的友谊很重要。' },
        { en: 'appointment', phonetic: '/əˈpɔɪnt.mənt/', mean: '预约', image: '📆', memoryTip: { type: '谐音法', text: 'appointment→额跑因特门特→预约才能进门' }, example: 'I have an appointment at 10.', exampleCN: '我十点有个预约。' },
        { en: 'experience', phonetic: '/ɪkˈspɪə.ri.əns/', mean: '经验', image: '💼', memoryTip: { type: '拆词法', text: 'ex(前)+perience(经历)→以前的经历就是经验' }, example: 'She has rich experience.', exampleCN: '她有丰富的经验。' },
        { en: 'department', phonetic: '/dɪˈpɑːt.mənt/', mean: '部门', image: '🏢', memoryTip: { type: '谐音法', text: 'department→低怕特门特→低怕特部门' }, example: 'Which department do you work in?', exampleCN: '你在哪个部门工作？' },
        { en: 'conference', phonetic: '/ˈkɒn.fər.əns/', mean: '会议', image: '🎤', memoryTip: { type: '谐音法', text: 'conference→看佛润斯→看佛润斯开会' }, example: 'The conference starts tomorrow.', exampleCN: '会议明天开始。' },
        { en: 'available', phonetic: '/əˈveɪ.lə.bəl/', mean: '有空的', image: '🟢', memoryTip: { type: '联想法', text: 'a(一)+vailable(微信)→一个微信说明有空' }, example: 'Are you available tomorrow?', exampleCN: '你明天有空吗？' }
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
        { en: 'cooperation', phonetic: '/kəʊˌɒp.ərˈeɪ.ʃən/', mean: '合作', image: '🤝', memoryTip: { type: '拆词法', text: 'co(共同)+operation(操作)→共同操作=合作' }, example: 'We need close cooperation.', exampleCN: '我们需要紧密合作。' },
        { en: 'deadline', phonetic: '/ˈded.laɪn/', mean: '截止日期', image: '⏰', memoryTip: { type: '拆词法', text: 'dead(死)+line(线)→死线=截止日期' }, example: 'The deadline is next Friday.', exampleCN: '截止日期是下周五。' },
        { en: 'negotiate', phonetic: '/nɪˈɡəʊ.ʃi.eɪt/', mean: '谈判', image: '⚖️', memoryTip: { type: '谐音法', text: 'negotiate→你够谁特→你够谁谈判' }, example: 'We need to negotiate the price.', exampleCN: '我们需要谈判价格。' },
        { en: 'responsibility', phonetic: '/rɪˌspɒn.sɪˈbɪl.ɪ.ti/', mean: '责任', image: '📋', memoryTip: { type: '拆词法', text: 'response(回应)+ibility→能回应=有责任' }, example: 'It is my responsibility.', exampleCN: '这是我的责任。' },
        { en: 'confidence', phonetic: '/ˈkɒn.fɪ.dəns/', mean: '自信', image: '💪', memoryTip: { type: '谐音法', text: 'confidence→看非等死→自信地看' }, example: 'I have confidence in you.', exampleCN: '我对你有信心。' },
        { en: 'opportunity', phonetic: '/ˌɒp.əˈtʃuː.nɪ.ti/', mean: '机会', image: '🚪', memoryTip: { type: '谐音法', text: 'opportunity→我扑推你蒂→抓住机会' }, example: 'This is a great opportunity.', exampleCN: '这是个好机会。' },
        { en: 'environment', phonetic: '/ɪnˈvaɪ.rən.mənt/', mean: '环境', image: '🌍', memoryTip: { type: '拆词法', text: 'en(使)+viron(周围)+ment→周围的一切=环境' }, example: 'We should protect the environment.', exampleCN: '我们应该保护环境。' },
        { en: 'contribution', phonetic: '/ˌkɒn.trɪˈbjuː.ʃən/', mean: '贡献', image: '🎁', memoryTip: { type: '拆词法', text: 'con(一起)+tribute(给予)+tion→一起给予=贡献' }, example: 'Your contribution is valuable.', exampleCN: '你的贡献很有价值。' },
        { en: 'presentation', phonetic: '/ˌprez.ənˈteɪ.ʃən/', mean: '演示', image: '📊', memoryTip: { type: '谐音法', text: 'presentation→破阵特神→演示破阵' }, example: 'I will give a presentation.', exampleCN: '我会做一个演示。' },
        { en: 'performance', phonetic: '/pəˈfɔː.məns/', mean: '表现', image: '📈', memoryTip: { type: '谐音法', text: 'performance→破佛慢死→表现慢吞吞' }, example: 'His performance was excellent.', exampleCN: '他的表现很出色。' },
        { en: 'suggestion', phonetic: '/səˈdʒestʃ.ən/', mean: '建议', image: '💡', memoryTip: { type: '谐音法', text: 'suggestion→色个神→给个好建议' }, example: 'Do you have any suggestion?', exampleCN: '你有什么建议吗？' },
        { en: 'evaluation', phonetic: '/ɪˌvæl.juˈeɪ.ʃən/', mean: '评估', image: '📉', memoryTip: { type: '拆词法', text: 'e(出)+value(价值)+ation→评估价值' }, example: 'We need an evaluation report.', exampleCN: '我们需要一份评估报告。' },
        { en: 'commitment', phonetic: '/kəˈmɪt.mənt/', mean: '承诺', image: '🤝', memoryTip: { type: '谐音法', text: 'commitment→可迷特门特→承诺迷住门特' }, example: 'I keep my commitment.', exampleCN: '我遵守承诺。' },
        { en: 'strategy', phonetic: '/ˈstræt.ə.dʒi/', mean: '策略', image: '♟️', memoryTip: { type: '谐音法', text: 'strategy→死抓特吉→死抓策略' }, example: 'What is our strategy?', exampleCN: '我们的策略是什么？' },
        { en: 'efficiency', phonetic: '/ɪˈfɪʃ.ən.si/', mean: '效率', image: '⚡', memoryTip: { type: '谐音法', text: 'efficiency→一飞神戏→效率一飞冲天' }, example: 'We should improve efficiency.', exampleCN: '我们应该提高效率。' },
        { en: 'perspective', phonetic: '/pəˈspek.tɪv/', mean: '视角', image: '🔭', memoryTip: { type: '谐音法', text: 'perspective→婆死拍特务→换个视角' }, example: 'From my perspective...', exampleCN: '从我的角度来看……' },
        { en: 'innovation', phonetic: '/ˌɪn.əˈveɪ.ʃən/', mean: '创新', image: '💡', memoryTip: { type: '拆词法', text: 'in(进入)+nov(新)+ation→进入新的=创新' }, example: 'Innovation drives progress.', exampleCN: '创新驱动进步。' },
        { en: 'acquisition', phonetic: '/ˌæk.wɪˈzɪʃ.ən/', mean: '获得；收购', image: '📦', memoryTip: { type: '谐音法', text: 'acquisition→爱可亏贼神→获得爱' }, example: 'The company made an acquisition.', exampleCN: '这家公司进行了一次收购。' },
        { en: 'sustainability', phonetic: '/səˌsteɪ.nəˈbɪl.ɪ.ti/', mean: '可持续性', image: '🌱', memoryTip: { type: '拆词法', text: 'sus(下)+tain(拿)+ability→能持续拿=可持续' }, example: 'Sustainability is important.', exampleCN: '可持续性很重要。' },
        { en: 'entrepreneur', phonetic: '/ˌɒn.trə.prəˈnɜːr/', mean: '企业家', image: '💼', memoryTip: { type: '谐音法', text: 'entrepreneur→昂特婆润牛→企业家很牛' }, example: 'He is a young entrepreneur.', exampleCN: '他是一位年轻的企业家。' }
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
        { en: 'sustainability', phonetic: '/səˌsteɪ.nəˈbɪl.ɪ.ti/', mean: '可持续性', image: '🌿', memoryTip: { type: '拆词法', text: 'sustain(维持)+ability(能力)→能维持=可持续' }, example: 'Corporate sustainability is key.', exampleCN: '企业可持续发展是关键。' },
        { en: 'acquisition', phonetic: '/ˌæk.wɪˈzɪʃ.ən/', mean: '收购', image: '🏢', memoryTip: { type: '谐音法', text: 'acquisition→阿亏贼神→收购亏了贼神' }, example: 'The acquisition was successful.', exampleCN: '这次收购很成功。' },
        { en: 'strategic', phonetic: '/strəˈtiː.dʒɪk/', mean: '战略的', image: '♟️', memoryTip: { type: '拆词法', text: 'strategy(策略)+ic→策略的=战略的' }, example: 'This is a strategic decision.', exampleCN: '这是一个战略决策。' },
        { en: 'perspective', phonetic: '/pəˈspek.tɪv/', mean: '视角', image: '👁️', memoryTip: { type: '谐音法', text: 'perspective→婆死拍特务→换个视角' }, example: 'From a global perspective...', exampleCN: '从全球视角来看……' },
        { en: 'controversial', phonetic: '/ˌkɒn.trəˈvɜː.ʃəl/', mean: '有争议的', image: '⚡', memoryTip: { type: '拆词法', text: 'contro(反)+vers(转)+ial→反转的=有争议的' }, example: 'It is a controversial topic.', exampleCN: '这是个有争议的话题。' },
        { en: 'entrepreneur', phonetic: '/ˌɒn.trə.prəˈnɜːr/', mean: '企业家', image: '🚀', memoryTip: { type: '谐音法', text: 'entrepreneur→昂特婆润牛→企业家很牛' }, example: 'The entrepreneur took risks.', exampleCN: '这位企业家承担了风险。' },
        { en: 'infrastructure', phonetic: '/ˈɪn.frəˌstrʌk.tʃər/', mean: '基础设施', image: '🌉', memoryTip: { type: '拆词法', text: 'infra(下)+structure(结构)→下面的结构=基础设施' }, example: 'We need better infrastructure.', exampleCN: '我们需要更好的基础设施。' },
        { en: 'optimization', phonetic: '/ˌɒp.tɪ.maɪˈzeɪ.ʃən/', mean: '优化', image: '⚙️', memoryTip: { type: '拆词法', text: 'optim(最好)+ization→做到最好=优化' }, example: 'Process optimization saves time.', exampleCN: '流程优化节省时间。' },
        { en: 'differentiation', phonetic: '/ˌdɪf.ər.en.ʃiˈeɪ.ʃən/', mean: '差异化', image: '🎨', memoryTip: { type: '拆词法', text: 'different(不同)+iation→差异化' }, example: 'Product differentiation matters.', exampleCN: '产品差异化很重要。' },
        { en: 'diversification', phonetic: '/daɪˌvɜː.sɪ.fɪˈkeɪ.ʃən/', mean: '多元化', image: '🌈', memoryTip: { type: '拆词法', text: 'diverse(多样)+ification→多元化' }, example: 'Diversification reduces risk.', exampleCN: '多元化降低风险。' },
        { en: 'accountability', phonetic: '/əˌkaʊn.təˈbɪl.ɪ.ti/', mean: '问责制', image: '⚖️', memoryTip: { type: '拆词法', text: 'account(账户)+ability→能算清账=问责' }, example: 'Accountability builds trust.', exampleCN: '问责制建立信任。' },
        { en: 'sophisticated', phonetic: '/səˈfɪs.tɪ.keɪ.tɪd/', mean: '复杂的；精密的', image: '🤖', memoryTip: { type: '谐音法', text: 'sophisticated→输飞思替Kated→复杂到输' }, example: 'It is a sophisticated system.', exampleCN: '这是一个复杂的系统。' },
        { en: 'disruptive', phonetic: '/dɪsˈrʌp.tɪv/', mean: '颠覆性的', image: '💥', memoryTip: { type: '拆词法', text: 'dis(分开)+rupt(断裂)+ive→断裂的=颠覆' }, example: 'Disruptive technology changes markets.', exampleCN: '颠覆性技术改变市场。' },
        { en: 'stakeholder', phonetic: '/ˈsteɪkˌhəʊl.dər/', mean: '利益相关者', image: '🧑‍🤝‍🧑', memoryTip: { type: '拆词法', text: 'stake(赌注)+holder(持有者)→利益相关者' }, example: 'We must consider all stakeholders.', exampleCN: '我们必须考虑所有利益相关者。' },
        { en: 'benchmark', phonetic: '/ˈbentʃ.mɑːk/', mean: '基准', image: '📏', memoryTip: { type: '拆词法', text: 'bench(长凳)+mark(标记)→板凳上的标记=基准' }, example: 'This is the industry benchmark.', exampleCN: '这是行业基准。' },
        { en: 'synergy', phonetic: '/ˈsɪn.ə.dʒi/', mean: '协同效应', image: '🔗', memoryTip: { type: '谐音法', text: 'synergy→吸拿鸡→协同效应吸金' }, example: 'The merger created synergy.', exampleCN: '这次合并创造了协同效应。' },
        { en: 'scalability', phonetic: '/ˌskeɪ.ləˈbɪl.ɪ.ti/', mean: '可扩展性', image: '📈', memoryTip: { type: '拆词法', text: 'scale(规模)+ability→能规模化=可扩展' }, example: 'Scalability is crucial for startups.', exampleCN: '可扩展性对初创公司至关重要。' },
        { en: 'resilience', phonetic: '/rɪˈzɪl.i.əns/', mean: '韧性', image: '🌲', memoryTip: { type: '谐音法', text: 'resilience→瑞贼林思→韧性十足' }, example: 'Resilience helps us recover.', exampleCN: '韧性帮助我们恢复。' },
        { en: 'proposition', phonetic: '/ˌprɒp.əˈzɪʃ.ən/', mean: '主张；提案', image: '📄', memoryTip: { type: '拆词法', text: 'pro(向前)+position(位置)→向前放=提案' }, example: 'What is your value proposition?', exampleCN: '你的价值主张是什么？' },
        { en: 'marginal', phonetic: '/ˈmɑː.dʒɪ.nəl/', mean: '边缘的；微小的', image: '↔️', memoryTip: { type: '拆词法', text: 'margin(边缘)+al→边缘的' }, example: 'The improvement is marginal.', exampleCN: '改进很微小。' },
        { en: 'volatile', phonetic: '/ˈvɒl.ə.taɪl/', mean: '波动的', image: '📉', memoryTip: { type: '谐音法', text: 'volatile→我来太哦→市场波动我来' }, example: 'The market is volatile.', exampleCN: '市场波动很大。' },
        { en: 'pragmatic', phonetic: '/præɡˈmæt.ɪk/', mean: '务实的', image: '🛠️', memoryTip: { type: '谐音法', text: 'pragmatic→扑来个Matt→务实的Matt' }, example: 'We need a pragmatic approach.', exampleCN: '我们需要务实的方法。' },
        { en: 'consolidate', phonetic: '/kənˈsɒl.ɪ.deɪt/', mean: '巩固；合并', image: '🧱', memoryTip: { type: '拆词法', text: 'con(一起)+solid(固体)+ate→变 solid=巩固' }, example: 'We need to consolidate gains.', exampleCN: '我们需要巩固成果。' },
        { en: 'compliance', phonetic: '/kəmˈplaɪ.əns/', mean: '合规', image: '📜', memoryTip: { type: '谐音法', text: 'compliance→看扑来安斯→合规才安心' }, example: 'Compliance is mandatory.', exampleCN: '合规是强制性的。' },
        { en: 'differentiate', phonetic: '/ˌdɪf.əˈren.ʃi.eɪt/', mean: '区分', image: '🔍', memoryTip: { type: '拆词法', text: 'different(不同)+iate→使不同=区分' }, example: 'How do you differentiate?', exampleCN: '你如何差异化？' }
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
    reception: { title: '前台接待', icon: '🏢', difficulty: '入门', time: '约5分钟', teach: '重点句型：Good morning, welcome to... / May I have your name? 注意 welcome 重读，name 用升调提问。不会的词用 I am here for... 补救。', grammar: '祈使句与礼貌用语：用 Could you / May I 比直接说更得体。', steps: [
      { ai: 'Good morning, welcome to our company.', keywords: ['good', 'morning', 'welcome', 'company'], highlight: '问候语使用正确', improve: '可补充自我介绍，如 I am XXX', bonus: 'Nice to meet you' },
      { ai: 'May I have your name, please?', keywords: ['name', 'i am', 'my name', 'call'], highlight: '回答清楚', improve: '可补充来访目的，如 I am here for the meeting', bonus: 'Nice to meet you too' },
      { ai: 'Nice to meet you, have a seat.', keywords: ['nice', 'meet', 'seat', 'thank'], highlight: '回应礼貌', improve: '可补充感谢，如 Thank you', bonus: 'Have a nice day' }
    ]},
    email: { title: '邮件沟通', icon: '📧', difficulty: '初级', time: '约8分钟', teach: '邮件三要素：开头 I hope this email finds you well. 中间说明目的，结尾 I look forward to your reply. 日期用 by + 星期/时间。', grammar: '将来时 will + 动词原形；礼貌请求用 Could you please...', steps: [
      { ai: 'I hope this email finds you well.', keywords: ['hope', 'email', 'well'], highlight: '邮件开头礼貌', improve: '可说明写信目的，如 I am writing to ask about...', bonus: 'I look forward to your reply' },
      { ai: 'Could you please send me the report by Friday?', keywords: ['report', 'friday', 'send'], highlight: '请求清楚', improve: '可确认截止时间，如 by 5 PM Friday', bonus: 'Thank you in advance' },
      { ai: 'Sure, I will send it this afternoon.', keywords: ['send', 'afternoon', 'will'], highlight: '回复明确', improve: '可补充附件说明，如 Please find the attachment', bonus: 'Best regards' }
    ]},
    blogger: { title: '博主连线', icon: '📹', difficulty: '初级', time: '约8分钟', teach: '连线开场：Hi, thanks for joining! 介绍自己用 I am a lifestyle blogger. 聊内容用 I mostly share... 邀请互动用 Feel free to ask me anything.', grammar: '一般现在时：I/you/we/they + 动词原形；第三人称加 -s。', steps: [
      { ai: 'Hi, thanks for joining this live stream!', keywords: ['hi', 'thanks', 'live'], highlight: '开场自然', improve: '可自我介绍，如 I am a lifestyle blogger', bonus: 'Nice to connect with you' },
      { ai: 'What kind of content do you usually create?', keywords: ['content', 'create', 'usually'], highlight: '问题表达清楚', improve: '可举例，如 makeup, vlog or review', bonus: 'That sounds interesting' },
      { ai: 'I mostly share daily skincare and makeup tips.', keywords: ['skincare', 'makeup', 'tips'], highlight: '回答具体', improve: '可邀请互动，如 Feel free to ask me anything', bonus: 'Let us stay in touch' }
    ]},
    travel: { title: '出差旅行', icon: '✈️', difficulty: '入门', time: '约5分钟', teach: '入住酒店：I would like to check in, please. 递证件说 Here you are. 问早餐用 What time is breakfast? 多用 please / thank you 显礼貌。', grammar: 'Would like to + 动词原形表礼貌请求；Here you are 是递东西固定说法。', steps: [
      { ai: 'Hello, I would like to check in, please.', keywords: ['check', 'in', 'like'], highlight: '表达清楚', improve: '可给出姓名和预订号，如 My name is...', bonus: 'I have a reservation' },
      { ai: 'May I see your passport?', keywords: ['passport', 'here', 'is'], highlight: '回应得体', improve: '可主动递上，如 Here you are', bonus: 'Thank you so much' },
      { ai: 'Here is your room key. Have a nice stay.', keywords: ['room', 'key', 'stay'], highlight: '礼貌回应', improve: '可询问早餐时间，如 What time is breakfast?', bonus: 'Have a wonderful day' }
    ]},
    chat: { title: '自由聊天', icon: '💬', difficulty: '进阶', time: '约10分钟', teach: '自由聊：先用 What do you usually do... 开启话题，回答用 I enjoy + 动名词，反问用 How about you? 让对话继续。', grammar: '动名词作宾语：enjoy / like + doing；频率用 usually / often。', steps: [
      { ai: 'What do you usually do in your free time?', keywords: ['free', 'time', 'usually', 'do'], highlight: '问题自然', improve: '可更具体，如 Do you prefer reading or sports?', bonus: 'That is a great hobby' },
      { ai: 'I enjoy taking photos and learning new things.', keywords: ['enjoy', 'photos', 'learning'], highlight: '表达流畅', improve: '可补充原因，如 because it helps me relax', bonus: 'We have a lot in common' },
      { ai: 'That is cool. What is your favorite city?', keywords: ['favorite', 'city', 'like'], highlight: '回应积极', improve: '可反问对方，如 How about you?', bonus: 'I would love to visit someday' }
    ]}
  };

  function getEngLevelHint(s) {
    const recent = s.history.slice(-3);
    if (!recent.length) return '完成今日学习即可开始记录学习表现';
    const avg = Math.round(recent.reduce((a, b) => a + b.acc, 0) / recent.length);
    if (recent.length < 3) return `再坚持 ${3 - recent.length} 天，系统会根据正确率自动调整难度`;
    if (avg >= 90 && s.level < 3) return '最近表现很棒，继续高分即可升级 ⤴️';
    if (avg <= 50 && s.level > 0) return '当前难度可能偏高，巩固基础后会自动降级 ⤵️';
    return `最近平均正确率 ${avg}%，当前难度适合你`;
  }
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
    const today = todayKey();
    const last = s.history[s.history.length - 1];
    // 每天只保留一条学习表现记录，多次学习取平均
    if (last && last.date === today) {
      last.acc = Math.round((last.acc + accuracy) / 2);
    } else {
      s.history.push({ date: today, acc: accuracy });
    }
    if (s.history.length > 10) s.history.shift();
    const recent = s.history.slice(-3);
    if (recent.length >= 3 && recent.every(x => x.acc >= 90) && s.level < 3) {
      s.level += 1; s.history = []; toast('🎉 连续3天表现优秀，难度自动升级！');
    } else if (recent.length >= 3 && recent.every(x => x.acc <= 50) && s.level > 0) {
      s.level -= 1; s.history = []; toast('难度已自动降低，先巩固基础 💪');
    }
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
      <button class="back-row" data-back>← 返回</button>
      <div class="sub-header"><h2>英语学习 🌍</h2><p>场景化闯关 · 当前难度自动匹配</p></div>
      <div class="clover-card">
        <div class="clover-section clover-cut-left"><div class="clover-icon">🔥</div><div class="clover-num">${s.streak}</div><div class="clover-label">连续天</div></div>
        <div class="clover-section clover-cut-mid"><div class="clover-icon">⭐</div><div class="clover-num">${s.xp}</div><div class="clover-label">经验值</div></div>
        <div class="clover-section clover-cut-right"><div class="clover-icon">❤️</div><div class="clover-num">${s.hp}</div><div class="clover-label">生命值</div></div>
      </div>
      <div class="card" style="padding:14px 16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;">难度等级 <span style="font-size:11px;color:var(--text-tertiary);font-weight:500;">(自动调整)</span></div>
          <div style="font-size:12px;color:var(--pink);font-weight:700;">当前：${ENGLISH_LEVELS[s.level]}</div>
        </div>
        <div class="diff-tabs">${ENGLISH_LEVELS.map((l, i) => `<button class="diff-tab ${i === s.level ? 'active' : ''}" data-el="${i}">${l}${i === s.level ? '<span class="diff-pulse"></span>' : ''}</button>`).join('')}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px;line-height:1.5;">${getEngLevelHint(s)} · 连续3天≥90%升级 / ≤50%降级</div>
      </div>
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

  /* 今日学习任务流 */
  function renderEnglishTasks() {
    const tasks = generateDailyTasks();
    window.__dailyTasks = tasks;
    openSubpage('今日学习任务 📖', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>📖 今日学习任务</h2><p>共 ${tasks.length} 题 · 错题优先 · 新词补齐</p></div>
      ${tasks.length ? tasks.map((t, i) => `<div class="eng-menu-row" data-dotask="${i}"><div class="eng-menu-left"><div class="eng-menu-icon">${t.type === 'new' ? '🆕' : t.type === 'review' ? '🔄' : '✍️'}</div><div><div class="eng-menu-title">${i + 1}. ${esc(t.en)}</div><div class="eng-menu-sub">${t.type === 'new' ? '新词学习' : t.type === 'review' ? `艾宾浩斯第${(t.round || 0) + 1}轮回顾` : '错题巩固'}</div></div></div><span style="color:var(--text-tertiary);">›</span></div>`).join('') : '<div class="empty">今日任务已清空，明天见！</div>'}
    `);
  }
  function goNextTask(taskIdx) {
    const tasks = window.__dailyTasks || generateDailyTasks();
    const next = taskIdx + 1;
    if (next >= tasks.length) { renderEnglishDailyComplete(); return; }
    const t = tasks[next];
    if (t.type === 'new') renderEnglishWord(t.en, next, false);
    else if (t.type === 'review') renderEnglishReviewQuiz(t.en, next, false);
    else renderEnglishDictation(t.en, next, false);
  }

  function renderEnglishWord(en, taskIdx, push = false) {
    const info = getWordInfo(en);
    ensureWordState(info, info.levelIdx);
    (push ? openSubpage : replaceSubpage)(`${en} · 新词学习`, `
      <button class="back-row" data-engback>← 返回任务列表</button>
      <div class="sub-header"><h2>📖 新词学习</h2><p>${ENGLISH_LEVELS[info.levelIdx]} · ${esc(info.en)}</p></div>
      <div class="word-card">
        <div class="word-en">${info.image} ${info.en}</div>
        <div class="word-phonetic">${info.phonetic} <button class="btn-outline" data-speak="${esc(info.en)}" style="padding:4px 10px;font-size:12px;">🔊 朗读</button></div>
        <div class="word-meaning">${info.mean}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:10px;">
          <div>例句：${info.example} <button class="btn-outline" data-speak="${esc(info.example)}" style="padding:4px 10px;font-size:12px;">🔊 朗读例句</button></div>
          <div style="margin-top:4px;color:var(--text-tertiary);">${info.exampleCN || ''}</div>
        </div>
      </div>
      <div class="card"><h4 style="margin:0 0 8px;">💡 记忆口诀 · ${info.memoryTip.type}</h4><p style="font-size:13px;color:var(--text-secondary);margin:0;">${info.memoryTip.text}</p></div>
      <button class="btn-primary" data-knownew="${esc(en)}" data-taskidx="${taskIdx}" style="width:100%;">✅ 我记住了，+5经验</button>
    `);
    autoSpeakWord(en);
  }

  function renderEnglishDictation(en, taskIdx, push = false) {
    const info = getWordInfo(en);
    const ws = ensureWordState(info, info.levelIdx);
    const backText = taskIdx >= 0 ? '← 返回任务列表' : '← 返回上一页';
    (push ? openSubpage : replaceSubpage)(`${en} · 默写`, `
      <button class="back-row" data-engback>${backText}</button>
      <div class="sub-header"><h2>✍️ 单词默写</h2><p>${ENGLISH_LEVELS[info.levelIdx]} · 连续3天正确才掌握</p></div>
      <div class="dictation-card">
        <div class="dictation-word">${info.image} ${info.mean}</div>
        <div class="dictation-tip">${info.phonetic} <button class="btn-outline" data-speak="${esc(info.en)}" style="padding:4px 10px;font-size:12px;">🔊 听发音</button></div>
        <input id="dictInput" class="dictation-input" placeholder="输入英文拼写" autocomplete="off" />
        <div id="dictFeedback" style="margin-top:12px;display:none;"></div>
        <button class="btn-primary" data-checkspell="${esc(en)}" data-taskidx="${taskIdx}" style="width:100%;margin-top:12px;">提交</button>
      </div>
      <div class="card"><h4 style="margin:0 0 8px;">📊 当前状态</h4><p style="font-size:13px;color:var(--text-secondary);margin:0;">连续正确 ${ws.consecutiveCorrect}/3 · 错误 ${ws.wrongCount} 次</p><div class="progress-mini"><div class="progress-mini-fill" style="width:${Math.min(100, ws.consecutiveCorrect / 3 * 100)}%"></div></div></div>
    `);
    autoSpeakWord(en);
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
      <div class="sub-header"><h2>${sc.icon} ${sc.title}</h2><p>${sc.difficulty} · 教学 → 对话 → 纠错</p></div>
      <div id="speakChat" class="chat-wrap">
        <div class="chat-bubble chat-ai"><b>📚 课前小灶（AI 先带你学一遍）</b><br/>${esc(sc.teach)}</div>
      </div>
      <div class="chat-input-row">
        <input id="speakInput" placeholder="先学完上面的小灶，再开始对话…" disabled />
        <button id="speakMic" class="mic-btn" data-micscene="${esc(sceneId)}" disabled>🎙️</button>
        <button id="speakSend" data-sendscene="${esc(sceneId)}" disabled>➤</button>
      </div>
      <div style="text-align:center;margin-top:10px;">
        <button class="btn-primary" id="speakStart">✅ 我学会了，开始对话 →</button>
      </div>
      <div id="speakResult" class="chat-feedback" style="display:none;"></div>
    `);
    window.__speakScene = sceneId;
    window.__speakStep = 0;
    window.__speakStars = 0;
    window.__speakPhase = 'teach';
    window.__speakMiss = [];
    window.__speakFreeN = 0;
  }

  function speakFeedback(sceneId, userText) {
    if (window.__speakPhase === 'done') return;
    const sc = speakScenarios[sceneId];
    const chat = $('#speakChat');
    const userBubble = document.createElement('div'); userBubble.className = 'chat-bubble chat-user'; userBubble.textContent = userText || '…'; chat.appendChild(userBubble);
    if (window.__speakPhase === 'free') {
      const replies = ['Nice! Tell me more.', 'That sounds good. Why do you like it?', 'Great! How often do you do that?', 'Interesting! I see.', 'Well said!'];
      const rep = replies[Math.floor(Math.random() * replies.length)];
      window.__speakFreeN++;
      setTimeout(() => {
        const n = document.createElement('div'); n.className = 'chat-bubble chat-ai'; n.textContent = rep; chat.appendChild(n); chat.scrollTop = chat.scrollHeight;
        if (window.__speakFreeN >= 2) endSpeakWithCritique(sc);
      }, 800);
      chat.scrollTop = chat.scrollHeight; return;
    }
    const step = sc.steps[window.__speakStep];
    const lower = (userText || '').toLowerCase();
    let stars = 0;
    step.keywords.forEach(kw => { if (lower.includes(kw.toLowerCase())) stars++; });
    if (lower.includes(step.bonus.toLowerCase())) stars++;
    stars = Math.min(5, Math.max(1, stars));
    window.__speakStars += stars;
    const hasKw = step.keywords.some(kw => lower.includes(kw.toLowerCase()));
    const hasBonus = lower.includes(step.bonus.toLowerCase());
    if (!hasKw) window.__speakMiss.push({ step: window.__speakStep + 1, need: step.keywords.join(' / '), improve: step.improve });
    const fb = `<b>⭐ ${stars}/5</b><br/>${hasKw ? '✅ ' + esc(step.highlight) : '💡 ' + esc(step.improve)}${hasBonus ? '<br/>🎉 加分表达：' + esc(step.bonus) : ''}`;
    const fbDiv = document.createElement('div'); fbDiv.className = 'chat-feedback'; fbDiv.innerHTML = fb; chat.appendChild(fbDiv);
    window.__speakStep++;
    if (window.__speakStep < sc.steps.length) {
      setTimeout(() => { const next = document.createElement('div'); next.className = 'chat-bubble chat-ai'; next.textContent = sc.steps[window.__speakStep].ai; chat.appendChild(next); chat.scrollTop = chat.scrollHeight; }, 800);
    } else {
      window.__speakPhase = 'free'; window.__speakFreeN = 0;
      setTimeout(() => { const n = document.createElement('div'); n.className = 'chat-bubble chat-ai'; n.textContent = "Now let's free-talk! Say anything you like 💬"; chat.appendChild(n); chat.scrollTop = chat.scrollHeight; }, 800);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function endSpeakWithCritique(sc) {
    window.__speakPhase = 'done';
    const total = window.__speakStars;
    const avg = Math.round(total / sc.steps.length);
    const acc = avg >= 4 ? 90 : avg >= 3 ? 75 : 55;
    let critique = `<b>🎓 课后诊断</b><br/>对话总星数：${total} ⭐ · 平均 ${avg}/5<br/>`;
    if (window.__speakMiss.length) {
      critique += `<br/>📌 这次漏掉的表达：<br/>` + window.__speakMiss.map(m => `• 第${m.step}轮：应含 <b>${esc(m.need)}</b><br/>　改进：${esc(m.improve)}`).join('<br/>');
    } else { critique += `<br/>✅ 关键词都覆盖到了，很棒！`; }
    critique += `<br/><br/>🗣️ 发音建议：放慢语速，重读实词（名词/动词），用 Web Speech 反复跟读例句。<br/>📚 语法重点：${esc(sc.grammar || '注意主谓一致和时态。')}`;
    const end = document.createElement('div'); end.className = 'chat-feedback'; end.innerHTML = critique; const chat = $('#speakChat'); chat.appendChild(end);
    const s = getEngState(); s.xp += 10; s.map['口语'] = Math.min(100, s.map['口语'] + 10); if (avg >= 4) s.streak += 1; setEngState(s);
    checkEngLevelAdjust(acc);
    toast('口语对练完成 +10经验');
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

  function renderEnglishReviewQuiz(en, taskIdx, push = false) {
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
    const rbackText = taskIdx >= 0 ? '← 返回任务列表' : '← 返回上一页';
    (push ? openSubpage : replaceSubpage)(`回顾 · ${en} 🔄`, `
      <button class="back-row" data-engback>${rbackText}</button>
      <div class="sub-header"><h2>🔄 第 ${round + 1} 轮回顾</h2><p>${type}</p></div>
      <div class="dictation-card"><div class="dictation-word">${q}</div>${hint}<input id="reviewInput" class="dictation-input" placeholder="输入答案" autocomplete="off" /></div>
      <button class="btn-primary" data-checkreview="${esc(en)}" data-taskidx="${taskIdx}" style="width:100%;">提交答案</button>
    `);
    if (round % 6 === 1 || round % 6 >= 4) autoSpeakWord(en);
  }

  function renderEnglishPlacement() {
    const questions = [
      { q: '入门：苹果的英语是？', levelHint: '入门', audio: 'apple', answer: 'apple' },
      { q: '初级：日程表的英语是？', levelHint: '初级', audio: 'schedule', answer: 'schedule' },
      { q: '中级：截止日期的英语是？', levelHint: '中级', audio: 'deadline', answer: 'deadline' }
    ];
    openSubpage('开局自测定级 🎯', `
      <button class="back-row" data-engback>← 返回</button>
      <div class="sub-header"><h2>🎯 开局自测定级</h2><p>3道题 · 答完自动跳到对应难度</p></div>
      <div class="card" style="background:var(--primary-light);margin-bottom:12px;"><p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.6;">系统会根据你的答案自动推荐最适合的初始难度，之后仍会根据每日学习表现继续自动升降。</p></div>
      ${questions.map((q, i) => `<div class="dictation-card" style="margin-bottom:10px;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">${i + 1}. ${q.q} <span style="font-size:11px;color:var(--text-tertiary);font-weight:500;">(${q.levelHint})</span></div><button class="btn-outline" data-speak="${esc(q.audio)}" style="margin-bottom:10px;">🔊 播放发音</button><input class="dictation-input placement-ans" data-idx="${i}" data-ans="${esc(q.answer)}" placeholder="输入英文" autocomplete="off" /></div>`).join('')}
      <button class="btn-primary" id="engPlacementSubmit" style="width:100%;">提交定级</button>
    `);
  }

  /* 今日任务完成页：默写 + 听写 + 语法 */
  function renderEnglishDailyComplete() {
    const s = getEngState();
    const todayWords = (window.__dailyTasks || []).filter(t => t.type === 'new').map(t => t.en).filter(Boolean);
    window.__dailyNewWords = todayWords;
    replaceSubpage('今日任务完成 🎉', `
      <button class="back-row" data-engback>← 返回英语学习</button>
      <div class="sub-header"><h2>🎉 今日任务完成</h2><p>全部记住后，进入巩固训练</p></div>
      <div class="clover-card" style="margin-bottom:14px;">
        <div class="clover-section"><div class="clover-icon">🔥</div><div class="clover-num">${s.streak}</div><div class="clover-label">连续天</div></div>
        <div class="clover-section"><div class="clover-icon">⭐</div><div class="clover-num">${s.xp}</div><div class="clover-label">经验值</div></div>
        <div class="clover-section"><div class="clover-icon">❤️</div><div class="clover-num">${s.hp}</div><div class="clover-label">生命值</div></div>
      </div>
      ${todayWords.length ? `
      <div class="card" style="background:linear-gradient(90deg,#E8F5E9,#fff);">
        <h4 style="margin:0 0 8px;">✍️ 默写巩固</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">把今天学过的 ${todayWords.length} 个单词全部默写一遍。</p>
        <button class="btn-primary" data-complete="dictation" style="width:100%;">开始默写</button>
      </div>
      <div class="card" style="background:linear-gradient(90deg,#E3F2FD,#fff);">
        <h4 style="margin:0 0 8px;">🎧 听写巩固</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">听发音写出英文。</p>
        <button class="btn-primary" data-complete="listen" style="width:100%;">开始听写</button>
      </div>
      <div class="card" style="background:linear-gradient(90deg,#F3E5F5,#fff);">
        <h4 style="margin:0 0 8px;">📐 语法运用</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">用今天单词完成语法填空。</p>
        <button class="btn-primary" data-complete="grammar" style="width:100%;">开始语法</button>
      </div>
      ` : '<div class="empty">今天没有新词，去练练听力或口语吧！</div>'}
    `);
  }
  function renderEnglishDailyDictation(words, idx, push = false) {
    const en = words[idx];
    const info = getWordInfo(en);
    (push ? openSubpage : replaceSubpage)(`默写巩固 ${idx + 1}/${words.length} ✍️`, `
      <button class="back-row" data-engback>← 返回完成页</button>
      <div class="sub-header"><h2>✍️ 默写巩固</h2><p>${idx + 1}/${words.length} · ${info.mean}</p></div>
      <div class="dictation-card">
        <div class="dictation-word">${info.image} ${info.mean}</div>
        <input id="dailyDictInput" class="dictation-input" placeholder="输入英文拼写" autocomplete="off" />
        <div id="dailyDictFeedback" style="margin-top:12px;display:none;"></div>
        <button class="btn-primary" data-dailydict="${esc(en)}" data-idx="${idx}" data-total="${words.length}" style="width:100%;margin-top:12px;">提交</button>
      </div>
    `);
  }
  function renderEnglishDailyListen(words, idx, push = false) {
    const en = words[idx];
    (push ? openSubpage : replaceSubpage)(`听写巩固 ${idx + 1}/${words.length} 🎧`, `
      <button class="back-row" data-engback>← 返回完成页</button>
      <div class="sub-header"><h2>🎧 听写巩固</h2><p>${idx + 1}/${words.length}</p></div>
      <div class="dictation-card">
        <button class="btn-outline" data-speak="${esc(en)}" style="margin-bottom:12px;">🔊 播放发音</button>
        <input id="dailyListenInput" class="dictation-input" placeholder="写出听到的单词" autocomplete="off" />
        <div id="dailyListenFeedback" style="margin-top:12px;display:none;"></div>
        <button class="btn-primary" data-dailylisten="${esc(en)}" data-idx="${idx}" data-total="${words.length}" style="width:100%;margin-top:12px;">提交</button>
      </div>
    `);
    autoSpeakWord(en);
  }
  function renderEnglishDailyGrammar(words, idx, push = false) {
    const en = words[idx];
    const info = getWordInfo(en);
    const templates = [
      `I eat an ______ every day.`,
      `Please drink more ______.`,
      `She likes ______.`
    ];
    const q = templates[idx % 3].replace('______', '____');
    (push ? openSubpage : replaceSubpage)(`语法运用 ${idx + 1}/${Math.min(words.length, 5)} 📐`, `
      <button class="back-row" data-engback>← 返回完成页</button>
      <div class="sub-header"><h2>📐 语法运用</h2><p>${idx + 1}/${Math.min(words.length, 5)} · 填入正确单词</p></div>
      <div class="dictation-card">
        <div style="font-size:15px;line-height:1.7;margin-bottom:12px;">${q} <span style="font-size:12px;color:var(--text-tertiary);">（${info.mean}）</span></div>
        <input id="dailyGrammarInput" class="dictation-input" placeholder="填入正确单词" autocomplete="off" />
        <div id="dailyGrammarFeedback" style="margin-top:12px;display:none;"></div>
        <button class="btn-primary" data-dailygrammar="${esc(en)}" data-idx="${idx}" data-total="${Math.min(words.length, 5)}" style="width:100%;margin-top:12px;">提交</button>
      </div>
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
  const SPORT_DATA = {
    tradition: [
      { name: '八段锦·标准跟练', desc: '国家体育总局标准版，8个动作疏通筋骨', dur: 12, search: '八段锦 标准教学 完整版' },
      { name: '八段锦·分段精讲', desc: '逐式拆解，新手也能学会', dur: 15, search: '八段锦 分段讲解 新手' },
      { name: '金刚功·全套', desc: '张至顺道长金刚功，温养阳气', dur: 15, search: '金刚功 全套 张至顺' },
      { name: '简化太极拳·24式', desc: '柔和缓慢，平衡身心', dur: 20, search: '简化太极拳 24式 教学' },
      { name: '八段锦·办公室坐姿版', desc: '坐着也能练，缓解久坐僵硬', dur: 8, search: '八段锦 坐姿 办公室' }
    ],
    strength: {
      leg: { name: '腿部力量', desc: '深蹲/箭步蹲，练出腿臀线条', dur: 10, search: '居家 腿臀训练 无器械', stretch: '大腿前侧&后侧拉伸' },
      butt: { name: '臀桥训练', desc: '臀桥+蚌式，提臀不粗腿', dur: 10, search: '居家 翘臀训练 无器械', stretch: '臀肌拉伸' },
      abs: { name: '腹部核心', desc: '卷腹+平板，收紧小腹', dur: 10, search: '居家 腹肌训练 无器械', stretch: '腹部拉伸' },
      arm: { name: '手臂线条', desc: '手臂塑形，告别拜拜肉', dur: 10, search: '居家 手臂训练 无器械', stretch: '手臂拉伸' },
      shoulder: { name: '肩颈放松', desc: '肩部绕环+颈部拉伸', dur: 8, search: '肩颈放松 拉伸 舒缓', stretch: '肩颈拉伸' },
      chest: { name: '胸背舒展', desc: '俯卧撑+扩胸，改善含胸', dur: 10, search: '居家 胸肌训练 无器械', stretch: '胸部拉伸' },
      back: { name: '背部训练', desc: '燕飞+划船，挺拔身姿', dur: 10, search: '居家 背肌训练 无器械', stretch: '背部拉伸' }
    },
    period: [
      { name: '经期舒缓瑜伽', desc: '猫牛式/仰卧束角，不压迫腹部', dur: 15, search: '经期瑜伽 舒缓 不压迫腹部' },
      { name: '经期呼吸放松', desc: '腹式呼吸+轻柔扭转，缓解不适', dur: 10, search: '经期 舒缓 呼吸 放松' }
    ]
  };
  function getSportData() {
    const p = load(LS.personal, {});
    return p.sport || { periodMode: false, date: '', pickType: '', pickKey: '' };
  }
  function setSportData(d) { const p = load(LS.personal, {}); p.sport = d; save(LS.personal, p); }
  function sportDailyPick(force) {
    const d = getSportData();
    const today = todayKey();
    if (!force && d.date === today && d.pickKey) return d;
    if (d.periodMode) {
      const idx = Math.floor(Math.random() * SPORT_DATA.period.length);
      d.pickType = 'period'; d.pickKey = 'p' + idx; d.date = today;
    } else {
      const r = Math.random();
      if (r < 0.55) { const idx = Math.floor(Math.random() * SPORT_DATA.tradition.length); d.pickType = 'tradition'; d.pickKey = 't' + idx; }
      else { const keys = Object.keys(SPORT_DATA.strength); const k = keys[Math.floor(Math.random() * keys.length)]; d.pickType = 'strength'; d.pickKey = k; }
      d.date = today;
    }
    setSportData(d); return d;
  }
  function renderSport() {
    const d = sportDailyPick(false);
    let ex, stretchHint = '';
    if (d.pickType === 'period') ex = SPORT_DATA.period[Number(d.pickKey.slice(1))];
    else if (d.pickType === 'tradition') ex = SPORT_DATA.tradition[Number(d.pickKey.slice(1))];
    else { ex = SPORT_DATA.strength[d.pickKey]; stretchHint = ex.stretch; }
    const searchUrl = 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(ex.search);
    openSubpage('运动计划 💪', `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="sub-header"><h2>运动计划 💪</h2><p>每日随机一项 · 优先传统养生</p></div>
      <div class="toggle-row">
        <div><div class="tg-label">🌸 姨妈期模式</div><div class="tg-sub">开启后自动替换为经期舒缓练习</div></div>
        <div class="switch ${d.periodMode ? 'on' : ''}" id="sportToggle"></div>
      </div>
      <div class="sport-hero"><h3>今日推荐 · ${esc(ex.name)}</h3><p>${esc(ex.desc)} · 约 ${ex.dur} 分钟</p></div>
      <div class="card">
        <h4 style="margin:0 0 10px;">📺 跟练视频</h4>
        <div class="video-item" data-search="${esc(ex.search)}">
          <div class="video-info"><div class="video-title">${esc(ex.name)} · 跟练</div><div class="video-meta">B站搜索 · 选播放量高的跟练</div></div>
          <div class="video-actions">
            <a href="${searchUrl}" target="_blank" rel="noopener" class="btn-primary" style="text-align:center;">▶ 去 B站跟练 ↗</a>
          </div>
        </div>
      </div>
      ${stretchHint ? `<div class="stretch-box">💡 力量训练后记得拉伸：<b>${esc(stretchHint)}</b>。可在 B站搜「${esc(stretchHint)}」跟练。</div>` : ''}
      <button class="btn-outline" id="sportChange" style="width:100%;margin-bottom:12px;">🔄 换一项（${d.periodMode ? '经期舒缓' : '今日随机'}）</button>
      <div class="ai-form">
        <label>🏃 AI 运动教练 · 今天身体感觉如何？（可多选）</label>
        <div class="chip-grid" id="sportFeel">
          ${['腰酸', '腿软', '乏力', '膝盖不适', '肩颈酸', '状态很好'].map(f => `<button class="chip" data-feel="${esc(f)}">${esc(f)}</button>`).join('')}
        </div>
        <button class="btn-primary" id="sportCoach" style="width:100%;margin-top:10px;">让 AI 教练调整计划</button>
        <div id="sportCoachResult" class="ai-result hidden" style="margin-top:12px;"></div>
      </div>
    `);
  }

  /* ---------- AI爆品 / 新闻 ---------- */
  let aipTime = '每日', aipPlat = '全部', newsCat = '全部';
  const AIP_FLAT = [
    { title: '便携式制冷杯', tag: 'hot', tagText: '爆款', sales: '2.3w+', commission: '25%', rating: '4.8', script: '“夏天办公室没有冰箱？这个制冷杯3秒冰镇你的饮料！”→展示对比普通杯子 vs 制冷杯→上手演示→价格锚定“一杯奶茶钱”' },
    { title: '防晒空顶帽', tag: 'trend', tagText: '趋势', sales: '5.6w+', commission: '20%', rating: '4.9', script: '“军训/通勤不晒黑的秘密”→紫外线测试卡对比→多场景佩戴展示→强调“不闷热不勒头”痛点解决' },
    { title: '冷泡茶随身杯', tag: 'new', tagText: '新品', sales: '1.8w+', commission: '30%', rating: '4.7', script: '“打工人续命水，冷水也能泡好茶”→30秒冷泡演示→对比瓶装茶价格→“一个月省下200块奶茶钱”' },
    { title: '次抛洗护旅行装', tag: 'potential', tagText: '潜力', sales: '9.8k+', commission: '22%', rating: '4.6', script: '“出差党的救星，一次一片不脏手”→拆箱展示→飞机/酒店场景演示→“比酒店小瓶靠谱10倍”' },
    { title: '桌面多巴胺收纳盒', tag: 'hot', tagText: '爆款', sales: '3.1w+', commission: '18%', rating: '4.8', script: '“工位乱到被老板点名？”→ before/after 桌面改造→分格收纳演示→“颜值与实用并存”' },
    { title: '磁吸充电小夜灯', tag: 'trend', tagText: '趋势', sales: '2.7w+', commission: '24%', rating: '4.7', script: '“租房党床头神器”→磁吸安装演示→三档色温对比→“不用布线也能有氛围感”' },
    { title: '挂耳咖啡礼盒', tag: 'new', tagText: '新品', sales: '1.2w+', commission: '28%', rating: '4.9', script: '“早八人的续命仪式感”→手冲过程特写→风味卡片展示→“比瑞幸更香更便宜”' },
    { title: '早C晚A精华套装', tag: 'hot', tagText: '爆款', sales: '4.5w+', commission: '15%', rating: '4.8', script: '“敏感肌也能抄作业的护肤公式”→28天打卡对比→成分表解读→“一套搞定暗沉细纹”' },
    { title: '氛围感星星串灯', tag: 'potential', tagText: '潜力', sales: '8.5k+', commission: '32%', rating: '4.5', script: '“租房氛围感天花板”→安装过程→关灯前后对比→“几十块拍出电影感卧室”' },
    { title: '洞洞鞋鞋花DIY', tag: 'hot', tagText: '爆款', sales: '6.2w+', commission: '21%', rating: '4.7', script: '“洞门永存！一双鞋换100种皮肤”→鞋花搭配合集→主题改造（库洛米/多巴胺）→“每天出门不重样”' },
    { title: '披肩外搭空调衫', tag: 'trend', tagText: '趋势', sales: '1.9w+', commission: '19%', rating: '4.6', script: '“办公室冷气太猛？这件空调衫拯救老寒肩”→搭配吊带/连衣裙→面料透气测试→“通勤防晒两不误”' },
    { title: '凉感冰丝枕', tag: 'new', tagText: '新品', sales: '3.4w+', commission: '17%', rating: '4.8', script: '“夏天睡觉一头汗？”→测温对比→仰卧/侧睡支撑展示→“不开空调也凉快”' }
  ];
  const AIP_PLATS = ['抖音', '快手', '小红书'];
  const AIP_TIMES = ['每日', '每周', '每月'];
  function buildAipNested(flat) {
    const res = {};
    AIP_PLATS.forEach(p => { res[p] = {}; AIP_TIMES.forEach(t => { res[p][t] = flat.slice(0, 6); }); });
    return res;
  }
  const AIPRODUCT_FALLBACK = buildAipNested(AIP_FLAT);
  const NEWS_FALLBACK = [
    { source: '中国新闻网', cat: '时政要闻', title: '今日要闻将在每次自动刷新后更新', summary: '新闻模块已接入每日自动抓取（中国新闻网/央视/微博热搜/虎嗅/36氪/知乎日报），打开即可看到当天最新内容。', time: '每日更新', url: 'https://www.chinanews.com.cn/' },
    { source: '人民网', cat: '民生社会', title: '便民政策早知道', summary: '社保、医保、出行等民生资讯每日汇总。', time: '每日更新', url: 'http://www.people.com.cn/' },
    { source: '新华网', cat: '财经动态', title: '财经市场每日动态', summary: '股市、消费、产业等财经资讯汇总。', time: '每日更新', url: 'http://www.xinhuanet.com/fortune/' },
    { source: '新华网', cat: '国际风云', title: '国际局势一日概览', summary: '全球热点与外交动态汇总。', time: '每日更新', url: 'http://www.xinhuanet.com/world/' },
    { source: '新华网', cat: '科技前沿', title: '科技新鲜事', summary: '前沿技术、产业创新资讯汇总。', time: '每日更新', url: 'http://www.xinhuanet.com/tech/' },
    { source: '微博热搜', cat: '今日热榜', title: '微博实时热搜', summary: '今日网友最关心的话题。', time: '每日更新', url: 'https://s.weibo.com/top/summary' }
  ];
  function renderAiproduct() {
    const aipData = (daily.aiproduct && daily.aiproduct['抖音']) ? daily.aiproduct : AIPRODUCT_FALLBACK;
    const tagClass = t => {
      if (t === '爆款' || t === 'hot') return 'hot';
      if (t === '趋势' || t === 'trend') return 'trend';
      if (t === '新品' || t === 'new') return 'new';
      return 'potential';
    };
    const tagText = p => p.tagText || ({ hot: '爆款', trend: '趋势', new: '新品', potential: '潜力' }[p.tag] || '潜力');
    const aipCard = (p, showPlat) => {
      const isReal = p.real;
      const saleVal = p.sales || '—';
      const commVal = p.commission || '—';
      const saleReal = isReal && p.sales && p.sales !== '趋势参考';
      const commReal = isReal && p.commission && p.commission !== '趋势参考';
      const highBadge = (p.high && commReal) ? `<span class="aip-high">🔥高佣</span>` : '';
      const srcLine = p.source ? `<span class="aip-src">来源：${esc(p.source)}</span>` : '';
      const catLine = (p.cat ? `🏷️ ${esc(p.cat)} ` : '') + srcLine;
      const amountLine = (isReal && p.amount && p.amount !== '—') ? ` · <span class="aip-amount">${esc(p.amount)}</span>` : '';
      const suitLine = p.suit ? `<div class="aip-suit">✅ 适合你：${esc(p.suit)}</div>` : '';
      const reviewGood = p.review && (p.review.indexOf('好评') >= 0 || p.review.indexOf('%)') >= 0);
      const reviewLine = p.review ? `<div class="aip-review ${reviewGood ? 'aip-review-good' : ''}">💬 真实口碑：${esc(p.review)}</div>` : '';
      const convLine = (p.conv && p.conv !== '—') ? `<div class="aip-stat"><span class="aip-stat-icon">📈</span>30天转化 <span class="aip-stat-val aip-good">${esc(p.conv)}</span></div>` : '';
      const searchUrl = 'https://www.baidu.com/s?wd=' + encodeURIComponent(p.title + ' 真实评价 测评 小红书');
      const searchBtn = `<a class="aip-search-btn" href="${searchUrl}" target="_blank" rel="noopener">🔍 搜这个产品的真实评价</a>`;
      return `<div class="aip-card">
        <div class="aip-card-head">
          <div class="aip-card-title">${esc(p.title)}${showPlat ? `<span class="aip-plat-tag">${esc(p._plat || '')}</span>` : ''}</div>
          ${highBadge || `<span class="aip-tag ${tagClass(p.tagText || p.tag)}">${esc(tagText(p))}</span>`}
        </div>
        ${catLine ? `<div class="aip-cat-line">${catLine}${amountLine}</div>` : (amountLine ? `<div class="aip-cat-line">${amountLine}</div>` : '')}
        ${suitLine}
        <div class="aip-stats">
          <div class="aip-stat"><span class="aip-stat-icon">🛒</span>销量 <span class="aip-stat-val ${saleReal ? '' : 'aip-dim'}">${esc(saleVal)}</span></div>
          <div class="aip-stat"><span class="aip-stat-icon">💰</span>佣金 <span class="aip-stat-val ${commReal ? '' : 'aip-dim'}">${esc(commVal)}</span></div>
          ${convLine}
        </div>
        ${reviewLine}
        <div class="aip-script-box">
          <div class="aip-script-label">📝 脚本方向</div>
          <div class="aip-script-text">${esc(p.script)}</div>
        </div>
        ${searchBtn}
      </div>`;
    };
    const collect = (plat, time) => {
      if (plat === '全部') {
        let arr = [];
        AIP_PLATS.forEach(p => { (aipData[p] && aipData[p][time] || []).forEach(it => arr.push(Object.assign({}, it, { _plat: p }))); });
        return arr;
      }
      return (aipData[plat] && aipData[plat][time]) || [];
    };
    let bodyHtml;
    if (aipTime === '历史记录') {
      const ah = contentHistory || {};
      const dates = Object.keys(ah).sort().reverse();
      if (!dates.length) {
        bodyHtml = '<div class="empty">⏳ 正在按天加载历史归档…（每个文件很小，手机秒开）</div>';
        fetchHistory(true);
      } else {
        bodyHtml = dates.map(d => {
          const snap = (ah[d] && ah[d].aiproduct) || {};
          let items = [];
          if (aipPlat === '全部') {
            AIP_PLATS.forEach(p => { (snap[p] && snap[p]['每日'] || []).forEach(it => items.push(Object.assign({}, it, { _plat: p }))); });
          } else {
            items = (snap[aipPlat] && snap[aipPlat]['每日']) || [];
          }
          return `<div class="aip-hist-date">📅 ${esc(d)}</div>` + (items.length ? items.map(it => aipCard(it, aipPlat === '全部')).join('') : '<div class="empty">该日无记录</div>');
        }).join('');
      }
    } else {
      const list = collect(aipPlat, aipTime);
      const hotHtml = (daily.aiproduct_hot && daily.aiproduct_hot.length) ? (
        '<div class="aip-hot-today"><div class="aip-hot-title">🔥 今日实时热点爆品灵感 <span class="aip-hot-sub">微博热搜·美妆/穿搭/女性好物·每天自动更新</span></div><div class="aip-hot-list">' +
        daily.aiproduct_hot.map(h => {
          const hf = (h.heat >= 10000) ? (h.heat / 10000).toFixed(1) + '万' : ('' + h.heat);
          const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(h.word + ' 带货 选品 小红书');
          return '<a class="aip-hot-card" href="' + url + '" target="_blank" rel="noopener"><div class="aip-hot-word">' + esc(h.word) + '</div><div class="aip-hot-heat">🔥 ' + hf + ' 热度</div></a>';
        }).join('') +
        '</div></div>'
      ) : '';
      const foot = daily.aiproduct_real
        ? '<div class="aip-foot aip-foot-real">✅ 已按「适合你(美妆·穿搭·女性好物)+佣金高」筛选排序 · 抖音=蝉妈妈真实商品(佣金/销量/30天转化率均真实) · 快手/小红书=公开报告真实热品(销量佣金趋势参考) · 「真实评价好」用蝉妈妈真实指标(转化率+持续销量)衡量，头部商品另附全网公开真实口碑(京东/天猫/抖音精选好评率) · 每张卡可一键「搜这个产品的真实评价」看小红书/抖音实时口碑 · 精选好物每日轮换主打 · 今日热点来自微博热搜每天更新</div>'
        : '<div class="aip-foot">商品选品灵感参考 · 销量/佣金为趋势参考值（非平台官方后台数据）</div>';
      bodyHtml = hotHtml + (list.length ? list.map(it => aipCard(it, aipPlat === '全部')).join('') : '<div class="empty">暂无爆品</div>') + foot;
    }
    const times = [['每日', '🔥 每日爆品'], ['每周', '📅 每周爆品'], ['每月', '📆 每月爆品'], ['历史记录', '🗂️ 历史记录']];
    $('#aiproductBody').innerHTML = `
      <div class="aip-page">
        <div class="aip-header">
          <div class="aip-header-left">
            <div class="aip-header-icon">🛍️</div>
            <div class="aip-header-title">AI爆品</div>
          </div>
          <div class="aip-header-right">AI选品</div>
        </div>
        <div class="aip-tabs">
          ${times.map(t => `<button class="aip-tab ${aipTime === t[0] ? 'active' : ''}" data-aiptime="${t[0]}">${t[1]}</button>`).join('')}
        </div>
        <div class="cat-bar" style="padding:0 16px 12px;">
          ${['全部', ...AIP_PLATS].map(p => `<button class="cat-chip ${aipPlat === p ? 'active' : ''}" data-aipplat="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
        <div class="aip-list">${bodyHtml}</div>
      </div>
    `;
  }
  function renderNews() {
    const data = (daily.news && daily.news.length) ? daily.news : NEWS_FALLBACK;
    const cats = ['全部', '时政要闻', '财经动态', '国际风云', '科技前沿', '民生社会', '今日热榜'];
    const catSet = new Set(data.map(n => n.cat));
    const orderedCats = cats.filter(c => c === '全部' || catSet.has(c));
    const list = data.filter(n => newsCat === '全部' || n.cat === newsCat);
    const groups = {};
    list.forEach(n => { groups[n.cat] = groups[n.cat] || []; groups[n.cat].push(n); });
    const groupOrder = orderedCats.filter(c => c !== '全部');
    const dateStr = daily.date || todayKey();
    const week = ['日', '一', '二', '三', '四', '五', '六'][new Date(dateStr.replace(/\//g, '-')).getDay()] || '—';
    const mediaMap = [
      { icon: '📺', name: '央视新闻', desc: '国家大事第一线·权威快讯', links: [
        { t: '央视新闻网', u: 'https://www.cctv.com/' },
        { t: '新闻联播回看', u: 'https://tv.cctv.com/lm/xwlb/' },
        { t: '央视频', u: 'https://www.yangshipin.cn/' }
      ]},
      { icon: '📰', name: '新华社', desc: '国家通讯社·深度时政报道', links: [
        { t: '新华网', u: 'https://www.xinhuanet.com/' },
        { t: '今日要闻', u: 'https://www.xinhuanet.com/politics/' }
      ]},
      { icon: '📄', name: '人民日报', desc: '党报头版·评论员文章', links: [
        { t: '人民网', u: 'http://www.people.com.cn/' },
        { t: '人民日报电子版', u: 'http://paper.people.com.cn/rmrb/' }
      ]},
      { icon: '🌍', name: '参考消息', desc: '外媒视角看中国和世界', links: [
        { t: '参考消息网', u: 'http://www.cankaoxiaoxi.com/' }
      ]}
    ];
    const catCards = groupOrder.map(cat => {
      const items = groups[cat] || [];
      if (!items.length) return '';
      return `<div class="news-sum-card">
        <div class="news-sum-cat">${esc(cat)}</div>
        <ol class="news-sum-list">
          ${items.map(n => `<li>
            <a class="news-sum-link" href="${esc(n.url || '#')}" target="_blank" rel="noopener">${esc(n.title)}</a>
            ${n.summary ? `<span class="news-sum-text">${esc(n.summary)}</span>` : ''}
            ${n.heat ? `<span class="news-sum-heat">🔥 ${esc(n.heat)}</span>` : ''}
          </li>`).join('')}
        </ol>
      </div>`;
    }).join('');
    $('#newsBody').innerHTML = `
      <button class="back-row" data-back>← 返回每日计划</button>
      <div class="news-header-card">
        <h1 class="news-h1">每日要闻</h1>
        <div class="news-subtitle">新华网(news.cn) · 中国新闻网 · 央视网 · 微博热搜 · 科技财经媒体 实时活源 · 每日读报打卡</div>
        <div class="news-tab-pill">
          <span class="news-tab-dot active">今日看点</span>
          <span class="news-tab-dot">要闻摘记</span>
        </div>
        <div class="news-date-line">${esc(dateStr)} · 星期${week}</div>
        <div class="news-slogan">花10分钟了解今天的世界吧</div>
        <button class="news-checkin-btn" id="newsCheckin">【今日新闻看完了，打卡！】</button>
      </div>
      <div class="news-section">
        <h3 class="news-section-title">权威官媒直通车</h3>
        <div class="news-media-list">
          ${mediaMap.map(m => `<div class="news-media-item">
            <div class="news-media-name">${m.icon} ${esc(m.name)}：<span class="news-media-desc">${esc(m.desc)}</span></div>
            <div class="news-media-links">
              ${m.links.map(l => `<a href="${esc(l.u)}" target="_blank" rel="noopener" class="news-link-pill">${esc(l.t)}</a>`).join('')}
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div class="news-section">
        <h3 class="news-section-title">分类看点 <small>点开查看频道入口</small></h3>
        <div class="news-cat-chips">
          ${orderedCats.map(c => `<button class="news-cat-chip ${c === newsCat ? 'active' : ''}" data-newscat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
      </div>
      <div class="news-section">
        <h3 class="news-section-title">📋 今日新闻摘要汇总</h3>
        ${catCards || '<div class="empty">暂无新闻</div>'}
      </div>
    `;
  }
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

  /* ---------- 穿搭衣橱 ---------- */
  const OUTFIT_CATS = ['上装','下装','外套','连衣裙','鞋履','配饰','包包'];
  const OUTFIT_SEASONS = ['春','夏','秋','冬'];
  const OUTFIT_THICK = ['薄','适中','厚'];
  function outfitIcon(cat) {
    return { '上装':'👚','下装':'👖','外套':'🧥','连衣裙':'👗','鞋履':'👟','配饰':'🧣','包包':'👜' }[cat] || '👔';
  }
  // 把用户选中的图片文件压缩成适合 localStorage 的小缩略图（dataURL）
  function fileToThumb(file, cb) {
    if (!file || !file.type || !file.type.startsWith('image/')) { cb(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 300;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let url = null;
        try { url = cv.toDataURL('image/jpeg', 0.6); } catch (e) { url = null; }
        cb(url);
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }
  // 写衣橱时做配额保护：超容量则去掉所有图片再存，保证不丢文字数据
  function saveWardrobeSafe() {
    try { save(LS.wardrobe, wardrobe); return true; }
    catch (e) {
      try {
        wardrobe.forEach(it => { delete it.img; });
        save(LS.wardrobe, wardrobe);
        toast('本地容量不足，已保留衣物信息但去掉了部分照片');
        return true;
      } catch (e2) { toast('本地存储已满，请删减一些衣物'); return false; }
    }
  }
  function renderOutfit() {
    $('#outfitBody').innerHTML = `
      <div class="outfit-page">
        <div class="outfit-header">
          <div class="outfit-title">💠 穿搭衣橱 👗</div>
          <div class="outfit-subtitle">不再靠猜温度，也不再对着衣柜发呆</div>
        </div>
        <div class="outfit-tabs">
          <button class="outfit-tab ${outfitTab==='today'?'active':''}" data-otab="today">🧣今日穿什么</button>
          <button class="outfit-tab ${outfitTab==='wardrobe'?'active':''}" data-otab="wardrobe">👚我的衣橱</button>
          <button class="outfit-tab ${outfitTab==='fitting'?'active':''}" data-otab="fitting">🪞试衣间</button>
          <button class="outfit-tab ${outfitTab==='ai'?'active':''}" data-otab="ai">✨AI搭配师</button>
        </div>
        <div id="outfitTabBody"></div>
      </div>`;
    renderOutfitTab(outfitTab);
  }
  function renderOutfitTab(tab) {
    outfitTab = tab;
    $$('#outfitBody .outfit-tab').forEach(t => t.classList.toggle('active', t.dataset.otab === tab));
    const b = $('#outfitTabBody');
    if (tab === 'today') b.innerHTML = renderOutfitTodayHTML();
    else if (tab === 'wardrobe') b.innerHTML = renderOutfitWardrobeHTML();
    else if (tab === 'fitting') b.innerHTML = renderOutfitFittingHTML();
    else if (tab === 'ai') b.innerHTML = renderOutfitAIHTML();
  }
  function renderOutfitTodayHTML() {
    return `
      <div class="outfit-suggest-card">
        <h3>今日穿搭建议</h3>
        <div class="outfit-input-row">
          <input id="outfitTemp" type="number" placeholder="输入温度℃" inputmode="numeric" />
          <button class="outfit-generate-btn" data-ogen>生成</button>
        </div>
        <div class="outfit-pref-row">
          <button class="outfit-pref ${outfitPref==='cold'?'active':''}" data-opref="cold">❄️ 怕冷</button>
          <button class="outfit-pref ${outfitPref==='normal'?'active':''}" data-opref="normal">🙂 正常</button>
          <button class="outfit-pref ${outfitPref==='hot'?'active':''}" data-opref="hot">🔥 怕热</button>
        </div>
      </div>
      <div id="outfitSuggestResult"></div>
      <div class="outfit-section-title">🌡️ 温度速查表</div>
      <div class="outfit-quick-table">
        <b>≥30℃</b>：短袖/吊带/短裤/凉鞋/透气棉麻<br/>
        <b>25~29℃</b>：T恤/薄衬衫/九分裤/单鞋<br/>
        <b>20~24℃</b>：长袖衬衫/薄针织衫/牛仔裤/休闲鞋<br/>
        <b>15~19℃</b>：卫衣/薄外套/长裤/乐福鞋<br/>
        <b>10~14℃</b>：毛衣/风衣/厚裤/短靴<br/>
        <b>5~9℃</b>：厚毛衣/羽绒服/加绒裤/保暖鞋<br/>
        <b>＜5℃</b>：羽绒服/保暖内衣/围巾手套/雪地靴
      </div>`;
  }
  function renderOutfitWardrobeHTML() {
    const cats = OUTFIT_CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const seasons = OUTFIT_SEASONS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    const thick = OUTFIT_THICK.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    let listHtml = wardrobe.length ? '' : `<div class="outfit-empty"><div class="outfit-empty-icon">👚</div><div class="outfit-empty-text">衣橱空空，点击「一键建基础衣橱」或「添加衣服」开始吧～</div></div>`;
    if (wardrobe.length) {
      listHtml = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);">共 ${wardrobe.length} 件衣物</div>` +
        wardrobe.map(it => `
          <div class="outfit-item">
            ${it.img ? `<img class="outfit-item-img" src="${it.img}" alt="" />` : `<div class="outfit-item-icon">${outfitIcon(it.category)}</div>`}
            <div class="outfit-item-info">
              <div class="outfit-item-name">${esc(it.name)}</div>
              <div class="outfit-item-meta">
                <span class="outfit-category-tag">${esc(it.category)}</span>
                ${esc(it.season)} · ${esc(it.thickness)}
              </div>
            </div>
            <button class="outfit-item-del" data-odel="${esc(it.id)}">✕</button>
          </div>`).join('');
    }
    return `
      <div class="outfit-card">
        <input id="outfitName" type="text" placeholder="衣服名称（如：米色针织开衫）" style="width:100%;border:1px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;background:#fff;outline:none;margin-bottom:8px;" />
        <div class="outfit-add-row">
          <select id="outfitCat">${cats}</select>
          <select id="outfitSeason">${seasons}</select>
          <select id="outfitThick">${thick}</select>
        </div>
        <label class="outfit-upload-btn">
          📷 拍照 / 上传衣服照片
          <input id="outfitImg" type="file" accept="image/*" capture="environment" hidden />
        </label>
        <div id="outfitImgPreview" class="outfit-thumb-wrap" style="${outfitPendingImg ? '' : 'display:none;'}">
          ${outfitPendingImg ? `<img class="outfit-thumb" src="${outfitPendingImg}" alt="" /><button class="outfit-thumb-del" data-oimgclear>✕</button>` : ''}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="outfit-btn-outline" data-oadd style="flex:1;">＋ 添加</button>
          <button class="outfit-btn-pink" data-obasic style="flex:1;">👚 一键建基础衣橱</button>
        </div>
      </div>
      <div id="outfitList">${listHtml}</div>`;
  }
  function renderOutfitFittingHTML() {
    if (!wardrobe.length) {
      return `<div class="outfit-card"><div class="outfit-empty"><div class="outfit-empty-icon">🪞</div><div class="outfit-empty-text">试衣间需要先到「我的衣橱」添加衣物<br/>才能预览搭配哦～</div></div></div>`;
    }
    const combos = generateFittingCombos();
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin:0 4px 10px;">
        <span style="font-size:13px;font-weight:700;color:var(--text);">推荐搭配</span>
        <button class="outfit-btn-outline" data-orefresh>🔄 换一批</button>
      </div>
      <div id="outfitCombos">${combos}</div>`;
  }
  function renderOutfitAIHTML() {
    const styles = ['不限','韩系','法式','老钱风','通勤','运动','甜美','酷飒','多巴胺','Clean Fit','新中式'];
    const styleOpts = styles.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    const _ac = loadAiConfig();
    const _qv = s => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // 默认预填智谱免费模型：文字用 glm-4.7-flash，看图用 glm-4.6v-flash，用户只需粘 Key
    const curBase = _ac.base || 'https://open.bigmodel.cn/api/paas/v4';
    const curModel = _ac.model || 'glm-4.7-flash';
    const curVision = _ac.visionModel || 'glm-4.6v-flash';
    const hasKey = !!(_ac.key && String(_ac.key).trim());
    const inp = 'width:100%;border:1px solid var(--border);border-radius:10px;padding:9px 11px;font-size:13px;background:#fff;outline:none;margin-bottom:6px;';
    return `
      <div class="outfit-ai-box">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">✨ AI搭配师 · 顶级私服顾问</div>
        <div class="outfit-ai-hint">融合抖音 / 小红书当季流行趋势，只从你<b>已有的衣物</b>里挑，结合想要的风格与天气，生成一套专属搭配。缺的单品会告诉你"差哪一件"。</div>

        <div class="outfit-card" style="background:#FFF6F9;margin:12px 0 14px;">
          <div style="font-size:14px;font-weight:700;margin-bottom:3px;">🔑 AI 设置 ${hasKey ? '<span style="color:#22a06b;font-size:12px;">· 已填好 ✅</span>' : ''}</div>
          <div class="outfit-tips" style="margin:0 0 9px;">
            ${hasKey
              ? 'Key 已保存（显示为圆点保护隐私）。下面四个都用智谱免费模型，一般不用改。'
              : '下面几行已<b>帮你填好</b>（智谱免费模型），你<b>只需把 Key 粘进第二行</b>，然后点保存。'}
          </div>
          <input id="oaiBase" value="${_qv(curBase)}" placeholder="API 地址" style="${inp}" />
          <input id="oaiKey" type="password" value="${_qv(_ac.key || '')}" placeholder="👈 在这里粘贴你的 Key" style="${inp}" />
          <input id="oaiModel" value="${_qv(curModel)}" placeholder="🧠 文字模型（唱歌点评/文字建议）" style="${inp}" />
          <input id="oaiVisionModel" value="${_qv(curVision)}" placeholder="👁️ 看图模型（上传照片时用）" style="${inp}" />
          <div class="outfit-tips" style="margin:-2px 0 8px;font-size:11px;">
            🧠 用 glm-4.7-flash（说话聪明）｜👁️ 用 glm-4.6v-flash（能看照片）<br/>
            看图若限流，把 👁️ 换成 <code>glm-4.1v-thinking-flash</code> 或 <code>glm-4v-flash</code>
          </div>
          <button class="outfit-btn-pink" data-oaisave style="width:100%;">💾 保存设置</button>
          <div id="oaiSaveTip" class="outfit-tips"></div>
          ${hasKey ? '' : '<div class="outfit-tips" style="margin-top:6px;">没 Key？去 <b>bigmodel.cn</b> 手机号注册 → 实名认证 → 右上角「API Key」新建 → 复制那串（只显示一次）。免费。</div>'}
        </div>

        ${wardrobe.length ? `
          <div class="outfit-ai-row">
            <select id="outfitAiStyle" style="flex:1;">${styleOpts}</select>
            <input id="outfitAiWeather" type="text" placeholder="天气/温度 如：18℃ 多云" style="flex:1.2;" />
          </div>
          <input id="outfitAiInput" type="text" placeholder="具体需求，如：今天约会想要温柔一点 / 哪件配饰更搭这套？（可上传照片）" style="width:100%;border:1px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;margin:8px 0 10px;outline:none;" />
          <label class="outfit-upload-btn" style="margin-bottom:10px;">
            📷 上传穿搭照 / 参考图（问"哪个配饰更搭"）
            <input id="outfitAiImg" type="file" accept="image/*" hidden />
          </label>
          <div id="outfitAiImgPreview" class="outfit-thumb-wrap" style="${outfitAiImg ? '' : 'display:none;'}">
            ${outfitAiImg ? `<img class="outfit-thumb" src="${outfitAiImg}" alt="" /><button class="outfit-thumb-del" data-oaiimgclear>✕</button>` : ''}
          </div>
          <button class="outfit-btn-pink" data-oaiask style="width:100%;">✨ 生成专属搭配</button>
        ` : `
          <button class="outfit-btn-pink" style="width:100%;" disabled>先添加衣物，AI才能为你搭配 👗</button>
          <div class="outfit-tips">请到「我的衣橱」添加至少一件衣服。</div>
        `}
        <div id="outfitAiResult"></div>
      </div>`;
  }
  function addOutfitItem() {
    const name = ($('#outfitName')?.value || '').trim();
    if (!name) { toast('请输入衣服名称'); return; }
    wardrobe.push({
      id: uid(), name,
      category: $('#outfitCat').value,
      season: $('#outfitSeason').value,
      thickness: $('#outfitThick').value,
      img: outfitPendingImg || null,
      addAt: Date.now()
    });
    if (saveWardrobeSafe()) {
      outfitPendingImg = null;
      if ($('#outfitName')) $('#outfitName').value = '';
      renderOutfitTab('wardrobe');
      toast('已添加 ✅');
    }
  }
  function deleteOutfitItem(id) {
    wardrobe = wardrobe.filter(it => it.id !== id);
    save(LS.wardrobe, wardrobe);
    renderOutfitTab('wardrobe');
  }
  function generateBasicWardrobe() {
    const basics = [
      ['白色T恤','上装','夏','薄'],['条纹衬衫','上装','春','薄'],
      ['黑色针织衫','上装','秋','适中'],['灰色卫衣','上装','秋','适中'],
      ['直筒牛仔裤','下装','秋','适中'],['黑色西装裤','下装','春','适中'],
      ['A字半身裙','下装','夏','薄'],['高腰阔腿裤','下装','夏','薄'],
      ['卡其色风衣','外套','秋','适中'],['黑色羽绒服','外套','冬','厚'],
      ['牛仔外套','外套','春','适中'],['米色大衣','外套','冬','厚'],
      ['黑色连衣裙','连衣裙','夏','薄'],['小白鞋','鞋履','夏','薄'],
      ['黑色乐福鞋','鞋履','春','适中'],['棕色短靴','鞋履','冬','厚'],
      ['帆布包','包包','夏','薄'],['斜挎小包','包包','春','适中'],
      ['围巾','配饰','冬','厚'],['棒球帽','配饰','夏','薄']
    ];
    const now = Date.now();
    wardrobe = basics.map(([name,category,season,thickness]) => ({ id: uid(), name, category, season, thickness, addAt: now }));
    save(LS.wardrobe, wardrobe);
    renderOutfitTab('wardrobe');
    toast('已生成 20 件基础衣物 👚');
  }
  function pickByTemp(temp, pref) {
    let offset = 0;
    if (pref === 'cold') offset = -3;
    if (pref === 'hot') offset = 3;
    const t = parseFloat(temp) + offset;
    if (isNaN(t)) return null;
    const rules = [
      { t: 30, name:'盛夏清凉', items:['上装:短袖/吊带','下装:短裤/半裙','鞋履:凉鞋','配饰:遮阳帽'] },
      { t: 25, name:'夏末清爽', items:['上装:T恤/薄衬衫','下装:九分裤/半裙','鞋履:单鞋/小白鞋','配饰:棒球帽'] },
      { t: 20, name:'初秋舒适', items:['上装:长袖衬衫/薄针织','下装:牛仔裤/长裤','鞋履:乐福鞋/休闲鞋','配饰:丝巾'] },
      { t: 15, name:'深秋保暖', items:['上装:卫衣/薄毛衣','外套:薄外套/风衣','下装:长裤','鞋履:短靴','配饰:围巾'] },
      { t: 10, name:'初冬防风', items:['上装:毛衣/厚针织','外套:大衣/棉服','下装:加绒裤','鞋履:短靴','配饰:围巾'] },
      { t: 5, name:'寒冬御寒', items:['上装:厚毛衣/保暖内衣','外套:羽绒服','下装:加绒裤','鞋履:保暖鞋/雪地靴','配饰:围巾/手套'] },
      { t: -50, name:'极寒防护', items:['上装:保暖内衣+厚毛衣','外套:长款羽绒服','下装:羽绒裤/加绒裤','鞋履:雪地靴','配饰:围巾/手套/帽子'] }
    ];
    return rules.find(r => t >= r.t) || rules[rules.length-1];
  }
  function matchWardrobePieces(ruleItems) {
    if (!wardrobe.length) return ruleItems.map(desc => ({ desc, found: null }));
    return ruleItems.map(desc => {
      const cat = desc.split(':')[0];
      const candidates = wardrobe.filter(it => it.category === cat);
      if (!candidates.length) return { desc, found: null };
      const idx = Math.floor(Math.random() * candidates.length);
      return { desc, found: candidates[idx] };
    });
  }
  function generateOutfitByTemp() {
    const temp = $('#outfitTemp').value;
    const rule = pickByTemp(temp, outfitPref);
    const box = $('#outfitSuggestResult');
    if (!rule) { box.innerHTML = ''; return; }
    const pieces = matchWardrobePieces(rule.items);
    box.innerHTML = `
      <div class="outfit-card">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px;">🌡️ ${esc(temp)}℃ · ${rule.name}</div>
        ${pieces.map(p => `
          <div class="outfit-combo-piece">
            ${(p.found && p.found.img) ? `<img class="outfit-combo-img" src="${p.found.img}" alt="" />` : `<span class="outfit-combo-piece-icon">${p.found ? outfitIcon(p.found.category) : '💡'}</span>`}
            <span>${p.found ? `<b>${esc(p.found.name)}</b>（${esc(p.found.category)}）` : esc(p.desc.split(':')[1])}</span>
          </div>
        `).join('')}
        <div class="outfit-tips">${wardrobe.length ? '已从你的衣橱中随机挑选；去「我的衣橱」添加更多衣服，匹配会更精准。' : '衣橱为空，显示通用建议。先添加衣物可获得专属搭配。'}</div>
      </div>`;
  }
  function generateFittingCombos() {
    const byCat = {};
    wardrobe.forEach(it => { byCat[it.category] = byCat[it.category] || []; byCat[it.category].push(it); });
    const tops = byCat['上装'] || []; const bottoms = byCat['下装'] || []; const outers = byCat['外套'] || [];
    const dresses = byCat['连衣裙'] || []; const shoes = byCat['鞋履'] || []; const accs = byCat['配饰'] || []; const bags = byCat['包包'] || [];
    const combos = [];
    const add = (pieces, arr, icon) => { const it = rand(arr); pieces.push({ name: it.name, icon, img: it.img }); };
    for (let i = 0; i < 3; i++) {
      let pieces = [];
      if (dresses.length && Math.random() > 0.5) {
        add(pieces, dresses, '👗');
      } else if (tops.length && bottoms.length) {
        add(pieces, tops, '👚');
        add(pieces, bottoms, '👖');
      } else if (tops.length) {
        add(pieces, tops, '👚');
      }
      if (outers.length && Math.random() > 0.4) add(pieces, outers, '🧥');
      if (shoes.length) add(pieces, shoes, '👟');
      if (accs.length && Math.random() > 0.5) add(pieces, accs, '🧣');
      if (bags.length && Math.random() > 0.5) add(pieces, bags, '👜');
      if (pieces.length < 2) continue;
      combos.push(`
        <div class="outfit-combo-card">
          <div class="outfit-combo-title">搭配 ${i+1}</div>
          ${pieces.map(p => `<div class="outfit-combo-piece">${p.img ? `<img class="outfit-combo-img" src="${p.img}" alt="" />` : `<span class="outfit-combo-piece-icon">${p.icon}</span>`}<span>${esc(p.name)}</span></div>`).join('')}
        </div>`);
    }
    return combos.length ? combos.join('') : `<div class="outfit-empty">衣物类别不够丰富，多添加几件再回来～</div>`;
  }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  async function outfitAIAsk() {
    const input = $('#outfitAiInput');
    const prompt = (input?.value || '').trim();
    if (!prompt) { toast('请描述你的需求（如：今天约会温柔一点 / 哪件配饰更搭）'); return; }
    const resBox = $('#outfitAiResult');
    resBox.innerHTML = `<div class="outfit-ai-result">⏳ 顶级搭配师正在为你构思专属穿搭…</div>`;
    const style = ($('#outfitAiStyle')?.value || '不限');
    const weather = ($('#outfitAiWeather')?.value || '').trim();
    const wardrobeText = wardrobe.map(it => `${it.category}:${it.name}(${it.season}季/${it.thickness}${it.img ? '·有照片' : ''})`).join('；');
    const sys = `你是一位顶级时尚搭配师，长期研究抖音、小红书等平台的当季流行趋势，对爆款配色与风格（如美拉德、老钱风、多巴胺、Clean Fit、新中式等）了如指掌。
用户会给你：①她衣橱里实际拥有的衣物清单（类别/季节/厚薄，部分有照片）；②她想要的风格与当天天气/温度；有时还会附上她的穿搭参考照片。
请严格只从她「已有的衣物」中挑出一套完整搭配（尽量涵盖 上装/下装/外套/鞋履/配饰/包包），并说明：为什么这套契合该风格与天气、参考了当下哪种流行趋势。
若她缺少某件关键单品，明确说「差这一件：xxx」，并建议补什么（可结合抖音/小红书当下热门款），但绝不把没有的衣服说成已有。
语气像懂行又贴心的闺蜜，控制在 240 字内，用短句换行。`;
    const userText = `我的衣橱：${wardrobeText || '（空）'}
想要风格：${style}
天气/温度：${weather || '未指定'}
我的需求：${prompt}${outfitAiImg ? '\n（附上了我的穿搭照片，请帮我看哪件配饰更搭这套）' : ''}`;
    const content = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: userText }], outfitAiImg ? [outfitAiImg] : null);
    if (content) {
      resBox.innerHTML = `<div class="outfit-ai-result">${esc(content).replace(/\n/g,'<br/>')}</div>`;
    } else {
      const reason = (window.__llmErr || '未知错误').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      resBox.innerHTML = `<div class="outfit-ai-result" style="border-left:3px solid #ff6b6b;">
        ⚠️ <b>${reason}</b><br/><br/>
        <span style="opacity:.75;font-size:12px;">📌 快速排查：</span><br/>
        <span style="opacity:.75;font-size:12px;">
        ① 上面「🔑 AI 设置」里 Key 那行有没有填？（填了会显示圆点）<br/>
        ② 有没有点「💾 保存设置」？<br/>
        ③ 地址和模型用我帮你预填的（智谱 glm-4.6v-flash）就行，别改成别的。<br/>
        ④ 还不行的话，把这个红框<b>截图发我</b>（Key 那行是圆点，安全）。</span>
      </div>`;
    }
  }

  /* ---------- 导航 + 启动 ---------- */
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  function liveStatus(msg, cls) {
    const el = $('#liveStatus');
    if (el) { el.textContent = msg; el.className = 'live-status' + (cls ? ' ' + cls : ''); }
  }
  let _liveSig = '';
  async function liveRefresh() {
    liveStatus('检查更新…');
    try {
      const res = await fetch('./daily.json?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (!d || !d.date) throw new Error('empty');
      const sig = [d.date, d.gen || '', (d.topics || []).length, (d.reposts || []).length, (d.news || []).length, (d.aiproduct || []).length, (d.aiproduct_hot || []).length].join('|');
      if (sig !== _liveSig) {
        if (daily.date && daily.date !== d.date) {
          const oldTopics = (daily.topics || []).map(t => ({ ...t, id: t.id || uid(), seen_date: daily.date || todayKey() }));
          const oldReposts = (daily.reposts || []).map(t => ({ ...t, id: t.id || uid(), seen_date: daily.date || todayKey() }));
          if (oldTopics.length || oldReposts.length) {
            const he = load(LS.historyExtra, { topics: [], reposts: [] });
            const seenT = new Set(he.topics.map(t => (t.title || '') + '|' + (t.platform || '')));
            oldTopics.forEach(t => { const k = (t.title || '') + '|' + (t.platform || ''); if (!seenT.has(k)) { he.topics.unshift(t); seenT.add(k); } });
            const seenR = new Set(he.reposts.map(t => (t.title || '') + '|' + (t.source || '')));
            oldReposts.forEach(t => { const k = (t.title || '') + '|' + (t.source || ''); if (!seenR.has(k)) { he.reposts.unshift(t); seenR.add(k); } });
            save(LS.historyExtra, he);
          }
          const oldAip = daily.aiproduct;
          if (oldAip && daily.date) { const ah = load(LS.aipHistory, {}); ah[daily.date] = oldAip; save(LS.aipHistory, ah); }
          hidden = []; save(LS.hidden, hidden);
        }
        const changed = daily.date !== d.date;
        daily = d; save(LS.daily, daily); _liveSig = sig;
        if (currentView === 'topic') renderTopics();
        else if (currentView === 'repost') renderReposts();
        else if (currentView === 'news') renderNews();
        else if (currentView === 'aiproduct') renderAiproduct();
        if (changed) toast('已更新到 ' + d.date + ' 数据');
      }
      liveStatus('已更新 ' + d.date, 'ok');
    } catch (e) {
      liveStatus('离线·本地 ' + (daily.date || ''), 'off');
    }
  }
  async function liveRefreshAssets() {
    try {
      const ra = await fetch('./archive.json?_=' + Date.now(), { cache: 'no-store' });
      if (ra.ok) { const a = await ra.json(); if (a) { archive = a; save(LS.archive, archive); } }
    } catch (e) {}
  }
  let _histFetching = false;
  // 仅预热日期索引（history/index.json，仅几百字节），不加载正文，省流量
  async function prefetchHistoryIndex() {
    if (_idxFetched || historyDone) return;
    _idxFetched = true;
    try {
      const ri = await fetch('./history/index.json?_=' + Date.now(), { cache: 'no-store' });
      if (ri.ok) { const idx = await ri.json(); historyIndex = Array.isArray(idx) ? idx : (idx.dates || []); }
    } catch (e) { _idxFetched = false; }
  }
  // 进入「历史」视图时调用：按天并行加载 history/<date>.json（每文件几十~百 KB，手机友好），流式渲染
  async function fetchHistory(force) {
    if (_histFetching) return;
    if (!force && historyDone) return;
    const have = Object.keys(contentHistory || {});
    // 先取线上索引，判断内联是否已覆盖全部日期；已覆盖则跳过（省流量）
    let idxDates = [];
    try {
      const ri = await fetch('./history/index.json?_=' + Date.now(), { cache: 'no-store' });
      if (ri.ok) { const idx = await ri.json(); idxDates = Array.isArray(idx) ? idx : (idx.dates || []); }
    } catch (e) {}
    if (!force && have.length && idxDates.length && idxDates.every(d => have.includes(d))) {
      historyDone = true; refreshHistoryNow(); return;
    }
    _histFetching = true; historyLoading = true; historyError = false;
    try {
      const base = idxDates.length ? idxDates : have;
      const dates = base.slice(-90); // 最多展示最近 90 天
      // 只拉取内联/缓存里还没有的「缺口天」，避免重复拉整批（手机省流量）
      const missing = dates.filter(d => !have.includes(d));
      const toFetch = missing.length ? missing : dates;
      let i = 0; const workers = Math.min(6, toFetch.length);
      async function worker() {
        while (i < toFetch.length) {
          const d = toFetch[i++];
          try {
            const rd = await fetch('./history/' + d + '.json?_=' + Date.now(), { cache: 'no-store' });
            if (rd.ok) { const obj = await rd.json(); if (obj && typeof obj === 'object') contentHistory[d] = obj; }
          } catch (e) {}
          if (currentView === 'topic' && topicMode === 'history') renderTopicHistory();
          else if (currentView === 'repost' && repostMode === 'history') renderRepostHistory();
        }
      }
      const ws = []; for (let k = 0; k < workers; k++) ws.push(worker());
      await Promise.all(ws);
      historyDone = true;
    } catch (e) { historyError = true; }
    finally { historyLoading = false; _histFetching = false; refreshHistoryNow(); }
  }
  // 仅负责「按当前视图重渲染历史」，不负责拉取
  function refreshHistoryNow() {
    if (currentView === 'topic' && topicMode === 'history') renderTopicHistory();
    else if (currentView === 'repost' && repostMode === 'history') renderRepostHistory();
    else if (currentView === 'aiproduct' && aipTime === '历史记录') renderAiproduct();
  }

  function init() {
    $('#todayDate').textContent = todayKey();
    renderPlan();
    liveRefresh();
    liveRefreshAssets();
    const lrb = $('#liveRefreshBtn');
    if (lrb) lrb.addEventListener('click', () => { liveRefresh(); liveRefreshAssets(); toast('正在检查更新…'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { liveRefresh(); liveRefreshAssets(); } });
    setInterval(() => { if (document.visibilityState === 'visible') liveRefresh(); }, 10 * 60 * 1000);
    setTimeout(updateScrollUI, 100);
  }
  init();
})();
