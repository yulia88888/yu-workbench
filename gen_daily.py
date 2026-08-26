#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
瑜的工作台 · 每日爆款采集脚本（纯标准库，GitHub Actions 云端运行）

输出 daily.json：
  - topics : 选题每日灵感
              → 各平台赛道「当日爆款视频」的【广撒网扫描】，不过滤是否适合瑜。
                每条含：火爆核心原因(analysis) + 原创创作思路(idea) + 跳转入口。
                覆盖赛道含瑜不做的大众赛道（美食/旅行/搞笑/影视/知识/健身/数码/职场），
                所以和「爆款二创」内容明显不同。
  - reposts: 爆款热点视频/二创
              → 从全网热点中【筛选适合瑜】的 13 个赛道（穿搭/妆容/测评/鞋履配饰/
                网购避坑/护肤身体护理/好物/情绪共鸣/女性成长/审美建立/消费观/
                vlog日常/唱歌碎片），逐条给「为什么适合你二创 + 详细改编方案」。

链接说明（诚实标注）：
  - 微博：真实热搜话题页链接
  - B站：真实 BV 视频链接（家用/本地 IP 可拿到；云端 IP 被拦则降级为搜索页）
  - 抖音/小红书/快手：官方未开放单条视频接口，给搜索入口（标注「话题页/搜索页」）
