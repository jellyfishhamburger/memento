#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MEMENTO 本地版：静态文件 + Ollama 同源代理。

为什么需要它：
  线上版是 https，浏览器禁止 https 页面访问 http://127.0.0.1:11434
  （混合内容），所以本机 Ollama 在线上版永远连不上。
  这里把网页和 /ai/* 代理放在同一个 http://127.0.0.1 下，
  同源就不存在 CORS，也不存在混合内容。

端口：默认自动挑 8901-8919 里第一个空的（8899 常被别的项目占着）。
      想固定就 set PORT=8900 再运行。

用法：  python serve.py
"""
import http.server
import json
import os
import socketserver
import sys
import urllib.error
import urllib.request

WANT_PORT = int(os.environ.get("PORT", "0"))     # 0 = auto
PORT_RANGE = list(range(8901, 8920))
OLLAMA = os.environ.get("OLLAMA", "http://127.0.0.1:11434").rstrip("/")
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if self.path.startswith("/ai/"):
            sys.stderr.write("  ai  %s\n" % (fmt % args))

    # ---------- helpers ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, method):
        target = OLLAMA + self.path[len("/ai"):]
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=payload, method=method)
        req.add_header("Content-Type", self.headers.get("Content-Type", "application/json"))
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self._cors()
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:                       # Ollama 没开、端口不通
            self._json(502, {
                "error": "连不上本地 Ollama（%s）：%s" % (OLLAMA, e),
                "hint": "另开一个窗口运行：ollama serve",
            })

    # ---------- routes ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/ai/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/ai/"):
            return self._proxy("POST")
        self.send_error(405)

    def do_HEAD(self):
        if self.path.startswith("/ai/"):
            return self._proxy("GET")
        return super().do_HEAD()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def pick_server():
    """8899 常被别人占着，所以自己找一个空的。"""
    tries = ([WANT_PORT] if WANT_PORT else []) + PORT_RANGE
    for p in tries:
        try:
            return Server(("127.0.0.1", p), Handler), p
        except OSError:
            continue
    raise SystemExit("没有可用端口（8901-8919 都被占了）")


if __name__ == "__main__":
    os.chdir(ROOT)
    httpd, port = pick_server()
    url = "http://127.0.0.1:%d/" % port
    print("=" * 48)
    print("  MEMENTO 本地版：%s" % url)
    print("  Ollama 代理：  %sai/api/tags" % url)
    print("=" * 48)
    print("  保持这个窗口开着；按 Ctrl+C 停止")
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
