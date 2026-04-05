import { getTextOfElement, openNewBrowser, sleep } from "./utility.js";
import { Flags } from "./constants.js";
import { postRestFormResponse, postRestResponse } from "./restTemplate.js";
var browser;
export async function GenerateWANAiVideos(prompt, loginEmail, loginPassword, emailToSendVideo, webhookUrl, videoTitle, rowNumber = 0) {
    let executionSteps = [];
    console.log("Received the request of execution...");
    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    let page = await browser.newPage();
    try {
        //Navigate to wan ai
        await page.goto("https://create.wan.video/generate", { waitUntil: "load" });
        await sleep(3000);
        executionSteps.push("Navigated to WAN AI Site.");
        //Navigate to login page
        // await clickBySelector(page, "[class*=HeaderContainer] [class*=RightContent] button");
        // await sleep(2000);
        //Login with user credentials
        await page.type('[data-test-id="login-form-box-address"]', loginEmail, { delay: 120 });
        await sleep(1000);
        executionSteps.push("Email ID is entered: " + loginEmail);
        await page.type('[data-test-id="login-form-box-password"]', loginPassword, { delay: 120 });
        await sleep(1000);
        executionSteps.push("Password is eneterd.");
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            page.click('[data-test-id="login-form-button-submit"]')
        ]);
        executionSteps.push("Clicked on login button.");
        // //Reload page once
        // await page.reload({ waitUntil: "networkidle2" });
        //Navigate to generated videos
        await page.goto("https://create.wan.video/generate", { waitUntil: "load" });
        await sleep(5000);
        executionSteps.push("Navigated to generate video section.");
        //Claim credits
        await page.reload({ waitUntil: "networkidle2" }); //For faaltu popup
        await sleep(3000);
        executionSteps.push("Page reloaded to avoid additional pop-up ads..");
        await page.click('[data-test-id="header-popover-button-credit"] [class*=CreditText]');
        await sleep(500);
        await page.click('[class*=BtnContainer] button:last-of-type');
        await sleep(2000);
        executionSteps.push("Credits are claimed.");
        // await captureScreenShot(page, "credits")
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(5000);
        executionSteps.push("Page reloaded to avoid additional pop-up ads.");
        //Enter the prompt
        await page.click('[data-slate-node="element"]');
        await sleep(1000);
        executionSteps.push("Clicked on textbox where prompt will be written.");
        await page.type('[data-slate-node="element"]', prompt);
        console.log("Prompt added successfully.");
        executionSteps.push("Prompt added to textbox.");
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
        executionSteps.push("Changed the resolution according to mobile devices");
        //Click on generate video
        await page.click('[data-test-id="creation-form-button-submit"]');
        await sleep(5000);
        executionSteps.push("Generate button is clicked.");
        //Check video generation is added in queue
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(4000);
        let text = await getTextOfElement(page, '[class*=VideoLoadingContainer]');
        console.log(text);
        let videoUrl = "";
        //Check generation process is started
        if (text.includes("Generating")) {
            console.log("Video generation is on queue");
            executionSteps.push("Check that video generation is started and wait until video generation done.");
            //Wait until generation process not ends
            outerLoop: for (let index = 0; index < 100; index++) {
                let newlyCreatedVideoCount = await page.$$eval('[data-test-id="dragable-content"]', els => els.length);
                executionSteps.push("Check that video is generated or not.");
                //get the video url of latest video
                if (newlyCreatedVideoCount > alreadyCreatedVideoCount) {
                    await page.reload({ waitUntil: "load" });
                    await sleep(5000);
                    executionSteps.push("Video is generated, Now grabbing the video url.");
                    for (let index = 0; index < 100; index++) {
                        const src = await page.$eval('[data-test-id="dragable-content"] video', el => el.src);
                        if (src && src != "") {
                            videoUrl = src;
                            console.log(videoUrl);
                            executionSteps.push("Video URL is also generated, Now sending it to the requested user.");
                            //Send video to user
                            await postRestResponse(webhookUrl + "/send-video-link", {
                                "rowNumber": rowNumber,
                                "videoUrlToSend": videoUrl,
                                "emailToSendVideo": emailToSendVideo,
                                "videoTitle": videoTitle
                            });
                            break outerLoop;
                        }
                        await sleep(2000);
                    }
                }
                else {
                    // await captureScreenShot(page, "testing" + index);
                    await sleep(7000);
                }
            }
        }
        //Video is blank throw exception
        if (videoUrl == "") {
            executionSteps.push("Error: Video URL is not generated or found.");
            throw new Error(`Video is not generated for user: ${loginEmail}`);
        }
        //Logout current user
        await page.click('[data-test-id="header-popover-button-user"]');
        await sleep(500);
        executionSteps.push("Clicked on profile icon.");
        await page.click('[class*=PopoverContent] > div:last-of-type');
        await sleep(1000);
        executionSteps.push("Clicked on logout option.");
        const buttons = await page.$$('button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text.trim() === 'Confirm') {
                await button.click();
                break;
            }
        }
        executionSteps.push("clicked on confirm logout option.");
        await page.reload({ waitUntil: "networkidle2" });
    }
    catch (error) {
        try {
            executionSteps.push("Error: " + error?.message);
            let formData = new FormData();
            const screenshot = await page.screenshot({ fullPage: true, type: "png" });
            formData.append("image", new Blob([screenshot], { type: "image/png" }), "error-screenshot.png");
            formData.append("executionSteps", JSON.stringify(executionSteps));
            await postRestFormResponse(webhookUrl + "/send/error-email", formData);
        }
        catch (error) {
            console.log("Internal error while sending mail of image");
            console.log(error);
        }
        console.log(error?.message);
        console.log("Execution completed with errors.");
        throw error;
    }
    finally {
        console.log("Execution completed.");
        await browser.close();
        // await captureScreenShot(page, "testing");
    }
}
