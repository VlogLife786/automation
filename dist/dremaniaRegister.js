import { focusOnPage, generatePassword, getEmailFromTempMailSo, getPageFromOpenedPages, openNewBrowser, sleep } from "./utility.js";
import { ApiURLs, Flags, PageNames } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";
var browser;
export async function registerToDremaniaAi() {
    console.log("Process started.");
    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    let page = await browser.newPage();
    try {
        let tempMail = await getEmailFromTempMailSo(browser);
        let userDetails = await getRestResponse(ApiURLs.USER_DETAILS_API);
        let userFullName = `${userDetails.results[0].name.first} ${userDetails.results[0].name.last}`;
        let password = await generatePassword(12, true);
        await page.goto("https://dreamina.capcut.com/ai-tool/login", { waitUntil: "load" });
        await page.evaluate(() => {
            document.querySelector('[type="checkbox"]').click();
        });
        await sleep(1000);
        await page.waitForSelector('[class="login-button-TamRlp"]');
        await page.click('[class="login-button-TamRlp"]');
        await sleep(1000);
        await page.evaluate(() => {
            let logInOptions = Array.from(document.querySelectorAll(".lv_new_third_part_sign_in_expand-button"));
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
        await page.type('[placeholder="Enter email"]', tempMail);
        await page.type('[placeholder="Enter password"]', password);
        await sleep(1000);
        await page.evaluate(() => {
            let buttonOptions = Array.from(document.querySelectorAll("button"));
            buttonOptions.forEach(async (element) => {
                if (element.textContent == "Continue") {
                    element.click();
                }
            });
        });
        await sleep(5000);
        await page.waitForFunction((email) => {
            let headingOptions = document.querySelector(".lv_new_sign_in_panel_wide-code-detail");
            if (headingOptions.textContent.includes(email)) {
                return true;
            }
        }, { timeout: 10000 }, tempMail);
        await sleep(1000);
        await focusOnPage(browser, PageNames.TEMP_EMAIL_SO);
        let otp = await getDremaniaAiOTPFromTempMailSo();
        console.log(otp);
        await page.screenshot({ path: "test.png" });
        await browser.close();
    }
    catch (err) {
        await page.screenshot({ path: "test.png" });
        console.log("Something went wrong: " + err);
        await browser.close();
    }
}
/**
 * Extract OTP of WAN AI from temp mail.so site
 * @returns OTP
 */
export async function getDremaniaAiOTPFromTempMailSo() {
    let tempMailSo = await getPageFromOpenedPages(browser, PageNames.TEMP_EMAIL_SO);
    await tempMailSo.waitForFunction(() => {
        let modelPopUp = document.querySelector('#home-guide-modal');
        return (modelPopUp && !modelPopUp.classList.contains("hidden"));
    });
    await tempMailSo.click("#home-guide-modal button");
    const emailText = await tempMailSo.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('.overflow-y-auto div'));
        const found = nodes.reverse().find(x => x.textContent?.includes("Dreamina"));
        return found?.textContent?.trim() ?? null;
    });
    let match = emailText?.match(/verification code[:：]\s*([A-Za-z0-9]{6})/i); // match exactly 6 digits
    let otp = match ? match[1] : "";
    return otp;
}
