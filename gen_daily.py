#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_daily.py — 生成 daily.json（供 GitHub Action 每日自动运行）

- B站：调用公开 popular 接口，按「美妆/护肤/穿搭/变美/职场/拍照」筛选，取播放量 Top5，给真实 BV 链接
- 微博：调用公开 hotSearch 接口，取与你赛道相关的热搜 Top5，给真实搜索链接
- 抖音 / 小红书 / 快手：精选搜索话题（这些本就是「搜索入口」，不需要实时数据，精选更稳更有用）
- 全部带兜底：任一接口失败不影响出文件，保证站点每天都有数据

输出：daily.json  { date, topics[], reposts[] }
字段与「瑜的工作台」前端导入格式一致：platform/title/reason/idea/heat/videoUrl/search
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
          "减肥", "瘦身", "素颜", "平价", "通勤")


def http_get(url, referer="https://www.bilibili.com/", timeout=15):
    headers = {"User-Agent": UA, "Referer": referer,
               "Accept": "application/json, text/plain, */*"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", "ignore")


def fetch_bilibili_top(n=5):
    out = []
    try:
        url = "https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1"
        data = json.loads(http_get(url))
        items = data.get("data", {}).get("list", [])
        sel = [v for v in items if any(k in v.get("title", "") for k in NICHES)]
        sel.sort(key=lambda v: v.get("stat", {}).get("view", 0), reverse=True)
        for v in sel[:n]:
            out.append({
                "platform": "B站",
                "title": v.get("title", ""),
                "reason": "B站当日热门，播放量高，选题结构可借鉴",
                "idea": "以行政前台视角翻拍/点评，强调平价与敏感肌差异化",
                "heat": v.get("stat", {}).get("view", 0),
                "videoUrl": "https://www.bilibili.com/video/" + v.get("bvid", ""),
                "search": v.get("title", "")
            })
    except Exception as e:
        print("[warn] bilibili failed:", e)
    return out


def fetch_weibo_hot(n=5):
    out = []
    try:
        data = json.loads(http_get("https://weibo.com/ajax/side/hotSearch",
                                   referer="https://weibo.com/"))
        lst = data.get("data", {}).get("realtime", [])
        matched = [x for x in lst if any(k in x.get("word", "") for k in NICHES)]
        sel = (matched[:n] if matched else lst[:n])
        for x in sel:
            w = x.get("word", "")
            out.append({
                "platform": "微博",
                "title": w,
                "reason": "微博当日热搜，话题度高",
                "idea": "结合打工人/前台视角做观点或轻松吐槽内容",
                "heat": x.get("num", 0),
                "videoUrl": "https://s.weibo.com/weibo?q=" + urllib.parse.quote(w),
                "search": w
            })
    except Exception as e:
        print("[warn] weibo failed:", e)
    return out


# ---- 抖音 / 小红书 / 快手 精选搜索话题（稳定可复用，按日期轻微轮换）----
DOUYIN_TOPICS = [
    "通勤伪素颜妆教程", "敏感肌平价护肤", "宽肩显瘦穿搭", "职场前台妆容",
    "新手化妆入门", "拍照姿势怎么摆", "打工人减脂餐", "学生党彩妆测评",
    "早八快速出门妆", "方脸修容教程", "小个子穿搭", "素颜好物分享",
    "变美逆袭vlog", "唱歌对口型变装", "办公室穿搭", "干皮保湿攻略",
]
XHS_TOPICS = [
    "敏感肌护肤流程", "肩宽女生穿搭", "平价彩妆红黑榜", "通勤妆容分享",
    "手机自拍技巧", "职场新人穿搭", "化妆小白教程", "干皮妆前打底",
    "显脸小发型", "早八伪素颜", "拍照显瘦角度", "打工人好物",
    "变美日记", "口红试色", "通勤包里有什么", "素颜霜测评",
]
KUAISHOU_TOPICS = [
    "农村女孩变美", "平价衣服穿搭", "手残党化妆", "素颜逆袭",
    "职场穿搭", "宝妈护肤", "拍照姿势教学", "唱歌对口型",
    "减肥打卡", "敏感肌自救", "通勤妆", "显瘦神裤",
    "新手化妆", "拍照氛围感", "打工人日常", "平价好物",
]


def search_entry(platform, keyword, reason, idea):
    base = {
        "抖音": "https://www.douyin.com/search/",
        "小红书": "https://www.xiaohongshu.com/search_result?keyword=",
        "快手": "https://www.kuaishou.com/search/video?keyword=",
    }[platform]
    return {
        "platform": platform,
        "title": keyword,
        "reason": reason,
        "idea": idea,
        "heat": "",
        "videoUrl": "",
        "search": keyword,
    }


def build_search_topics():
    # 按日期偏移轮换，制造"每日略有不同"的感觉
    day = datetime.date.today().toordinal()
    topics = []
    for i, kw in enumerate(DOUYIN_TOPICS):
        if (i + day) % 2 == 0:  # 隔日轮换，保持一半稳定一半更新
            topics.append(search_entry("抖音", kw,
                                       "抖音高热搜索词，前台变美赛道流量池",
                                       "用行政前台人设翻拍，强调平价/敏感肌差异点"))
    for i, kw in enumerate(XHS_TOPICS):
        if (i + day) % 2 == 0:
            topics.append(search_entry("小红书", kw,
                                       "小红书种草高频词，适合接广告内容",
                                       "做测评/清单体，封面用对比图+大字"))
    for i, kw in enumerate(KUAISHOU_TOPICS):
        if (i + day) % 2 == 0:
            topics.append(search_entry("快手", kw,
                                       "快手老铁向爆款方向，真实接地气",
                                       "用素人视角真实记录，不精致反而更可信"))
    return topics


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
    topics += fetch_bilibili_top(5)     # 真实 BV 链接
    topics += fetch_weibo_hot(5)        # 真实微博链接
    topics += build_search_topics()      # 抖音/小红书/快手 搜索入口
    return {
        "date": datetime.date.today().isoformat(),
        "topics": topics,
        "reposts": build_reposts(),
    }


if __name__ == "__main__":
    d = build()
    with open("daily.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"daily.json written: {len(d['topics'])} topics, "
          f"{len(d['reposts'])} reposts, date={d['date']}")
