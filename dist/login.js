import { ApiURLs, Constant, Flags } from "./constants.js";
import { captureScreenShot, openNewBrowser, sleep } from "./utility.js";
import { getRestResponse } from "./restTemplate.js";
var browser;
/**
 * Login on daily basis.
 */
export async function startProcessOfAccountLogin() {
    try {
        console.log("Data validation process started.");
        let userDetails = await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=checkDailyLogin`);
        if (userDetails.message !== "No past date found") {
            browser = await openNewBrowser(Flags.BROWSER_SERVER);
            // Launch browser
            const page = await browser.newPage();
            try {
                await page.setViewport({ width: 0, height: 0 });
                // Go to a website
                await page.goto("https://create.wan.video/generate/video/image-to-video?model=wan2.5", {
                    waitUntil: "networkidle0"
                });
                await page.type('[data-test-id="login-form-box-address"]', userDetails.message.email);
                await page.type('[data-test-id="login-form-box-password"]', userDetails.message.password);
                await sleep(2000);
                await page.click('[data-test-id="login-form-button-submit"]');
                await RenewCredit(page);
                let credit = await page.$eval('[data-test-id="header-popover-button-credit"]', el => el.innerText.trim() ?? '0');
                await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateCredit&email=${userDetails.message.email}&credit=${credit}`);
                console.log("Details updated successfully.");
            }
            catch (error) {
                await captureScreenShot(page, "LoginError");
                console.log("Something went wrong: " + error);
            }
            finally {
                console.log("Operation closed.");
                await browser.close();
            }
        }
        else {
            console.log("No past date found");
        }
    }
    catch (error) {
        console.log("Something went wrong: " + error);
    }
}
/**
 * Renew credit by loging in.
 * @param page - Page object
 */
async function RenewCredit(page) {
    await page.waitForNavigation({ waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3000);
    await page.waitForSelector('[data-test-id="header-popover-button-credit"]', { visible: true });
    let credit = await page.$eval('[data-test-id="header-popover-button-credit"]', el => el.innerText.trim() ?? '0');
    await page.evaluate(async () => {
        await document.querySelector('[data-test-id="header-popover-button-credit"] .sc-jyxMhz').click();
    });
    await page.waitForSelector('.ant-popover-inner', { visible: true });
    const buttonHandles = await page.$$('.ant-popover-inner button'); // returns ElementHandle[]
    for (const handle of buttonHandles) {
        const text = await page.evaluate(el => el.textContent, handle);
        if (text?.includes(Constant.CHECK_IN_TO)) {
            await handle.click(); // click the matching button
            await page.waitForFunction((prevCredit) => {
                let updatedCredit = document.querySelector('[data-test-id="header-popover-button-credit"]')?.textContent?.trim();
                return (updatedCredit && parseInt(updatedCredit) > parseInt(prevCredit));
            }, { timeout: 5000 }, credit);
            await sleep(5000);
            break;
        }
    }
}
