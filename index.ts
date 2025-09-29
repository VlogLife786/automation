import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";   // If "type": "module" in package.json
import { Flags, PageNames } from "./constants.js";
import Chromium from "@sparticuz/chromium";

const browser: Browser = Flags.BROWSER_LOCAL ?
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
        headless: false,
    }); // headless:false shows the browser

(async () => {

    try {
        let tempMail = "siddhesh124@yopmail.com";
        await wanAIRegistration(tempMail, "Siddhesh Gathibandhe", "Siddhesh18");
        await yopmail(tempMail)
        let otp: string = await getWanOTPFromYopmail();
        await focusOnPage(PageNames.WAN_AI);
        let wanPage: Page = await getPageFromOpenedByPageName(PageNames.WAN_AI);

        wanPage.type('[placeholder="Verification code"]', otp);
        await sleep(3000);
        await wanPage.click('[type="submit"]');
        await wanPage.waitForNavigation();
        await wanPage.waitForSelector('.ant-modal-close-x', { visible: true });
        await wanPage.click('.ant-modal-close-x');
        let checkInButton = await wanPage.waitForSelector('.sc-jytpVa button', { visible: true }) as ElementHandle<HTMLButtonElement>;
        await checkInButton.evaluate(el => el.scrollIntoView());
        await checkInButton.click();

        browser.close();
    } catch (error) {
        console.error("An error occurred:", error);
    }



    // await page.type('[data-test-id="login-form-box-password"]', 'Siddhesh18');


    // Take a screenshot
    //   await page.screenshot({ path: "example.png" });

    // Close browser
    // await browser.close();
})();

async function yopmail(emailId: string) {
    const yopmail: Page = await browser.newPage();
    await yopmail.goto("https://yopmail.com/", {
        waitUntil: "load"
    })
    const yopmailTitle = await yopmail.title();
    console.log("Page title: ", yopmailTitle);
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

async function generateTempMail() {
    const tempMail: Page = await browser.newPage();
    await tempMail.goto("https://tempmailo.com/", {
        waitUntil: "load"
    })
    const tempMailTitle = await tempMail.title();
    console.log("Page title: ", tempMailTitle);
    await tempMail.waitForFunction(() => {
        let emailId: HTMLInputElement = document.querySelector('#i-email') as HTMLInputElement;
        return (emailId && emailId.value && emailId.value.trim() != '');
    });
    return await tempMail.$eval('#i-email', el => (el as HTMLInputElement).value.trim());
}

async function wanAIRegistration(emailId: string, name: string, password: string) {
    // Launch browser
    const page = await browser.newPage();
    await page.setViewport({ width: 0, height: 0 });
    // Go to a website
    await page.goto("https://create.wan.video/generate/video/image-to-video?model=wan2.5", {
        waitUntil: "load"
    });

    // Extract the title
    const title = await page.title();
    console.log("Page title: ", title);

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
    // await sleep(3000);
}

async function focusOnPage(pageName: string): Promise<void> {
    let pages: Page[] = await browser.pages();
    for (const page of pages) {
        let currentPageName = await page.title();
        if (currentPageName.includes(pageName)) {
            page.bringToFront();
        }
    }
}


async function getPageFromOpenedByPageName(pageName: string): Promise<Page> {
    let pages: Page[] = await browser.pages();
    for (const page of pages) {
        let currentPageName = await page.title();
        if (currentPageName.includes(pageName)) {
            return page;
        }
    }
    throw new Error("Page not found: " + pageName);
}

async function getWanOTPFromYopmail(): Promise<string> {
    let yopmail: Page = await getPageFromOpenedByPageName(PageNames.INBOX);
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
        await yopmail.screenshot({ path: "example.png" });
        throw new Error("Something went wrong: " + err);
    }
}

async function getEmailFromTempMailSo(): Promise<string> {
    let tempMailSo = await browser.newPage();
    try {
        await tempMailSo.goto("https://tempmail.so/", { waitUntil: "load" });
        const title = await tempMailSo.title();
        console.log("Page title: ", title);
        let initialEmailId: string = await tempMailSo.$eval('[class="text-base truncate"]', el => (el as HTMLSpanElement).innerText.trim());
        await tempMailSo.click('temp-mail-inbox .h-8');
        await tempMailSo.waitForFunction(() => {
            let modelPopUp: HTMLDivElement = document.querySelector('#home-guide-modal') as HTMLDivElement;
            return (modelPopUp && !modelPopUp.classList.contains("hidden"));
        });
        await tempMailSo.click("#home-guide-modal button");
        await tempMailSo.waitForFunction(() => {
            let latestEmailId = document.querySelector('[class="text-base truncate"]')?.textContent?.trim();
            return (latestEmailId && initialEmailId != latestEmailId);
        });
        return await tempMailSo.$eval('[class="text-base truncate"]', el => (el as HTMLSpanElement).innerText.trim());
    } catch (err) {
        await tempMailSo.screenshot({ path: "tempmailSo.png" });
        throw new Error("Something went wrong: " + err);
    }
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}