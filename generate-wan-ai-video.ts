import { Browser, BrowserContext, Page } from "puppeteer-core";
import { clickOnElementByText, openNewBrowser, sleep } from "./utility.js";
import { ApiURLs, Flags } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";
import { ExecutionRequestModel, RefrenceImageDetails, StartVideoGenerationResponse, TaskResultByIdResponse } from "./wan-video-object-models.js";
import { refrenceImageList } from "./generate-scene.js";

var browser: Browser;
let incognitoContext: BrowserContext;
let page: Page;
let taskResultResponse: TaskResultByIdResponse;
let videoGenerationResponse: StartVideoGenerationResponse;


export async function GenerateWANAiVideos(requestModel: ExecutionRequestModel, retries = 10) {

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
    console.log("Received the request of execution...");

    try {

        //Navigate to wan ai
        await page.goto("https://create.wan.video/generate/video/reference?model=wan2.7", { waitUntil: "load" });
        await sleep(5000);
        console.log("Navigated to WAN AI Site.");

        page.on('response', async (response) => {
            if (response.url().includes('wanx/api/common/v2/taskResult')) {
                console.log("Received response for task result.");
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

        //Login with user credentials
        await page.type('[data-test-id="login-form-box-address"]', requestModel.loginEmail, { delay: 120 });
        await sleep(1000);
        // executionSteps.push("Email ID is entered: " + requestModel.loginEmail);

        await page.type('[data-test-id="login-form-box-password"]', requestModel.loginPassword, { delay: 120 });
        await sleep(1000);
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
            await uploadStartImage(requestModel.startImageName);
        }

        await uploadReferenceImages(requestModel.refrenceImageList, requestModel.prompt);


        //Enter the prompt
        await page.click('[data-slate-node="element"]');
        await sleep(1000);
        console.log("Clicked on textbox where prompt will be written.");

        refrenceImageList.forEach(async () => { await page.keyboard.press('Backspace'); })

        // await page.type('[data-slate-node="element"]', requestModel.prompt);
        await typePromptWithImageTags(page, requestModel.prompt);
        console.log("Prompt added successfully.");


        await sleep(2000);
        await page.click('[data-test-id="creation-form-button-submit"]');
        let videoUrl = "";

        // await sleep(10000);

        await page.waitForFunction(() => {
            return [...document.querySelectorAll('div')]
                .some(div => div.textContent?.includes('Submitted'));
        });

        await sleep(10000);

        if (videoGenerationResponse && videoGenerationResponse.success && videoGenerationResponse.data) {
            for (let i = 0; i <= 300; i++) {
                if (taskResultResponse?.data?.taskResult && taskResultResponse.data.taskResult.length > 0
                    && taskResultResponse.data.taskResult[0].downloadUrl) {
                    videoUrl = taskResultResponse.data.taskResult[0].downloadUrl;
                    console.log("Video generated successfully. Video URL: " + videoUrl);
                    break;
                } else {
                    console.log("Video is still processing... Checking again in 3 seconds.");
                    await sleep(3000);
                }
            }
        }

        if (videoUrl == "") {
            throw new Error("Video URL not found after waiting for 15 minutes.");
        }

        return videoUrl;

    } catch (error: any) {

        if (retries > 0) {
            console.log(`Retrying... Attempts left: ${retries}`);
            await page.reload({ waitUntil: "networkidle2" });
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
        await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=changeIsClaimedStatus&email=${requestModel.loginEmail}&status=No`);
        console.log("Execution completed.");

        if (incognitoContext)
            await incognitoContext.close();

        if (browser)
            await browser.close();
    }
}


async function readAllPendingMessages() {
    await page.click('[data-test-id="header-message-button"]');
    await sleep(2000);

    const messagesCount = (await page.$$('[class*=MessageDrawerContainer] [class^=MessageContainer] [class^=ItemContainer]')).length;
    if (messagesCount > 0) {
        const buttons = await page.$$('[class*=MessageDrawerContainer] [class^=ButtonContainer] button');

        console.log(await page.$$eval('[class*=MessageDrawerContainer] [class^=ButtonContainer] button', buttons => buttons.map(btn => btn.textContent)));

        for (let i = buttons.length; i > 1; i--) {
            buttons[i].click();
            await sleep(2000);
            await clickOnElementByText(page, "Confirm", 'button');
            await sleep(2000);
        }
    }
}

async function uploadReferenceImages(refrenceImageList: RefrenceImageDetails[], prompt: string) {
    if (refrenceImageList.length > 0) {
        for (let image of refrenceImageList.filter(refrenceImages => prompt.includes(refrenceImages.imageAlias))) {
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


async function uploadStartImage(imageName: string) {
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