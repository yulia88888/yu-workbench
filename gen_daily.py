#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_daily.py — 生成 daily.json（供 GitHub Action 每日自动运行）

数据策略（诚实标注 kind 字段）：
- B站：公开接口，真实 BV 视频链接（kind=video）；云端 IP 被 B站拦截时降级为精选话题（kind=topic）
- 微博：公开热搜，真实链接（kind=topic）
- 抖音/小红书/快手：
    * 优先走第三方聚合接口拿「真实视频链接」（kind=video）
    * 拿不到就退回到「官方实时热搜词 / 精选话题」生成平台话题页（kind=topic）
- 每个平台最多 20 条，混着给你挑；失败不影响出文件。

字段与「瑜的工作台」前端一致：platform/title/reason/idea/heat/videoUrl/search/kind
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import datetime
import ssl

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

NICHES = ("美妆", "化妆", "护肤", "穿搭", "变美", "职场", "拍照", "vlog",
          "减肥", "瘦身", "素颜", "平价", "通勤", "敏感肌", "前台", "唱歌")


def http_get(url, referer="https://www.bilibili.com/", timeout=15, retries=3):
    headers = {"User-Agent": UA, "Referer": referer,
               "Accept": "application/json, text/plain, */*"}
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
    raise last


def is_niche(text):
    return any(k in text for k in NICHES)


# ---------- 聚合接口（尽力拿真实视频链接）----------
AGGREGATORS = {
    "抖音": [
        "https://api.vvhan.com/api/douyin/hot",
        "https://tenapi.vvhan.com/api/douyin/hot",
        "https://api.codelife.cc/api/v1/douyin",
    ],
    "小红书": [
        "https://api.vvhan.com/api/xiaohongshu/hot",
        "https://tenapi.vvhan.com/api/xiaohongshu/hot",
    ],
    "快手": [
        "https://api.vvhan.com/api/kuaishou/hot",
        "https://tenapi.vvhan.com/api/kuaishou/hot",
    ],
}


def parse_items(obj):
    out = []
    def grab(o):
        if not isinstance(o, dict):
            return
        title = (o.get("title") or o.get("word") or o.get("name")
                 or o.get("text") or o.get("desc"))
        url = (o.get("url") or o.get("link") or o.get("href")
               or o.get("origin") or o.get("share_url") or o.get("video"))
        hot = (o.get("hot") or o.get("hotValue") or o.get("hot_value")
               or o.get("heat") or o.get("score") or o.get("hotScore") or "")
        if title and url:
            out.append({"title": str(title).strip(),
                        "url": str(url).strip(), "hot": hot})
    data = obj
    if isinstance(obj, dict):
        if "data" in obj:
            data = obj["data"]
        if isinstance(data, dict):
            for k in ("list", "items", "results", "newslist", "info", "array"):
                if isinstance(data.get(k), list):
                    data = data[k]
                    break
    if isinstance(data, list):
        for it in data:
            grab(it)
    return out


def fetch_aggregator(urls, n=20):
    for u in urls:
        try:
            raw = http_get(u, referer=u)
            items = parse_items(json.loads(raw))
            if items:
                return items[:n]
        except Exception as e:
            print("[warn] aggregator failed:", u, e)
    return []


# ---------- 官方实时热搜词（兜底/话题页）----------
def fetch_douyin_words(n=40):
    try:
        data = json.loads(http_get(
            "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/",
            referer="https://www.douyin.com/"))
        return [(w.get("word", ""), w.get("hot_value", ""))
                for w in data.get("word_list", [])][:n]
    except Exception as e:
        print("[warn] douyin words failed:", e)
        return []


def topic_link(platform, word):
    return {
        "抖音": "https://www.douyin.com/search/" + urllib.parse.quote(word),
        "小红书": "https://www.xiaohongshu.com/search_result?keyword=" + urllib.parse.quote(word),
        "快手": "https://www.kuaishou.com/search/video?keyword=" + urllib.parse.quote(word),
    }[platform]


