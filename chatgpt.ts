import puppeteer, { Page } from "puppeteer-core";


function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function login() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--start-maximized'
        ]
    });

    // ✅ Get default pages but DON'T close them yet
    const defaultPages = await browser.pages();

    // Create incognito context FIRST
    const incognitoContext = await browser.createBrowserContext();

    // Open a new page in the incognito context
    const page = await incognitoContext.newPage();

    // ✅ NOW close default pages AFTER incognito page is ready
    // for (const p of defaultPages) {
    //     await p.close();
    // }

    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });


    // ✅ Remove webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // ✅ Set realistic user agent
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Start your automation
    await page.goto('https://chatgpt.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    // await page.screenshot({ path: 'incognito-screenshot.png' });

    console.log('Running in incognito mode!');

    await page.waitForSelector('[id="prompt-textarea"]', { timeout: 60000 });
    await page.type('[id="prompt-textarea"]',
        `What is the latest news in currently in maharashtra. Tell me in json format having fields "title", "description", "source" and "url". Give me atleast 5 news.`,
        { delay: 100 });
    await page.keyboard.press('Enter');

    await sleep(3000);
    await checkResponseCompleted(page, 20);


    let ele = await page.$$('[class^="markdown prose"]');
    if (ele.length > 0) {
        const textContent = await page.evaluate(el => el.textContent, ele[ele.length - 1]);
        console.log(textContent);
    } else {
        console.log('Element not found');
    }


    // await sleep(10000);

    // Close the incognito context when done
    await incognitoContext.close();
    await browser.close();
}


async function checkResponseCompleted(page: Page, retries = 5) {
    let responseFetchInProgress = await page.$$('[class^=composer-submit-btn]');

    await sleep(3000); // Wait for 3 seconds before checking
    if (responseFetchInProgress && responseFetchInProgress.length > 0) {
        console.log('Response not fetched yet. Checking again...');
        if (retries > 0) {
            await checkResponseCompleted(page, retries - 1);
        }
    }
    // else if (retries > 0) {
    //     await sleep(2000); // Wait for 2 seconds before checking again
    //     checkResponseCompleted(page, retries - 1);
    //     console.log(`Retrying...`);
    // }
}

(async () => {
    await login();
})();