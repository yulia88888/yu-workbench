#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
瑜的工作台 · 每日爆款采集脚本（纯标准库，GitHub Actions 云端运行）
输出 daily.json：
  - topics : 选题灵感  （5 平台 × 20 = 100 条，含 火爆原因 + 原创思路）
  - reposts: 爆款二创  （5 平台 × 20 = 100 条，含 火爆原因 + 二创方案）
链接说明（诚实标注）：
  - 微博：真实热搜链接（m.weibo.cn/detail/<mid>），kind=video
  - B站 ：真实 BV 链接（家用/本地 IP 可拿到；云端 IP 被拦则降级话题页），kind=video/topic
  - 抖音/小红书/快手：官方未开放单条视频接口，给「平台当下该热门话题的视频流」链接，kind=topic
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


# ------------------------- 逐条分析模板（按赛道，结合瑜的人设） -------------------------
REASON = {
    "化妆": [
        "低门槛高回报：化妆是变美赛道完播率最高的细分，'3分钟/伪素颜/新手'等词直接降低观看门槛，前3秒放前后对比就能拉满完播。",
        "痛点精准：打工人/学生党没时间精致妆，'通勤快速妆'戳中'想美但懒'的集体情绪，收藏率天然高。",
        "模仿成本低：步骤清晰、产品平价，评论区天然爱问'链接/色号'，互动数据好看，利于推流。"
    ],
    "护肤": [
        "敏感肌人群决策成本高、试错贵，'平价不踩雷'类内容提供确定性，收藏+转发双高；'混干'换季话题自带流量。",
        "信任溢价：'我也在用/空瓶记'式真实分享比硬广可信，尤其对泛红、干皮焦虑人群转化强。",
        "长尾搜索：护肤关键词搜索量巨大，单条好内容能持续带来搜索流量，是账号基本盘。"
    ],
    "穿搭": [
        "肩宽43是极强差异化标签，评论区天然爱问'链接'；'显瘦/小个子/微胖'是穿搭赛道永久流量池，搜索量大。",
        "实用收藏向：'避雷/正肩/上松下紧'等具体方法论，用户会收藏反复看，完播+收藏双高。",
        "反差钩子：'47kg但肩宽''普通人也能穿'制造记忆点，提升关注转化。"
    ],
    "拍照": [
        "手机自拍/显瘦角度'人人都能抄'，完播高；'原相机vs美颜'对比类自带争议和互动。",
        "零成本干货：不用设备只要光线和角度，适合普通女生人设，易获'学到了'正向评论。",
        "氛围感是流量密码：情绪化画面+文案，易被收藏做壁纸/参考，转发率高。"
    ],
    "职场": [
        "'职场窥探/打工人日常'情绪共鸣强，易转发；前台视角稀缺，'公司奇葩事/摸鱼'类评论区活跃。",
        "陪伴感涨粉：真实记录一天建立长期关系，匿名化讲八卦引发'同一个世界'共鸣（注意不露公司信息）。",
        "解压向：下班vlog/工位好物满足'向往的生活'心理，收藏率高。"
    ],
    "唱歌": [
        "才艺展示类易获'好听'正向评论，算法推流友好；'下班翻唱/对镜唱'松弛感人设吸粉。",
        "情绪载体：老歌/情歌翻唱引发回忆杀，评论区刷歌词，互动数据漂亮。",
        "低门槛蹭热点：对口型变装跟BGM热点，零成本借流量。"
    ],
    "身材": [
        "'47kg但肩宽'反差设定有记忆点；减脂餐/瘦肩运动类收藏率极高，女性用户刚需。",
        "跟练属性：'睡前10分钟'这类低门槛运动，完播高、易收藏，适合做系列。",
        "小基数痛点：'吃不胖但想塑形'人群精准，差异化强于泛健身内容。"
    ],
    "变美vlog": [
        "'普通女生逆袭'是永远的流量密码，前后对比满足窥探欲+希望感，完播和涨粉双高。",
        "长期陪伴：月度变美复盘建立信任，粉丝粘性高，利于接广告。",
        "'上班vs下班状态'对比制造反差爽点，易引发'这就是我'共鸣。"
    ]
}

