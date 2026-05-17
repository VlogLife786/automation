import { openNewBrowser, sleep } from "./utility.js";
import { Flags } from "./constants.js";
export async function chatgptPrompt() {
    const browser = await openNewBrowser(Flags.BROWSER_SERVER);
    // ✅ Get default pages but DON'T close them yet
    const defaultPages = await browser.pages();
    // Create incognito context FIRST
    const incognitoContext = await browser.createBrowserContext();
    // Open a new page in the incognito context
    const page = await incognitoContext.newPage();
    // ✅ NOW close default pages AFTER incognito page is ready
    for (const p of defaultPages) {
        await p.close();
    }
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    // ✅ Remove webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });
    // ✅ Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    // Start your automation
    await page.goto('https://chatgpt.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });
    await page.screenshot({ path: 'incognito-screenshot.png' });
    console.log('Running in incognito mode!');
    await page.type('#prompt-textarea', `Give me only detailed video generation prompt in array in 3 parts, Like devide each scene so that the video will be consistent of a boy playing cricket on ground without any additional comment.`, { delay: 120 });
    await page.keyboard.press('Enter');
    await sleep(20000);
    let ele = await page.$('[class="markdown prose dark:prose-invert wrap-break-word w-full light markdown-new-styling"]');
    if (ele) {
        const textContent = await page.evaluate(el => el.textContent, ele);
        console.log(textContent);
    }
    else {
        console.log('Element not found');
    }
    // await sleep(10000);
    // // Close the incognito context when done
    // await incognitoContext.close();
    // await browser.close();
}
// (async () => {
//     await login();
// })();
