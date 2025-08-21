from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen for ALL console messages and print them.
        # CORRECTED: .type and .text are properties, not methods.
        page.on("console", lambda msg: print(f"Browser Console ({msg.type}): {msg.text}"))

        try:
            # Go to the page and wait for it to load
            page.goto("http://localhost:8000", wait_until="load", timeout=10000)

            # Wait for the loading overlay to disappear, which signals that generation is complete
            loading_overlay = page.locator('#loading-overlay')
            loading_overlay.wait_for(state='hidden', timeout=30000)

            # Check for the canvas
            canvas = page.locator('canvas')
            canvas.wait_for(timeout=5000)

            # Wait a moment for rendering to settle
            page.wait_for_timeout(2000)

            page.screenshot(path="jules-scratch/verification/screenshot.png")
            print("Screenshot saved to jules-scratch/verification/screenshot.png")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            # Take a screenshot on failure to see the state of the page
            page.screenshot(path="jules-scratch/verification/failure_screenshot.png")
            print("Failure screenshot saved to jules-scratch/verification/failure_screenshot.png")

        finally:
            browser.close()

if __name__ == "__main__":
    run()
