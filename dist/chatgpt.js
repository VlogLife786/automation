import puppeteer from "puppeteer-core";
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export async function chatgptPrompt(textPrompt, retryCount = 5) {
    let browser;
    // let incognitoContext: BrowserContext | undefined;
    try {
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://production-sfo.browserless.io?token=2UXmNShc7TaJ724dfc282bbe442bf75f2fcf2d9ef24d4c8ef`,
        });
        // ✅ Get default pages but DON'T close them yet
        // const defaultPages = await browser.pages();
        // Create incognito context FIRST
        // incognitoContext = await browser.createBrowserContext();
        // Open a new page in the incognito context
        const page = await browser.newPage();
        // ✅ NOW close default pages AFTER incognito page is ready
        // for (const p of defaultPages) {
        //     await p.close();
        // }
        // Set viewport
        // await page.setViewport({ width: 1280, height: 800 });
        // ✅ Remove webdriver property
        // await page.evaluateOnNewDocument(() => {
        //     Object.defineProperty(navigator, 'webdriver', {
        //         get: () => false,
        //     });
        // });
        // ✅ Set realistic user agent
        // await page.setUserAgent(
        //     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        // );
        // Start your automation
        await page.goto('https://chatgpt.com/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(5000);
        await page.screenshot({ path: 'incognito-screenshot.png' });
        console.log('Running!');
        await page.type('[data-placeholder^="Ask anything"]', textPrompt, { delay: 100 });
        console.log("Prompt is eneterd.");
        await page.keyboard.press('Enter');
        console.log("Enter key is pressed.");
        await page.screenshot({ path: 'incognito-screenshot1.png' });
        await sleep(3000);
        // await page.screenshot({ path: 'incognito-screenshot1.png' });
        await checkResponseCompleted(page, 20);
        let ele = await page.$('[class^="markdown prose"]');
        if (ele) {
            const textContent = await page.evaluate(el => el.textContent, ele);
            console.log("Response gathered and returned.");
            return textContent;
        }
        else {
            console.log('Element not found');
            throw new Error("Unable to get response form chatgpt, Please try again after sometime.");
        }
        // await sleep(10000);
    }
    catch (error) {
        console.log(error);
        if (retryCount > 0) {
            await chatgptPrompt(textPrompt, retryCount - 1);
        }
        throw new Error(error?.message);
    }
    finally {
        // Close the incognito context when done
        // if (incognitoContext) {
        //     await incognitoContext?.close();
        // }
        if (browser) {
            await browser?.close();
        }
    }
}
async function checkResponseCompleted(page, retries = 5) {
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
// (async () => {
//     await login();
// })();
