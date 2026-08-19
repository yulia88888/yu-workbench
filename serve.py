#!/usr/bin/env python3
# 瑜的工作台 · 本地静态服务器
# 用途：让工作台以 http 方式打开，从而支持「打开即自动拉取 daily.json」。
# 用法：双击运行，或终端执行  python serve.py
# 手机访问：保持本机运行，手机连同一 WiFi，浏览器打开 http://<电脑局域网IP>:8000
import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'瑜的工作台已启动 → http://localhost:{PORT}')
        print('手机请用电脑的局域网 IP 访问，例如 http://192.168.x.x:8000')
        print('按 Ctrl+C 停止')
        httpd.serve_forever()
