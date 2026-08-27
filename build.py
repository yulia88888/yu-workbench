#!/usr/bin/env python3
# 把 app.js 和当日 daily.json 注入 template.html，
# 生成自包含的 index.html（PWA/GitHub Pages）和 瑜的工作台.html（本地离线快照）。
import json, pathlib

base = pathlib.Path(__file__).parent
tpl = (base / 'template.html').read_text(encoding='utf-8')
script = (base / 'app.js').read_text(encoding='utf-8')
data = json.loads((base / 'daily.json').read_text(encoding='utf-8'))

payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
payload = payload.replace('</script', '<\\/script')

if '__SCRIPT__' not in tpl:
    raise SystemExit('模板里找不到 __SCRIPT__ 占位符')
if '__EMBEDDED_JSON__' not in script:
    raise SystemExit('app.js 里找不到 __EMBEDDED_JSON__ 占位符')

out = tpl.replace('__SCRIPT__', script)
out = out.replace('__EMBEDDED_JSON__', payload)

index_path = base / 'index.html'
index_path.write_text(out, encoding='utf-8')
print('OK ->', index_path, '大小', len(out), '字节')

# 本地离线快照（瑜的工作台.html）：仅在可写时生成，失败不影响线上构建
try:
    local_path = base.parent / '瑜的工作台.html'
    local_path.write_text(out, encoding='utf-8')
    print('OK ->', local_path, '大小', len(out), '字节')
except Exception as e:
    print('跳过本地离线快照（不影响线上）:', e)
print('数据日期:', data.get('date'), '| 选题', len(data.get('topics', [])), '条 | 二创', len(data.get('reposts', [])), '条')
