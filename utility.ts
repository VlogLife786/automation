import puppeteer, { Browser, Page } from "puppeteer-core";   // If "type": "module" in package.json
import { ApiURLs, Configs, Flags, PageNames } from "./constants.js";
import Chromium from "@sparticuz/chromium";
import nodeCron from "node-cron";
import { getRestResponse } from "./restTemplate.js";

var browser: Browser;

export async function startProcessOfAccountCreation() {
    console.log("Data creation process started.");
    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    try {
        let tempMail: string = await getEmailFromTempMailSo(browser);
        let userDetails = await getRestResponse(ApiURLs.USER_DETAILS_API)
        let userFullName: string = `${userDetails.results[0].name.first} ${userDetails.results[0].name.last}`
        let password: string = await generatePassword(12);
        await wanAIRegistration(tempMail, userFullName, password);
        await focusOnPage(browser, PageNames.TEMP_EMAIL_SO);
        let otp: string = await getWanOTPFromTempMailSo();
        await focusOnPage(browser, PageNames.WAN_AI);
        let wanPage: Page = await getPageFromOpenedPages(browser, PageNames.WAN_AI);
        try {
            await validateWANOtp(wanPage, otp, tempMail);
            await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=add&email=${tempMail}&fullName=${userFullName}&password=${password}`)
            console.log(`Data created successfully.`);
        } catch (error) {
            await wanPage.screenshot({ path: "wanOTPValidation.png" });
            console.error("An error occurred while validating OTP: ", error);
        }
    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        console.log("Operation closed.");
        await browser.close();
    }
};

/**
 * Validate OTP in WAN
 * @param wanPage WAN page object 
 * @param otp OTP
 * @param tempMail email ID 
 */
export async function validateWANOtp(wanPage: Page, otp: string, tempMail: string) {
    await wanPage.type('[placeholder="Verification code"]', otp);
    await sleep(3000);
    await wanPage.click('[type="submit"]');
    await wanPage.waitForSelector('[role="dialog"]', { visible: true });
    await sleep(3000);
    await wanPage.click('[class="ant-modal-close-x"]');
}

/**
 * Check the latest email in yopmail.
 * @param emailId Email ID for which we have to check emails.
 */
export async function yopmail(emailId: string) {
    const yopmail: Page = await browser.newPage();
    await yopmail.goto("https://yopmail.com/", {
        waitUntil: "load"
    })
    const yopmailTitle = await yopmail.title();
    await yopmail.waitForSelector('#ycptcpt');
    await yopmail.type('[placeholder="Enter your inbox here"]', emailId);
    await Promise.all([
        yopmail.click('[title="Check Inbox @yopmail.com"]'),
        yopmail.waitForNavigation()
    ]);
    await sleep(5000);
    await yopmail.click("#refresh");
    await sleep(3000);
}

/**
 * Generate temp email from temp mail io
 * @returns Temporary email
 */
export async function generateTempMail() {
    const tempMail: Page = await browser.newPage();
    await tempMail.goto("https://tempmailo.com/", {
        waitUntil: "load"
    })
    const tempMailTitle = await tempMail.title();
    await tempMail.waitForFunction(() => {
        let emailId: HTMLInputElement = document.querySelector('#i-email') as HTMLInputElement;
        return (emailId && emailId.value && emailId.value.trim() != '');
    });
    return await tempMail.$eval('#i-email', el => (el as HTMLInputElement).value.trim());
}

/**
 * Initiate WAN AI registration.
 * @param emailId Email ID
 * @param name User name
 * @param password Password
 */
export async function wanAIRegistration(emailId: string, name: string, password: string) {
    // Launch browser
    const page = await browser.newPage();
    await page.setViewport({ width: 0, height: 0 });
    // Go to a website
    await page.goto("https://create.wan.video/generate/video/image-to-video?model=wan2.5", {
        waitUntil: "load"
    });

    // Extract the title
    const title = await page.title();

    await page.waitForSelector('.sc-cokDIm');
    await page.click(".sc-cokDIm");

    await page.waitForSelector('[placeholder="Confirm password"]', { visible: true });
    await page.type('[placeholder="Email address"]', emailId);
    await page.type('[placeholder="Password (8-20 characters)"]', password);
    await page.type('[placeholder="Confirm password"]', password);
    await page.type('[placeholder="Your name"]', name);

    await Promise.all([
        page.click('[type="submit"]'),
        sleep(3000)
    ]);
}

/**
 * Focus on the specific tab by name.
 * @param pageName Tab name
 */
export async function focusOnPage(browserObject: Browser, pageName: PageNames): Promise<void> {
    let pages: Page[] = await browserObject.pages();
    for (const page of pages) {
        let currentPageName = await page.title();
        if (currentPageName.includes(pageName)) {
            page.bringToFront();
        }
    }
}

/**
 * Get the page object by name of the page.
 * @param pageName Page name
 * @returns Page object
 */
export async function getPageFromOpenedPages(browserObject: Browser, pageName: string): Promise<Page> {
    let pages: Page[] = await browserObject.pages();
    for (const page of pages) {
        let currentPageName = await page.title();
        if (currentPageName.includes(pageName)) {
            return page;
        }
    }
    throw new Error("Page not found: " + pageName);
}

/**
 * Extract WAN AI sent OTP from yopmail
 * @returns OTP
 */
export async function getWanOTPFromYopmail(): Promise<string> {
    let yopmail: Page = await getPageFromOpenedPages(browser, PageNames.INBOX);
    try {
        const iframeHandle = await yopmail.$('iframe#ifmail'); // Replace with your iframe selector
        if (!iframeHandle) throw new Error("Iframe not found");

        // 2. Get the content frame
        const frame = await iframeHandle.contentFrame();
        if (!frame) throw new Error("Failed to get iframe content");

        // 3. Wait for the div inside the iframe to appear
        await frame.waitForSelector('#mail');

        let divText: string | null = await frame.$eval('#mail', el => el.textContent?.trim() ?? null);
        let match = divText?.match(/\b\d{6}\b/); // match exactly 6 digits
        let otp = match ? match[0] : ""

        return otp;
    }
    catch (err) {
        await yopmail.screenshot({ path: "yopmailError.png" });
        throw new Error("Something went wrong: " + err);
    }
}

/**
 * Get new email from temp mail.so
 * @returns New generated email Id.
 */
export async function getEmailFromTempMailSo(browserInstannce: Browser): Promise<string> {
    browser = browserInstannce;
    let tempMailSo: Page = await browser.newPage();
    try {
        await tempMailSo.goto("https://tempmail.so/", { waitUntil: "load" });
        const title = await tempMailSo.title();

        await tempMailSo.click('temp-mail-inbox .h-8');
        await tempMailSo.waitForFunction(() => {
            let modelPopUp: HTMLDivElement = document.querySelector('#home-guide-modal') as HTMLDivElement;
            return (modelPopUp && !modelPopUp.classList.contains("hidden"));
        });

        await tempMailSo.click("#home-guide-modal button");
        await tempMailSo.waitForFunction(() => {
            let latestEmailId = document.querySelector('[class="text-base truncate"]')?.textContent?.trim();
            return (latestEmailId && latestEmailId != "");
        });
        await sleep(3000);
        return await tempMailSo.$eval('[class="text-base truncate"]', el => (el as HTMLSpanElement).innerText.trim());
    } catch (error) {
        await tempMailSo.screenshot({ path: "tempmailSoError.png" });
        throw new Error("Something went wrong: " + error);
    }
}

/**
 * Extract OTP of WAN AI from temp mail.so site
 * @returns OTP
 */
export async function getWanOTPFromTempMailSo(): Promise<string> {
    let tempMailSo: Page = await getPageFromOpenedPages(browser, PageNames.TEMP_EMAIL_SO);
    await tempMailSo.waitForFunction(() => {
        let modelPopUp: HTMLDivElement = document.querySelector('#home-guide-modal') as HTMLDivElement;
        return (modelPopUp && !modelPopUp.classList.contains("hidden"));
    });
    await tempMailSo.click("#home-guide-modal button");
    const emailText = await tempMailSo.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('.overflow-y-auto div'));
        let emailId = document.querySelector('[class="text-base truncate"]')?.textContent?.trim() ?? "";
        const found = nodes.reverse().find(x => x.textContent?.includes(emailId));
        return found?.textContent?.trim() ?? null;
    });
    let match = emailText?.match(/\b\d{6}\b/); // match exactly 6 digits
    let otp = match ? match[0] : ""

    return otp;
}

/**
 * Add delay in process.
 * @param ms Time of delay in ms
 * @returns Hold the process
 */
export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 
 * @param instanceType Open new browser to start the process
 * @returns new browser instance
 */
export async function openNewBrowser(instanceType: Flags): Promise<Browser> {
    return instanceType == Flags.BROWSER_LOCAL ?
        await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        })
        :
        await puppeteer.launch({
            args: Chromium.args,
            defaultViewport: null,         // optional: to see full page
            executablePath: await Chromium.executablePath(),
            headless: true,
        }); // headless:false shows the browser
}

/**
 * Generate password based on input length
 * @param length Length of the password
 * @returns Password
 */
export async function generatePassword(length: number = 12, appendSpecialCharacters: boolean = false): Promise<string> {
    const upperCase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowerCase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";

    const allChars = upperCase + lowerCase + numbers;

    let password = "";

    // Ensure at least one from each category
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];

    // Fill the rest
    for (let i = 3; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle to avoid predictable positions
    return password
        .split("")
        .sort(() => Math.random() - 0.5)
        .join("");
}