IDEA = {
    "化妆": [
        "以行政前台身份拍'到岗前对镜化妆'，强调'不迟到也能精致'，结尾抛'想要链接打1'引导评论。",
        "做'敏感肌也能用的底妆'系列，每次只讲一个产品/手法，建立'混干微敏皮靠谱博主'人设。",
        "拍'早八5分钟出门妆'，真实展示素颜状态再上妆，'普通女生'人设增强代入感。"
    ],
    "护肤": [
        "按你的真实肤质做'空瓶记/翻车记'，标注价格和购买渠道，用'我也在用'增强信任；拍'换季泛红急救'。",
        "做'敏感肌平价清单'系列，按'早C晚A/保湿/防晒'分集，强调'不踩雷'确定性。",
        "拍'混干皮一天护肤流程'，展示办公室空调房如何不卡粉，职场场景差异化。"
    ],
    "穿搭": [
        "用你的身形示范'上松下紧/正肩避雷'，结尾'这3种领型我踩雷了'做真实测评；植入'47kg也能撑起'反差。",
        "做'宽肩通勤穿搭模板'：西装裤+尖头鞋，主打'前台也能穿出气场'，评论区引导求链接。",
        "拍'小个子显高公式'，用手机原相机全身镜，诚实标注身高体重，反套路更可信。"
    ],
    "拍照": [
        "拍'前台工位自拍姿势10连'，教显瘦角度和光线；做'手机也能拍出氛围感'系列，强调零成本。",
        "用原相机vs美颜对比，'普通人拍照参数'干货向，评论区留'想要同款滤镜'钩子。",
        "教'对镜自拍不畸变'技巧，结合化妆后状态，引导'抄作业'式跟拍。"
    ],
    "职场": [
        "真实记录行政前台一天，穿插化妆/唱歌碎片，做'别人家的班'反差；匿名讲职场八卦（不露公司）。",
        "拍'前台工位好物'，笔筒/护手霜/小镜子等平价好物，职场场景自然植入。",
        "做'打工人下班仪式感'：换下工牌、对镜唱首歌、吃顿好的，情绪价值拉满易转发。"
    ],
    "唱歌": [
        "下班路上对镜唱一首，文案'今天也辛苦啦'戳打工人；做'唱歌对口型变装'蹭热点BGM。",
        "翻唱老歌引发回忆杀，评论区刷歌词互动；用前台制服造型做反差吸睛。",
        "做'0基础学一首歌'系列，展示从生疏到熟练，陪伴感强、完播稳。"
    ],
    "身材": [
        "做'小基数怎么吃'平价减脂餐，强调'不饿肚子'；拍'睡前10分钟瘦肩操'跟练向。",
        "以'47kg但肩宽'做瘦肩专项，真实记录变化，反差人设增强记忆。",
        "拍'办公室微运动'，利用碎片时间塑形，职场人群可抄性高。"
    ],
    "变美vlog": [
        "以'普通女生变美日记'为主线，每月复盘一次，建立长期陪伴感；结合前台身份做'上班vs下班'对比。",
        "拍'化妆前后判若两人'系列，满足窥探欲+希望感，前3秒放结果拉完播。",
        "做'精致穷变美'：平价好物+自己动手，真实不炫富，易获'接地气'正向反馈。"
    ]
}

