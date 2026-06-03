import puppeteer, { Browser, BrowserContext, Page } from "puppeteer-core";
import { openNewBrowser, sleep, writeTextInTextbox } from "./utility.js";
import fs from 'fs/promises';
import path from "path";
import { Flags } from "./constants.js";

let browser: Browser;
let incognitoContext: BrowserContext;
let page: Page;

export async function searchOnChatGpt(textPrompt: string, imagePaths: string[] = [], retries = 5, closeBrowserAfterDone: boolean = true): Promise<string | undefined> {

    try {

        if (browser && incognitoContext) {
            console.log('Reusing existing browser and incognito context');
        } else {
            console.log('Launching new browser and creating incognito context');

            browser = await openNewBrowser(Flags.BROWSER_LOCAL)

            // ✅ Get default pages but DON'T close them yet
            const defaultPages = await browser.pages();

            // Create incognito context FIRST
            incognitoContext = await browser.createBrowserContext();

            // Open a new page in the incognito context
            page = await incognitoContext.newPage();

            // ✅ NOW close default pages AFTER incognito page is ready
            for (const p of defaultPages) {
                await p.close();
            }

            // Set viewport
            // await page.setViewport({ width: 1280, height: 800 });


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

        }

        // await page.screenshot({ path: 'incognito-screenshot.png' });

        console.log('Running in incognito mode!');

        await page.waitForSelector('[id="prompt-textarea"]', { timeout: 60000 });

        if (imagePaths.length > 0) {
            const imagePathsToUpload = imagePaths.map(imagePath => path.resolve((imagePath)));

            // Select file input
            const input = await page.$('input[type="file"]');

            if (!input) {
                throw new Error('File input not found');
            }

            // Upload multiple files
            await input.uploadFile(...imagePathsToUpload);
        }


        await writeTextInTextbox(page, '[id="prompt-textarea"]', textPrompt);

        // await page.locator('[id="prompt-textarea"]').fill(textPrompt);


        await sleep(3000);

        await page.keyboard.press('Enter');

        await checkResponseCompleted(page, 20);


        let ele = await page.$$('[class^="markdown prose"]');
        if (ele.length > 0) {
            const textContent = await page.evaluate(el => el.textContent, ele[ele.length - 1]);
            // console.log(textContent);
            return textContent ?? undefined;
        } else {
            console.log('Element not found');
            throw new Error('Response element not found');
        }
    } catch (error) {
        console.error('Error occurred:', error);
        if (retries > 0) {
            console.log(`Retrying... Attempts left: ${retries}`);
            return await searchOnChatGpt(textPrompt, imagePaths, retries - 1, closeBrowserAfterDone);
        } else {
            console.log('Max retries reached. Unable to fetch response.');
            return undefined;
        }
    } finally {
        if (incognitoContext && closeBrowserAfterDone) {
            await incognitoContext.close();
        }

        if (browser && closeBrowserAfterDone) {
            await browser.close();
        }
    }
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

// (async () => {
//     await searchOnChatGpt(`What is the latest news 
// in currently in maharashtra. 
// Tell me in json format having fields "title",
// "description", "source" and "url". Give me atleast 5 news.`);
// })();