PLAT_CURATED = {
    "抖音": ["通勤伪素颜妆", "敏感肌平价护肤", "宽肩显瘦穿搭", "职场前台妆容",
             "新手化妆入门", "手机自拍技巧", "打工人减脂餐", "学生党彩妆测评",
             "早八快速出门妆", "方脸修容教程", "小个子穿搭", "素颜好物分享",
             "变美逆袭vlog", "唱歌对口型变装", "办公室穿搭", "干皮保湿攻略",
             "黄黑皮口红", "氛围感写真", "约会妆容", "夏日穿搭"],
    "小红书": ["敏感肌护肤流程", "肩宽女生穿搭", "平价彩妆红黑榜", "通勤妆容分享",
               "手机自拍技巧", "职场新人穿搭", "化妆小白教程", "干皮妆前打底",
               "显脸小发型", "早八伪素颜", "拍照显瘦角度", "打工人好物",
               "变美日记", "口红试色", "通勤包里有什么", "素颜霜测评",
               "黄皮穿搭", "氛围感照片", "约会妆", "夏日防晒"],
    "快手": ["农村女孩变美", "平价衣服穿搭", "手残党化妆", "素颜逆袭",
             "职场穿搭", "宝妈护肤", "拍照姿势教学", "唱歌对口型",
             "减肥打卡", "敏感肌自救", "通勤妆", "显瘦神裤",
             "新手化妆", "拍照氛围感", "打工人日常", "平价好物",
             "黄黑皮穿搭", "约会妆容", "夏季穿搭", "学生党好物"],
    "B站": ["行政前台的一天", "通勤伪素颜妆", "敏感肌护肤", "宽肩穿搭",
            "新手化妆教程", "学生党平价彩妆", "打工人减脂餐", "手机自拍技巧",
            "变美逆袭vlog", "方脸修容", "小个子穿搭", "素颜好物",
            "早八快速化妆", "干皮保湿", "约会妆容", "氛围感写真",
            "黄黑皮穿搭", "职场穿搭", "拍照姿势", "平价好物"],
}


def build_flex(platform, n=20):
    """优先真实视频链接，不足用官方热搜/精选话题补足，凑满 n 条"""
    out = []
    seen = set()

    for it in fetch_aggregator(AGGREGATORS[platform], n):
        if it["title"] in seen:
            continue
        seen.add(it["title"])
        out.append({
            "platform": platform,
            "title": it["title"],
            "reason": "第三方聚合抓到的当日热门视频，可直接看原片",
            "idea": "用行政前台人设翻拍/点评，强调平价/敏感肌差异点",
            "heat": it["hot"],
            "videoUrl": it["url"],
            "search": it["title"],
            "kind": "video",
        })

    words = []
    if platform == "抖音":
        words = [w for w, _ in fetch_douyin_words(40)]
    if not words:
        words = PLAT_CURATED[platform]

    for w in words:
        if len(out) >= n:
            break
        if w in seen:
            continue
        seen.add(w)
        out.append({
            "platform": platform,
            "title": w,
            "reason": ("抖音官方实时热搜，当下讨论度高" if platform == "抖音"
                       else "平台高频词，适合接广告/测评内容"),
            "idea": "结合你的人设做差异化表达，结尾抛互动问题引导评论",
            "heat": "",
            "videoUrl": topic_link(platform, w),
            "search": w,
            "kind": "topic",
        })
    return out[:n]


def fetch_bilibili_top(n=20):
    out = []
    try:
        url = "https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1"
        data = json.loads(http_get(url, referer="https://www.bilibili.com/"))
        items = data.get("data", {}).get("list", [])
        sel = [v for v in items if is_niche(v.get("title", ""))]
        sel.sort(key=lambda v: v.get("stat", {}).get("view", 0), reverse=True)
        for v in sel[:n]:
            out.append({
                "platform": "B站",
                "title": v.get("title", ""),
                "reason": "B站当日热门，播放量高，选题结构可借鉴",
                "idea": "以行政前台视角翻拍/点评，强调平价与敏感肌差异化",
                "heat": v.get("stat", {}).get("view", 0),
                "videoUrl": "https://www.bilibili.com/video/" + v.get("bvid", ""),
                "search": v.get("title", ""),
                "kind":  "video",
            })
    except Exception as e:
        print("[warn] bilibili failed:", e)
    # 云端服务器 IP 可能被 B站拦截，抓不到时用精选话题兜底，保证有内容
    if len(out) < n:
        for w in PLAT_CURATED["B站"]:
            if len(out) >= n:
                break
            out.append({
                "platform": "B站",
                "title": w,
                "reason": "B站高频选题，适合中长视频涨粉",
                "idea": "用你的视角做差异化表达，结尾抛互动问题引导评论",
                "heat": "",
                "videoUrl": "https://search.bilibili.com/all?keyword=" + urllib.parse.quote(w),
                "search": w,
                "kind": "topic",
            })
    return out