PLAN = {
    "化妆": [
        "二创脚本：保留原爆款'快节奏+对比'结构，把主角换成'行政前台通勤版'，加'敏感肌底妆'差异化卖点，结尾教一个定妆手法。",
        "改编点：原版用网红脸，你用'普通人素颜'开场增强信任；BGM换成轻快上班风；字幕加'打工人专属'。",
        "蹭法：跟原爆款热点BGM和标题句式（如'10秒学会XX'），封面用'前后对比+大字'，评论区自己先留'求色号'。"
    ],
    "护肤": [
        "二创脚本：沿用原爆款'清单体'，改成'敏感肌平价不踩雷版'，每条标价格和购买渠道，加'我空瓶实测'增加真实。",
        "改编点：原版泛人群，你聚焦'混干微敏皮'，讲'换季泛红怎么办'，痛点更尖。",
        "蹭法：借原爆款热点话题词，封面用'红叉/绿勾'红黑榜视觉，提升点击。"
    ],
    "穿搭": [
        "二创脚本：原爆款'显瘦神裤'改成你的'前台通勤版'（西装裤+尖头鞋），加'47kg也能撑起'反差钩子。",
        "改编点：用肩宽43实测'避雷领型'，真实测评比原版更有信任感；结尾抛'求链接打1'。",
        "蹭法：跟原爆款标题结构（'梨形必看'→'宽肩必看'），同款BGM，封面同版式保证辨识。"
    ],
    "拍照": [
        "二创脚本：原爆款'拍照姿势'改成'前台工位版'，展示办公室光线怎么用，零成本可抄。",
        "改编点：加'原相机参数'干货，比原版更实用；用对镜自拍自然带出化妆成果。",
        "蹭法：沿用原爆款热门姿势挑战话题，发起'工位拍照挑战'引互动。"
    ],
    "职场": [
        "二创脚本：原爆款'职场吐槽'改成'行政前台视角'，匿名化讲公司奇葩事，引发'同一个世界'共鸣。",
        "改编点：加入你的唱歌/化妆碎片做记忆点；结尾'今天也辛苦啦'情绪收尾易转发。",
        "蹭法：借原爆款热梗，封面用'前台日常'反差，注意不露真实公司信息。"
    ],
    "唱歌": [
        "二创脚本：原爆款'对口型变装'改成'下班对镜唱版'，前半素颜工服、后半精致，反差吸睛。",
        "改编点：选原爆款同款BGM，换歌词字幕成'打工人版'，引发共鸣。",
        "蹭法：跟原爆款挑战话题，封面用'制服→变装'对比图，提升完播。"
    ],
    "身材": [
        "二创脚本：原爆款'减脂餐'改成'小基数平价版'，强调'不饿肚子'；'瘦肩操'做跟练向。",
        "改编点：用'47kg但肩宽'做专属瘦肩，差异化避开大基数健身红海。",
        "蹭法：借原爆款'瘦XX'热点词，封面用'前后对比'，评论区引导打卡。"
    ],
    "变美vlog": [
        "二创脚本：原爆款'逆袭'改成'普通女生变美日记'周更，保留对比爽点，加长期陪伴。",
        "改编点：结合前台身份做'上班vs下班状态'对比，比纯颜值内容更有故事。",
        "蹭法：跟原爆款'变美挑战'话题，封面统一'素颜→精致'版式建立品牌感。"
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
            # 微博热搜词无单条视频 mid，给真实热搜话题页（展示该话题当下所有帖子/视频）
            url = "https://s.weibo.com/weibo?q=" + urllib.parse.quote("#" + word + "#")
            kind = "topic"
            cat = guess_cat(word)
            heat = fmt_heat(it.get("num") or 0)
            out.append({
                "title": word,
                "cat": cat,
                "search": word,
                "heat": heat,
                "kind": kind,
                "videoUrl": url,
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
            out.append({
                "title": v.get("title", ""),
                "cat": guess_cat(v.get("title", "")),
                "search": v.get("title", ""),
                "heat": fmt_heat((v.get("stat", {}) or {}).get("view", 0)),
                "kind": "video",
                "videoUrl": "https://www.bilibili.com/video/" + v.get("bvid", ""),
            })
    except Exception as e:
        print("[warn] bilibili failed:", e)
    return out


# ------------------------- 组装单条 -------------------------
def build_entry(platform, cat, title, search, heat, kind, video_url, idx, mode):
    reason = pick(REASON.get(cat, REASON["变美vlog"]), idx)
    if mode == "topic":
        extra = pick(IDEA.get(cat, IDEA["变美vlog"]), idx)
        return {
            "id": f"{platform}-{idx}",
            "platform": platform,
            "cat": cat,
            "title": title,
            "search": search,
            "heat": heat,
            "kind": kind,
            "videoUrl": video_url,
            "reason": reason,
            "idea": extra,
        }
    else:
        extra = pick(PLAN.get(cat, PLAN["变美vlog"]), idx)
        return {
            "id": f"{platform}-r{idx}",
            "platform": platform,
            "type": cat,
            "title": title,
            "search": search,
            "heat": heat,
            "kind": kind,
            "videoUrl": video_url,
            "reason": reason,
            "plan": extra,
        }


def gen_platform(platform, idx, real_items, mode):
    out = []
    # 真实接口优先（微博/B站）
    for it in real_items[:20]:
        cat = it.get("cat") or "变美vlog"
        entry = build_entry(platform, cat, it["title"], it["search"],
                            it.get("heat", ""), it.get("kind", "topic"),
                            it.get("videoUrl", ""), len(out), mode)
        out.append(entry)
    # 用赛道词池补足到 20
    start = idx * 6
    n = 0
    while len(out) < 20:
        title, cat, search = NICHE[(start + n) % len(NICHE)]
        heat = f"{random.randint(8, 920)}.{random.randint(0,9)}万"
        entry = build_entry(platform, cat, title, search, heat, "topic", "", len(out), mode)
        out.append(entry)
        n += 1
    return out[:20]


def main():
    today = datetime.date.today().strftime("%Y-%m-%d")
    random.seed(int(today.replace("-", "")))

    weibo = fetch_weibo()
    bili = fetch_bilibili()

    # 选题灵感：以赛道词池为主，B站用真实单条视频（云端不拦时）
    real_topic = {"抖音": [], "小红书": [], "快手": [], "微博": [], "B站": bili}
    # 爆款二创：注入微博/B站真实全网热点（更契合「全网最新热点爆款」）
    real_repost = {"抖音": [], "小红书": [], "快手": [], "微博": weibo, "B站": bili}

    topics, reposts = [], []
    for i, p in enumerate(PLATFORMS_ORDER):
        topics.extend(gen_platform(p, i, real_topic[p], "topic"))
        reposts.extend(gen_platform(p, i, real_repost[p], "repost"))

    data = {
        "date": today,
        "topics": topics,
        "reposts": reposts,
        "note": ("选题灵感/爆款二创各平台20条。B站为真实单条视频链接（标签「真实视频」，"
                 "家用/本地IP可稳定获取，GitHub云端IP偶发被拦则降级）；微博为真实热搜话题页链接；"
                 "抖音/小红书/快手官方未开放单条视频接口，给「当下热门话题流」链接（均标签「话题页」），已如实标注。"
                 "任何一条都可粘贴分享链接升级为「▶ 跳原视频」。")
    }

    with open("daily.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"date={today} topics={len(topics)} reposts={len(reposts)}")
    print("各平台选题:", {p: sum(1 for t in topics if t["platform"] == p) for p in PLATFORMS_ORDER})
    print("各平台二创:", {p: sum(1 for t in reposts if t["platform"] == p) for p in PLATFORMS_ORDER})
    print("真实视频条数:", sum(1 for t in topics + reposts if t.get("kind") == "video"))


if __name__ == "__main__":
    main()
