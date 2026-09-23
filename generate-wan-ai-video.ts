import { Browser, BrowserContext, Page } from "puppeteer-core";
import { clickElememtByTextJs, clickOnElementByText, clickOnElementByTextContains, globalVars, hoverOnElementByText, openNewBrowser, replaceString, sleep, openStealthBrowser } from "./utility.js";
import { ApiURLs, Flags } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";
import { ExecutionRequestModel, RefrenceImageDetails, StartVideoGenerationResponse, TaskResultByIdResponse } from "./wan-video-object-models.js";
import { refrenceImageList } from "./generate-scene.js";
import axios from "axios";

let config = {} as any;

export async function GenerateWANAiVideos(requestModel: ExecutionRequestModel, retries = 10) {
    let taskResultResponse = {} as TaskResultByIdResponse;
    let videoGenerationResponse = {} as StartVideoGenerationResponse;

    console.log('Launching new browser and creating incognito context');

    let browser: Browser = await openStealthBrowser();

    // ✅ Get default pages but DON'T close them yet
    const defaultPages = await browser.pages();

    // Create incognito context FIRST
    let incognitoContext: BrowserContext = await browser.createBrowserContext();

    // Open a new page in the incognito context
    let page: Page = await incognitoContext.newPage();

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
        await page.goto(requestModel.refrenceImageList.length > 0 ? "https://create.wan.video/generate/video/reference?model=wan3.0" :
            requestModel.startImageName != "" ? "https://create.wan.video/generate/video/generate?model=wan2.7" : "https://create.wan.video/generate/video/omni?model=wan3.0", { waitUntil: "load", timeout: 120000 });
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

                    taskResultResponse = await response.json() as TaskResultByIdResponse;
                }
                if (response.url().includes('wanx/api/common/imageGen')) {
                    console.log("Received response for video generation request.");
                    videoGenerationResponse = await response.json() as StartVideoGenerationResponse;
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

        await sleep(5000);

        //Reload page once
        await page.reload({ waitUntil: "networkidle2" });
        await sleep(5000);

        if (requestModel.startImageName && requestModel.startImageName != "") {
            if (requestModel.refrenceImageList.length > 0) {
                await uploadStartImageForRefrenceToVideoGeneration(page, requestModel.startImageName);
            } else {
                await uploadStartImageForImageToVideoGeneration(page, requestModel.startImageName);
            }
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

        if (requestModel.refrenceImageList.length > 0 || requestModel.startImageName == "") {
            try {
                await selectVideoResolutionAndDuration(page);
                await page.click('div[class="ant-switch-handle"]');
                console.log("Disable to audio generation in video.");
                await sleep(2000);
            } catch (error) {
                console.log("Error while selecting video resolution and duration: ", error);
            }
        }

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
                } else if (i == (videoGenerationIteration - 5)) {
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
                    } catch (error) {
                        console.log("Error while fetching task result: ", error);
                    }
                }

                if (taskResultResponse?.data?.taskResult && taskResultResponse.data.taskResult.length > 0
                    && taskResultResponse.data.taskResult[0].downloadUrl) {
                    videoUrl = taskResultResponse.data.taskResult[0].downloadUrl;
                    console.log("Video generated successfully. Video URL: " + videoUrl);
                    break;
                } else {
                    console.log("Video is still processing for tries " + (i + 1) + "... Checking again in 3 seconds.");
                    await sleep(3000);
                }
            }
        }

        if (videoUrl == "") {
            throw new Error("Video URL not found after waiting for 15 minutes.");
        }

        return videoUrl;

    } catch (error: any) {
        await closeBrowserInstances(incognitoContext, browser);
        if (retries > 0) {
            console.log(error?.message ?? error);

            console.log(`Retrying... Attempts left: ${retries}`);
            return await GenerateWANAiVideos(requestModel, retries - 1);
        }
        try {
        } catch (error) {
            console.log("Internal error while sending mail of image");
            console.log(error);
        }
        console.log(error?.message);
        console.log("Execution completed with errors.");
        throw error;
    } finally {
        // page.off('response');
        config = {};
        await updateUserClaimedStatus(requestModel);
        await sleep(10000);
        console.log("Execution completed.");

        await closeBrowserInstances(incognitoContext, browser);
    }
}


async function selectVideoResolutionAndDuration(page: Page) {
    await clickOnElementByText(page, '720PSmart Ratio5s', 'div');
    console.log("Clicked on resolution opening box");
    

    await sleep(4000);

    const thumb = await page.waitForSelector('div[class*="Thumb"]');

    console.log('Selected the duration slider.');
    

    const box = await thumb?.boundingBox();

    if (!box) throw new Error('Thumb not visible');

    let startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await new Promise(r => setTimeout(r, 100));

    await page.mouse.down();

    for (let i = 0; i < 30; i++) {
        let time = await page.$eval(
            'div[class*="ThumbLabel"]',
            el => el.innerText
        );

        console.log("Selected time: " + time);

        if (time && time.includes('4')) {
            console.log("Timer is set for 4 second.");
            break;
        }
        startX -= 10;
        await page.mouse.move(startX, startY, {
            steps: 30
        });

        await sleep(500);

    }
    await page.mouse.up();

    await sleep(4000);

    await clickOnElementByText(page, '16:9', 'div[class^="Label-sc-"]', true);
    console.log("Clicked on aspect ratio option to set 16:9");

    await sleep(2000);
}

