import { clickOnElementByText, globalVars, openNewBrowser, replaceString, sleep } from "./utility.js";
import { ApiURLs, Flags } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";
import { refrenceImageList } from "./generate-scene.js";
import axios from "axios";
let config = {};
export async function GenerateWANAiVideos(requestModel, retries = 10) {
    let taskResultResponse = {};
    let videoGenerationResponse = {};
    console.log('Launching new browser and creating incognito context');
    let browser = await openNewBrowser(Flags.BROWSER_LOCAL);
    // ✅ Get default pages but DON'T close them yet
    const defaultPages = await browser.pages();
    // Create incognito context FIRST
    let incognitoContext = await browser.createBrowserContext();
    // Open a new page in the incognito context
    let page = await incognitoContext.newPage();
    // ✅ NOW close default pages AFTER incognito page is ready
    for (const p of defaultPages) {
        await p.close();
    }
    // ✅ Remove webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });
    // ✅ Set realistic user agent
    await page.setUserAgent({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36'
    });
    console.log("Received the request of execution...");
    try {
        //Navigate to wan ai
        await page.goto("https://create.wan.video/generate/video/reference?model=wan2.7", { waitUntil: "load", timeout: 120000 });
        await sleep(5000);
        console.log("Navigated to WAN AI Site.");
        page.on('response', async (response) => {
            const request = response.request();
            if (response.url().includes('wanx/api/common/v2/taskResult')) {
                console.log("Received response for task result.");
                config = {
                    method: request.method(),
                    maxBodyLength: Infinity,
                    url: request.url(),
                    headers: request.headers(),
                    data: await request.fetchPostData()
                };
                taskResultResponse = await response.json();
            }
            if (response.url().includes('wanx/api/common/imageGen')) {
                console.log("Received response for video generation request.");
                videoGenerationResponse = await response.json();
            }
        });
        //Navigate to login page
        // await clickBySelector(page, "[class*=HeaderContainer] [class*=RightContent] button");
        // await sleep(2000);
        await page.waitForSelector('[data-test-id="login-form-box-address"]', { timeout: 60000 });
        await page.click('[data-test-id="login-form-box-address"]');
        await sleep(5000);
        //Login with user credentials
        await page.type('[data-test-id="login-form-box-address"]', requestModel.loginEmail, { delay: 120 });
        await sleep(5000);
        // executionSteps.push("Email ID is entered: " + requestModel.loginEmail);
        await page.click('[data-test-id="login-form-box-password"]');
        await sleep(5000);
        await page.type('[data-test-id="login-form-box-password"]', requestModel.loginPassword, { delay: 120 });
        await sleep(5000);
        console.log("Password is entered.");
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            page.click('[data-test-id="login-form-button-submit"]')
        ]);
        console.log("Clicked on login button.");
        //Reload page once
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(5000);
        if (requestModel.startImageName && requestModel.startImageName != "") {
            await uploadStartImage(page, requestModel.startImageName);
        }
        let filteredRefImages = refrenceImageList.filter(image => requestModel.prompt.includes(image.imageName));
        await uploadReferenceImages(page, filteredRefImages, requestModel.prompt);
        await sleep(5000);
        let updatedPrompt = requestModel.prompt;
        for (let i = 0; i < filteredRefImages.length; i++) {
            updatedPrompt = await replaceString(updatedPrompt, filteredRefImages[i].imageName, `@Image${i + 1}`);
        }
        //Enter the prompt
        await page.click('[data-slate-node="element"]');
        await sleep(3000);
        console.log("Clicked on textbox where prompt will be written.");
        refrenceImageList.forEach(async () => {
            await page.keyboard.press('Backspace');
            await sleep(2000);
        });
        await page.keyboard.press('Delete');
        // await page.type('[data-slate-node="element"]', requestModel.prompt);
        await typePromptWithImageTags(page, updatedPrompt);
        console.log("Prompt added successfully.");
        await sleep(5000);
        await page.click('[data-test-id="creation-form-button-submit"]');
        let videoUrl = "";
        // await sleep(10000);
        await page.waitForFunction(() => {
            return [...document.querySelectorAll('div')]
                .some(div => div.textContent?.includes('Submitted'));
        });
        await sleep(10000);
        let nextExecutionTime = new Date((new Date()).getTime() + 20 * 1000);
        let videoGenerationIteration = 300; // 300 iterations with 20 seconds wait time will give us around 100 minutes of wait time which is more than enough for video generation
        if (videoGenerationResponse && videoGenerationResponse.success && videoGenerationResponse.data) {
            for (let i = 0; i <= videoGenerationIteration; i++) {
                if (taskResultResponse && taskResultResponse.data && taskResultResponse.data.errorMsg &&
                    taskResultResponse.data.errorMsg.trim().length > 2) {
                    throw new Error("Error in video generation task: " + taskResultResponse.data.errorMsg);
                }
                else if (i == (videoGenerationIteration - 5)) {
                    console.log("Adding additional wait time of 5 minutes as video is still not generated...");
                    videoGenerationIteration += 300;
                }
                let currentDate = new Date();
                if (config && config?.url && currentDate >= nextExecutionTime) {
                    console.log("Getting response from API...");
                    try {
                        nextExecutionTime = new Date(currentDate.getTime() + 20 * 1000);
                        let headers = config.headers;
                        for (const key of Object.keys(headers)) {
                            if (key.startsWith(':')) {
                                delete headers[key];
                            }
                        }
                        config.headers = headers;
                        let response = await axios.request(config);
                        taskResultResponse = response.data;
                    }
                    catch (error) {
                        console.log("Error while fetching task result: ", error);
                    }
                }
                if (taskResultResponse?.data?.taskResult && taskResultResponse.data.taskResult.length > 0
                    && taskResultResponse.data.taskResult[0].downloadUrl) {
                    videoUrl = taskResultResponse.data.taskResult[0].downloadUrl;
                    console.log("Video generated successfully. Video URL: " + videoUrl);
                    break;
                }
                else {
                    console.log("Video is still processing for tries " + (i + 1) + "... Checking again in 3 seconds.");
                    await sleep(3000);
                }
            }
        }
        if (videoUrl == "") {
            throw new Error("Video URL not found after waiting for 15 minutes.");
        }
        return videoUrl;
    }
    catch (error) {
        if (retries > 0) {
            console.log(`Retrying... Attempts left: ${retries}`);
            return await GenerateWANAiVideos(requestModel, retries - 1);
        }
        try {
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
        // page.off('response');
        config = {};
        try {
            await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=changeIsClaimedStatus&email=${requestModel.loginEmail}&status=No`);
        }
        catch (error) {
            console.log("Error while updating user status:", error);
        }
        await sleep(10000);
        console.log("Execution completed.");
        try {
            if (incognitoContext && browser?.connected) {
                await incognitoContext.close();
            }
        }
        catch (e) {
            console.log("Ignoring context close error:", e.message);
        }
        try {
            if (browser?.connected) {
                await browser.close();
            }
        }
        catch (e) {
            console.log("Ignoring browser close error:", e.message);
        }
    }
}
// async function readAllPendingMessages() {
//     await page.click('[data-test-id="header-message-button"]');
//     await sleep(2000);
//     const messagesCount = (await page.$$('[class*=MessageDrawerContainer] [class^=MessageContainer] [class^=ItemContainer]')).length;
//     if (messagesCount > 0) {
//         const buttons = await page.$$('[class*=MessageDrawerContainer] [class^=ButtonContainer] button');
//         console.log(await page.$$eval('[class*=MessageDrawerContainer] [class^=ButtonContainer] button', buttons => buttons.map(btn => btn.textContent)));
//         for (let i = buttons.length; i > 1; i--) {
//             buttons[i].click();
//             await sleep(2000);
//             await clickOnElementByText(page, "Confirm", 'button');
//             await sleep(2000);
//         }
//     }
// }
async function uploadReferenceImages(page, refrenceImageList, prompt) {
    if (refrenceImageList.length > 0) {
        for (let image of refrenceImageList) {
            let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"]');
            await sleep(2000);
            imageUploadOptions[imageUploadOptions.length - 2].click();
            await sleep(2000);
            const [fileChooser] = await Promise.all([
                page.waitForFileChooser(),
                clickOnElementByText(page, "Upload from device", 'span')
            ]);
            await fileChooser.accept([
                'temp/images/' + image.imageName,
            ]);
            await sleep(5000);
        }
    }
}
async function uploadStartImage(page, imageName) {
    let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"]');
    await sleep(2000);
    imageUploadOptions[imageUploadOptions.length - 1].click();
    await sleep(2000);
    const [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        clickOnElementByText(page, "Upload from device", 'span')
    ]);
    await fileChooser.accept([
        'temp/images/' + imageName,
    ]);
    await sleep(5000);
}
async function typePromptWithImageTags(page, prompt) {
    const regex = /@Image\d+/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(prompt)) !== null) {
        // Type text before the image tag
        const beforeText = prompt.slice(lastIndex, match.index);
        if (beforeText) {
            await page.keyboard.type(beforeText, { delay: 20 });
        }
        // Type the image tag
        const imageTag = match[0];
        await page.keyboard.type(imageTag, { delay: 20 });
        // Wait for dropdown/suggestions
        await sleep(3000);
        // Select image
        await page.keyboard.press('Enter');
        lastIndex = match.index + imageTag.length;
    }
    // Type remaining text
    const remaining = prompt.slice(lastIndex);
    if (remaining) {
        await page.keyboard.type(remaining, { delay: 20 });
    }
}
