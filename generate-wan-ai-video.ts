import { Browser, Page } from "puppeteer-core";
import { captureScreenShot, clickBySelector, openNewBrowser, sleep } from "./utility.js";
import { Flags } from "./constants.js";

var browser: Browser;

export async function GenerateWANAiVideos(prompt: string) {
    browser = await openNewBrowser(Flags.BROWSER_SERVER);
    let page: Page = await browser.newPage();
    try {

        //Navigate to wan ai
        await page.goto("https://create.wan.video/", { waitUntil: "load" });
        await sleep(3000);
    
        //Navigate to login page
        await clickBySelector(page, "[class*=HeaderContainer] [class*=RightContent] button");
        await sleep(2000);
        captureScreenShot(page, "testing")

        //Login with user credentials

        //Reload page once

        //Claim credits

        //Navigate to generated videos

        //Change the ai model

        //Chanage the resolution

        //Enter the prompt

        //Click on generate video

        //Check video generation is added in queye

        //Check generation process is started

        //Wait until generation process not ends

        //get the video url of latest video


    } catch (error) {
        console.log(error);
        // captureScreenShot()
    }
}