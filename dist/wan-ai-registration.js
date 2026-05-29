import { ApiURLs, Flags, PageNames } from "./constants.js";
import { getRestResponse } from "./restTemplate.js";
import { captureScreenShot, focusOnPage, generatePassword, getEmailFromTempMailSo, getPageFromOpenedPages, getWanOTPFromTempMailSo, globalVars, openNewBrowser, validateWANOtp, wanAIRegistration } from "./utility.js";
export async function startProcessOfAccountCreation() {
    console.log("Data creation process started.");
    globalVars.globalBrowser = await openNewBrowser(Flags.BROWSER_LOCAL);
    try {
        let tempMail = await getEmailFromTempMailSo(globalVars.globalBrowser);
        let userDetails = await getRestResponse(ApiURLs.USER_DETAILS_API);
        let userFullName = `${userDetails.results[0].name.first} ${userDetails.results[0].name.last}`;
        let password = await generatePassword(12);
        await wanAIRegistration(tempMail, userFullName, password);
        await focusOnPage(globalVars.globalBrowser, PageNames.TEMP_EMAIL_SO);
        let otp = await getWanOTPFromTempMailSo();
        await focusOnPage(globalVars.globalBrowser, PageNames.WAN_AI);
        let wanPage = await getPageFromOpenedPages(globalVars.globalBrowser, PageNames.WAN_AI);
        try {
            await validateWANOtp(wanPage, otp, tempMail);
            await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=add&email=${tempMail}&fullName=${userFullName}&password=${password}`);
            console.log(`Data created successfully.`);
        }
        catch (error) {
            await captureScreenShot(wanPage, "wanOTPValidation");
            console.error("An error occurred while validating OTP: ", error);
        }
    }
    catch (error) {
        console.error("An error occurred:", error);
    }
    finally {
        console.log("Operation closed.");
        await globalVars.globalBrowser.close();
    }
}
;
