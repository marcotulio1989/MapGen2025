import asyncio
from playwright.async_api import async_playwright, Page

async def handle_console(msg):
    # Skip noisy Vite messages
    if "[vite]" in msg.text.lower():
        return
    print(f"BROWSER LOG: [{msg.type()}] {msg.text}")

async def main():
    import http.server
    import socketserver
    import threading

    PORT = 8001
    Handler = http.server.SimpleHTTPRequestHandler
    httpd = None
    server_thread = None

    try:
        httpd = socketserver.TCPServer(("", PORT), Handler)
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        print(f"Serving at http://localhost:{PORT}")

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            page.on("console", handle_console)

            try:
                await page.goto(f"http://localhost:{PORT}/index.html", wait_until="load", timeout=10000)
                print("Page loaded. Waiting for console messages...")
                # Wait a bit for async scripts to run and potentially fail
                await asyncio.sleep(5)
            except Exception as e:
                print(f"An error occurred during page load: {e}")

            await browser.close()
    finally:
        if httpd:
            print("Shutting down server...")
            httpd.shutdown()
            httpd.server_close()
        if server_thread:
            server_thread.join()
        print("Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(main())