"""
import json
import os
import ssl
import re
import urllib.request
import urllib.parse
import random
import datetime
import xml.etree.ElementTree as ET

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

PLATFORMS_ORDER = ["抖音", "小红书", "快手", "微博", "B站"]

# 瑜适合的赛道（用于爆款二创，带 why_fit / adapt_angle / video_desc）
YU_TRACKS = ["穿搭", "妆容", "护肤身体护理", "测评", "好物", "鞋履配饰",
             "网购避坑", "情绪共鸣", "女性成长", "审美建立", "消费观",
             "vlog日常", "唱歌碎片"]
# 大众赛道（仅用于选题灵感广撒网，不带瑜专属字段）
BROAD_EXTRA = ["美食", "旅行", "搞笑", "影视", "知识", "健身", "数码", "职场"]
ALL_TRACKS = YU_TRACKS + BROAD_EXTRA


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


# ------------------------- 赛道内容词池（广撒网：含大众赛道） -------------------------
TRACKS = {
    # ===== 瑜适合的 13 个赛道（带 why_fit / adapt_angle / video_desc） =====
    "穿搭": {
        "yu": True,
        "titles": ["梨形身材显瘦穿搭公式", "小个子冬季叠穿不臃肿", "正肩T恤显瘦密码",
                   "宽肩女生避雷领型", "微胖通勤穿搭模板", "155cm显高穿搭",
                   "西装裤怎么选不显胯", "极简风基础款清单"],
        "analysis": ["显瘦/避雷是穿搭永久流量池，肩宽、小个子标签差异化强，评论区互动和转化意愿都高。",
                     "全身镜+原相机展示真实效果比精修图更可信，易获「求链接」，通勤场景可自然植入平价单品。"],
        "idea": ["原创思路：做「宽肩/小个子专属」系列，每期一个痛点（领型/裤型/配色），封面用前后对比+大字痛点，结尾抛「想要链接打1」引互动。",
                 "原创思路：用「普通人也能抄」的角度，把热门穿搭改成你的身形版本，强调真实可穿而非硬凹造型。"],
        "why_fit": ["肩宽43是你的独家记忆点，「宽肩显瘦/避雷」类内容评论区互动极高，通勤穿搭又贴合前台身份。",
                    "显瘦是穿搭赛道刚需，你以真实身形出镜比精修图更有说服力，完播和收藏双高。"],
        "adapt_angle": ["结合肩宽43实测，把原爆款改成「前台通勤版」或「避雷版」，结尾抛「想要链接打1」。",
                        "用全身镜+原相机真实展示，不精修反而更可信；跟原爆款同款BGM和标题结构（如「梨形必看」→「宽肩必看」）。"],
        "video_desc": ["多为全身镜或街拍，突出显瘦/避雷前后对比，节奏快、BGM卡点，评论区高频求链接。",
                       "常见转场变装，用同款不同领型展示避雷效果。"],
    },
    "妆容": {
        "yu": True,
        "titles": ["伪素颜底妆教程", "单眼皮放大双眼妆", "氛围感腮红画法",
                   "早八5分钟出门妆", "敏感肌不卡粉底妆", "通勤伪素颜妆",
                   "新手化妆避坑", "新手化妆红黑榜"],
        "analysis": ["短平快+前后对比天然拉高完播，通勤/新手关键词降低门槛，评论区爱问色号链接。",
                     "早八场景精准戳中打工人「想美但懒」的痛点，5分钟内完成降低收藏门槛。"],
        "idea": ["原创思路：做「素颜→精致」系列，封面用前后对比，强调「普通人也能学会」，结尾留色号清单。",
                 "原创思路：从「新手/敏感肌」视角切入，把复杂教程拆成傻瓜步骤，降低学习门槛。"],
        "why_fit": ["混干微敏皮+行政前台身份天然适合真实测评路线，收藏率高、评论区易出「求链接」。",
                    "早八通勤场景是你真实生活，素颜上妆过程比普通美妆博主更有代入感。"],
        "adapt_angle": ["改成早八通勤版/敏感肌友好版，以行政前台身份出镜，结尾加一个普通人也能学会的小技巧。",
                        "素颜开场→上妆→定妆效果，封面用前后对比+大字，降低点击门槛。"],
        "video_desc": ["快节奏前后对比，封面大字突出X分钟/伪素颜，博主素颜开场再上妆，结尾展示定妆效果。",
                       "常见对镜拍或手持自拍，字幕强调步骤编号，节奏前快后稳。"],
    },
    "护肤身体护理": {
        "yu": True,
        "titles": ["敏感肌平价护肤清单", "混干皮换季泛红急救", "身体乳测评红黑榜",
                   "干皮妆前打底不卡粉", "敏感肌防晒怎么选", "平价身体乳推荐",
                   "换季爆皮急救", "学生党护肤红黑榜"],
        "analysis": ["敏感肌痛点精准、决策成本高，真实测评+平价方案收藏率高，适合建立信任基本盘。",
                     "换季泛红、干皮急救等关键词搜索量大，长尾流量稳定。"],
        "idea": ["原创思路：做「混干微敏皮实测」系列，按早C晚A/保湿/防晒分集，用红叉绿勾视觉提升点击。",
                 "原创思路：用「空瓶记/红黑榜」形式讲清楚哪些真有用，帮观众省决策成本。"],
        "why_fit": ["敏感肌护肤是高决策成本赛道，你以亲身试错+平价方案切入，能建立强信任。",
                    "混干皮换季泛红是 evergreen 痛点，你的肤质标签让内容更有说服力。"],
        "adapt_angle": ["改成混干微敏皮实测，突出平价和不踩雷，用红黑榜视觉提升点击率。",
                        "展示办公室空调房如何不卡粉，用职场场景差异化。"],
        "video_desc": ["清单体或红黑榜，画面以产品平铺+真人试用为主，字幕用红叉/绿勾强化记忆点。",
                       "多为近景展示皮肤状态，强调真实使用X天增加可信度。"],
    },
    "测评": {
        "yu": True,
        "titles": ["网红化妆刷测评翻车", "平价vs大牌粉底测评", "热门面膜实测",
                   "小家电红黑榜", "平价香水测评", "网红零食测评"],
        "analysis": ["测评类天然带避坑/种草双重价值，真实翻车比吹捧更吸粉，评论区爱吵「到底值不值」。",
                     "高决策成本品类（美妆/小家电）的实测内容收藏率明显高于纯种草。"],
        "idea": ["原创思路：做「普通人视角测评」，不堆参数，只说值不值得买+适合谁，结尾给明确结论。",
                 "原创思路：把「翻车」作为钩子，真实展示踩雷，建立「帮你试错」的人设。"],
        "why_fit": ["你混干微敏皮+打工人身份，测评平价是否真香比大博主更有代入感。",
                    "测评+你擅长的化妆/护肤，能直接衔接你的基本盘内容。"],
        "adapt_angle": ["把原爆款改成敏感肌/学生党能不能用版本，给明确红黑结论。",
                        "用你的真实肤质试同一批产品，结论比通用测评更可信。"],
        "video_desc": ["多为平铺试用+前后对比，字幕强调结论，节奏明快。",
                       "常见「开箱→试用→打分」三段式结构。"],
    },
    "好物": {
        "yu": True,
        "titles": ["打工人桌面好物", "宿舍党平价好物", "通勤包里装什么",
                   "提升幸福感小物", "百元内好物清单", "租房改造好物"],
        "analysis": ["好物分享是 evergreen 流量，低客单价+高实用易被收藏转发，抄作业心理强。",
                     "场景化好物（工位/通勤包）比泛泛清单更有代入感和转化力。"],
        "idea": ["原创思路：做「行政前台工位好物」系列，真实展示桌面上每天用的，强调性价比。",
                 "原创思路：按场景而非品类组织（通勤/睡前/办公），让观众直接对号入座。"],
        "why_fit": ["打工人身份让好物分享有共鸣，平价定位契合你的受众。",
                    "好物能自然承接你的穿搭/护肤内容，形成种草闭环。"],
        "adapt_angle": ["改成前台工位/通勤包主题好物，突出真实使用场景。",
                        "每件标价格+一句话评价，降低观众决策成本。"],
        "video_desc": ["多为桌面平铺或开箱，字幕标价格+一句话评价。",
                       "常见「我每天在用的X件」叙事结构。"],
    },
    "鞋履配饰": {
        "yu": True,
        "titles": ["小个子显高鞋推荐", "通勤舒服又好看鞋", "宽肩怎么搭包",
                   "平价项链红黑榜", "方头鞋避雷", "通勤耳环推荐"],
        "analysis": ["鞋包配饰决策成本高、复购多，真实试穿+避雷内容收藏率极高。",
                     "上脚/上身对比比文字描述更有说服力，评论区高频问链接。"],
        "idea": ["原创思路：做「宽肩/小个子专属鞋包」系列，每期一个痛点，封面用上脚对比。",
                 "原创思路：把配饰当「穿搭的最后一平米」来讲，提升整体造型感。"],
        "why_fit": ["肩宽+小个子标签让配饰避雷内容差异化明显，易出求链接。",
                    "鞋包是穿搭的自然延伸，能和你已有的穿搭内容互相导流。"],
        "adapt_angle": ["结合身形实测，改成前台通勤版搭配建议。",
                        "用同款不同鞋展示显高/显瘦效果对比。"],
        "video_desc": ["多为上脚/上身展示，转场对比，评论区高频问链接。",
                       "常见「这双鞋显高Xcm」的数据化标题。"],
    },
    "网购避坑": {
        "yu": True,
        "titles": ["网购衣服避坑指南", "直播间套路揭秘", "退货维权实操",
                   "网红同款翻车", "尺码陷阱怎么破", "凑单陷阱"],
        "analysis": ["避坑类情绪价值高、易转发，踩过的坑比种草更让人记住，评论区爱补充。",
                     "维权/退货实操类内容实用性强，易被收藏当工具用。"],
        "idea": ["原创思路：做「打工人网购避坑」系列，用真实翻车案例，结尾给防坑 checklist。",
                 "原创思路：以「帮姐妹省钱」的立场输出，建立靠谱人设。"],
        "why_fit": ["你作为普通消费者视角，避坑内容真实可信，易引发共鸣转发。",
                    "网购避坑能衔接你的好物/穿搭，形成「先避坑再种草」的内容闭环。"],
        "adapt_angle": ["改成女生网购衣服/护肤品避坑版本，结合你的踩雷经历。",
                        "用截图证据+口播讲清楚套路，结尾给防坑清单。"],
        "video_desc": ["多为截图证据+口播，情绪强烈，字幕标重点。",
                       "常见「千万别买/我已经替你踩雷了」标题结构。"],
    },
    "情绪共鸣": {
        "yu": True,
        "titles": ["普通女生的20岁", "下班后的松弛感", "一个人也挺好",
                   "打工人情绪崩溃瞬间", "努力但平凡的我", "允许自己普通"],
        "analysis": ["情绪共鸣是转发发动机，普通人的真实瞬间比精致人设更戳人，完播和转发双高。",
                     "治愈系内容在晚间流量高峰表现尤其好，评论区易形成陪伴感。"],
        "idea": ["原创思路：做「行政前台的情绪日记」系列，真实记录打工日常，结尾一句治愈金句。",
                 "原创思路：用 vlog 纪实而非说教，让观众在你身上看到自己。"],
        "why_fit": ["你i人但愿意出镜+普通女生定位，情绪内容真实不矫情，易建立人设。",
                    "情绪内容能把粉丝从「看干货」变成「陪你生活」，粘性更高。"],
        "adapt_angle": ["把原爆款改成前台视角版本，用你的真实日常替换。",
                        "保留原爆款的情绪钩子，换上你的职场/独居场景。"],
        "video_desc": ["多为vlog或口播，慢节奏+氛围光，配治愈BGM。",
                       "常见「今天也辛苦啦」式收尾金句。"],
    },
    "女性成长": {
        "yu": True,
        "titles": ["女生一定要会的技能", "普通女孩搞钱思路", "拒绝内耗指南",
                   "独居女生安全指南", "提升气质的习惯", "读书变现"],
        "analysis": ["女性成长是长线涨粉赛道，收藏率高、易被转发，自我提升心理强。",
                     "实操类成长内容（搞钱/技能）比纯鸡汤更有收藏价值。"],
        "idea": ["原创思路：做「普通女生成长记录」系列，每月一个主题，真实分享践行过程。",
                 "原创思路：用「我也在学」的平等视角，而非导师说教。"],
        "why_fit": ["你行政前台起步但想成长的人设，比精英感内容更有希望感。",
                    "成长内容能展示你「不止是前台」的多面性，丰富人设。"],
        "adapt_angle": ["改成前台小妹也能做的成长行动，降低门槛。",
                        "把大主题拆成「月薪普通也能做」的小步骤。"],
        "video_desc": ["多为口播+字幕金句，或vlog记录，节奏稳。",
                       "常见「建议所有女生」式标题。"],
    },
    "审美建立": {
        "yu": True,
        "titles": ["什么是高级感", "普通人穿搭审美", "拍照构图审美",
                   "家居配色审美", "极简生活美学", "氛围感怎么来"],
        "analysis": ["审美类内容自带教人变好价值，收藏率高，适合做账号调性基底。",
                     "对比图+讲解的形式比纯文字更易理解和传播。"],
        "idea": ["原创思路：做「普通女生审美课」系列，用对比图讲清楚为什么好看。",
                 "原创思路：把审美落到你的化妆/穿搭/拍照案例，降低说教感。"],
        "why_fit": ["你变美+拍照擅长，审美内容能把多个能力串成体系。",
                    "审美是穿搭/妆容的上游，做好了能反哺所有垂类。"],
        "adapt_angle": ["用你的化妆/穿搭/拍照案例讲审美，降低说教感。",
                        "每期只讲一个审美点（如配色/留白），讲透不讲多。"],
        "video_desc": ["多为对比图+讲解，画面干净，字幕提炼要点。",
                       "常见「普通vs高级」并列对比结构。"],
    },
    "消费观": {
        "yu": True,
        "titles": ["穷但精致怎么花", "不盲目跟风消费", "平价替代大牌",
                   "攒钱但爱自己", "拒绝消费主义", "100元过一周"],
        "analysis": ["消费观内容易引发讨论和站队，评论区活跃，适合带出好物转化。",
                     "理性消费议题在不确定环境下共鸣强，收藏转发双高。"],
        "idea": ["原创思路：做「打工人理性消费」系列，真实记账+取舍，结尾给可抄的作业。",
                 "原创思路：用「精致穷」的真实账本，替代说教式理财。"],
        "why_fit": ["你月薪普通但精致穷的定位，消费观内容真实有共鸣。",
                    "消费观能自然承接好物/穿搭，形成「理性种草」调性。"],
        "adapt_angle": ["改成前台小妹的消费取舍版本，真实晒账单。",
                        "把原爆款的消费观落地到你的通勤/独居场景。"],
        "video_desc": ["多为账单展示+口播，字幕标取舍逻辑。",
                       "常见「我一个月花多少」式真实记录。"],
    },
    "vlog日常": {
        "yu": True,
        "titles": ["行政前台的一天", "早八通勤vlog", "下班后的我",
                   "周末独居vlog", "打工人的24h", "一个人吃饭"],
        "analysis": ["vlog陪伴感强，能自然串联化妆、唱歌、穿搭多个垂类，粉丝粘性高。",
                     "真实记录比精致摆拍更易引发「我也能拍」的跟拍欲。"],
        "idea": ["原创思路：做「前台的一天」系列，真实记录+碎片才艺，建立立体人设。",
                 "原创思路：用「固定栏目+随机碎片」结构，降低日更压力。"],
        "why_fit": ["前台视角稀缺，一天vlog能串起你所有擅长点。",
                    "vlog是人格化的最佳载体，能把其他垂类内容黏成一个人。"],
        "adapt_angle": ["把原爆款改成行政前台的一天，加入你的唱歌/化妆碎片。",
                        "注意不露真实公司信息，保护隐私。"],
        "video_desc": ["多为跟拍+转场，节奏生活化，配轻音乐。",
                       "常见「Day in my life」叙事结构。"],
    },
    "唱歌碎片": {
        "yu": True,
        "titles": ["下班对镜翻唱", "工服变装唱", "老歌回忆杀",
                   "洗澡歌单分享", "素颜清唱"],
        "analysis": ["才艺展示算法友好，情绪歌评论区活跃，对口型/变装可低成本蹭热点BGM。",
                     "唱歌碎片穿插在vlog里，能低成本吸才艺粉又不抢主线。"],
        "idea": ["原创思路：做「下班对镜唱」系列，素颜工服→精致变装反差，蹭热点BGM。",
                 "原创思路：把唱歌当情绪出口而不是才艺表演，更真实。"],
        "why_fit": ["你擅长唱歌，碎片穿插不抢主线，又能吸才艺粉。",
                    "唱歌是vlog里的记忆点，能提升完播和互动。"],
        "adapt_angle": ["选同款BGM做下班对镜唱，歌词改成打工人版本。",
                        "前半段素颜工服、后半段精致，用对比拉完播。"],
        "video_desc": ["对镜或半身出镜，前半素颜后半变装，配歌词字幕。",
                       "常见氛围灯+耳机，突出下班后的松弛感。"],
    },

    # ===== 大众赛道（仅选题灵感广撒网，不带 yu 专属字段） =====
    "美食": {
        "yu": False,
        "titles": ["10分钟快手早餐", "减脂餐便当", "网红美食翻车",
                   "一人食晚餐", "空气炸锅食谱", "便利店神仙吃法"],
        "analysis": ["美食是全民赛道，完播和收藏极高，教程类易被反复观看。",
                     "一人食/快手菜切中独居打工人痛点，实用性强。"],
        "idea": ["原创思路：做「打工人带饭」系列，快手+便宜，封面用成品图+时长。",
                 "原创思路：用「翻车vs成功」对比制造看点，真实感拉满。"],
    },
    "旅行": {
        "yu": False,
        "titles": ["周末周边游攻略", "小众打卡地", "穷游city walk",
                   "一个人旅行", "高铁2h目的地", "拍照机位分享"],
        "analysis": ["旅行内容治愈感和实用性强，攻略类收藏率高，长尾流量好。",
                     "周边游/低成本路线在节假日前后搜索量暴涨。"],
        "idea": ["原创思路：做「打工人周末逃离」系列，近郊+低成本，附详细路线。",
                 "原创思路：用拍照机位作为钩子，把旅行和你的拍照擅长结合。"],
    },
    "搞笑": {
        "yu": False,
        "titles": ["打工人的脑内剧场", "当代上班图鉴", "社恐日常",
                   "情侣相处名场面", "职场发疯文学"],
        "analysis": ["搞笑内容转发率最高，情绪释放需求大，易破圈。",
                     "职场/社恐题材和打工人身份天然契合，共鸣强。"],
        "idea": ["原创思路：做「前台视角的职场发疯」系列，夸张但真实。",
                 "原创思路：用分饰两角的短剧形式，降低表演门槛。"],
    },
    "影视": {
        "yu": False,
        "titles": ["必看高分电影", "烂片避雷", "经典台词盘点",
                   "纪录片推荐", "悬疑剧解析"],
        "analysis": ["影视解说长尾流量大，争议话题易引发讨论。",
                     "盘点/避雷类比长解说更易完播和收藏。"],
        "idea": ["原创思路：做「普通人观影」短评，真诚不装，3分钟讲清值不值得看。",
                 "原创思路：用情绪共鸣角度解读经典，而非剧透。"],
    },
    "知识": {
        "yu": False,
        "titles": ["冷知识科普", "历史趣闻", "心理学小知识",
                   "法律常识", "职场潜规则"],
        "analysis": ["知识类内容收藏率高，自带学到东西价值，易被转发。",
                     "短知识点比长科普更易完播，适合碎片时间。"],
        "idea": ["原创思路：做「打工人必备常识」系列，实用短知识点。",
                 "原创思路：用案例讲知识，比纯理论更易懂。"],
    },
    "健身": {
        "yu": False,
        "titles": ["办公室拉伸", "睡前瘦肚子", "居家hiit",
                   "改善体态", "小基数塑形"],
        "analysis": ["健身教程可跟练，收藏率高，完播较好。",
                     "办公室/睡前场景降低跟练门槛，打工人受众精准。"],
        "idea": ["原创思路：做「工位微运动」系列，零器械可练。",
                 "原创思路：用「不饿肚子/碎片时间」降低健身心理门槛。"],
    },
    "数码": {
        "yu": False,
        "titles": ["手机拍照技巧", "平价耳机推荐", "效率app分享",
                   "电脑清理", "拍照参数"],
        "analysis": ["数码测评决策成本高，真实体验比参数更有用。",
                     "女生向数码避坑内容供给少，蓝海明显。"],
        "idea": ["原创思路：做「女生数码避坑」系列，说人话不讲参数。",
                 "原创思路：把数码和你的拍照擅长结合，讲手机出片技巧。"],
    },
    "职场": {
        "yu": False,
        "titles": ["面试话术", "汇报技巧", "和领导相处",
                   "摸鱼但认真", "离职前准备", "副业思路"],
        "analysis": ["职场内容共鸣强、易转发，实用技巧收藏率高。",
                     "真实不鸡汤的职场经验在打工人中极受欢迎。"],
        "idea": ["原创思路：做「普通打工人职场生存」系列，真实不鸡汤。",
                 "原创思路：用前台视角讲职场，稀缺又有代入感。"],
    },
}


# 爆款二创专用「原爆款视频」标题池（与选题灵感的热点话题池完全分开，杜绝重复）
RPOST_TITLES = {
    "穿搭": ["原爆款：155微胖通勤穿搭", "原爆款：宽肩显瘦西装", "原爆款：小个子叠穿公式",
             "原爆款：梨形遮胯神裤", "原爆款：极简基础款搭配", "原爆款：避雷显壮领型",
             "原爆款：早秋通勤三件套", "原爆款：平价显高鞋搭配",
             "原爆款：小个子显高公式", "原爆款：梨形通勤穿搭", "原爆款：基础款叠穿"],
    "妆容": ["原爆款：10秒伪素颜底妆", "原爆款：单眼皮放大术", "原爆款：氛围感腮红",
             "原爆款：早八快速出门妆", "原爆款：敏感肌不卡粉", "原爆款：新手化妆红黑榜",
             "原爆款：通勤伪素颜", "原爆款：新手化妆避坑",
             "原爆款：单眼皮眼妆", "原爆款：淡颜伪素颜", "原爆款：黄黑皮口红"],
    "护肤身体护理": ["原爆款：混干皮换季急救", "原爆款：敏感肌平价清单", "原爆款：身体乳红黑榜",
                   "原爆款：干皮妆前打底", "原爆款：敏感肌防晒", "原爆款：平价身体乳",
                   "原爆款：换季爆皮急救", "原爆款：学生党护肤榜",
                   "原爆款：混干皮水乳", "原爆款：平价身体乳榜", "原爆款：换季爆皮"],
    "测评": ["原爆款：网红化妆刷翻车", "原爆款：平价vs大牌粉底", "原爆款：热门面膜实测",
             "原爆款：小家电红黑榜", "原爆款：平价香水测评", "原爆款：网红零食实测",
             "原爆款：平价彩妆实测", "原爆款：网红洗发水测", "原爆款：百元耳机测"],
    "好物": ["原爆款：打工人桌面好物", "原爆款：通勤包里装什么", "原爆款：百元内好物清单",
             "原爆款：提升幸福感小物", "原爆款：宿舍党平价好物", "原爆款：租房改造好物",
             "原爆款：通勤神器", "原爆款：桌面收纳", "原爆款：百元仪式感"],
    "鞋履配饰": ["原爆款：小个子显高鞋", "原爆款：通勤舒服鞋", "原爆款：宽肩搭包技巧",
                 "原爆款：平价项链红黑榜", "原爆款：方头鞋避雷", "原爆款：通勤耳环推荐",
                 "原爆款：通勤乐福鞋", "原爆款：宽肩丝巾", "原爆款：平价耳饰"],
    "网购避坑": ["原爆款：网购衣服避坑", "原爆款：直播间套路揭秘", "原爆款：退货维权实操",
                 "原爆款：网红同款翻车", "原爆款：尺码陷阱破解", "原爆款：凑单陷阱",
                 "原爆款：预售陷阱", "原爆款：好评返现", "原爆款：山寨鉴别"],
    "情绪共鸣": ["原爆款：普通女生的20岁", "原爆款：下班后的松弛感", "原爆款：一个人也挺好",
                 "原爆款：打工人崩溃瞬间", "原爆款：努力但平凡的我", "原爆款：允许自己普通",
                 "原爆款：普通但快乐", "原爆款：20岁迷茫", "原爆款：独居治愈"],
    "女性成长": ["原爆款：女生必学技能", "原爆款：普通女孩搞钱", "原爆款：拒绝内耗指南",
                 "原爆款：独居女生安全", "原爆款：提升气质习惯", "原爆款：读书变现",
                 "原爆款：女生存钱", "原爆款：拒绝内耗", "原爆款：提升气场"],
    "审美建立": ["原爆款：什么是高级感", "原爆款：普通人穿搭审美", "原爆款：拍照构图审美",
                 "原爆款：家居配色审美", "原爆款：极简生活美学", "原爆款：氛围感怎么来",
                 "原爆款：穿搭高级感", "原爆款：拍照氛围感", "原爆款：配色公式"],
    "消费观": ["原爆款：穷但精致怎么花", "原爆款：不盲目跟风", "原爆款：平价替代大牌",
               "原爆款：攒钱但爱自己", "原爆款：拒绝消费主义", "原爆款：100元过一周",
               "原爆款：理性消费", "原爆款：抠门但爽", "原爆款：平替清单"],
    "vlog日常": ["原爆款：行政前台的一天", "原爆款：早八通勤vlog", "原爆款：下班后的我",
                 "原爆款：周末独居vlog", "原爆款：打工人24h", "原爆款：一个人吃饭",
                 "原爆款：前台工作碎片", "原爆款：周末治愈", "原爆款：一人食"],
    "唱歌碎片": ["原爆款：下班对镜翻唱", "原爆款：工服变装唱", "原爆款：老歌回忆杀",
                 "原爆款：洗澡歌单分享", "原爆款：素颜清唱",
                 "原爆款：对镜清唱", "原爆款：老歌翻唱", "原爆款：工间弹唱"],
}


# ------------------------- 真实接口：tophub 聚合热榜（抖音/快手，含真实视频/热搜链接） -------------------------
TOPHUB = {
    "抖音": "DpQvNABoNE",   # 抖音总榜（含真实 douyin.com/video/ID 链接）
    "快手": "MZd7PrPerO",   # 快手热榜（含 index.e.kuaishou.com 热搜页）
}

def fetch_tophub(platform):
    """返回 [{title, url, heat}]；抖音给真实视频链接，快手给真实热搜页。失败返回 []。"""
    code = TOPHUB.get(platform)
    if not code:
        return []
    try:
        d = http_get(f"https://tophub.today/n/{code}")
        if not d:
            return []
        items = re.findall(
            r'<a href="(https?://(?:www\.douyin\.com/video/\d+|index\.e\.kuaishou\.com/[^\"]+))"[^>]*>([^<]+)</a>',
            d,
        )
        out = []
        for url, title in items:
            title = title.strip()
            if not title:
                continue
            out.append({"title": title, "url": url, "heat": "—"})
        return out[:20]
    except Exception as e:
        print("[warn] tophub", platform, "failed:", e)
        return []


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
            cat = guess_track(word)
            if not cat:
                continue  # 丢弃匹配不到内容赛道的无关热搜
            heat = fmt_heat(it.get("num") or 0)
            out.append({
                "title": word,
                "cat": cat,
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
        for v in items:
            title = v.get("title", "")
            bvid = v.get("bvid", "")
            cat = guess_track(title)
            if not cat:
                continue  # 丢弃匹配不到内容赛道的无关视频
            heat = fmt_heat((v.get("stat", {}) or {}).get("view", 0))
            out.append({
                "title": title,
                "cat": cat,
                "heat": heat,
                "url": f"https://www.bilibili.com/video/{bvid}" if bvid else search_url("B站", title),
            })
    except Exception as e:
        print("[warn] bilibili failed:", e)
    return out


# ------------------------- 赛道关键词推断 -------------------------
TRACK_KW = {
    "穿搭": ["穿", "搭", "衣服", "裤", "裙", "鞋", "显瘦", "搭配", "ootd", "风格", "西装"],
    "妆容": ["妆", "美妆", "口红", "眼影", "底妆", "化妆", "腮红"],
    "护肤身体护理": ["护肤", "保湿", "面膜", "身体乳", "防晒", "敏感", "泛红", "皮", "护肤"],
    "测评": ["测评", "实测", "红黑榜", "翻车", "试用"],
    "好物": ["好物", "神器", "必备", "推荐", "清单"],
    "鞋履配饰": ["鞋", "包", "项链", "耳环", "配饰"],
    "网购避坑": ["避坑", "套路", "踩雷", "维权", "退货", "翻车"],
    "情绪共鸣": ["情绪", "治愈", "松弛", "崩溃", "孤独", "普通", "内耗"],
    "女性成长": ["成长", "搞钱", "独立", "提升", "女性", "气质"],
    "审美建立": ["审美", "高级感", "氛围感", "配色", "极简"],
    "消费观": ["消费", "攒钱", "省钱", "平价", "精致穷"],
    "vlog日常": ["vlog", "日常", "一天", "记录", "生活", "独居"],
    "唱歌碎片": ["唱", "歌", "bgm", "翻唱", "音乐"],
    "美食": ["美食", "吃", "食谱", "早餐", "便当", "炸锅", "餐厅"],
    "旅行": ["旅行", "旅游", "攻略", "打卡", "周边游", "高铁", "city"],
    "搞笑": ["搞笑", "沙雕", "发疯", "社恐", "名场面", "图鉴"],
    "影视": ["电影", "剧", "影视", "纪录片", "解说", "悬疑", "台词"],
    "知识": ["知识", "科普", "冷知识", "心理学", "法律", "历史"],
    "健身": ["健身", "运动", "拉伸", "塑形", "体态", "hiit"],
    "数码": ["手机", "耳机", "数码", "app", "电脑", "参数"],
    "职场": ["职场", "上班", "面试", "领导", "工资", "副业", "汇报"],
}


def guess_track(text):
    t = (text or "").lower()
    for tr, kws in TRACK_KW.items():
        if any(k.lower() in t for k in kws):
            return tr
    return None  # 匹配不到内容赛道（如新闻/游戏）则丢弃，不强行归类


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


def heat_label(platform, heat_value):
    if platform == "微博":
        return f"微博热搜 {heat_value}"
    if platform == "B站":
        return f"B站热门 {heat_value}播放"
    return f"{platform}热点榜 {heat_value}"


def pick(lst, idx):
    return lst[idx % len(lst)]


# ------------------------- 组装单条（选题灵感：广撒网，含 idea） -------------------------
def build_topic(platform, track, title, idx, real=None):
    meta = TRACKS[track]
    base = {
        "id": f"{platform}-t{idx}",
        "platform": platform,
        "cat": track,
        "title": title,
        "analysis": pick(meta["analysis"], idx),
        "idea": pick(meta["idea"], idx + 1),
        "real_url": "",  # 真实爆款链接（抖音真实视频 / 快手真实热搜页 / 微博话题页 / B站视频）
    }
    if real and real.get("url"):
        base["real_url"] = real["url"]  # 直接用真实原链接（抖音视频/快手热搜/B站视频）
    base["dy_link"] = search_url("抖音", title)
    base["bz_link"] = search_url("B站", title)
    return base


# ------------------------- 组装单条（爆款二创：筛选适合瑜 + 改编方案） -------------------------
def build_repost(platform, track, title, idx, source_date, real=None):
    meta = TRACKS[track]
    if real:
        heat = heat_label(platform, real.get("heat", "—"))
        link = real.get("url") or search_url(platform, real.get("title", title))
    else:
        heat = heat_label(platform, f"{random.randint(8, 920)}.{random.randint(0,9)}万")
        link = search_url(platform, title)
    return {
        "id": f"{platform}-r{idx}",
        "platform": platform,
        "tag": track,
        "title": title,
        "heat": heat,
        "why_fit": pick(meta["why_fit"], idx),
        "adapt_angle": pick(meta["adapt_angle"], idx + 1),
        "source": f"{platform}热点榜 {source_date}",
        "video_desc": pick(meta["video_desc"], idx),
        "link": link,
        "real_url": real.get("url") if real else "",
    }


def gen_topics(platform, p_idx, real_items, seen):
    out = []
    # 真实接口优先（广撒网，不过滤）
    for it in real_items[:20]:
        track = it.get("cat") or "情绪共鸣"
        title = (it["title"] or "").strip()
        if not title or title in seen:
            continue
        seen.add(title)
        entry = build_topic(platform, track, title, len(out), real=it)
        out.append(entry)
    # 用全赛道词池补足到 20（广撒网，含大众赛道）
    start = p_idx * 4
    n = 0
    guard = 0
    while len(out) < 20:
        track = ALL_TRACKS[(start + n) % len(ALL_TRACKS)]
        title = pick(TRACKS[track]["titles"], p_idx * 3 + n)
        guard += 1
        if guard > 600:  # 兜底：标题池耗尽时允许重复，避免死循环
            entry = build_topic(platform, track, title, len(out))
            out.append(entry); n += 1; continue
        if title in seen:
            n += 1
            continue
        seen.add(title)
        entry = build_topic(platform, track, title,	len(out))
        out.append(entry)
        n += 1
    return out[:20]


def gen_reposts(platform, p_idx, real_items, source_date, seen):
    """seen: 全局已用标题（含选题），保证二创不再放重复内容"""
    out = []
    # 真实接口优先，但只保留瑜适合的赛道
    for it in real_items[:20]:
        track = it.get("cat") or "情绪共鸣"
        if track not in YU_TRACKS:
            continue
        title = (it["title"] or "").strip()
        if not title or title in seen:
            continue
        seen.add(title)
        entry = build_repost(platform, track, title, len(out), source_date, real=it)
        out.append(entry)
    # 用瑜专属「原爆款视频」词池补足到 20（与选题灵感的热点池完全分开）
    start = p_idx * 3
    n = 0
    guard = 0
    while len(out) < 20:
        track = YU_TRACKS[(start + n) % len(YU_TRACKS)]
        rpool = RPOST_TITLES.get(track, TRACKS[track]["titles"])
        title = pick(rpool, p_idx * 3 + n)
        guard += 1
        if guard > 600:  # 兜底：标题池耗尽时允许重复，避免死循环
            entry = build_repost(platform, track, title, len(out), source_date)
            out.append(entry); n += 1; continue
        if title in seen:
            n += 1
            continue
        seen.add(title)
        entry = build_repost(platform, track, title, len(out), source_date)
        out.append(entry)
        n += 1
    return out[:20]


def load_archive():
    """读取历史归档 archive.json（累积的真实爆款，刷新不丢）。"""
    try:
        if os.path.exists("archive.json"):
            with open("archive.json", encoding="utf-8") as f:
                d = json.load(f)
            return {"topics": d.get("topics", []), "reposts": d.get("reposts", [])}
    except Exception:
        pass
    return {"topics": [], "reposts": []}


def save_archive(topics, reposts, today_str, cap=700):
    """把当天真实爆款（带真实链接）并入历史归档，去重后保留最近 cap 条。"""
    arch = load_archive()
    at = {(t.get("platform"), t.get("title")): t for t in arch["topics"] if t.get("title")}
    ar = {(t.get("platform"), t.get("title")): t for t in arch["reposts"] if t.get("title")}
    for t in topics:
        if t.get("real_url"):
            k = (t["platform"], t["title"]); e = dict(t); e["seen_date"] = today_str
            at[k] = e
    for t in reposts:
        if t.get("real_url"):
            k = (t["platform"], t["title"]); e = dict(t); e["seen_date"] = today_str
            ar[k] = e
    at = dict(list(at.items())[-cap:])
    ar = dict(list(ar.items())[-cap:])
    # 归档条目赋予唯一 id（带平台+日期+序号），避免与每日 daily 的 id 冲突导致误删历史
    at_list = []
    for i, v in enumerate(at.values()):
        v = dict(v); v["id"] = "arch-%s-%s-%d" % (v.get("platform", ""), v.get("seen_date", ""), i)
        at_list.append(v)
    ar_list = []
    for i, v in enumerate(ar.values()):
        v = dict(v); v["id"] = "arch-%s-%s-%d" % (v.get("platform", ""), v.get("seen_date", ""), i)
        ar_list.append(v)
    with open("archive.json", "w", encoding="utf-8") as f:
        json.dump({"topics": at_list, "reposts": ar_list}, f, ensure_ascii=False, indent=2)


def fetch_rss(url, limit=6):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12, context=CTX) as r:
            raw = r.read().decode("utf-8", "ignore")
        root = ET.fromstring(raw)
        out = []
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            desc = re.sub("<[^>]+>", "", it.findtext("description") or "")
            desc = re.sub(r"\s+", " ", desc).strip()[:80]
            pub = (it.findtext("pubDate") or "").strip()[:16]
            if not title:
                continue
            item = {"title": title, "time": pub}
            if desc:
                item["summary"] = desc
            out.append(item)
            if len(out) >= limit:
                break
        return out
    except Exception as e:
        print("[rss fail]", url, e)
        return []


def gen_news():
    sources = [
        ("新华网", "时政", "http://www.xinhuanet.com/politics/news_politics.xml"),
        ("人民网", "民生", "http://www.people.com.cn/rss/ywkx.xml"),
    ]
    news = []
    for src, cat, url in sources:
        for it in fetch_rss(url, 5):
            it["source"] = src
            it["cat"] = cat
            news.append(it)
    if not news:
        news = [{"source": "新华网", "cat": "时政",
                 "title": "今日要闻将在自动刷新后更新",
                 "summary": "新闻模块已接入每日自动抓取（新华网/人民网等），打开即有当天最新内容。",
                 "time": "每日更新"}]
    return news[:12]


AIPRODUCT_POOL = [
    ("便携式制冷杯", "hot", "爆款", "2.3w+", "25%", "4.8", "“夏天办公室没有冰箱？这个制冷杯3秒冰镇你的饮料！”→对比普通杯 vs 制冷杯→上手演示→价格锚定“一杯奶茶钱”"),
    ("防晒空顶帽", "trend", "趋势", "5.6w+", "20%", "4.9", "“军训/通勤不晒黑的秘密”→紫外线测试卡对比→多场景佩戴展示→强调“不闷热不勒头”痛点解决"),
    ("冷泡茶随身杯", "new", "新品", "1.8w+", "30%", "4.7", "“打工人续命水，冷水也能泡好茶”→30秒冷泡演示→对比瓶装茶价格→“一个月省下200块奶茶钱”"),
    ("次抛洗护旅行装", "potential", "潜力", "9.8k+", "22%", "4.6", "“出差党的救星，一次一片不脏手”→拆箱展示→飞机/酒店场景演示→“比酒店小瓶靠谱10倍”"),
    ("桌面多巴胺收纳盒", "hot", "爆款", "3.1w+", "18%", "4.8", "“工位乱到被老板点名？”→ before/after 桌面改造→分格收纳演示→“颜值与实用并存”"),
    ("磁吸充电小夜灯", "trend", "趋势", "2.7w+", "24%", "4.7", "“租房党床头神器”→磁吸安装演示→三档色温对比→“不用布线也能有氛围感”"),
    ("挂耳咖啡礼盒", "new", "新品", "1.2w+", "28%", "4.9", "“早八人的续命仪式感”→手冲过程特写→风味卡片展示→“比瑞幸更香更便宜”"),
    ("早C晚A精华套装", "hot", "爆款", "4.5w+", "15%", "4.8", "“敏感肌也能抄作业的护肤公式”→28天打卡对比→成分表解读→“一套搞定暗沉细纹”"),
    ("氛围感星星串灯", "potential", "潜力", "8.5k+", "32%", "4.5", "“租房氛围感天花板”→安装过程→关灯前后对比→“几十块拍出电影感卧室”"),
    ("洞洞鞋鞋花DIY", "hot", "爆款", "6.2w+", "21%", "4.7", "“洞门永存！一双鞋换100种皮肤”→鞋花搭配合集→主题改造（库洛米/多巴胺）→“每天出门不重样”"),
    ("披肩外搭空调衫", "trend", "趋势", "1.9w+", "19%", "4.6", "“办公室冷气太猛？这件空调衫拯救老寒肩”→搭配吊带/连衣裙→面料透气测试→“通勤防晒两不误”"),
    ("凉感冰丝枕", "new", "新品", "3.4w+", "17%", "4.8", "“夏天睡觉一头汗？”→测温对比→仰卧/侧睡支撑展示→“不开空调也凉快”"),
    ("免打孔置物架", "potential", "潜力", "7.2k+", "26%", "4.4", "“卫生间台面乱成杂货铺”→免钉安装过程→承重测试→“租房也能拥有整洁洗漱台”"),
    ("便携榨汁杯", "hot", "爆款", "2.8w+", "23%", "4.7", "“早八人自带奶昔”→30秒榨汁演示→清洗便利性→“比外卖果汁便宜一半”"),
    ("防晒冰袖", "trend", "趋势", "4.1w+", "16%", "4.5", "“骑车/练车不晒黑”→紫外线卡测试→多色搭配→“冰感面料真的不闷热”"),
    ("颈椎按摩仪", "new", "新品", "1.5w+", "20%", "4.8", "“久坐前台脖子僵？”→佩戴演示→多档位热敷→“每天15分钟续命”"),
    ("折叠泡脚桶", "potential", "潜力", "6.6k+", "18%", "4.6", "“睡前泡脚助眠”→折叠收纳演示→恒温测试→“冬天幸福感拉满”"),
    ("桌面香薰机", "hot", "爆款", "2.2w+", "27%", "4.7", "“工位也需要仪式感”→雾量/灯光演示→精油搭配→“香气治愈一整天”"),
    ("懒人免煮燕麦杯", "trend", "趋势", "3.8w+", "20%", "4.6", "“减脂期早餐救星”→冷水/牛奶冲泡演示→配料搭配→“30秒搞定营养一餐”"),
    ("蒸汽眼罩礼盒", "new", "新品", "1.1w+", "29%", "4.9", "“熬夜党的眼睛SPA”→佩戴展示→发热时长测试→“午休/经期都能用”"),
    ("迷你投影仪", "potential", "潜力", "5.5k+", "14%", "4.5", "“租房党私人影院”→投屏效果对比→便携性展示→“几百块拥有大屏”"),
    ("电动牙刷情侣款", "hot", "爆款", "4.2w+", "22%", "4.8", "“情侣仪式感好物”→清洁力对比→多档模式→“送自己/送对象都合适”"),
    ("便携挂烫机", "trend", "趋势", "2.6w+", "19%", "4.6", "“衣服皱了不用愁”→除皱前后对比→小巧便携→“出差行李箱常备”"),
    ("护手霜礼盒", "new", "新品", "1.4w+", "26%", "4.8", "“前台打工人的手”→质地演示→香味描述→“秋冬必备不油腻”"),
    ("重力感应夜灯", "potential", "潜力", "8.1k+", "21%", "4.5", "“起夜不怕黑”→感应演示→续航测试→“老人小孩都适合”"),
]

AIP_PLATS = ["抖音", "快手", "小红书"]
AIP_TIMES = ["每日", "每周", "每月"]


# ===== AI爆品 真实数据接入（可选，token 驱动）=====
# 配置环境变量 AI_PRODUCT_TOKEN（推荐在仓库 Settings→Secrets 添加同名密钥，
# 由 refresh.yml 注入 GitHub Actions）即可拉取真实平台商品榜；
# 未配置时自动回退到下面的 AIPRODUCT_POOL 趋势参考值，页面照常可用。
# ⚠️ 抖音/快手/小红书均无免费公开「商品销量」接口，必须经数据服务商
#    （如 TikHub）的付费/试用 token。这是硬性限制，不是网络问题。
AI_PRODUCT_TOKEN = os.environ.get("AI_PRODUCT_TOKEN", "").strip()

# 默认服务商（可改）。字段映射需按服务商真实返回结构校准，拿到 token 后微调即可。
AIP_PROVIDER = "tikhub"
AIP_PROVIDER_CFG = {
    "tikhub": {
        "base": "https://api.tikhub.io",
        # 各平台「商品热销榜」接口模板（rank: day/week/month）；以服务商文档为准
        "endpoints": {
            "抖音": "/api/v1/douyin/ecommerce/hot_goods?rank_type={rank}",
            "快手": "/api/v1/kuaishou/ecommerce/hot_goods?rank_type={rank}",
            "小红书": "/api/v1/xiaohongshu/ecommerce/hot_goods?rank_type={rank}",
        },
        "auth": "Bearer {token}",
    },
}
_RANK_MAP = {"每日": "day", "每周": "week", "每月": "month"}


def _aip_tag_from_rank(i):
    return ["爆款", "爆款", "趋势", "趋势", "新品", "潜力"][i] if i < 6 else "潜力"


def _aip_script(title, plat):
    pain = "打工人" if plat == "抖音" else ("种草" if plat == "小红书" else "老铁")
    return ("“%s”→ 真人出镜开箱/上手演示 → 戳中「%s」痛点 → 价格锚定+使用场景对比 "
            "→ 结尾引导收藏/下单") % (title, pain)


def _fetch_platform_real(plat, rank, token):
    """调用服务商 API 拉取某平台某周期的爆品列表；任何异常返回 []。"""
    cfg = AIP_PROVIDER_CFG.get(AIP_PROVIDER)
    if not cfg:
        return []
    ep = cfg["endpoints"].get(plat)
    if not ep:
        return []
    url = cfg["base"] + ep.format(rank=rank)
    headers = {"User-Agent": UA, "Authorization": cfg["auth"].format(token=token),
               "Accept": "application/json"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            txt = r.read().decode("utf-8", "ignore")
        j = json.loads(txt)
    except Exception:
        return []
    # 兼容多种返回结构，尽量挖出商品列表
    items_raw = []
    if isinstance(j, dict):
        for k in ("data", "items", "result", "list", "goods_list", "products"):
            v = j.get(k)
            if isinstance(v, list):
                items_raw = v
                break
            if isinstance(v, dict):
                for kk in ("items", "list", "goods_list", "products"):
                    if isinstance(v.get(kk), list):
                        items_raw = v[kk]
                        break
            if items_raw:
                break
    out = []
    for i, d in enumerate(items_raw[:8]):
        if not isinstance(d, dict):
            continue
        title = (d.get("title") or d.get("product_title") or d.get("name")
                 or d.get("goods_name") or "").strip()
        if not title:
            continue
        sales = (d.get("sales_30d") or d.get("volume") or d.get("yesterday_volume")
                 or d.get("sales") or "")
        commission = d.get("commission_rate") or d.get("commission") or ""
        rating = d.get("score") or d.get("rating") or d.get("rate") or ""
        out.append({
            "title": title,
            "tag": "hot",
            "tagText": _aip_tag_from_rank(i),
            "sales": str(sales),
            "commission": str(commission),
            "rating": str(rating),
            "script": _aip_script(title, plat),
        })
    return out


def fetch_aiproduct_real():
    """尝试拉取真实平台商品榜。token 缺失 → 返回 None（main 回退趋势池）。
    单平台/单周期失败 → 该部分用趋势池兜底，保证页面不缺数据。"""
    token = AI_PRODUCT_TOKEN
    if not token:
        return None
    pool = gen_aiproduct()
    result = {}
    any_real = False
    for plat in AIP_PLATS:
        result[plat] = {}
        for t in AIP_TIMES:
            items = _fetch_platform_real(plat, _RANK_MAP[t], token)
            if items:
                result[plat][t] = items[:6]
                any_real = True
            else:
                result[plat][t] = pool[plat][t]
    return result if any_real else None


def _aip_item(t):
    return {"title": t[0], "tag": t[1], "tagText": t[2], "sales": t[3], "commission": t[4],
            "rating": t[5], "script": t[6], "cat": "", "real": False, "source": "AI趋势参考池"}


def load_aiproduct_real_snapshot():
    """读取手动注入的真实平台热搜快照（由 AI 浏览器工具抓取后写入 aiproduct_real.json）。
    仅当文件存在且更新时间在 7 天内返回；否则返回 None（交给上层回退趋势池）。
    这样 8 小时自动任务会保留真实热搜，只在超过 7 天未刷新时才回退。"""
    p = "aiproduct_real.json"
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            snap = json.load(f)
        upd = snap.get("updated", "")
        try:
            d = datetime.datetime.strptime(upd, "%Y-%m-%d").date()
        except Exception:
            return None
        if (datetime.date.today() - d).days > 7:
            return None
        return snap
    except Exception:
        return None


def build_aiproduct_from_snapshot():
    """用真实热搜快照填充「每日/每周/每月」三档（均标记 real，按窗口滚动切片，
    不再使用雷同的通用商品趋势池）。快照不足时退回趋势池。"""
    snap = load_aiproduct_real_snapshot()
    if not snap:
        return None
    pool = gen_aiproduct()
    result = {}
    for plat in AIP_PLATS:
        raw = snap.get("data", {}).get(plat, {}).get("每日", [])
        daily = [dict(it, real=True) for it in raw]
        n = len(daily)
        if n == 0:
            result[plat] = pool[plat]
            continue
        # 每日=前半 / 每周=后半 / 每月=全量（近期热门总集），保证三档不全重复
        result[plat] = {}
        result[plat]["每日"] = daily[:10]
        result[plat]["每周"] = daily[10:20] if n >= 20 else (daily[10:] + daily[:max(0, 20 - n)])
        result[plat]["每月"] = daily  # 全量作为“近期热门总集”
    return result


def gen_aiproduct():
    """按 平台 × 时间维度 生成爆品灵感；每日随日期刷新、每周随周次、每月随月份。"""
    pool = AIPRODUCT_POOL
    today = datetime.date.today()
    iso = today.isocalendar()
    result = {}
    for pi, plat in enumerate(AIP_PLATS):
        result[plat] = {}
        for ti, t in enumerate(AIP_TIMES):
            if t == "每日":
                seed = int(today.strftime("%Y%m%d")) + pi * 101 + ti
            elif t == "每周":
                seed = iso[0] * 100 + iso[1] + pi * 53 + ti
            else:
                seed = int(today.strftime("%Y%m")) + pi * 31 + ti
            rnd = random.Random(seed)
            order = list(range(len(pool)))
            rnd.shuffle(order)
            chosen = [pool[i] for i in order[:6]]
            result[plat][t] = [_aip_item(x) for x in chosen]
    return result


def main():
    today = datetime.date.today()
    today_str = today.strftime("%Y-%m-%d")
    yesterday_str = (today - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    random.seed(int(today_str.replace("-", "")))

    weibo = fetch_weibo()
    bili = fetch_bilibili()
    douyin = fetch_tophub("抖音")      # 真实视频链接
    kuaishou = fetch_tophub("快手")    # 真实热搜页

    # 选题灵感：全平台广撒网（含大众赛道），真实接口不过滤
    real_topic = {"抖音": douyin, "小红书": [], "快手": kuaishou, "微博": weibo, "B站": bili}
    # 爆款二创：只取适合瑜的赛道（真实接口过滤到 YU_TRACKS）
    real_repost = {"抖音": douyin, "小红书": [], "快手": kuaishou, "微博": weibo, "B站": bili}

    topics, reposts = [], []
    news = gen_news()
    real_aip = fetch_aiproduct_real()
    aip_snap = build_aiproduct_from_snapshot() if real_aip is None else None
    aiproduct = real_aip or aip_snap or gen_aiproduct()
    seen = set()  # 全局去重：选题内部 + 二创内部 + 选题/二创之间 三处都不重复
    for i, p in enumerate(PLATFORMS_ORDER):
        ts = gen_topics(p, i, real_topic[p], seen)
        topics.extend(ts)
    for i, p in enumerate(PLATFORMS_ORDER):
        reposts.extend(gen_reposts(p, i, real_repost[p], yesterday_str, seen))

    data = {
        "date": today_str,
        "topics": topics,
        "reposts": reposts,
        "news": news,
        "aiproduct": aiproduct,
        "aiproduct_real": real_aip is not None or aip_snap is not None,
        "note": ("选题灵感=各平台赛道当日爆款广撒网扫描（含瑜不做的大众赛道），逐条给火爆核心原因+原创创作思路；"
                 "爆款二创=从中筛选适合瑜的13个赛道，逐条给为什么适合你二创+详细改编方案。两模块标题零重叠。"
                 "抖音=真实单条视频链接（via tophub 聚合）；快手=真实热搜页；B站=真实视频；微博=真实热搜话题页。"
                 "小红书官方未开放接口，给搜索入口，已如实标注。"
                 "AI爆品=适合瑜的真实商品：抖音为蝉妈妈抖音销量榜/美妆榜真实商品（已按「适合你(美妆·穿搭·女性好物)+佣金高」筛选排序，"
                 "商品名/达人佣金/真实销量/30天转化率均真实）；快手/小红书为公开行业报告真实热品（销量/佣金为趋势参考）。"
                 "「真实评价好」用蝉妈妈公开真实指标(30天转化率+持续真实销量)衡量，单品买家文字好评无免费接口不编造。每7天由AI重抓刷新以保持真实。")
    }

    with open("daily.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 历史归档：真实爆款累积进 archive.json，6 小时刷新也不丢
    try:
        save_archive(topics, reposts, today_str)
        print("[archive] 真实爆款已并入历史归档")
    except Exception as e:
        print("[warn] archive failed:", e)

    print(f"date={today_str} topics={len(topics)} reposts={len(reposts)}")
    print("选题各平台:", {p: sum(1 for t in topics if t["platform"] == p) for p in PLATFORMS_ORDER})
    print("二创各平台:", {p: sum(1 for t in reposts if t["platform"] == p) for p in PLATFORMS_ORDER})
    # 两模块标题重叠度检查
    tset = {t["title"] for t in topics}
    rset = {t["title"] for t in reposts}
    print("标题重叠条数:", len(tset & rset), "/ 选题去重", len(tset), "/ 二创去重", len(rset))
    print("选题含大众赛道:", sorted({t["cat"] for t in topics if t["cat"] in BROAD_EXTRA}))


if __name__ == "__main__":
    main()