async function closeBrowserInstances(incognitoContext: BrowserContext, browser: Browser) {
    try {
        if (incognitoContext && browser?.connected) {
            await incognitoContext.close();
        }
    } catch (e: any) {
        console.log("Ignoring context close error:", e.message);
    }

    try {
        if (browser?.connected) {
            await browser.close();
        }
    } catch (e: any) {
        console.log("Ignoring browser close error:", e.message);
    }
}

async function updateUserClaimedStatus(requestModel: ExecutionRequestModel, retryCount = 5) {
    try {
        await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=changeIsClaimedStatus&email=${requestModel.loginEmail}&status=No`);
    } catch (error) {
        if (retryCount > 0) {
            console.log(`Retrying to update user claimed status... Attempts left: ${retryCount}`);
            await sleep(5000);
            await updateUserClaimedStatus(requestModel, retryCount - 1);
        } else {
            console.log("Error while updating user claimed status:", error);
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

async function uploadReferenceImages(page: Page, refrenceImageList: RefrenceImageDetails[], prompt: string) {
    if (refrenceImageList.length > 0) {
        for (let refrence of refrenceImageList) {
            let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"][class^=CoverWrapper]');
            await sleep(2000);

            imageUploadOptions[imageUploadOptions.length - 2].click();
            await sleep(2000);

            const [fileChooser] = await Promise.all([
                page.waitForFileChooser(),
                clickOnElementByText(page, "Upload from device", '[data-test-id="creation-form-box-upload-undefined"] span')
            ]);

            await fileChooser.accept([
                'temp/images/' + refrence.imageName,
            ]);

            await sleep(7000);

            if (refrence.voiceFileName && refrence.voiceFileName.trim() != "") {
                await uploadVoiceOnLatestUploadedRefrenceImage(page, refrence);
            }

        }
    }
}


async function uploadVoiceOnLatestUploadedRefrenceImage(page: Page, refrance: RefrenceImageDetails) {
    let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"][class^=CoverWrapper]');
    await sleep(2000);

    imageUploadOptions[imageUploadOptions.length - 3].click();
    await sleep(2000);

    // const upload = await page.$eval(
    //     'body',
    //     el => el.innerText.includes('Upload from device')
    // );

    // console.log(upload);
    // document.querySelector("#\\:r76\\: > div > div > div.SettingItem-sc-1mp98jj-0.fUxlsc.ant-popover-open");
    await clickOnElementByText(page, "Custom Voice", '[data-test-id="creation-form-box-Operation"] div', true);
    // await page.click('[data-test-id="creation-form-box-voice-undefined"]');

    // const handles = await page.$$(
    //     '[data-test-id="creation-form-box-voice-undefined"]'
    // );

    // for (let i = 0; i < handles.length; i++) {
    //     const visible = await handles[i].evaluate(el => {
    //         const style = getComputedStyle(el);
    //         const rect = el.getBoundingClientRect();

    //         return (
    //             style.display !== 'none' &&
    //             style.visibility !== 'hidden' &&
    //             rect.width > 0 &&
    //             rect.height > 0
    //         );
    //     });

    //     console.log(i, visible);
    // }

    await sleep(2000);

    const [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        clickOnElementByText(page, "Upload from device", '[data-test-id="creation-form-box-upload-voice"] span', true)
    ]);

    await fileChooser.accept([
        'temp/audio/' + refrance.voiceFileName,
    ]);

    await sleep(3000);
    await clickOnElementByText(page, "Confirm", 'button[type="button"]');
    await sleep(5000);

}


async function uploadStartImageForRefrenceToVideoGeneration(page: Page, imageName: string) {
    let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"]');
    await sleep(2000);

    imageUploadOptions[imageUploadOptions.length - 1].click();
    await sleep(2000);

    const [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        clickOnElementByText(page, "Upload from device", 'span', true)
    ]);

    await fileChooser.accept([
        'temp/images/' + imageName,
    ]);
    await sleep(5000);
}


async function uploadStartImageForImageToVideoGeneration(page: Page, imageName: string) {
    let imageUploadOptions = await page.$$('[data-test-id="creation-form-box-undefined"]');
    await sleep(2000);

    imageUploadOptions[0].click();
    await sleep(2000);

    const [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        clickOnElementByText(page, "Upload from device", 'span', true)
    ]);

    await fileChooser.accept([
        'temp/images/' + imageName,
    ]);
    await sleep(5000);
}





async function typePromptWithImageTags(
    page: Page,
    prompt: string
) {
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