import asyncio
from playwright.async_api import async_playwright, expect
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Listen for all console events and print them
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))

        # Get the absolute path to the HTML file
        file_path = os.path.abspath('index.html')

        try:
            # Go to the local HTML file
            await page.goto(f'file://{file_path}', timeout=10000)

            # Wait for the main canvas element to be visible
            canvas = page.locator('canvas')
            await expect(canvas).to_be_visible(timeout=15000)

            # Wait for the loading overlay to disappear
            loading_overlay = page.locator('#loading-overlay')
            await expect(loading_overlay).to_be_hidden(timeout=15000)

            await page.wait_for_timeout(2000)

            # Use page.evaluate to stop the animation loop, move the camera, and force a render
            await page.evaluate('''() => {
                // Stop the animation loop by replacing it with an empty function
                if (typeof window.animate === 'function') {
                    window.animate = () => {};
                    console.log('Animation loop stopped.');
                }

                const targetPoint = new THREE.Vector3(5, 0, 5);
                const cameraOffset = new THREE.Vector3(8, 6, 8);

                camera.position.copy(targetPoint).add(cameraOffset);
                controls.target.copy(targetPoint);
                controls.update();

                // Force an immediate render to the canvas
                renderer.render(scene, camera);
                console.log('Camera moved and scene re-rendered.');
            }''')

            await page.wait_for_timeout(500)

            # Take a screenshot of the page
            screenshot_path = 'jules-scratch/verification/curb_gaps_closeup.png'
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"An error occurred during Playwright execution: {e}")
            # Save a screenshot on error to help debug
            await page.screenshot(path='jules-scratch/verification/error.png')
            print("Error screenshot saved to jules-scratch/verification/error.png")

        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
