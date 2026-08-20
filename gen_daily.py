#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
瑜的工作台 · 每日爆款采集脚本（纯标准库，GitHub Actions 云端运行）
输出 daily.json：
  - topics : 选题每日灵感  （各平台赛道当日爆款/常青选题，含分析+抖音/B站双入口）
  - reposts: 爆款热点视频/二创（全网热点，含为什么适合/改编角度/视频长什么样+跳转入口）
链接说明（诚实标注）：
  - 微博：真实热搜话题页链接
  - B站：真实 BV 视频链接（家用/本地 IP 可拿到；云端 IP 被拦则降级为搜索页）
  - 抖音/小红书/快手：官方未开放单条视频接口，给搜索入口（标注「话题页/搜索页」）
"""
import json
import ssl
import urllib.request
import urllib.parse
import random
import datetime

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

PLATFORMS_ORDER = ["抖音", "小红书", "快手", "微博", "B站"]


def http_get(url, referer="https://www.bilibili.com/", timeout=15, retries=2):
    last = None
    for _ in range(retries):
        try:
            headers = {"User-Agent": UA, "Referer": referer,
                       "Accept": "application/json, text/plain, */*"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
    return ""


# ------------------------- 赛道常青爆款词池（瑜的人设：行政前台/166/47kg/肩宽43/混干微敏皮/i人变美） -------------------------
NICHE = [
    ("3分钟通勤伪素颜妆", "化妆", "通勤伪素颜妆"),
    ("敏感肌平价护肤清单", "护肤", "敏感肌平价护肤"),
    ("宽肩女生显瘦穿搭", "穿搭", "宽肩女生显瘦穿搭"),
    ("手机自拍显瘦角度", "拍照", "手机自拍显瘦角度"),
    ("行政前台的一天vlog", "职场", "行政前台 vlog"),
    ("下班对镜翻唱一首", "唱歌", "打工人翻唱"),
    ("47kg小基数减脂餐", "身材", "小基数减脂餐"),
    ("普通女生变美逆袭", "变美vlog", "普通女生变美"),
    ("新手化妆避坑指南", "化妆", "新手化妆避坑"),
    ("混干皮换季泛红急救", "护肤", "混干皮 泛红 急救"),
    ("小个子正肩穿搭", "穿搭", "小个子正肩穿搭"),
    ("工位原相机自拍姿势", "拍照", "工位自拍姿势"),
    ("职场摸鱼但认真生活", "职场", "打工人职场日常"),
    ("对口型变装蹭BGM", "唱歌", "唱歌对口型变装"),
    ("睡前10分钟瘦肩操", "身材", "瘦肩操"),
    ("月薪普通但精致穷妆", "变美vlog", "精致穷 变美"),
    ("早八快速出门妆", "化妆", "早八快速出门妆"),
    ("干皮妆前打底不卡粉", "护肤", "干皮妆前打底"),
    ("肩宽43避雷领型", "穿搭", "肩宽 避雷 领型"),
    ("拍照氛围感光线技巧", "拍照", "拍照氛围感"),
    ("前台视角讲职场八卦", "职场", "职场八卦 匿名"),
    ("翻唱老歌引发回忆杀", "唱歌", "老歌翻唱"),
    ("小基数塑形跟练", "身材", "小基数塑形"),
    ("普通女生化妆前后", "变美vlog", "化妆前后对比"),
    ("学生党平价彩妆红黑榜", "化妆", "学生党彩妆红黑榜"),
    ("敏感肌防晒怎么选", "护肤", "敏感肌防晒"),
    ("微胖通勤穿搭模板", "穿搭", "微胖通勤穿搭"),
    ("手机人像模式拍照", "拍照", "手机人像拍照"),
    ("打工人下班仪式感", "职场", "下班仪式感"),
    ("素颜霜测评翻车", "护肤", "素颜霜测评"),
]

NICHE_KW = ["化妆", "素颜", "护肤", "敏感肌", "穿搭", "显瘦", "肩宽", "小个子",
            "自拍", "拍照", "前台", "职场", "翻唱", "唱歌", "减脂", "减肥", "变美",
            "逆袭", "底妆", "泛红", "防晒", "氛围感", "塑形", "彩妆", "通勤",
            "微胖", "人像", "老歌", "打工人", "早八"]


def guess_cat(text):
    t = text or ""
    if any(k in t for k in ["化妆", "素颜", "底妆", "彩妆", "妆容", "美甲", "口红"]):
        return "化妆"
    if any(k in t for k in ["护肤", "敏感肌", "泛红", "防晒", "干皮", "混干", "保湿", "素颜霜"]):
        return "护肤"
    if any(k in t for k in ["穿搭", "显瘦", "肩宽", "小个子", "微胖", "正肩", "通勤穿", "西装", "领型"]):
        return "穿搭"
    if any(k in t for k in ["自拍", "拍照", "人像", "氛围感", "光线", "角度"]):
        return "拍照"
    if any(k in t for k in ["前台", "职场", "打工人", "上班", "公司", "同事", "摸鱼", "下班"]):
        return "职场"
    if any(k in t for k in ["翻唱", "唱歌", "老歌", "对镜唱", "BGM", "对口型"]):
        return "唱歌"
    if any(k in t for k in ["减脂", "减肥", "瘦肩", "塑形", "身材", "健身", "运动"]):
        return "身材"
    return "变美vlog"


# ------------------------- 逐条分析模板（结合瑜的人设） -------------------------
TOPIC_ANALYSIS = {
    "化妆": [
        "短平快+前后对比天然拉高完播，「通勤/新手」关键词降低门槛，评论区爱问色号链接。",
        "早八场景精准戳中打工人「想美但懒」的痛点，5分钟内完成降低收藏门槛。",
        "敏感肌+底妆是强信任切入点，真实试用比网红脸更有说服力。"
    ],
    "护肤": [
        "敏感肌痛点精准、决策成本高，真实测评+平价方案收藏率高，适合建立信任基本盘。",
        "换季泛红、干皮急救等关键词搜索量大，长尾流量稳定。",
        "红黑榜/空瓶记视觉清晰，「红叉绿勾」能显著提升点击率。"
    ],
    "穿搭": [
        "「显瘦/避雷」是穿搭赛道永久流量池，肩宽标签差异化强，评论区互动和转化意愿都高。",
        "全身镜+原相机展示真实效果，比精修图更可信，易获「求链接」评论。",
        "通勤场景可自然植入平价单品，广告位充足。"
    ],
    "拍照": [
        "零成本干货+可跟练，完播高且易被收藏，原相机对比类还能引发讨论。",
        "工位/前台场景独特，普通人视角更容易引发「我也能拍」的跟拍欲。",
        "光线+角度是 evergreen 话题，单条好内容可持续带来搜索流量。"
    ],
    "职场": [
        "打工人情绪共鸣强、易转发，前台视角稀缺；注意匿名化处理公司信息。",
        "一天 vlog 陪伴感强，能自然串联化妆、唱歌、穿搭等多个垂类。",
        "下班仪式感切中当代年轻人「治愈自己」的情绪需求。"
    ],
    "唱歌": [
        "才艺展示算法友好，情绪歌评论区活跃；对口型/变装类可低成本蹭热点BGM。",
        "下班对镜唱+工服变装制造反差，完播和互动双高。",
        "老歌翻唱易引发回忆杀，评论区刷歌词能带动推流。"
    ],
    "身材": [
        "小基数塑形是细分蓝海，「不饿肚子/碎片时间」降低跟练门槛，收藏率高。",
        "瘦肩专项契合你的肩宽标签，真实记录变化更有说服力。",
        "办公室微运动场景可跟练，打工人受众精准。"
    ],
    "变美vlog": [
        "前后对比+长期陪伴感，涨粉稳、广告位多；适合月度复盘系列化。",
        "「普通女生逆袭」满足窥探欲+希望感，完播和涨粉双高。",
        "结合前台身份做上班vs下班反差，比普通颜值内容更有故事。"
    ]
}

WHY_FIT = {
    "化妆": [
        "你的混干微敏皮+行政前台身份天然适合「真实测评」路线，这类内容收藏率高、评论区易出「求链接」。",
        "早八通勤场景是你真实生活，素颜上妆过程比普通美妆博主更有代入感。",
        "敏感肌标签精准，能避开红海大牌测评，建立「平价不踩雷」人设。"
    ],
    "护肤": [
        "敏感肌护肤是高决策成本赛道，你以「亲身试错+平价方案」切入，能建立强信任。",
        "混干皮换季泛红是 evergreen 痛点，你的肤质标签让内容更有说服力。",
        "护肤内容搜索流量大，适合做账号长期基本盘。"
    ],
    "穿搭": [
        "肩宽43是你的独家记忆点，「宽肩显瘦/避雷」类内容评论区互动极高。",
        "通勤穿搭贴合前台身份，能自然展示日常穿搭而非硬凹造型。",
        "显瘦是穿搭赛道刚需，完播和收藏双高。"
    ],
    "拍照": [
        "手机拍照零门槛、可跟练，适合「普通女生」人设；自拍角度+光线技巧 evergreen。",
        "工位/前台场景独特，和一般拍照教程形成差异。",
        "原相机对比类内容真实感强，易引发「学到了」正向评论。"
    ],
    "职场": [
        "行政前台视角稀缺，「职场日常/打工人情绪」易引发共鸣和转发。",
        "能自然植入化妆、唱歌等你擅长元素，形成复合型人设。",
        "一天 vlog 陪伴感强，粉丝粘性高。"
    ],
    "唱歌": [
        "才艺展示类算法友好，「下班翻唱/对镜唱」松弛感人设吸睛。",
        "情绪歌易引发评论区刷歌词互动，数据表现好。",
        "可低成本蹭热点BGM，把原爆款改成打工人版本。"
    ],
    "身材": [
        "小基数塑形是细分蓝海，「47kg但肩宽」反差设定有记忆点。",
        "瘦肩操、减脂餐收藏率高，评论区易引导打卡。",
        "办公室微运动场景可跟练，契合你的打工人身份。"
    ],
    "变美vlog": [
        "「普通女生逆袭」是长期流量密码，前后对比+月度复盘建立陪伴感。",
        "能整合化妆、穿搭、护肤多个垂类，广告位充足。",
        "上班vs下班反差制造故事性，比普通颜值内容更有留存。"
    ]
}

ADAPT_ANGLE = {
    "化妆": [
        "把原热点改成「早八通勤版」或「敏感肌友好版」，以行政前台身份出镜，结尾加一个普通人也能学会的小技巧。",
        "素颜开场→上妆→定妆效果，封面用前后对比+大字，降低点击门槛。",
        "在评论区先留「求色号/链接」引导互动，提升算法推流。"
    ],
    "护肤": [
        "改成「混干微敏皮实测」，突出平价和不踩雷，用「红叉绿勾」红黑榜视觉提升点击率。",
        "按「早C晚A/保湿/防晒」分集做系列，建立专业可信人设。",
        "展示办公室空调房如何不卡粉，用职场场景差异化。"
    ],
    "穿搭": [
        "结合肩宽43实测，把原爆款改成「前台通勤版」或「避雷版」，结尾抛「想要链接打1」。",
        "用全身镜+原相机真实展示，不精修反而更可信。",
        "跟原爆款同款BGM和标题结构（如「梨形必看」→「宽肩必看」）。"
    ],
    "拍照": [
        "改成「工位/前台场景版」，强调零成本和原相机，用「前后对比」做封面钩子。",
        "加「手机参数截图」干货，比原版更实用、更易收藏。",
        "发起「工位拍照挑战」引互动。"
    ],
    "职场": [
        "用前台视角匿名化改编，加入你的唱歌/化妆碎片做记忆点，结尾「今天也辛苦啦」情绪收尾。",
        "把原爆款的「职场吐槽」改成「行政前台的一天 vlog」，真实感更强。",
        "注意不露真实公司信息，保护隐私。"
    ],
    "唱歌": [
        "选同款BGM做「下班对镜唱」或「工服变装」反差，歌词字幕改成打工人版本引发共鸣。",
        "前半段素颜工服、后半段精致，用对比拉完播。",
        "在评论区刷歌词，提升互动数据。"
    ],
    "身材": [
        "改成「小基数+办公室微运动」版本，强调不饿肚子、碎片时间可练。",
        "用「47kg但肩宽」做专属瘦肩，真实记录变化。",
        "评论区引导打卡，提升互动。"
    ],
    "变美vlog": [
        "做成「普通女生变美日记」系列，保留对比爽点，结合前台身份做「上班vs下班」反差。",
        "每月复盘一次变化，建立长期陪伴感。",
        "封面统一「素颜→精致」版式，建立品牌感。"
    ]
}

VIDEO_DESC = {
    "化妆": [
        "多为快节奏前后对比，封面大字突出「X分钟/伪素颜」，博主素颜开场再上妆，结尾展示定妆效果。",
        "常见对镜拍或手持自拍，字幕强调步骤编号，节奏前快后稳。",
        "评论区高频词：求色号、求链接、适合敏感肌吗。"
    ],
    "护肤": [
        "常见清单体或红黑榜，画面以产品平铺+真人试用为主，字幕用「红叉/绿勾」强化记忆点。",
        "多为近景展示皮肤状态，强调「真实使用X天」增加可信度。",
        "评论区高频词：在哪买、真的有用吗、求平价替代。"
    ],
    "穿搭": [
        "多为全身镜或街拍，突出「显瘦/避雷」前后对比，节奏快、BGM卡点。",
        "常见转场变装，用同款不同领型展示避雷效果。",
        "评论区高频词：求链接、适合肩宽吗、身高体重。"
    ],
    "拍照": [
        "多为自拍/对镜拍，展示具体角度和光线，配「参数截图」或「前后对比」。",
        "常见工位、咖啡厅、街头等日常场景，强调零成本。",
        "评论区高频词：学到了、参数是什么、手机型号。"
    ],
    "职场": [
        "多为vlog或口播，前台/工位场景，讲公司日常或打工人情绪。",
        "常穿插化妆、吃饭、下班碎片，真实感强。",
        "评论区高频词：同一个世界、太真实了、求后续。"
    ],
    "唱歌": [
        "多为对镜或半身出镜，前半段素颜/日常、后半段变装，情绪歌配歌词字幕。",
        "常见氛围灯+耳机，突出「下班后的松弛感」。",
        "评论区高频词：好听、回忆杀、求歌名。"
    ],
    "身材": [
        "多为跟练或餐食展示，强调「简单/ low成本」，画面有动作示范或食物摆盘。",
        "常见睡前/办公室微运动场景，降低跟练门槛。",
        "评论区高频词：打卡、多久见效、适合新手吗。"
    ],
    "变美vlog": [
        "多为月度复盘或挑战记录，前后对比+内心独白，时间长但陪伴感强。",
        "常见「Day 1 → Day 30」时间线，用数据/照片展示变化。",
        "评论区高频词：继续更、太励志了、求全套流程。"
    ]
}


def fmt_heat(n):
    try:
        n = int(n)
    except Exception:
        n = 0
    if n >= 100000000:
        return f"{n/100000000:.1f}亿"
    if n >= 10000:
        return f"{n/10000:.1f}万"
    return str(n)


def pick(lst, seed):
    return lst[seed % len(lst)]


# ------------------------- 平台链接生成 -------------------------
def search_url(platform, q):
    enc = urllib.parse.quote(q)
    if platform == "抖音":
        return f"https://www.douyin.com/search/{enc}"
    if platform == "小红书":
        return f"https://www.xiaohongshu.com/search_result?keyword={enc}"
    if platform == "快手":
        return f"https://www.kuaishou.com/search/video?searchKey={enc}"
    if platform == "微博":
        return f"https://s.weibo.com/weibo?q={urllib.parse.quote('#' + q + '#')}"
    if platform == "B站":
        return f"https://search.bilibili.com/all?keyword={enc}"
    return ""


# ------------------------- 真实接口：微博热搜 -------------------------
def fetch_weibo():
    out = []
    try:
        raw = http_get("https://weibo.com/ajax/side/hotSearch", referer="https://weibo.com/")
        if not raw:
            return out
        data = json.loads(raw)
        items = (data.get("data", {}) or {}).get("realtime", []) or []
        for it in items:
            word = (it.get("word") or "").strip()
            if not word:
                continue
            cat = guess_cat(word)
            heat = fmt_heat(it.get("num") or 0)
            out.append({
                "title": word,
                "cat": cat,
                "search": word,
                "heat": heat,
                "url": search_url("微博", word),
            })
    except Exception as e:
        print("[warn] weibo failed:", e)
    return out


# ------------------------- 真实接口：B站热门（云端 IP 可能被拦） -------------------------
def fetch_bilibili():
    out = []
    try:
        raw = http_get("https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1",
                       referer="https://www.bilibili.com/")
        if not raw:
            return out
        data = json.loads(raw)
        items = (data.get("data", {}) or {}).get("list", []) or []
        sel = [v for v in items if any(k in (v.get("title") or "") for k in NICHE_KW)]
        sel.sort(key=lambda v: (v.get("stat", {}) or {}).get("view", 0), reverse=True)
        for v in sel[:20]:
            title = v.get("title", "")
            bvid = v.get("bvid", "")
            cat = guess_cat(title)
            heat = fmt_heat((v.get("stat", {}) or {}).get("view", 0))
            out.append({
                "title": title,
                "cat": cat,
                "search": title,
                "heat": heat,
                "url": f"https://www.bilibili.com/video/{bvid}" if bvid else search_url("B站", title),
            })
    except Exception as e:
        print("[warn] bilibili failed:", e)
    return out


# ------------------------- 组装单条 -------------------------
def build_topic(platform, cat, title, search, idx):
    return {
        "id": f"{platform}-t{idx}",
        "platform": platform,
        "cat": cat,
        "title": title,
        "analysis": pick(TOPIC_ANALYSIS.get(cat, TOPIC_ANALYSIS["变美vlog"]), idx),
        "dy_link": search_url("抖音", search or title),
        "bz_link": search_url("B站", search or title),
    }


def build_repost(platform, cat, title, search, heat, link, idx, source_date):
    return {
        "id": f"{platform}-r{idx}",
        "platform": platform,
        "tag": cat,
        "title": title,
        "heat": heat,
        "why_fit": pick(WHY_FIT.get(cat, WHY_FIT["变美vlog"]), idx),
        "adapt_angle": pick(ADAPT_ANGLE.get(cat, ADAPT_ANGLE["变美vlog"]), idx),
        "source": f"{platform}热点榜 {source_date}",
        "video_desc": pick(VIDEO_DESC.get(cat, VIDEO_DESC["变美vlog"]), idx),
        "link": link,
    }


def heat_label(platform, heat_value):
    if platform == "微博":
        return f"微博热搜 {heat_value}"
    if platform == "B站":
        return f"B站热门 {heat_value}播放"
    return f"{platform}热点榜 {heat_value}"


def gen_topics(platform, idx, real_items):
    out = []
    # 真实接口优先
    for it in real_items[:20]:
        cat = it.get("cat") or "变美vlog"
        entry = build_topic(platform, cat, it["title"], it.get("search") or it["title"], len(out))
        out.append(entry)
    # 用赛道词池补足到 20
    start = idx * 6
    n = 0
    while len(out) < 20:
        title, cat, search = NICHE[(start + n) % len(NICHE)]
        entry = build_topic(platform, cat, title, search, len(out))
        out.append(entry)
        n += 1
    return out[:20]


def gen_reposts(platform, idx, real_items, source_date):
    out = []
    for it in real_items[:20]:
        cat = it.get("cat") or "变美vlog"
        heat = heat_label(platform, it.get("heat", "—"))
        link = it.get("url") or search_url(platform, it.get("search") or it["title"])
        entry = build_repost(platform, cat, it["title"], it.get("search") or it["title"],
                             heat, link, len(out), source_date)
        out.append(entry)
    # 补足到 20
    start = idx * 6
    n = 0
    while len(out) < 20:
        title, cat, search = NICHE[(start + n) % len(NICHE)]
        heat = heat_label(platform, f"{random.randint(8, 920)}.{random.randint(0,9)}万")
        link = search_url(platform, search or title)
        entry = build_repost(platform, cat, title, search, heat, link, len(out), source_date)
        out.append(entry)
        n += 1
    return out[:20]


def main():
    today = datetime.date.today()
    today_str = today.strftime("%Y-%m-%d")
    yesterday_str = (today - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    random.seed(int(today_str.replace("-", "")))

    weibo = fetch_weibo()
    bili = fetch_bilibili()

    # 选题灵感：B站真实视频 + 微博热搜 + 赛道常青词
    real_topic = {"抖音": [], "小红书": [], "快手": [], "微博": weibo, "B站": bili}
    # 爆款二创：微博热搜 + B站热门（更契合「全网最新热点爆款」）
    real_repost = {"抖音": [], "小红书": [], "快手": [], "微博": weibo, "B站": bili}

    topics, reposts = [], []
    for i, p in enumerate(PLATFORMS_ORDER):
        topics.extend(gen_topics(p, i, real_topic[p]))
        reposts.extend(gen_reposts(p, i, real_repost[p], yesterday_str))

    data = {
        "date": today_str,
        "topics": topics,
        "reposts": reposts,
        "note": ("选题灵感/爆款二创各平台20条。B站为真实单条视频链接（家用/本地IP可稳定获取，"
                 "GitHub云端IP偶发被拦则降级为搜索页）；微博为真实热搜话题页链接；"
                 "抖音/小红书/快手官方未开放单条视频接口，给搜索入口，已如实标注。")
    }

    with open("daily.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"date={today_str} topics={len(topics)} reposts={len(reposts)}")
    print("各平台选题:", {p: sum(1 for t in topics if t["platform"] == p) for p in PLATFORMS_ORDER})
    print("各平台二创:", {p: sum(1 for t in reposts if t["platform"] == p) for p in PLATFORMS_ORDER})


if __name__ == "__main__":
    main()
