import { Browser, Page } from "puppeteer-core";
import { captureScreenShot, clickBySelector, getTextOfElement, openNewBrowser, sleep, yopmail } from "./utility.js";
import { Flags } from "./constants.js";

var browser: Browser;

export async function GenerateWANAiVideos(prompt: string, loginEmail: string, loginPassword: string) {

    console.log("Received the request of execution.");

    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    let page: Page = await browser.newPage();
    try {

        //Navigate to wan ai
        await page.goto("https://create.wan.video/", { waitUntil: "load" });
        await sleep(3000);

        //Navigate to login page
        await clickBySelector(page, "[class*=HeaderContainer] [class*=RightContent] button");
        await sleep(2000);

        //Login with user credentials
        await page.type('[data-test-id="login-form-box-address"]', loginEmail, { delay: 120 });
        await sleep(1000);
        await page.type('[data-test-id="login-form-box-password"]', loginPassword, { delay: 120 });
        await sleep(1000);
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            page.click('[data-test-id="login-form-button-submit"]')
        ]);

        // //Reload page once
        // await page.reload({ waitUntil: "networkidle2" });

        //Navigate to generated videos
        await page.goto("https://create.wan.video/generate", { waitUntil: "load" });
        await sleep(5000);

        //Claim credits
        await page.reload({ waitUntil: "networkidle2" }); //For faaltu popup
        await sleep(3000);

        await page.click('[data-test-id="header-popover-button-credit"] [class*=CreditText]');
        await sleep(500);
        await page.click('[class*=BtnContainer] button:last-of-type');
        await sleep(2000);
        await captureScreenShot(page, "credits")
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(5000);


        //Enter the prompt
        await page.click('[data-slate-node="element"]');
        await sleep(1000);
        await page.type('[data-slate-node="element"]', prompt);
        console.log("Prompt added successfully.");


        //Check existing created videos
        const alreadyCreatedVideoCount = await page.$$eval('[data-test-id="dragable-content"]', els => els.length);
        console.log(alreadyCreatedVideoCount);

        //Change the ai model

        //Chanage the resolution
        await page.click('[class*=SettingWrapper] div:last-of-type');
        await sleep(500);
        await page.click('[data-test-id="creation-form-box-Setting"] [class*=SettingContentWrapper] > [class*=Container] div:nth-of-type(2) label:last-of-type');
        await sleep(1000);
        await page.click('[class*=SettingWrapper] div:last-of-type');
        await sleep(500);

        //Click on generate video
        await page.click('[data-test-id="creation-form-button-submit"]');
        await sleep(4000);

        //Check video generation is added in queue
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(4000);
        let text = await getTextOfElement(page, '[class*=VideoLoadingContainer]');
        console.log(text);

        let videoUrl = "";
        //Check generation process is started
        if (text.includes("Generating")) {
            console.log("Video generation is on queue");

            //Wait until generation process not ends
            outerLoop: for (let index = 0; index < 100; index++) {
                let newlyCreatedVideoCount = await page.$$eval('[data-test-id="dragable-content"]', els => els.length);

                //get the video url of latest video
                if (newlyCreatedVideoCount > alreadyCreatedVideoCount) {
                    await page.reload({ waitUntil: "load" });
                    await sleep(5000);
                    for (let index = 0; index < 100; index++) {
                        const src = await page.$eval(
                            '[data-test-id="dragable-content"] video',
                            el => el.src
                        );

                        if (src && src != "") {
                            console.log(src);
                            videoUrl = src;
                            console.log(videoUrl);

                            break outerLoop;
                        }
                        await sleep(2000);
                    }

                } else {
                    await captureScreenShot(page, "testing" + index);
                    await sleep(7000);
                }
            }
        }

        //Video is blank throw exception
        if (videoUrl == "") {
            throw new Error(`Video is not generated for user: ${loginEmail}`)
        }

        //Logout current user
        await page.click('[data-test-id="header-popover-button-user"]');
        await sleep(500);
        await page.click('[class*=PopoverContent] > div:last-of-type');
        await sleep(1000);

        const buttons = await page.$$('button');

        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text.trim() === 'Confirm') {
                await button.click();
                break;
            }
        }

        await page.reload({ waitUntil: "networkidle2" });

    } catch (error) {
        console.log(error);
        throw error;
    } finally {
        await captureScreenShot(page, "testing");
        await browser.close();
    }
}