def fetch_weibo_hot(n=10):
    out = []
    try:
        data = json.loads(http_get("https://weibo.com/ajax/side/hotSearch",
                                   referer="https://weibo.com/"))
        lst = data.get("data", {}).get("realtime", [])
        sel = [x for x in lst if is_niche(x.get("word", ""))]
        sel = sel[:n] if sel else lst[:n]
        for x in sel:
            w = x.get("word", "")
            out.append({
                "platform": "微博",
                "title": w,
                "reason": "微博当日热搜，话题度高",
                "idea": "结合打工人/前台视角做观点或轻松吐槽内容",
                "heat": x.get("num", 0),
                "videoUrl": "https://s.weibo.com/weibo?q=" + urllib.parse.quote(w),
                "search": w,
                "kind": "topic",
            })
    except Exception as e:
        print("[warn] weibo failed:", e)
    return out


# ---- 爆款二创（肩宽穿搭 / 化妆教程 / 职场吐槽）----
REPOST_SEED = [
    {"type": "肩宽穿搭", "title": "梨形+宽肩显瘦神裤",
     "reason": "评论区疯狂求链接，转化意向强",
     "plan": "改你的「前台通勤版」：西装裤+尖头鞋，加「47kg也能撑起」反差钩子",
     "search": "宽肩显瘦穿搭"},
    {"type": "化妆教程", "title": "10秒伪素颜底妆",
     "reason": "短平快、易模仿，完播极高",
     "plan": "换「敏感肌版本」，强调不卡粉不泛红，结尾教定妆手法差异化",
     "search": "敏感肌底妆教程"},
    {"type": "肩宽穿搭", "title": "一字肩避雷指南",
     "reason": "踩坑类内容收藏率高",
     "plan": "以肩宽43实测，拍「这3种领型我踩雷了」，真实测评更有信任感",
     "search": "肩宽 避雷 领型"},
    {"type": "化妆教程", "title": "方圆脸修容公式",
     "reason": "干货收藏率高，易涨粉",
     "plan": "结合你混干微敏皮，拍「敏感受不了的修容产品」反向测评",
     "search": "方圆脸 修容"},
    {"type": "职场吐槽", "title": "前台日常崩溃瞬间",
     "reason": "打工人共鸣强，转发高",
     "plan": "匿名化改编成段子，结尾抛「你们前台也这样吗」引导评论",
     "search": "前台 日常 吐槽"},
    {"type": "肩宽穿搭", "title": "小个子显高穿搭",
     "reason": "受众广，搜索量大",
     "plan": "你166但偏瘦，做「瘦高但宽肩怎么穿」细分角度",
     "search": "小个子 显高 穿搭"},
    {"type": "化妆教程", "title": "新手化妆顺序",
     "reason": "入门流量大，涨粉稳",
     "plan": "做「行政前台5分钟上岗妆」场景化版本",
     "search": "新手 化妆 顺序"},
    {"type": "职场吐槽", "title": "同事奇葩行为大赏",
     "reason": "八卦向，互动高",
     "plan": "匿名化处理，改成「某公司前台看到的离谱事」系列",
     "search": "同事 奇葩 吐槽"},
]


def build_reposts():
    day = datetime.date.today().toordinal()
    out = []
    for i, r in enumerate(REPOST_SEED):
        if (i + day) % 2 == 0:
            item = dict(r)
            item["heat"] = ""
            item["videoUrl"] = ""
            out.append(item)
    return out


def build():
    topics = []
    topics += fetch_bilibili_top(20)      # 真实视频 / 兜底话题
    topics += fetch_weibo_hot(10)         # 真实链接
    topics += build_flex("抖音", 20)
    topics += build_flex("小红书", 20)
    topics += build_flex("快手", 20)
    return {
        "date": datetime.date.today().isoformat(),
        "topics": topics,
        "reposts": build_reposts(),
    }


if __name__ == "__main__":
    d = build()
    with open("daily.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    kinds = {}
    for t in d["topics"]:
        kinds[t.get("kind", "search")] = kinds.get(t.get("kind", "search"), 0) + 1
    print(f"daily.json written: {len(d['topics'])} topics, "
          f"{len(d['reposts'])} reposts, date={d['date']}, kind={kinds}")
