(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    tasks: 'yu_tasks',
    done: 'yu_done',
    user_topics: 'yu_user_topics_v2',
    user_reposts: 'yu_user_reposts_v2',
    reviews: 'yu_reviews',
    daily: 'yu_daily',
    hidden: 'yu_hidden'
  };

  const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const PLATFORMS = ['抖音', '小红书', '快手', '微博', 'B站'];
  const CATS = ['穿搭', '妆容', '护肤身体护理', '测评', '好物', '鞋履配饰', '网购避坑',
                '情绪共鸣', '女性成长', '审美建立', '消费观', 'vlog日常', '唱歌碎片',
                '美食', '旅行', '搞笑', '影视', '知识', '健身', '数码', '职场'];

  /* ---------- Toast / Copy ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.style.display = 'none', 2200);
  }
  async function copyLink(url) {
    if (!url) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      toast('✅ 链接已复制');
    } catch (e) {
      toast('复制失败，请长按链接手动复制');
    }
  }

  /* ---------- 每日计划 ---------- */
  let tasks = load(LS.tasks, [
    { id: uid(), text: '🏃 运动', fixed: true },
    { id: uid(), text: '😴 10:50 提醒睡觉', fixed: true }
  ]);
  let doneMap = load(LS.done, {});
  let doneToday = doneMap[todayKey()] || {};

  function renderPlan() {
    const list = $('#taskList');
    list.innerHTML = '';
    tasks.forEach(t => {
      const ok = !!doneToday[t.id];
      const li = document.createElement('li');
      li.className = 'task-item';
      li.innerHTML = `
        <button data-toggle="${t.id}" class="task-check ${ok ? 'done' : ''}">
          ${ok ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6"/></svg>' : ''}
        </button>
        <span class="task-text ${ok ? 'done' : ''}">${esc(t.text)}</span>
        ${t.fixed ? '' : `<button data-del="${t.id}" class="task-del">✕</button>`}`;
      list.appendChild(li);
    });
    const total = tasks.length, done = tasks.filter(t => doneToday[t.id]).length;
    $('#planCount').textContent = done + '/' + total;
    $('#planBar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    save(LS.done, doneMap);
  }
  $('#taskList').addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    const dl = e.target.closest('[data-del]');
    if (tg) {
      const id = tg.dataset.toggle;
      doneToday[id] = !doneToday[id];
      doneMap[todayKey()] = doneToday;
      renderPlan();
    }
    if (dl) {
      const id = dl.dataset.del;
      tasks = tasks.filter(t => t.id !== id);
      delete doneToday[id];
      save(LS.tasks, tasks);
      renderPlan();
    }
  });
  function addTask(text) {
    text = text.trim();
    if (!text) return;
    tasks.push({ id: uid(), text });
    save(LS.tasks, tasks);
    renderPlan();
  }
  $('#taskAdd').addEventListener('click', () => { addTask($('#taskInput').value); $('#taskInput').value = ''; });
  $('#taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') { addTask($('#taskInput').value); $('#taskInput').value = ''; } });
  if (!doneMap[todayKey()]) { doneMap[todayKey()] = {}; doneToday = doneMap[todayKey()]; }
  renderPlan();

  /* ---------- 选题灵感 ---------- */
  let userTopics = load(LS.user_topics, [
    { id: uid(), platform: '抖音', cat: '妆容', title: '上班妆容 3 分钟搞定伪素颜', analysis: '打工人通勤痛点 + 低价平替，完播高', idea: '做成「素颜→精致」系列，封面前后对比，结尾留色号清单', dy_link: 'https://www.douyin.com/search/%E9%80%9A%E5%8B%A4%E4%BC%AA%E7%B4%A0%E9%A2%9C%E5%A6%86', bz_link: 'https://search.bilibili.com/all?keyword=%E9%80%9A%E5%8B%A4%E4%BC%AA%E7%B4%A0%E9%A2%9C%E5%A6%86' },
    { id: uid(), platform: '小红书', cat: '护肤身体护理', title: '敏感肌平价护肤清单', analysis: '混干微敏皮人群精准，收藏率高', idea: '按早C晚A/保湿/防晒分集，用红黑榜视觉提升点击', dy_link: 'https://www.douyin.com/search/%E6%95%8F%E6%84%9F%E8%82%8C%E5%B9%B3%E4%BB%B7%E6%8A%A4%E8%82%A4', bz_link: 'https://search.bilibili.com/all?keyword=%E6%95%8F%E6%84%9F%E8%82%8C%E5%B9%B3%E4%BB%B7%E6%8A%A4%E8%82%A4' },
    { id: uid(), platform: '抖音', cat: '穿搭', title: '宽肩女生显瘦穿搭', analysis: '肩宽 43 是差异化人设，评论区爱问链接', idea: '做「宽肩专属」系列，每期一个痛点，结尾抛「想要链接打1」', dy_link: 'https://www.douyin.com/search/%E5%AE%BD%E8%82%A9%E5%A5%B3%E7%94%9F%E6%98%BE%E7%98%A6%E7%A9%BF%E6%90%AD', bz_link: 'https://search.bilibili.com/all?keyword=%E5%AE%BD%E8%82%A9%E5%A5%B3%E7%94%9F%E6%98%BE%E7%98%A6%E7%A9%BF%E6%90%AD' }
  ]);
  const EMBEDDED = __EMBEDDED_JSON__;
  let daily = load(LS.daily, null);
  let hidden = load(LS.hidden, []);
  if (!daily || !daily.date || (EMBEDDED.date && EMBEDDED.date > daily.date)) {
    daily = { date: EMBEDDED.date, topics: EMBEDDED.topics || [], reposts: EMBEDDED.reposts || [] };
    hidden = [];
    save(LS.daily, daily); save(LS.hidden, hidden);
  }

  let topicFilter = '全部';
  const topicFilterEl = $('#topicFilter');
  const topicListEl = $('#topicList');

  function renderTopicFilter() {
    const tabs = ['全部', ...PLATFORMS];
    topicFilterEl.innerHTML = tabs.map(t =>
      `<button data-tab="${esc(t)}" class="filter-chip ${t === topicFilter ? 'active' : ''}">${esc(t)}</button>`
    ).join('');
  }
  function allTopics() {
    const u = userTopics.map(t => ({ ...t }));
    const d = daily.topics.filter(t => !hidden.includes(t.id)).map(t => ({ ...t }));
    return [...u, ...d];
  }
  function renderTopics() {
    const list = allTopics().filter(t => topicFilter === '全部' || t.platform === topicFilter);
    if (!list.length) {
      topicListEl.innerHTML = '<div class="empty">暂无选题，点下方「＋新增」添加</div>';
      return;
    }
    topicListEl.innerHTML = list.map((t, i) => topicCard(t, i + 1)).join('');
  }
  function topicCard(t, num) {
    const tag = t.cat ? `<span class="tag">${esc(t.cat)}</span>` : '';
    const hasReal = !!t.real_url;
    const mainLink = hasReal ? t.real_url : (t.dy_link || '#');
    const mainLabel = hasReal ? '▶ 看原爆款（真实视频/热榜）' : '▶ 看抖音相关视频';
    return `<div class="card topic-card">
      <div class="topic-header">
        <span class="topic-number">${num}.</span>
        <div class="topic-title-wrap">
          <div class="topic-title">${esc(t.title)} ${tag}</div>
        </div>
      </div>
      <p class="topic-analysis"><b style="color:var(--primary)">🔥 火爆核心原因：</b><br>${esc(t.analysis)}</p>
      <p class="topic-analysis"><b style="color:var(--primary)">💡 原创创作思路：</b><br>${esc(t.idea || '（暂无，可点下方编辑补充）')}</p>
      <div class="topic-actions">
        <a href="${esc(mainLink)}" target="_blank" rel="noopener" class="btn-primary">${esc(mainLabel)}</a>
        <a href="${esc(t.bz_link || '#')}" target="_blank" rel="noopener" class="btn-outline">B站相关</a>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button data-copy="${esc(mainLink)}" class="btn-outline" style="flex:1;font-size:11px;">📋 复制 ${hasReal ? '原链接' : '抖音链接'}</button>
        <button data-rtopic="${esc(t.id)}" class="btn-outline" style="flex:1;font-size:11px;color:#b91c1c;border-color:#fecaca;">删除</button>
      </div>
    </div>`;
  }
  topicFilterEl.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    topicFilter = b.dataset.tab; renderTopicFilter(); renderTopics();
  });
  topicListEl.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { copyLink(c.dataset.copy); return; }
    const b = e.target.closest('[data-rtopic]'); if (!b) return;
    const id = b.dataset.rtopic;
    if (daily.topics.some(t => t.id === id)) {
      if (!hidden.includes(id)) hidden.push(id); save(LS.hidden, hidden);
    } else {
      userTopics = userTopics.filter(t => t.id !== id); save(LS.user_topics, userTopics);
    }
    renderTopics();
  });
  $('#topicAddBtn').addEventListener('click', () => openSheet('选题', buildTopicForm()));

  /* ---------- 链接升级：粘贴分享短链 → 灵感卡片 ---------- */
  $('#upBtn').addEventListener('click', async () => {
    const raw = ($('#upInput').value || '').trim();
    if (!raw) { toast('请先粘贴链接'); return; }
    const m = raw.match(/https?:\/\/[^\s"'<>]+/);
    if (!m) { toast('没找到链接，换个姿势粘贴'); return; }
    let url = m[0].replace(/[)"'<>]+$/, '');
    let pf = '抖音';
    if (/xiaohongshu|小红书|xhs/.test(url)) pf = '小红书';
    else if (/kuaishou|快手/.test(url)) pf = '快手';
    else if (/bilibili|b23\.tv|BV[0-9A-Za-z]/.test(url)) pf = 'B站';
    else if (/douyin|抖音|iesdouyin|tiktok/.test(url)) pf = '抖音';
    let title = '（粘贴的真实爆款，点开看原视频）';
    try {
      const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { mode: 'cors' });
      if (r.ok) {
        const html = await r.text();
        const mm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<title>([^<]+)<\/title>/i);
        if (mm) title = mm[1].replace(/\s+/g, ' ').trim().slice(0, 60);
      }
    } catch (e) { /* 解析标题失败则用占位，不影响主功能 */ }
    userTopics.unshift({
      id: uid(), platform: pf, cat: '情绪共鸣',
      title, analysis: '这是你粘贴的真实爆款链接，可围绕它做二创。',
      idea: '结合你的人设（行政前台/敏感肌/普通女生）重做一版，保留原爆款的钩子但换成你的视角。',
      real_url: url, dy_link: url, bz_link: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(title)
    });
    save(LS.user_topics, userTopics);
    $('#upInput').value = '';
    renderTopics();
    toast('已升级为灵感卡片 ✅ 在「全部」里查看');
  });

  /* ---------- 爆款二创 ---------- */
  let userReposts = load(LS.user_reposts, [
    { id: uid(), platform: '抖音', tag: '穿搭', title: '原爆款：梨形+宽肩显瘦神裤', heat: '抖音热点榜 580万', why_fit: '评论区疯狂求链接，转化意向强', adapt_angle: '改为你的「前台通勤版」：西装裤+尖头鞋，加「47kg也能撑起」反差钩子', source: '抖音热点榜 2026-08-19', video_desc: '多为全身镜前后对比，节奏快、BGM卡点，评论区高频求链接。', link: 'https://www.douyin.com/search/%E5%AE%BD%E8%82%A9%E6%98%BE%E7%98%A6%E7%A9%BF%E6%90%AD' },
    { id: uid(), platform: '小红书', tag: '化妆', title: '原爆款：10 秒伪素颜底妆', heat: '小红书热点榜 320万', why_fit: '短平快、易模仿，完播极高', adapt_angle: '换成「敏感肌版本」，强调不卡粉不泛红，结尾教「定妆手法」差异化', source: '小红书热点榜 2026-08-19', video_desc: '常见对镜拍或手持自拍，字幕强调步骤编号，节奏前快后稳。', link: 'https://www.xiaohongshu.com/search_result?keyword=%E9%80%9A%E5%8B%A4%E4%BC%AA%E7%B4%A0%E9%A2%9C%E5%A6%86' }
  ]);

  let repostFilter = '全部';
  const repostFilterEl = $('#repostFilter');
  const repostListEl = $('#repostList');

  function renderRepostFilter() {
    const tabs = ['全部', ...PLATFORMS];
    repostFilterEl.innerHTML = tabs.map(t =>
      `<button data-f="${esc(t)}" class="filter-chip ${t === repostFilter ? 'active' : ''}">${esc(t)}</button>`
    ).join('');
  }
  function allReposts() {
    const u = userReposts.map(t => ({ ...t }));
    const d = daily.reposts.filter(t => !hidden.includes(t.id)).map(t => ({ ...t }));
    return [...u, ...d];
  }
  function renderReposts() {
    const list = allReposts().filter(t => repostFilter === '全部' || t.platform === repostFilter);
    if (!list.length) {
      repostListEl.innerHTML = '<div class="empty">暂无素材，点下方「＋新增」添加</div>';
      return;
    }
    repostListEl.innerHTML = list.map(repostCard).join('');
  }
  function repostCard(t) {
    const tag = t.tag ? `<span class="tag">${esc(t.tag)}</span>` : '';
    return `<div class="card repost-card">
      <div class="repost-header">
        <div class="repost-title">${esc(t.title)} ${tag}</div>
        <div class="repost-heat">🔥 ${esc(t.heat)}</div>
      </div>
      <div class="repost-section">
        <div class="repost-label">为什么适合你二创：</div>
        <div class="repost-text">${esc(t.why_fit)}</div>
      </div>
      <div class="repost-section">
        <div class="repost-label">改编角度：</div>
        <div class="repost-text">${esc(t.adapt_angle)}</div>
      </div>
      <div class="repost-source">来源：${esc(t.source)}</div>
      <div class="repost-cta">
        <a href="${esc(t.link || '#')}" target="_blank" rel="noopener" class="btn-primary">▶ 去${esc(t.platform)}看真实视频（点开即看）</a>
      </div>
      <div class="repost-info">
        <div class="repost-info-icon">🎬</div>
        <div class="repost-info-text"><b>这个视频长这样：</b>${esc(t.video_desc)}</div>
      </div>
      <div class="repost-footer">
        <button data-addtask="${esc(t.title)}" class="btn-outline">＋ 加入任务</button>
        <button data-saveinsp="${esc(t.id)}" class="btn-outline">⭐ 存为灵感</button>
        <button data-hide="${esc(t.id)}" class="btn-outline">🔄 换视频</button>
      </div>
      <div style="margin-top:10px;">
        <button data-copy="${esc(t.link || '')}" class="btn-outline" style="width:100%;font-size:11px;">📋 复制链接</button>
      </div>
    </div>`;
  }
  repostFilterEl.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    repostFilter = b.dataset.f; renderRepostFilter(); renderReposts();
  });
  repostListEl.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { copyLink(c.dataset.copy); return; }
    const add = e.target.closest('[data-addtask]');
    if (add) { tasks.push({ id: uid(), text: '🎬 二创：' + add.dataset.addtask }); save(LS.tasks, tasks); renderPlan(); toast('已加入任务'); return; }
    const sv = e.target.closest('[data-saveinsp]');
    if (sv) { toast('已存为灵感（可在本地收藏查看）'); return; }
    const hd = e.target.closest('[data-hide]');
    if (hd) {
      const id = hd.dataset.hide;
      if (daily.reposts.some(t => t.id === id)) {
        if (!hidden.includes(id)) hidden.push(id); save(LS.hidden, hidden);
      } else {
        userReposts = userReposts.filter(t => t.id !== id); save(LS.user_reposts, userReposts);
      }
      renderReposts(); return;
    }
  });
  $('#repostAddBtn').addEventListener('click', () => openSheet('二创素材', buildRepostForm()));

  /* ---------- 内容复盘 ---------- */
  let reviews = load(LS.reviews, []);
  const reviewListEl = $('#reviewList');

  function diagnose(d) {
    const out = [];
    const views = +d.views || 0, likes = +d.likes || 0, comments = +d.comments || 0,
          shares = +d.shares || 0, finish = +d.finish || 0;
    const lkRate = views ? (likes / views * 100) : 0;

    if (views > 0 && finish > 0 && finish < 30)
      out.push('📉 完播率仅 ' + finish + '%，偏低 → 前 3 秒必须前置钩子：把最大反差/结果/冲突放开头，配大字标题，节奏前快后稳。');
    if (views > 0 && comments < likes * 0.02)
      out.push('💬 评论偏少 → 结尾主动抛互动问题（如「你是宽肩还是窄肩？」「求链接打 1」），并在评论区自己先留一条引导。');
    if (views > 0 && lkRate < 3)
      out.push('❤️ 赞播比仅 ' + lkRate.toFixed(1) + '% → 选题或封面标题吸引力不足，建议测试更情绪化/更具体的标题，封面用「对比图+大字」。');
    if (views > 0 && shares < likes * 0.05)
      out.push('🔁 转发低 → 缺「可收藏实用价值」，建议加干货清单、金句截图点或「抄作业」式步骤，提升转发动机。');
    if (d.source === '推荐' && views < 500)
      out.push('🚀 推荐流量弱 → 话题标签不精准或账号权重低，优化 3-5 个垂直话题词，固定黄金发布时段（19-22 点）培养习惯。');
    if (views > 0 && views < 200)
      out.push('🔍 整体播放低 → 检查发布时间、首波互动（发后 1 小时内自己点赞评论引动），并考虑蹭当日热点二创。');

    if (!out.length) out.push('✅ 数据表现均衡，继续保持当前节奏，可尝试在稳定选题上做微创新（换钩子/换封面）测试天花板。');
    return out;
  }

  $('#reviewForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const d = {
      id: uid(), date: f.rdate.value || todayKey(),
      platform: f.platform.value, source: f.source.value, title: f.title.value.trim(),
      views: f.views.value, likes: f.likes.value, comments: f.comments.value,
      shares: f.shares.value, finish: f.finish.value, good: f.good.value.trim(), improve: f.improve.value.trim()
    };
    d.tips = diagnose(d);
    reviews.unshift(d);
    save(LS.reviews, reviews);
    f.reset();
    renderReviews();
    toast('已保存 · ' + d.tips.length + ' 条优化建议');
  });

  function renderReviews() {
    if (!reviews.length) { reviewListEl.innerHTML = '<div class="empty">还没有复盘记录，发完作品来填一单吧</div>'; return; }
    reviewListEl.innerHTML = reviews.map(r => `
      <div class="review-item">
        <div class="review-item-top">
          <span class="tag">${esc(r.platform)}</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:11px;color:var(--text-tertiary);">${esc(r.date)}</span>
            <button data-rreview="${r.id}" style="color:var(--text-tertiary);font-size:13px;">删除</button>
          </div>
        </div>
        <div class="review-item-title">${esc(r.title)}</div>
        <div class="review-metrics">
          ${metric('播放', r.views)} ${metric('点赞', r.likes)} ${metric('评论', r.comments)}
          ${metric('转发', r.shares)} ${metric('完播', r.finish + '%')} ${metric('来源', r.source)}
        </div>
        ${r.good ? `<p style="font-size:12px;color:var(--text-secondary);margin:8px 0 0;"><b style="color:var(--primary);">👍 亮点：</b>${esc(r.good)}</p>` : ''}
        ${r.improve ? `<p style="font-size:12px;color:var(--text-secondary);margin:6px 0 0;"><b style="color:var(--primary);">🔧 待改：</b>${esc(r.improve)}</p>` : ''}
        <div class="review-tips">
          ${(r.tips || []).map(t => `<p>${esc(t)}</p>`).join('')}
        </div>
      </div>`).join('');
  }
  function metric(label, val) {
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-val">${esc(val || 0)}</div></div>`;
  }
  reviewListEl.addEventListener('click', e => {
    const b = e.target.closest('[data-rreview]'); if (!b) return;
    reviews = reviews.filter(r => r.id !== b.dataset.rreview); save(LS.reviews, reviews); renderReviews();
  });
  renderReviews();

  $('#reviewForm').addEventListener('input', e => {
    if (e.target.name === 'views' || e.target.name === 'likes') {
      const v = +e.target.form.views.value || 0, l = +e.target.form.likes.value || 0;
      e.target.form.lkrate.value = v ? (l / v * 100).toFixed(1) + '%' : '';
    }
  });

  /* ---------- 弹层 ---------- */
  const sheet = $('#sheet'), sheetBody = $('#sheetBody'), sheetTitle = $('#sheetTitle');
  function openSheet(title, html) {
    sheetTitle.textContent = '新增' + title;
    sheetBody.innerHTML = html + `<button id="sheetSave" class="sheet-save">保存</button>`;
    sheet.classList.remove('hidden');
  }
  function closeSheet() { sheet.classList.add('hidden'); }
  sheet.addEventListener('click', e => { if (e.target.hasAttribute('data-close') || e.target.id === 'sheetSave') closeSheet(); });

  function buildTopicForm() {
    const popts = PLATFORMS.map(p => `<option>${p}</option>`).join('');
    const copts = CATS.map(c => `<option>${c}</option>`).join('');
    return `
      <div class="sheet-field"><label>平台<select id="f_platform">${popts}</select></label></div>
      <div class="sheet-field"><label>赛道分类<select id="f_cat">${copts}</select></label></div>
      <div class="sheet-field"><label>标题 / 选题<textarea id="f_title" rows="2" placeholder="爆款标题或你的选题"></textarea></label></div>
      <div class="sheet-field"><label>火爆核心原因 / 分析<textarea id="f_analysis" rows="2" placeholder="为什么火"></textarea></label></div>
      <div class="sheet-field"><label>原创创作思路<textarea id="f_idea" rows="2" placeholder="如果做这个方向，原创思路是什么"></textarea></label></div>
      <div class="sheet-field"><label>抖音相关视频链接<input id="f_dy_link" placeholder="https://www.douyin.com/search/... 或具体视频链接" /></label></div>
      <div class="sheet-field"><label>B站相关链接<input id="f_bz_link" placeholder="https://search.bilibili.com/... 或 BV 链接" /></label></div>
    `;
  }
  function buildRepostForm() {
    const popts = PLATFORMS.map(p => `<option>${p}</option>`).join('');
    const copts = CATS.map(c => `<option>${c}</option>`).join('');
    return `
      <div class="sheet-field"><label>平台<select id="f_platform">${popts}</select></label></div>
      <div class="sheet-field"><label>标签/赛道<select id="f_tag">${copts}</select></label></div>
      <div class="sheet-field"><label>原爆款标题<textarea id="f_title" rows="2" placeholder="原视频标题"></textarea></label></div>
      <div class="sheet-field"><label>热度（如：抖音热点榜 772万）<input id="f_heat" placeholder="抖音热点榜 772万" /></label></div>
      <div class="sheet-field"><label>为什么适合你二创<textarea id="f_why_fit" rows="2" placeholder="契合你人设的原因"></textarea></label></div>
      <div class="sheet-field"><label>改编角度<textarea id="f_adapt_angle" rows="3" placeholder="具体怎么改"></textarea></label></div>
      <div class="sheet-field"><label>来源<input id="f_source" placeholder="抖音热点榜 2026-08-20" /></label></div>
      <div class="sheet-field"><label>这个视频长这样<textarea id="f_video_desc" rows="2" placeholder="原视频画面/结构描述"></textarea></label></div>
      <div class="sheet-field"><label>跳转链接<input id="f_link" placeholder="https://... 留空则跳平台搜索" /></label></div>
    `;
  }
  sheetBody.addEventListener('click', e => {
    if (e.target.id !== 'sheetSave') return;
    if (sheetTitle.textContent.includes('选题')) {
      userTopics.unshift({
        id: uid(), platform: $('#f_platform').value, cat: $('#f_cat').value,
        title: $('#f_title').value, analysis: $('#f_analysis').value, idea: $('#f_idea').value,
        dy_link: $('#f_dy_link').value.trim() || 'https://www.douyin.com/search/' + encodeURIComponent($('#f_title').value),
        bz_link: $('#f_bz_link').value.trim() || 'https://search.bilibili.com/all?keyword=' + encodeURIComponent($('#f_title').value)
      });
      save(LS.user_topics, userTopics); renderTopics(); toast('选题已添加');
    } else if (sheetTitle.textContent.includes('二创')) {
      userReposts.unshift({
        id: uid(), platform: $('#f_platform').value, tag: $('#f_tag').value,
        title: $('#f_title').value, heat: $('#f_heat').value,
        why_fit: $('#f_why_fit').value, adapt_angle: $('#f_adapt_angle').value,
        source: $('#f_source').value, video_desc: $('#f_video_desc').value,
        link: $('#f_link').value.trim() || 'https://www.douyin.com/search/' + encodeURIComponent($('#f_title').value)
      });
      save(LS.user_reposts, userReposts); renderReposts(); toast('二创素材已添加');
    } else if (sheetTitle.textContent.includes('导入')) {
      importData($('#f_import') ? $('#f_import').value : '');
    }
    closeSheet();
  });

  /* ---------- 导入 ---------- */
  function importObj(d) {
    if (d && Array.isArray(d.topics)) {
      d.topics.forEach(t => userTopics.unshift({ id: uid(), ...t }));
      save(LS.user_topics, userTopics); renderTopics();
    }
    if (d && Array.isArray(d.reposts)) {
      d.reposts.forEach(t => userReposts.unshift({ id: uid(), ...t }));
      save(LS.user_reposts, userReposts); renderReposts();
    }
  }
  function importData(str) {
    try { importObj(JSON.parse(str)); toast('已导入今日采集'); }
    catch (e) { toast('JSON 解析失败，请检查格式'); }
  }
  function openImport() {
    openSheet('今日采集', `<div class="sheet-field"><label>把聊天里「瑜的工作台·今日采集」的 JSON 整段粘贴到这里（包含 topics / reposts 两项）：<textarea id="f_import" rows="9" placeholder='{"date":"2026-08-20","topics":[...],"reposts":[...]}'></textarea></label></div>`);
  }
  $('#topicImportBtn').addEventListener('click', openImport);
  $('#repostImportBtn').addEventListener('click', openImport);

  // 联网时拉取最新 daily.json
  fetch('./daily.json').then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.date && daily.date && d.date !== daily.date) {
      daily = { date: d.date, topics: d.topics || [], reposts: d.reposts || [] };
      hidden = []; save(LS.daily, daily); save(LS.hidden, hidden);
      renderTopics(); renderReposts();
      toast('已更新到 ' + d.date + ' 采集');
    }
  }).catch(() => {});

  /* ---------- 视图切换 ---------- */
  const titles = { plan: '每日计划', topic: '选题每日灵感', repost: '爆款热点视频/二创', review: '内容复盘' };
  function switchView(v) {
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== v));
    $('#viewTitle').textContent = titles[v];
  }
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  /* ---------- 初始化 ---------- */
  $('#todayDate').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  renderTopicFilter(); renderTopics();
  renderRepostFilter(); renderReposts();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
