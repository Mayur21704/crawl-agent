"""
Zero-Dependency Offline Test Server
Starts a lightweight local HTTP server to preview and test the crawled offline clone.
"""
import http.server
import socketserver
import os
import sys

def run_server(folder, port=8080):
    os.chdir(folder)
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"\n[OFFLINE SERVER] Serving {folder} on http://localhost:{port}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else '.'
    p = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    run_server(target, p)\n