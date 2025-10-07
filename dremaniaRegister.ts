import { Browser, Page } from "puppeteer-core";
import { focusOnPage, generatePassword, getEmailFromTempMailSo, getPageFromOpenedPages, openNewBrowser, sleep } from "./utility.js";
import { ApiURLs, Flags, PageNames } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";

var browser: Browser;
export async function registerToDremaniaAi() {
    console.log("Process started.")
    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    let page: Page = await browser.newPage();
    try {
        //Generate temp user details
        let tempMail: string = await getEmailFromTempMailSo(browser);
        let password: string = await generatePassword(12, true);

        // Navigate to dremania ai page
        await page.goto("https://dreamina.capcut.com/ai-tool/login", { waitUntil: "load" });
        await sleep(3000);
        // Check signup consent
        await page.evaluate(() => {
            (document.querySelector('[type="checkbox"]') as HTMLInputElement).click();
        })
        await sleep(1000);

        // Wait for login page to appear
        await page.waitForSelector('[class="login-button-TamRlp"]');
        // Click on registration page
        await page.click('[class="login-button-TamRlp"]');
        await sleep(1000);

        // Select continue wwith email address option
        await page.evaluate(() => {
            let logInOptions: HTMLDivElement[] = Array.from(document.querySelectorAll(".lv_new_third_part_sign_in_expand-button")) as HTMLDivElement[];
            logInOptions.forEach(async (element) => {
                if (element.textContent == "Continue with email") {
                    element.click();
                }
            });
        });
        await sleep(1000);
        await page.click(".new-forget-pwd-btn");
        await page.waitForSelector('[placeholder="Enter email"]');
        await sleep(3000);

        // Enter user details
        await page.type('[placeholder="Enter email"]', tempMail);
        await page.type('[placeholder="Enter password"]', password);
        await sleep(1000);

        // Enter sign up button
        await page.evaluate(() => {
            let buttonOptions: HTMLButtonElement[] = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
            buttonOptions.forEach(async (element) => {
                if (element.textContent == "Continue") {
                    element.click();
                }
            });
        });
        await sleep(5000);

        // Wait for OTP filling page to be appear
        await page.waitForFunction((email) => {
            let headingOptions: HTMLDivElement = document.querySelector(".lv_new_sign_in_panel_wide-code-detail") as HTMLDivElement;
            if (headingOptions.textContent.includes(email)) {
                return true;
            }
        }, { timeout: 10000 }, tempMail);

        await sleep(1000);

        // Open temp mail site to grab otp.
        await focusOnPage(browser, PageNames.TEMP_EMAIL_SO);
        let otp: string = await getDremaniaAiOTPFromTempMailSo();

        // Navigate to dremmania ai page
        await focusOnPage(browser, PageNames.DREMANIA_AI)

        // Fill the OTP.
        await page.type(".verification_code_input-number", otp);

        // Wait for next page to be appear.
        await page.waitForFunction(() => {
            let dateOfBirthParagraph: HTMLParagraphElement = document.querySelector(".lv_new_sign_in_panel_wide-birthday-subtitle") as HTMLParagraphElement;
            if (dateOfBirthParagraph?.textContent?.includes("Your birthday won’t be shown publicly.")) {
                return true;
            }
        });

        // Enter date of year
        await page.type('[placeholder="Year"]', (await getRandomBirthYear()).toString());

        // Enter date of month 
        await page.click(".lv-select-view-value");
        await page.evaluate(async () => {
            let monthElements: HTMLLIElement[] = Array.from(document.querySelectorAll("#lv-select-popup-0 li")) as HTMLLIElement[];
            let randomMonthNumber: number = Math.round(Math.random() * (monthElements.length - 1) + 1);
            (monthElements[randomMonthNumber] as HTMLLIElement).click();
        });

        // Enter date of birth date 
        await page.click(".lv-select-view-value.lv-select-view-value-mirror");
        await page.evaluate(async () => {
            let dateOfBirthDateElemennts: HTMLLIElement[] = Array.from(document.querySelectorAll("#lv-select-popup-1 li")) as HTMLLIElement[];
            let randomDateNumber: number = Math.round(Math.random() * (dateOfBirthDateElemennts.length - 1) + 1);
            dateOfBirthDateElemennts[randomDateNumber].click();
        });

        // Click on next button
        await page.click(".lv_new_sign_in_panel_wide-birthday-next.lv-btn");

        await page.waitForFunction((expectedTitle) => document.title != expectedTitle, {}, PageNames.DREMANIA_AI);
        await sleep(10000);
        await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=addDremania&email=${tempMail}&password=${password}`)
        console.log("Process completed.");
    } catch (err) {
        console.log("Something went wrong: " + err)
    } finally {
        await browser.close();
        console.log("Operation closed.");
    }
}

/**
 * Extract OTP of WAN AI from temp mail.so site
 * @returns OTP
 */
export async function getDremaniaAiOTPFromTempMailSo(): Promise<string> {
    let tempMailSo: Page = await getPageFromOpenedPages(browser, PageNames.TEMP_EMAIL_SO);
    await tempMailSo.waitForFunction(() => {
        let modelPopUp: HTMLDivElement = document.querySelector('#home-guide-modal') as HTMLDivElement;
        return (modelPopUp && !modelPopUp.classList.contains("hidden"));
    });
    await tempMailSo.click("#home-guide-modal button");
    const emailText = await tempMailSo.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('.overflow-y-auto div'));
        const found = nodes.reverse().find(x => x.textContent?.includes("Dreamina"));
        return found?.textContent?.trim() ?? null;
    });
    let match = emailText?.match(/verification code[:：]\s*([A-Za-z0-9]{6})/i); // match exactly 6 digits
    let otp = match ? match[1] : ""

    return otp;
}

/**
 * Geneerate random date of year based on age limit passed.
 * @param minAge Minimum age of year
 * @param maxAge Maximum age of year
 * @returns Date of year
 */
async function getRandomBirthYear(minAge = 18, maxAge = 40): Promise<number> {
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - maxAge; // Oldest (40)
    const maxYear = currentYear - minAge; // Youngest (18)

    return Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
}

/**
 * Generate random number netween a perticular range of number.
 * @param min Minimum starting number
 * @param max Minimum ending number
 * @returns Random numbeer between minimum and maximun number
 */
export async function getRandomNumber(min: number = 1, max: number): Promise<number> {
    return Math.round(Math.random() * (max - min) + min);
}