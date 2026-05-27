import axios from "axios";
import crypto from "crypto";
import { replaceString, sleep } from "./utility.js";
import { getRestResponse, postRestResponse } from "./restTemplate.js";
import { fileTypeFromFile } from "file-type";
import { ApiURLs, Configs } from "./constants.js";
import FormData from "form-data";
import fs from 'fs';
import { refrenceImageList, videoResolution } from "./generate-scene.js";
import imageSize from "image-size";
let authHeaders = "";
let isUserLoggedIn = false;
export async function GenerateWANAiVideosByApi(requestModel) {
    let executionSteps = [];
    console.log("Received the request of execution...");
    try {
        let loginResponse = await loginToWanAI({
            username: requestModel.loginEmail,
            password: requestModel.loginPassword,
            enableOAuth2: false
        });
        if (!loginResponse.success) {
            throw new Error("Authentication failed, Please check credentials.");
        }
        isUserLoggedIn = true;
        callCountApi();
        executionSteps.push("Login done with user credentials.");
        await sleep(5000);
        await claimDailyReward();
        executionSteps.push("Daily reward claimed.");
        await sleep(5000);
        let availableCredits = await getAvailableCredits();
        if (availableCredits.data.availableCount < 10) {
            throw new Error("User does not have sufficient credits to generate videos.");
        }
        await sleep(5000);
        let videoGenerationResponse = {};
        if (requestModel.refrenceImageList && requestModel.refrenceImageList.length > 0) {
            console.log("You are in right place...");
            await uploadRefrenceImageToWanAiServer(requestModel, executionSteps);
            if (requestModel.startImageName && requestModel.startImageName != null && requestModel.startImageName != "") {
                //Image upload
                let ossUploadedImageResponse = await uploadImageToWanAiServer(requestModel, executionSteps);
                await sleep(1000);
                let imagePath = Configs.UPLOADED_IMAGE_DIR + requestModel.startImageName;
                const buffer = fs.readFileSync(imagePath);
                const dimensions = imageSize(buffer);
                let startImageDetaiils = {
                    imageName: requestModel.startImageName,
                    imageUrl: ossUploadedImageResponse.data,
                    imageAlias: "Image",
                    imageId: crypto.randomUUID(),
                    width: dimensions.width ?? 0,
                    height: dimensions.height ?? 0,
                    imageType: "",
                    imageFile: fs.createReadStream(imagePath),
                    originalName: "StartFrame"
                };
                videoGenerationResponse = await generateRefrenceVideoWithFirstFrame(requestModel, startImageDetaiils);
            }
            else {
                videoGenerationResponse = await generateVideosForRefrenceImage(requestModel);
            }
        }
        else if (requestModel.startImageName && requestModel.startImageName != null && requestModel.startImageName != "") {
            if (requestModel.audioFileName && requestModel.audioFileName != null && requestModel.audioFileName != "") {
                let filetype = await fileTypeFromFile(Configs.UPLOADED_AUDIO_DIR + requestModel.audioFileName);
                let policyResponse = await getPolicyForFile(requestModel.audioFileName + "." + (filetype?.ext ?? "mp3"));
                executionSteps.push("Created policy for uploaded audio.");
                await sleep(1000);
                await uploadFileToServer(Configs.UPLOADED_AUDIO_DIR + requestModel.audioFileName, policyResponse);
                executionSteps.push("Created audio uploaded on server.");
                await sleep(1000);
                let cdnOssAudioResponse = await generateBatchCdnForAudio(policyResponse.data.key);
                executionSteps.push("Generated CDN OSS URL for uploaded audio.");
                await sleep(1000);
                //Image upload
                let ossUploadedImageResponse = await uploadImageToWanAiServer(requestModel, executionSteps);
                await sleep(1000);
                videoGenerationResponse = await generateVideoForImageAndAudio(requestModel.prompt, ossUploadedImageResponse.data, cdnOssAudioResponse.data.cdnList[0].cdnlink);
            }
            else {
                let ossResponse = await uploadImageToWanAiServer(requestModel, executionSteps);
                videoGenerationResponse = await generateVideoByImage(ossResponse.data, requestModel.prompt);
            }
        }
        else {
            videoGenerationResponse = await startVideoGeneration(requestModel.prompt);
        }
        executionSteps.push("Video generation started.");
        await sleep(3000);
        console.log(videoGenerationResponse);
        let videoDownloadUrl = "";
        if (videoGenerationResponse.success && videoGenerationResponse.data) {
            for (let index = 1; index <= 300; index++) {
                let taskResultResponse = await getTaskDetailsById(videoGenerationResponse.data);
                // console.log(taskResultResponse);
                if (taskResultResponse?.data?.taskResult && taskResultResponse.data.taskResult.length > 0
                    && taskResultResponse.data.taskResult[0].downloadUrl) {
                    // console.log(taskResultResponse.data.taskResult[0].downloadUrl);
                    videoDownloadUrl = taskResultResponse.data.taskResult[0].downloadUrl;
                    executionSteps.push("Video generation is completed, Now sending video link over email.");
                    if (requestModel.sendEmail) {
                        await postRestResponse(requestModel.webhookUrl + "/send-video-link", {
                            "rowNumber": requestModel.rowNumber,
                            "videoUrlToSend": videoDownloadUrl,
                            "emailToSendVideo": requestModel.emailToSendVideo,
                            "videoTitle": requestModel.videoTitle
                        });
                    }
                    else {
                        return videoDownloadUrl;
                    }
                    executionSteps.push("Generated video link is shared over email.");
                    break;
                }
                console.log("Video generation is in progress, Wait for sometime. Try No: " + index);
                await sleep(2000);
            }
            if (videoDownloadUrl == "") {
                throw new Error("Video is not generated or taking too much time for " + requestModel.loginEmail);
            }
        }
    }
    catch (error) {
        executionSteps.push("Error: " + error?.message);
        throw error;
    }
    finally {
        isUserLoggedIn = false;
        try {
            let availableCredits = await getAvailableCredits();
            if (requestModel.sendEmail) {
                await postRestResponse(requestModel.webhookUrl + "/send/error-email", {
                    "executionSteps": JSON.stringify(executionSteps),
                    "videoTitle": requestModel.videoTitle,
                    "rowNumber": requestModel.rowNumber,
                    "emailToSendVideo": requestModel.emailToSendVideo,
                    "resetUserStatus": availableCredits.data.availableCount < 10 ? false : true
                });
            }
            else {
                await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateUserStatus&rowNumber=${requestModel.rowNumber}&status=${availableCredits.data.availableCount < 10 ? "Not Available" : "Available"}`);
            }
            await logoutCurrentUser();
            executionSteps.push("Logout done.");
        }
        catch (error) {
            console.log("Internal error happened...");
            console.log(error);
        }
        authHeaders = "";
        console.log("Execution completed.");
    }
}
async function generateVideoForImageAndAudio(textPrompt, uploadedImageUrl, uploadedAudioUrl) {
    try {
        let data = JSON.stringify({
            "deductMode": "credit_mode",
            "taskType": "image_to_video",
            "taskInput": {
                "modelVersion": "2_7",
                "duration": 5,
                "assistInfo": "{}",
                "prompt": textPrompt,
                "promptMeta": {
                    "originPrompt": textPrompt,
                    "orderedKeys": [],
                    "refs": {}
                },
                "generationMode": "imaginative",
                "baseImage": uploadedImageUrl,
                "selectedResolution": "720P",
                "multiShots": "single",
                "subType": "basic",
                "audioUrl": uploadedAudioUrl,
                "startTimeStamp": 0,
                "endTimeStamp": 5
            }
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imageGen',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-ua': '231!HW43aAmU65A+j3MDO47Jsv0oUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZRVGrK0x971XY27d0DIyvSBFJJiv8qFzwiEKerqGFyL7jVuuTtfO4lUGXqcsGqMEqMLyyvRrb95g6JJ/4o3x20JBuKt5DCGzVIf52UUcmuoFfglOTPLAQG/gKT7EiG4bteSVSmCjf/DcWBVyK01zbQA13LJKVHyFN3snfKSP8ivzYB0wMXCV+q62wsMGBGAlmUxUSfl61dIBaUe7bAmCRsIbm3EMOGr+wMep4Dqk+I9xGdFfOB4KFlCok+++4mWYi++6bFpjOyBQIBDjDjvJml9K0VHF00K95jqbAYL+LZPD48Jp/vjHlcdz2MQWeGQdcJ0wmz9Or/22R8HBHG8+lyGl9idkgDWZbABygI5C4VogFHgUfAnYuEKOHE+I5f3vg2vo8htQZmDjGCeFRuf4yn0t4Pylj4kdC37MA5uI9OcYupio3lYS0wxhhd8+FQevUoR/2O+P906Cpz2WMHyZcxkfFd2OR2tQ+T0Cuc9TzN2w6D8DfL+GOr600AB22SWxBqVs9u0tjzhlCPisWNgnS/sobKknEURvEPbYohGWcXVNEtkhQUEB5nT38rGWPMbpXhahqEtZy+YncDF5OA845q+pNzXfSn97ysVikDHWdGmzXxovNp9yoL3K4SEFJBo2ea1J0tpyLccTl7xYkc5rpqs0Bq66F3C+6N2FnxEKmygS9OaDOFLrMaErEMXi04f6BPVQ6Rc2DINfBbR88fIRW2p08k5RmtMoEFuZmP9wst5uyFKR06Iiz3LgdFgat4yNnGz8OhSIgs0aZG2Cf5XPDDEFo+dTRZ+gSYMyttLR1MIJ6HS+RVoBMuREZeYJu/zwoMGiotFevdS7fwCBGZfCQj/zvCHgTAxY6DPnKyL//9Wd+FggRWdVC593kTnqFVP5nCDycjoriodqcA4rTWGABMparPD06lX3ckvxBv4Oj7OENVKMP7Je1e5hi63fOluoHOn9stJvhiW+90I2gUazgDm/bWRVi0ehOCp0mb3nCQVi9L9GuHLNxMogHwJiw6qpCWbGhH5udKhBeOtwLHmJIfOW66kqk6bk+BGbbZpEsDP5I2PntZXTENLZXRHHKg+pBEI/UTwM1D9uBC+3lmRzZNKao4obcwygKmhxczhNC+CR2jnJMJz1A+nP5n9jNmOO0tTMwCPeYXe32/Hee7hLywNo8jxs33TdPgZfZI0lzaYm+LMSJoPJ3RjB2kmaesQYN9b7k610n0vz3vXhI14U8YTbyAdO16MoB02JUbmUcx+RQM+zjG0ALcinA7wT70Wv8WLLfDipQDwi5fRngmwjdt4gNd17D/eESQe0LBKR9jCma6VpvvJ79tohKRPd5HgKKAzJ779MVrDukFo0Kz/r+Ki1Yy0RtqUFT7Sk5MJxroJ1pqqmfVk5Y+Rx5AiUiHDRTNxFTMAi0Qe/V4Lt4OfNhTVHSggTZ3qLmi1M6DxPFWS75Cut3bOGriTN8aLlxIHOyHTSAA7I7omX7NGyaK6JQVujr+jA7n7dVuIVlpLkH/+YOIK9FP9U3N7oIXYvmtnhhHNEmLmSD5AFTVVsXmlcBk2X35jnCRIxJ2XyuP8CbdzlqrIO0qSN+L2NA==',
                'bx-umidtoken': 'T2gAMcS6OtEjVZm7vjfX2kBtU4l8VLt3S_D5Jz5mPo-G6pti-EFy2xU1Zqgr1QerJMY=',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': '3ed33a87-93bf-4140-970c-8eddfe96b18b',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; sca=8fc5c674; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=22a8abb325d4e1e370e4505c_1776234458_7; _ga_Z4KVB8RMTT=GS2.1.s1776233401$o54$g1$t1776234427$j55$l0$h0; tfstk=g59qKta9pxH4WR3HYHXZaauo_UBxp9mSRSJ1jGx9XlbcnqCgQFtHG12jMCRyYEJ6Gt60DQLBx-9jMOwNHOBiR2MIdmKABOf4lRfuDTjNxRD1SNXlHGsfDSBEdnKYqoziAQDIQesE8GbMSsblZGQlmNVco05lAGXgn120ZzbRjOXGjRDlZMS_I-2DS3mPXabGIsYGE0SOrNXGIbQRSwwPYsm4vzaszRGZjw-czR2MnjdR8DxP2H9rusbemLy43cIVgwxczq8QHBCkX1JTXR5HmBLOxE4m7NpyqKAH-4NfoBSwAC-mn8XXHnAhsp0TseW276vcal2HDtQNUgvnfWQWUZTM3_mQL16kd6XDNb3f1tSeSKL4bRYHVH9AwduUrNdfvTjwBDVN71jrNPIlaWv9gPVNigIPR0orMjQlAZarXTPT6sdR4wixD5FOigIPR0oz65CAeg7IDmC..; isg=BPPxowlMnkUHSVMUuXatw25hgvcdKIfqeYT_F6W4A5JJpFpGa_zLO-hyXsxKBN_i; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
async function uploadImageToWanAiServer(requestModel, executionSteps) {
    let filetype = await fileTypeFromFile(Configs.UPLOADED_IMAGE_DIR + requestModel.startImageName);
    let policyResponse = await getPolicyForFile(requestModel.startImageName + "." + (filetype?.ext ?? "png"));
    executionSteps.push("Created policy for uploaded image.");
    await sleep(1000);
    await uploadFileToServer(Configs.UPLOADED_IMAGE_DIR + requestModel.startImageName, policyResponse);
    executionSteps.push("Created image uploaded on server.");
    await sleep(1000);
    let ossResponse = await GenerateImageFileOssResponse(policyResponse.data.key);
    executionSteps.push("Generated OSS URL for uploaded image.");
    await sleep(1000);
    return ossResponse;
}
async function uploadRefrenceImageToWanAiServer(requestModel, executionSteps) {
    for (const image of requestModel.refrenceImageList) {
        let filetype = await fileTypeFromFile(Configs.UPLOADED_IMAGE_DIR + image.imageName);
        let policyResponse = await getPolicyForFile(image.imageName + "." + (filetype?.ext ?? "png"));
        executionSteps.push("Created policy for uploaded reference image.");
        await sleep(1000);
        await uploadFileToServer(Configs.UPLOADED_IMAGE_DIR + image.imageName, policyResponse);
        executionSteps.push("Created reference image uploaded on server.");
        await sleep(1000);
        let ossResponse = await GenerateImageFileOssResponse(policyResponse.data.key);
        executionSteps.push("Generated OSS URL for uploaded reference image.");
        await sleep(1000);
        image.imageUrl = ossResponse.data;
    }
}
async function generateVideoByImage(baseImageUrl, textPrompt) {
    try {
        let data = JSON.stringify({
            "deductMode": "credit_mode",
            "taskType": "image_to_video",
            "taskInput": {
                "modelVersion": "2_7",
                "duration": 5,
                "assistInfo": "{}",
                "prompt": textPrompt,
                "promptMeta": {
                    "originPrompt": textPrompt,
                    "orderedKeys": [],
                    "refs": {}
                },
                "generationMode": "imaginative",
                "baseImage": baseImageUrl,
                "selectedResolution": "720P",
                "multiShots": "single",
                "subType": "basic"
            }
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imageGen',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-ua': '231!D0B3qkmUfGv+j7sAO47Jsv0oUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZRVGrK0x971XY27d0DIyvSBFJJiv8qFzwiEKerqGFyL7jVuuTtfO4lUGXqcsGqMEqMLyyvRrb95g6JJ/4o3x20JBuKt5DCGzVIf52UUcmuoFfglOTPLAQG/gKT7EiG4bteSVSmCjf/DcWBVyK01zbQA13LJKVHyFN3snfKSP8ivzYB0wMXCV+q62wsMGBGAlmUxUSfl61dIBaUe7bAmCRsIbm3EMOGr+wMep4Dqk+I9xGdFfOB4KFlCok+++4mWYi++6bFljOt38I0Dj+8UbxQxCPg3jf0vemUJ1T2B6lg2Ul9xujCjtedczvzXoKWmutZfQkhH9BniZlMy8DD+h9o+r0xQBJ8zu3OFiC535NRxKxzSMMxUPmHUClUzFzDT8h9pY7olPA049BNtPj1uVFwykkNBO27yLtHTiwewSh2I//dg3VXzxefiiXQarAC7Z7AliJqBMfe10Pcp8ro6mzj0aw6EaBq2SW9x7FDNVc94zhExwY3dR1iUMKPJn5MsxIC80gI3HhsBMse1pA7qE1LRS9yhjY+LSuyX3X4s3TEkF6bDLF/+15wywu9sQb1nwm0nMyyP9m7KwAYBOLEr9ypVRQKm8wCXJYxrE3jhJNjBq9UdxKPredCHsy+zAoJXjyWq1GE7dVupM3if7PTmTPMG4E4wtJ6o1yZVC0NN1Kp1NJq64v0RV9TL6Rz8WaYtxYsAUQgaeTSJTwyXUE7/EJ/pC/osje7hhWWIQpMGGzrt48+ukraFHzwL7CQsgJj9+5n5WTrjaglgxUEHn5yZvPCL2Y4eGaL91H2RlHJR9QgzH03Ggx2DYJiKfSFYAJmjSYUo7XBOzUEHIuxKevYqVPj3R4W8xwddZ84cA2uX1DToRpV8ItHYahoxx8LaknTbUKe7HqLGnX4etILY3GtKekZWe+2QugXDpO5g1vkvAgphsSiPzrtUlPVL/ixjsF9Z+ImMKR86Qyrl9DizdBeGw14dSLc6vhbKBZdUAzGBQJuSH73s1FZyyQA9RV1RJROVr6dcQoM6EyFxfP7KXFDGiErSYAqlMTGcQXd6AmZCU6WQR1aUW4fQ4OkazIHr3YztMvy2shODcVxJamgiUNRYlySw39irkQo1GHW1wervsGUGVSxGhGPWZrJr2dOumMC4MAsSxTRyOcNHzUV28MnY/tx5Pt7/+rdKk45xAX+FYRTfBY5hbnNdgyy3ht+2MjVaZ7yo0SXxCTmP1Ry+54to9drCd3x6XkKWD5bVs4E/6k6FDJ4O8GaRUyYVXNjnUZliVJKVBBeZbYZO9j7PPNp8auyFV6baSlfHN0P+Z0WIJJfpAfK9foPOXJaNJ+ZzKkfbXr5xkcWJn0Z+Qve9PjT4V3m06dLlRdyoAo8htYNbpPgU4cxRwzdQrqpBZcDWl4DO7afrYtmLkackw4sASkCUN0oHmTJZgmxDnbmYW/TWA3EF3z/d16t/8YzURhhLFzOlxyjlVVm7o/2UOGT4cAO5uj72ANryA7bCgT4SBMOcdtd2YxqfLUwDHIE80KW4VjSA+E8F6xHDmGUdmsB2ZoN79GmW8QDGl9+8xTYpo3FcFkIasgwE0tFlAWhUlrfiENtIXJwhQgD3FHQUR4==',
                'bx-umidtoken': 'T2gAq0hC8ojtwWDDzC4aya-LhRU4T3gbbIqLSmA-0KvXH8ByToa6Iu2Xm3arqO-tL-8=',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate/video/generate?model=wan2.7',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': '2d2f52a6-3d76-4bd4-86bf-54dc8dd0d956',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; sca=ac107df6; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=ca35581f3482d00714b9186d_1775648365_5; _ga_Z4KVB8RMTT=GS2.1.s1775648300$o47$g1$t1775648417$j13$l0$h0; tfstk=gB5jVpZhmmmbz4zYXmzrPG8feDR60zPe6VTO-NhqWIdvfdIFffWVWjR1C3_Fu1zDggi1YgW27-xZ1g_Cc1W2gIns1gsB7rxaoqXlYwhVg-AZ1IAM6krUTWzcoCAOeO5UWqAJ7elT_nLtyIYwdtiHqW7co43jXyW8T5MFsiT9XGpv2aL22mHtMGp-wFx-MFhvW0UWS3dtMFdty0LpRFK9BGQ8PFxJXCpAXLUWS3K96ChWDuTuhnQbWuClSYUuUttS6fCWyrbClliMeG8fFH7AGK9cNXvXvZKS6oNarwx6q6EzFajOHi8lfWZW99j51pd_GDYfewOJ0BeIFI_Pm6OAOoG2zdtfespSWfQXZnvRCiZjnnBVVpYJeVNHzM-RosB7S0QAYnOvyLPLRapOUsvhguhX99b2gOIL4x-AdFIyHX-QFgDsPpc6PHz7PADMSldg4oSsfd9vrU5UPzijIKLkPHz7PADMHUYyLzaScAf..; isg=BJSULBCsgZHqaBRR8tNCjgW8ZdIG7bjX0Y5yky5krJ6wGRtjB_kEZjrfGQmB4fAv; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
async function GenerateImageFileOssResponse(key) {
    try {
        let data = JSON.stringify({
            "key": key,
            "taskType": ""
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/oss/generateOssUrl',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate/video/generate?model=wan2.7',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': '2d2f52a6-3d76-4bd4-86bf-54dc8dd0d956',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; sca=ac107df6; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=ca35581f3482d00714b9186d_1775648365_5; _ga_Z4KVB8RMTT=GS2.1.s1775648300$o47$g1$t1775648417$j13$l0$h0; tfstk=gnKx0ame0bccG2mS9o0kjAF1EUDkh4v2FIJQj1f05QdJ1dYm31D2y5OMZNaMofr96_OeoNDVSGB6t_zMnfk26QdB9NYcSqW_Xi-kolfmgGp6tGhntDmH3KSPfXcneAoYzM6L5rNGGga5jOUvkk5y3KSaU8Vs-U9qXyBuAOs61g15Q9S_GNZjea6hCGZf5oa7N_W1fG1fCLw5d9zfCG_seL1PCG161ZMRP_W1f1O1fjy_H12f6lL56rfUX8rbxkxRHZCTosq9XFEhQ69PwlGBwtFFOK18fl1QK4-DeKcYYLj2fBBHi0Zv9d9e5aKTNXCw2LtX5LPxFMpJrebvyjZOZnXORG_8Cl9R2_7HfMiQwT8WnFt2MRE13nxhW67-Cl7GVHbBRIeZLLsfCC7ejXrVGd9eYejKDWWvPpIR4eKHvRrLt6BglYH87P7fUwDxbiyfNwmOe6DurPzNrTWRtYH87P7fUTCnE04a7aXP.; isg=BOLidNLS_-v2E-K7cF2sRGfaM2hEM-ZNs6jk-Sx1DtUP_6h5E8EDXFQ5LyMDb17l; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
async function uploadFileToServer(fileNameWithPath, policyResponse) {
    try {
        let type = await fileTypeFromFile(fileNameWithPath);
        let data = new FormData();
        data.append('OSSAccessKeyId', policyResponse.data.accessId);
        data.append('policy', policyResponse.data.policy);
        data.append('signature', policyResponse.data.signature);
        data.append('key', policyResponse.data.key);
        data.append('dir', policyResponse.data.dir);
        data.append('success_action_status', '200');
        data.append('file', fs.createReadStream(fileNameWithPath), {
            filename: fileNameWithPath + "." + (type?.ext ?? "png"),
            contentType: type?.mime ?? "image/png"
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://tongyi-wanx-international.oss-accelerate.aliyuncs.com/',
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Origin': 'https://create.wan.video',
                'Referer': 'https://create.wan.video/generate/video/generate?model=wan2.7',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                ...data.getHeaders()
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function getPolicyForFile(fileName) {
    try {
        let data = JSON.stringify({
            "fileName": fileName,
            "taskType": ""
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/oss/getPolicy',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate/video/generate?model=wan2.7',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': '2d2f52a6-3d76-4bd4-86bf-54dc8dd0d956',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; sca=ac107df6; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=ca35581f3482d00714b9186d_1775648365_5; _ga_Z4KVB8RMTT=GS2.1.s1775648300$o47$g1$t1775648417$j13$l0$h0; tfstk=g1fE05mRMWFEL1qcuZAzQQZtrvRpXQrXq_tWrabkRHx3vLGyaZI2EDwdPOklAiXBABfIaTSfPyh7JBDuaiI2AHfQJTlPzgl5d_7-aUbl2yK7JR_dJQducoszGwQLcisfe68nIfb9yeDuCpcI9vH8coNb1J0MakrfRE3kmdYJjecHZv4ZjELvZUYHZP-MzEHoxgAu7P8kl3motXcMIULWZ3jkZP7MXURkrgAu7Nx9rjR2qnGwup4enfg6pDmJBnbHbbcqXF9nIgHSAD1w8p5lKh86518eLnvrVsthtG_lO6pTLvAR5tSPEiqsdHX2uGJfLolF0MLlzUjUMq-GTa5wpOinKEReYKfHLqGcuLXN_B132xQ17Hv21OwTALOFYtKvKREO4N-Cq6JiYlt5hN1HQiqs_gpPE6OGtlVV4mnJSdkcw9ooUpY97naa75bkcrKIbzdZeYpdBF-bJyH-epY97naa7YHJpCLwcyUd.; isg=BGdnZodtwqi7Q0coBbLhJ1rt9psx7DvOvl-ByjnZe_YSKK3qRr7-H5luSjC2wBNG; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function loginToWanAI(loginrequest) {
    try {
        loginrequest.password = crypto
            .createHash("sha256")
            .update(loginrequest.password)
            .digest("hex");
        let data = JSON.stringify(loginrequest);
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/public/user/login',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-xsrf-token': 'e12fe403-3ad2-42e3-9c65-91b660e2fbd0',
                // 'Cookie': 'visitId=786F386206704E0DAFB9BD52F842F049; WANX_SESSION=YTkzNDMwMWYtZGM5Yi00YTc0LTk3MWYtYmM3YTJmOTNhYzdl; _ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; atpsida=1a929dbf4289ff71ad3a1b34_1775458444_3; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458447$j60$l0$h0; tfstk=gc0-KkTZzKvl0UYXBaxm-yKHJnODsncyrYl1-J2lAxHxdXmkaJArD9Mnnksnqp7Kp-a7Y023EJUKTAdDIFYiabzUldvMSmqX1-47N7aQRBabO5O0NMZPoX4URdvcmwZyWykRu9rTFjOYtWyCAvZ7lrN_hWs7Rvwbc5NGFyaIdIUbZWP5dW_ChZw4Oy_7dvGXMW2bNyaIdjOYTbNRwJf7pwnbhLtW2_SPJw3Ywuedqr7L0qbg4R9znwQLe7ERqbwARwgxAacbz8tNiJzuUjF-LF7zPknIrrgWheasbx3LfPKHauGKDvzolBs7C0Dul4iOOwGYy-EnrlBJHRgrGVzbmFOtGqkoaqhhOeNmI-GrPyL6_zU7FrFq-K77pmiIruzFFpeEkjgSvgWESVCFWO2TtgOvMMSUVSrMwezrDLDFYSeMiijFYoV4MRAvMMSUVSPYIIYcYMr0g; isg=BGtrOFYIhmGxVtq1lSU1QydR-o9VgH8C0gt9Pt3pmaoBfIneR1RDUo-a1qQS3Nf6; wanx-sg-remember-me=aGFtZXJrb3AxMDY0MiU0MG1haWxzaGFuLmNvbToxNzc3OTg4ODE4NjU2OlNIQTI1NjpkZjQwN2VlNTY3YmM1MTliNDQwZDE0YTllMWEwOTgxOTU1ZmM1Nzk1YTQxZTYwOWFjMGNhMTcwMzZmNGY5MTJi; visitId=7ED1893D1DE64CFF8E6F43B8EE1654E7'
            },
            data: data
        };
        let response = await axios.request(config);
        if (response.status == 200) {
            authHeaders = await extractAuthHeader(["visitId", "wanx-sg-remember-me", "WANX_SESSION"], response.headers["set-cookie"] || []);
        }
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function claimDailyReward() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/inspiration/dailySignReward',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458543$j60$l0$h0; atpsida=1a929dbf4289ff71ad3a1b34_1775458572_7; tfstk=gcbrpRDdWzUzWhwG_1YU07pVVRTJ4eysaw9Bt6fHNLvueHge81BwxYZROiohFOjWFUbFD25O9aNJR7LRweL3CRa1L_CJJDyo0V_yoIAe_yGoroT0mMswQRa_5_qkwe10Cg9YlsAHteAkEe00gBOnKBXHxKfDHBdnEB0ugsvvnBDor4fmoBdIx2XH-S5DHBYHZ9xugsvvtevnNbpHCqRwq7-zG85Qe2-WI_vq-Vkva34daDgE8YOkqdxD32AfuQ-yI_bMvadXiZ_2fnGQeEfOcTA27zk9aifwrB7LsDJeYaL23OziJIIlUZxFlWERgwJyjaxqs21v8BXHYieZ5Q850h7P2WHcZO9PjUCI_812bi-9incEqUs11wKGrzk9hhdF3hszQ4WG4IMpinoGJgknY3AvgdN4grfHC5QOHV9SvDKRDIJ_w7nKv3AvgdN4gDnp2Ed2C7FR.; isg=BGdnUEodwq3cwEYhcTlxv9ul9psx7DvOvl-ByjnUJPYdKIbqQblaHsRuSjC2wBNG; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        if (response.status == 200) {
            return true;
        }
        return false;
    }
    catch (error) {
        throw error;
    }
}
export async function startVideoGeneration(textPrompt) {
    try {
        let data = JSON.stringify({
            "deductMode": "credit_mode",
            "taskType": "text_to_video",
            "taskInput": {
                "modelVersion": "2_7",
                "duration": 5,
                "generationMode": "imaginative",
                "prompt": textPrompt,
                "promptMeta": {
                    "originPrompt": textPrompt,
                    "orderedKeys": [],
                    "refs": {}
                },
                "selectedResolution": "720P",
                "ratio": videoResolution,
                "multiShots": "single",
                "subType": "basic",
                "modelIds": []
            }
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imageGen',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-ua': '231!dq03zAmUD1R+j7/40A7wMB0oUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZRVGrK0x971XY27d0DIyvSBFJD7zqghY+1xdWwVhr4cavHk+I1kik3PYeFF3BouK0za4dKnRI8nHoupb/TXdSNaQw80mj2bwa+PPtqG1OcNtjciJckI+yjcztMvdjTCOVsSLoKVj+U/m/c6f/XjllA+zwXiqdZlQhWjV4YyvtNzR2gYAu5YEzp5zRtncCJhY3gohS7qXn8bXqyOovRxfBlo4hKR3kmr0Q3oyE+jauHhUYuK3IUGHkE+++3+qCS4+ItUgk6eU72Co+4+tMASq/rWt4RqfHhK+y4cYbyHhN2J0cJSpZ13tHnF4ifMtBsLk/mGXbJrXTIPXYzUO0E04pmhPe822hGVxqk1d1GQSE0rseCw5QK6lEqdfTFdxbL6krvWFfCfZ51VhfpkJ2XhLzDS7Ig1tmoVUVvgzTz0ary5R0sp3k2QckuIB5VUUi6Kx6yyAMyv1EJtM/plX8MV+L5xni562HNxOkgbSxEt7mhNPuQCrc3gsdCY7603RNcE4xrcZBwbGMqIZ+V0/iE+BHI1iASJfgXeqG8w1E7jWY9Lu5HgfTIBIf3ExGngMvqobuqscJd9bPyDYupkk791VQ2VpqHNvebShYyl/jMupIqsFPTy/KIRUR0WADUTzT8LorZczAPU7ydshM8kT2GmS3Kymca+GcLzKm7RjzBrTpUVJi4tHww4PjjvbA9LfqxeNbKWnYF2J2a2QJ0agarKygb4Ld5+7C0DXzKVSNwAk3DeYElAHbMTVEZZgZKMBdKN64JhR/skGJlgzhbl6+Mg6lxivJeXKvP0VtIrvHqK0NB7DyPrQk1LjEVTmddv+/nDZooU7wQVqfww3TLplmbuH0uXn03XGBUDGSqIv4uPsShqbLp3pIxJsyoqhclUXdKEug2pOY4pE/BqEgRNcPQbhjWcgQfhzQG1TC2dt/EEHhARWZX7TZupCTXKzKnSxAlYrCCc5BwsLxCFjR/I6x1Pu/SRE3FpTmkR4rVjbGwwkTZm9sAwvnK1j6zERzW/fLbmvTOfgCfSbH/P76DqjNQavlK3WTTJzR90zjcFPKLd4YrMichGojllb5b38lkiG3eY91pImBUMUIbfPYWslZxz2jFpm6XbcJ+lneqQizyiwFOer3/kx4UcWaA1yblEgsggSsVENntNN3d/LZ+aCYljnwGu7t+ku3qldSAGGwY+nb8qQs7xbuwbH7dt1CMplGC/Q1niao7VWW26n8inuVz9b/Whvj9ExLTVaZ4qCU58NtbsjJhBQAEya/9rCTW5pGoR0TgCQrIW01r3Pk9weqHLPymeHqo5fINWfRGaPMCI5nVP3tDM4lCqlp1sRF0ggfYEp9c6WAgRNZCua2kCK9BJNdqga7DNND8DKmFPiFti6SpHgnqvaDfWo4REQfAm7sTkS9H/J+2gIGcOvzNOdACGSkcj/uHT7JLJxB3AcCYQhg9602AtWP1ZJBx5FxaPwMDGwS+KrI7UVuPzHkGCVaLV3BgtMpYjUtbb1SzEfSo19DHpoqQtWKbi4opPVw14gMNVYD76',
                'bx-umidtoken': 'T2gAYP2nXVImyuOmxGs3WQmDrj2HeEw8C8oJ8E330zY4YsbRWH6N3GLzhmcW2Kd1f6s=',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458543$j60$l0$h0; atpsida=1a929dbf4289ff71ad3a1b34_1775458572_7; tfstk=grttLYmybXcM8FiIwl0Hmi3X6Dkhe2jwQNA_mojcs2OdOIWDSV50DepWMZbfnFXYDB1eMZkNis1viKTiK0mkQdSVcihoq0jkO426MO_f1WMfnOFsKNafxk0Vcbcoxy2C7fjXIkPwF69CTtE1GlOfAM65Ui6fCiMdOtBzl5OfcvHdHTP_1i66dw6RFi1XGiMpd6WAcOOfcvpCTtG2IRC0CsEvR6GMhJyb-5VMvOQOMPbaDtOaqO15Z6ZjN1XTa_919oZfN5xvzppi6uJhbnORECmQXQpXUE_pDWGRgHpBfE9U6vsJpeYlWeh_D6xGHasfJ-ZXpMCFrnsSVWBeRdYXbCeYcO-MqZCPJxZVoMtlPUOT3YJCftOVznczb19XU38l2cFPBe9Rvg-eq3e427fRnPMKprzV597oBmSwJfA4u9CoKy44uwXFp_DKprzV59WdZvm3ur7hL; isg=BAsLyI7R5gHSSjpVNQXVY0cxmq_1oB8isivdXn0blsq_nAr-M3R6cmx6doRyvHca; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function getTaskDetailsById(taskId) {
    try {
        let data = JSON.stringify({
            "taskId": taskId
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/v2/taskResult',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=1a929dbf4289ff71ad3a1b34_1775459276_8; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775459248$j60$l0$h0; tfstk=gjKxEume0bcmTRmS9o0kjG36M0koJ4j231AbjljGi4ORNCWMoq5gXUpB6Nb1IEXTXQ1yiEvi3Ns9LBdO7x5G11dMCEDoxDv23GS1XXmnxMAS--OOhN1bNA6GHSMllX7itMjstXmur8_qiG904S55PL1PBo11CC17NOf5Crs61__5d9VffGOsea6CLS11hG_7P9551Gs61LMRI_6ffGO6FYBZgayAs-1TXU1SidwzMvN4g3BAk1UculBygkXfOK18fX1cH75Bh_E_f6NDXeJJnjEeEi-699AmVodpCp81yhFS91-JFnT6USH5vLLk-ZL-GlCkmOQCfae_fLIRawx1ADNRUU9D5nRYBl62mHbOTaH_bNjWxwTBMRkeFi66_w-iTo5XCp-e-MnYTtLWpgIy8HxLQkFh9O4jeYUa7Z6P-xnN0UhD_PWRtY4u7P7lUTCneYUa7Z6Pe6DoqPzNrT5..; isg=BOfnaMqdQi1ew8ah8bnxP1sldhuxbLtOPt8BSrlHfXaDqCZq9zienuDmyrA2QJPG; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function logoutCurrentUser() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/logout',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=1a929dbf4289ff71ad3a1b34_1775459276_8; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775459248$j60$l0$h0; tfstk=gHNSeCsgq3xSE5_Rv372lTmFOLhB5NWV_jTQSPneaph8cDaQfaAFryKKOoi2LzShrkZbXlMUUvWoJBGug8RE4gcQJllCbG5N_z4oiXINbxfJT_htPQdJYvdxMXuQ_Vtcuz4otEY2vOyYr69LHxuK9khxD20Z9pnKJZMx72hpwvdJHnnmJXhKpQKvD20sv23KvZaxm2hKvkHRljnmJXnLvXhSRigcF0U5JMgEXH-ft5oX9BFjkaDUPULKiug7Oca8N8w8GCDSXznX9g64AuoIm5IVhrqLeuu0A1sj6RqbOAhCNh07HPGx4fB6hba4q5G81gOruvi7H7HXJBUSi0DYdusWE0ezcA0xHe1iuloYr7ef-nU8b0G-kx5O5rHL37DgaidS6R4raJEO0Lo8C2IyxCo1hovBlAAIlc7flpvn-Mhh0Cf4HID-oqPNlZtWKY3mlc7flpvneq0qQZ_XVpf..; isg=BLy90XWk-ZzOpM3AHhB6DuysjVputWDfycZKK5YlnafPYXjriMaVb8mXQZEZKZg3; ' + authHeaders
            },
            data: data
        };
        await axios.request(config);
    }
    catch (error) {
        throw error;
    }
}
export async function getAvailableCredits() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imagineCount',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '1293031729177674722',
                'x-xsrf-token': '91591d0d-db4b-4e44-9157-ead729910e87',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; sca=0c24b11f; xlly_s=1;_ga_Z4KVB8RMTT=GS2.1.s1775561641$o45$g1$t1775562514$j42$l0$h0; cnaui=1293031729177674722; aui=1293031729177674722; atpsida=300d0aaf90c489f2ec91de63_1775562544_6; tfstk=gNpZdJaveAHNGr0k43XqTFinvcXOMtu7bK_fmnxcfNbiWswV33LPiPG9cBPD5UA15Ov29--JDdiOhcB9XtBmP4MWuhKOHwdQScJNKMjcbxZgnX6ntIOPz4MSFhcGXttnPC_Jb6SVmtjGSt4nYis0jiYcsvXhJiI0Si2iYHbd-PVgn-D3xij8ItXDoHmFDwjGnsYDxDSA-Zcm4Zb7Lg5ib6UGzWGDQ17kjwyyypsiLakRR-2DLG-FrhVYn-vFb1JE2V3IW1OD2_p6qxydC3RhKiJxqS7VaIv1Kd0nE6CDKejH5mNAYI-DeOBzmAxFQN5kK1EbCUxemQ1ed0DRQObMGOKb4VteQFt9LnZ0tOW6T_JNEYUGlBty3iJxkv8ym3dcTKzN4FUAx6PkHCz0g1jdYaiEYvxcP0Q_8mBUMSC99M7SXcFYM1jdYaiEYSFA69IFPcnO.; isg=BBkZJAItlFyIaEnGh8iXcXhHKAXzpg1Y3AUPZDvOAcC_QjrUgPOCKOUURB40eqWQ; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function callCountApi() {
    try {
        while (isUserLoggedIn) {
            let data = JSON.stringify({});
            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: 'https://create.wan.video/wanx/api/common/task/progress/count',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9',
                    'bx-v': '2.5.36',
                    'content-type': 'application/json',
                    'origin': 'https://create.wan.video',
                    'priority': 'u=1, i',
                    'referer': 'https://create.wan.video/generate',
                    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                    'x-platform': 'web',
                    'x-wan-uid': '5857469546000430138',
                    'x-xsrf-token': '0d2dcbd1-a2aa-414d-b6bc-081f5aa0ec4c',
                    'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; sca=0c24b11f; xlly_s=1; cnaui=5857469546000430138; aui=5857469546000430138; _ga_Z4KVB8RMTT=GS2.1.s1775571800$o46$g1$t1775572374$j60$l0$h0; atpsida=6320e525b10888f277407f0e_1775572404_8; tfstk=gLJs3M0kSP4_DMntkPoUAKoEY96X6Dkr1osvqneaDOBOlsLyl-RwDRWXGwtybKoGQeaXzeRN0fb4hlvBP-yZSfxYhtWxz4krUhmGnt3PRlE975jP2lH46RBGpzcqKCMrUhxTbGnyvYRaU5Sf0ZBA6NKLvwj4WRLA6kUd-ijYWietAHQhJGEOXsCL9gjYHrLAHDtd-iBAXECtAHQhDtQxN2gCxf_9fm3T2ssuObKfR-evdMnGyhMbFGJdf9_JXpJD3pwh1aKOR-3s3Dxllwv-8XtHkCLNxEMSRTdkRK1RhAalfBK5pNW-NW66YFv5BLg_QM5f5BpOOoevf9bG9ITs55b9_e1lv6EjEM8PJhv9Om4pXU71BMCEe0tdMBJGZduLCTdkbORvy2PNWQsA4ZePPXT3Gk1uhM_rADN0ii0An2uwlr1f6MjeUDiQ5SfOxM_rADN0i1IhY_oIAPNc.; isg=BOPj8-wwjh-3rkMkKca98_4xcieN2HcamvOFxhVCk8KYVAJ2naoiaqDKTjzadM8S; ' + authHeaders
                },
                data: data
            };
            await axios.request(config);
            console.log("Count API executed in interval");
            await sleep(2000);
        }
    }
    catch {
        console.log("Count API failed.");
    }
}
async function generateBatchCdnForAudio(key) {
    try {
        let data = JSON.stringify({
            "ossPathList": [
                key
            ]
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/oss/generateBatchCdn',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': '3ed33a87-93bf-4140-970c-8eddfe96b18b',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; sca=8fc5c674; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=22a8abb325d4e1e370e4505c_1776234458_7; _ga_Z4KVB8RMTT=GS2.1.s1776233401$o54$g1$t1776234427$j55$l0$h0; tfstk=go1tKcNP_kqMzfFQ2f2hiilXmhzHa8AN7djsijADjJspAi8cIR-mM9Q5DKvXoOYxMMtFDKzwmntAmZ6g-7Vl7NR2GIEuZ7fZcFzADFOX5eaXkF3_-dMXtX22Guqutv0BQlAfSkJjBp_BYEh65jsXOwTMrITX5IapAELrhcsXGyUpyFg6lE9XRHTWAnOXGi_QJExB5IOfcwapujuqWn06DjBIiVYNbXP_mofpWdKxIHGviZlkc3_6vjZfNFneVNtKGjtSrJ5GJNqtawANGgLljWGO2Z_PhpCxAuKV9w11hwoTRQQdKTvOplGvx1YvFI9Klj_p9HJlGQNSveWCSt1NXqhX71fkH3JLljJDO_v5FG34zwO6liJPiulwfZ_PaTA8608Odadd4w1lwql-q3LmCyUK3xJ68Qp36Sg6ALVvJ34nKxk2Ke8pqyUK3xJ68eKu-WDq3pYF.; isg=BLCxvrb9rWxU1HBtdke-etnggX4C-ZRDjuXcTqoeP4veZWkPUw160i0bvXUFckwb; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function extractAuthHeader(headers, cookies) {
    let universalHeaders = "";
    for (let cookie of cookies) {
        for (let header of headers) {
            const regex = new RegExp(`${header}=([^;]+)`);
            const match = cookie.match(regex);
            // const impIds = match ? match[1] : null;
            if (match) {
                universalHeaders += `${header}=${match[1]}; `;
            }
        }
    }
    return universalHeaders.slice(0, -1);
}
export async function generateVideosForRefrenceImage(requestModel) {
    let requestJson = {
        "deductMode": "credit_mode",
        "taskType": "cast_to_video",
        "taskInput": {
            "subType": "basic",
            "modelVersion": "2_7",
            "prompt": requestModel.prompt,
            "promptMeta": {
                "originPrompt": "",
                "orderedKeys": [],
                "refs": {}
            },
            "generationMode": "imaginative",
            "selectedResolution": "720P",
            "ratio": videoResolution,
            "duration": 5,
            "multiShots": "single",
            "reference": {
                "type": "ref-element",
                "refElementIds": []
            },
            "elements": {}
        }
    };
    let originPrompt = requestJson.taskInput.prompt;
    for (const refImages of refrenceImageList.filter(img => requestJson.taskInput.prompt.includes(img.imageAlias))) {
        originPrompt = await replaceString(originPrompt, refImages.imageAlias, `@{${refImages.imageId}}`);
        // requestJson.taskInput.prompt.replace(new RegExp(refImages.imageAlias, "g"), `@{${refImages.imageId}}`);
        requestJson.taskInput.promptMeta.orderedKeys.push(refImages.imageId);
        requestJson.taskInput.promptMeta.refs[refImages.imageId] = {
            "type": "ref-element",
            "payload": {
                "id": refImages.imageId
            }
        };
        requestJson.taskInput.reference.refElementIds.push(refImages.imageId);
        requestJson.taskInput.elements[refImages.imageId] = {
            "type": "image",
            "payload": {
                "key": refImages.imageId,
                "originImage": refImages.imageUrl,
                "resultImage": refImages.imageUrl,
                "objOrBg": "obj",
                "placePoint": {
                    "top": 0,
                    "left": 0,
                    "width": refImages.width,
                    "height": refImages.height
                },
                "name": refImages.imageName,
                "title": refImages.imageAlias.replace("@", ""),
                "fieldName": "multipleAssets",
                "refImageResolution": `${refImages.width}*${refImages.height}`
            }
        };
    }
    requestJson.taskInput.promptMeta.originPrompt = originPrompt;
    console.log(JSON.parse(JSON.stringify(requestJson)));
    let data = JSON.stringify(requestJson);
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://create.wan.video/wanx/api/common/imageGen',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'bx-ua': '231!xJR3HkmUt80+j3o4Ok74NEAoUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZfxiCX9Yo2rvNZL/q6VD620bvis1zrAuLZsaS42oTyapmOlNf/VUqwRb/NZY4SIBwrblnZZmBnWnpK6eZbTzyhRkW+TxDjE72XNwQG81iZSge9fEJrRs9b6q6AIrkv3AOiqF3nLfw0yTA1TJp2W+VyBUHyCnsL2CMQDCpwiqYTtQmoXdPW9qcVAlo3zrPGubs0oJk4MpKlxhseQoeWLhPIIXypaMguM3kmr0Q3oyE+jauHhUYuK3IUGHkE+++3+qCS4+ItUVkVPqmtso+ro2PjULfFNI2Ss5iwH+2Q772Yjb+i03O9NjgTcCaIAgmifB4SvsxvUHHrrcRDW2yrynuLuyqSh4qFBSZh1+cyLgJY5uMFyGDoHrUd6w9QFt8BO8iwquaD433j7JtguzRb/n2j5IYNyVd7KOjl9fHrdyr+pbWKLjxDr7ib9b2lGlBcIKfQj8bj56d9itnb/TY8NmCFeOdZ5117VH0y495iaQxMxRia2xQvxr6kAYaX03gUNcoWK3ZffJ5IBY1udEgpSE2jYXgLsVSZaKC/GEM4iU/gtVbTAzVza7fFwFQAgRjKIlRmAdhe7f4vPT1Jq1f8dY6PFwTFhzoAQZsqL5pQPrDoC7kQDoo9mbRdA8dgRf2rx+IhqAO+f45l6z3Wi4tWY4ZAoScTVVPw2poV3rgj8KCe94cHBpvk37h7PZMHosvRoFX3Nv0WboQ0hREpBbGEkULj3CAloW7vPARo9mzMn9rIcwJZbZNN9A8ywM8CskK5zqusN/5tYvCTrOuoYErAktu49u84+KdJGIBYCz7fwA0psKTWCOyNHkGtS3qxoHxnaZ1NRI6qf40Zi+JHKd3UpTP+9f7udoiyMd0tGjhzUPhROmYFPKWZTU7JfwotwWzPt4oSwuri1WW9i6Q+8dP78PR/bGqsZn4zKd24h5f3zFXuEaGXNIVeanxubWl+oT8zSJjE3EulRh0eMhHfAeyyrtUGmvrZc81YjdFz+SJsrCU27uk521PTJLoPTCLAUERh2JxUAhC/8Tg9cqHiiaQ+i35zkw04FCGSTU0SObgD8BqOz3jfWUP1oE7N68mgB4SAEFAEvJPXLLZgiMxoN3s5Eop3APXJUasC+jFROfDrCBS247mtAHimpo34W3k8g+qAFXmHvA6uq7+jBiO4sJnXHX9r1Ftq6ZAcjvFHSmhOzl8LIfDj8D8G6FJy+5qXxPV77R4EOx04CybMpR3FNVOdmw3OC+dI4eOn5CxM1HJUWSzF9onKjSkiFiDwbyFgV5yfDULYR53j6hABs0iliAaomx85OqAO8HLw+t3GglVHdyXw6+m/UF9hIwY7tDm2YUA6+d+G7mvdmNNsNefAT73hQENctp1hhUVL7WFyRKMAW9+MMoKErQ3rHMFtV5oyTmjdoJ/UCjLrfg6vHACQdjuKftbEp60u6SffssL73CzKuADIXkKJWSLiblvfG/ebq8wWHccPIwlyIS3aO3+FlmUJoI4YiUPfPw6SU097eoGGvnc5M/QomLIUxuI6QDyB3JwBAOuR9Pc59MNz3SXfHVLOMxqZyPa9BKnhBsM2ygzNnM41Fmc4wsfw7Dxex8Pe5pdVFNf4feLbHlaJAJ6cZaow2K8KrgT++r/w3L6hhBd4I',
            'bx-umidtoken': 'T2gAVAqEe6hx6-eQihUKeF11Eif2vK4surlz8LpVue4p28NrVbzXT5wUJY5WJIKQnwc=',
            'bx-v': '2.5.36',
            'content-type': 'application/json',
            'origin': 'https://create.wan.video',
            'priority': 'u=1, i',
            'referer': 'https://create.wan.video/generate/video/reference?model=wan2.7',
            'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            'x-platform': 'web',
            'x-wan-uid': '5546448818118663755',
            'x-xsrf-token': 'ed0c6447-6450-40d2-99d3-3dc1396a0707',
            'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; cnaui=5546448818118663755; aui=5546448818118663755; j_s_1239037570=VzJO6sJzoWKcL%2BZEoGR9r7D2f7Q1eORzfCizeGnNjWL1DP4AoGR9RZeLQce4xSrNB0J16WeOose1ROycDALZB0JcjPEZjNR9ROJ36PEC6OrK6PKPvWSnvLmnwxMzG%3DZp7c4er%2BLB7zbcGStRV%2By3G4tv5P6m7P4n7PKAvx4UQ7cbRNnNw%2Bb160R9RXtc6%3DU1fNMlj2UZjNS1oWmEoPglhX4YBX4YwsUtVGKOjPclhsUyBPbnoWTlDXZ1wSbOj%2BZZjAQNIQdd; sca=96ba3dd2; atpsida=c21954a23a2ed6a7a93a307b_1779459019_3; _ga_Z4KVB8RMTT=GS2.1.s1779459002$o68$g1$t1779459035$j27$l0$h0; tfstk=gOkIqvYm-wbBbG-pyw-Nc8XnzD2WRhJ49gZ-m0BF2JeLP73qPTlE29ySNPiqYY-3LV_SuVlU4B4PFVijRYlULJFRFqgb4Xoy-TsnCq6PLeAn2TwzeE823KoHx82JuGJQMdS34u6ReazRXPezVvfEQcnnx8jGbadq6DA7Z42VpuUJfRE84weR9Wn9fuZby8ULwNCT2PU8e4Fd6cE4muU8J6F9fu4Ty8e-yRK_4PU8e83-Xj7X5lAQJDtkwI1rFKXZYP6ReAZ9xriBb9rjLkM8lDHMYH-uAWaxvPTI0O4460VSEgX7MDhmro3dJUaoCcHKMqLNTyhbVmlSvpBTLvmKM7Hvr_3bd4Nxp5sRHD23PRZtH3507AaEyvN90tNzBxPYpfRM87yQc4HnRg6-kcoqK5DWlNUoTo2TVYxANzNR4ZW4lCgGNGNcFla2fh1lZfQaMF3h-HW_9lqZ3ht1R_VLjla2fh1lZWEgbS-6fw1l.; isg=BA4OyoJB6Gl3L16HRHE4AKu-X-TQj9KJoIKv5zhSbpGom6n1oRtamFcd09_3hcqh; ' + authHeaders
        },
        data: data
    };
    let response = await axios.request(config);
    return response.data;
    // return {} as any;
}
export async function generateRefrenceVideoWithFirstFrame(requestModel, startImageDetails) {
    let requestJson = {
        "deductMode": "credit_mode",
        "taskType": "cast_to_video",
        "taskInput": {
            "subType": "basic",
            "modelVersion": "2_7",
            "prompt": requestModel.prompt,
            "promptMeta": {
                "originPrompt": "",
                "orderedKeys": [],
                "refs": {}
            },
            "generationMode": "imaginative",
            "selectedResolution": "720P",
            "duration": 5,
            "multiShots": "single",
            "reference": {
                "type": "ref-element",
                "refElementIds": []
            },
            "elements": {},
            "firstFrame": {
                "type": "ref-element",
                "refElementId": startImageDetails.imageId
            }
        }
    };
    let originPrompt = requestJson.taskInput.prompt;
    for (const refImages of refrenceImageList.filter(img => requestJson.taskInput.prompt.includes(img.imageAlias))) {
        // requestJson.taskInput.promptMeta.originPrompt = requestJson.taskInput.prompt.replace(new RegExp(refImages.imageAlias, "g"), `@{${refImages.imageId}}`);
        originPrompt = await replaceString(originPrompt, refImages.imageAlias, `@{${refImages.imageId}}`);
        requestJson.taskInput.promptMeta.orderedKeys.push(refImages.imageId);
        requestJson.taskInput.promptMeta.refs[refImages.imageId] = {
            "type": "ref-element",
            "payload": {
                "id": refImages.imageId
            }
        };
        requestJson.taskInput.reference.refElementIds.push(refImages.imageId);
        requestJson.taskInput.elements[refImages.imageId] = {
            "type": "image",
            "payload": {
                "key": refImages.imageId,
                "originImage": refImages.imageUrl,
                "resultImage": refImages.imageUrl,
                "objOrBg": "obj",
                "placePoint": {
                    "top": 0,
                    "left": 0,
                    "width": refImages.width,
                    "height": refImages.height
                },
                "name": refImages.imageName,
                "title": refImages.imageAlias.replace("@", ""),
                "fieldName": "multipleAssets",
                "refImageResolution": `${refImages.width}*${refImages.height}`
            }
        };
    }
    requestJson.taskInput.promptMeta.originPrompt = originPrompt;
    //Start image details will be added as a separate element in the elements list and also as first frame reference. This is because even if user wants to generate video with first frame only, the image details should be present in the elements list to get the credit deduction and for better tracking of the asset used in generation.
    requestJson.taskInput.elements[startImageDetails.imageId] = {
        "type": "image",
        "payload": {
            "key": startImageDetails.imageId,
            "originImage": startImageDetails.imageUrl,
            "resultImage": startImageDetails.imageUrl,
            "objOrBg": "obj",
            "placePoint": {
                "top": 0,
                "left": 0,
                "width": startImageDetails.width,
                "height": startImageDetails.height
            },
            "name": startImageDetails.imageName,
            "title": "Image",
            "fieldName": "firstFrameImage",
            "refImageResolution": `${startImageDetails.width}*${startImageDetails.height}`
        }
    };
    let data = JSON.stringify(requestJson);
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://create.wan.video/wanx/api/common/imageGen',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'bx-ua': '231!4hB734mUXov+j7rvOk74NEAoUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZfxiCX9Yo2rvNZL/q6VD620bvis1zrAuLZsaS42oTyapmOlNf/VUqwRb/NZY4SIBwrblnZZmBnWnpK6eZbTzyhRkW+TxDjE72XNwQG81iZSge9fEJrRs9b6q6AIrkv3AOiqF3nLfw0yTA1TJp2W+VyBUHyCnsL2CMQDCpwiqYTtQmoXdPW9qcVAlo3zrPGubs0oJk4MpKlxhseQoeWLhPIIXypaMguM3kmr0Q3oyE+jauHhUYuK3IUGHkE+++3+qCS4+ItUf4VbBmVso+ro2PjULfFNI2Ss5iwH+2Q772Yjbjp6bheoxdBE8lzh2W6GBEi0krrpPdXN73jkHWZ+pdhFaoYqL6hqBLMDPmXpnXzgFxeujpB/nFKxcvOO488Jm1luA4k1p81Gkrx5iewwx8XbeIRb2Lx5vpsjVEdvyUNwA4ubY3njNggOZ2LHrKXF7h4rKuXvkKK7ddXSInxrkqH0wv05x/e2iIYB3xCnF1e/SBW02UUbaXDHbYhUk53cXQBN2yKUQVAQ8CdpfSQjHc4UFYX0dow/6Fc7A00joWmdu4vYVr7w8+Y8Cf4KHri65H0WXNxOI/XuJO1Ijl4WDxUmaODIn8gBiOBHfhgN7aR1NV4T5IUmWVzpciUQk3faDuIXY0DhkXdpTzwa5rY7srlLH9Nwnl9yycqjO7Meo+XfXDPA6NDDfBHtfpopi+nTVmr9x6aR3w2hdoA0jyKF00RuxaRjfjEa0QBhNgTDA2QkmGmmsL2SfqHa2bmklv0Xeq+zQ5HMmvmsGNiJCKv2JqfwA/m85ZrMoGjXxOv3XKDo3Sbd6tyVqUviB9KXIBkWGQX9yDS0LKvI7E3Xz3qh3CGPhPZOI8WMSg0B5XmYJYrT1AoNA2pUG58en9Z8bU6EOhtuEvlgqhi9Vq3BhY3d0f1G3K5WHtPaKpzHrY/OBZijppfUECOWtOEHM/BldB++dcAVq7VNRRjaS0jisOWtB95nbJKwcCAi7ZOeSvXAR6epVSS/J1dHrrWAfLil9+VpJSHAegsrFBOhLtOuoGJd4IJimAkobxBNYmOh3Yil7WRCzF4geEL0jToTie0mUWnGLJqIq/VMfsE7iqOmkaOqREixKciUA1NY6D6z+8sCoaWyHFiLNy8MIEe7tT16av3OtRwynAOzT8M3n2akkQlQBTrffdEI/TjftyjqavG9AFt0z1qIz6SajK9cjkRWk2dB4ca4jCzB9KGWei+MLwtwhDTAILpOthtTMvMmKnLOG4alzBtOtSWwkNRvS7JfbgM2KNCtEqYdDBz7Y4z5tEBlF2ey5cXWgBymZ5/T8CqlgH+WiORyfbpBO6WQiVCmPEwCrWAvB/RGbdfe6K76zCEkTjmK+AYiheOf9OK76OOKQ8cIspcd+R8uysaOZwMRi3ly1R4pUKlhBw6dF2eboFnAp2BDb93tnv/lIubW5vyXCPmZBJQjBiNIxzhaZG9g+aT1nJDy9FAJ8UrKlw2nU3O2bkyHyx2xSgx4KkdywRUnRhbLZpxZ0p0B+STN9c18cFAj5Tdv2wFT6j2shPQYDQj/HonvCkYnVHzzh9k64i1BO0vjJ8qBN70hP76PNp26kskaAQGuvvf44I9ze45iYw54oB+F9IAS4WsMquib9gLujYhvR8FEaweukep/5njsy5vnn+==',
            'bx-umidtoken': 'T2gAVAqEe6hx6-eQihUKeF11Eif2vK4surlz8LpVue4p28NrVbzXT5wUJY5WJIKQnwc=',
            'bx-v': '2.5.36',
            'content-type': 'application/json',
            'origin': 'https://create.wan.video',
            'priority': 'u=1, i',
            'referer': 'https://create.wan.video/generate/video/reference?model=wan2.7',
            'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            'x-platform': 'web',
            'x-wan-uid': '5546448818118663755',
            'x-xsrf-token': 'ed0c6447-6450-40d2-99d3-3dc1396a0707',
            'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; xlly_s=1; cnaui=5546448818118663755; aui=5546448818118663755; j_s_1239037570=VzJO6sJzoWKcL%2BZEoGR9r7D2f7Q1eORzfCizeGnNjWL1DP4AoGR9RZeLQce4xSrNB0J16WeOose1ROycDALZB0JcjPEZjNR9ROJ36PEC6OrK6PKPvWSnvLmnwxMzG%3DZp7c4er%2BLB7zbcGStRV%2By3G4tv5P6m7P4n7PKAvx4UQ7cbRNnNw%2Bb160R9RXtc6%3DU1fNMlj2UZjNS1oWmEoPglhX4YBX4YwsUtVGKOjPclhsUyBPbnoWTlDXZ1wSbOj%2BZZjAQNIQdd; sca=96ba3dd2; atpsida=c21954a23a2ed6a7a93a307b_1779459019_3; _ga_Z4KVB8RMTT=GS2.1.s1779459002$o68$g1$t1779459035$j27$l0$h0; tfstk=gYbo41Yohg-7RvM4Sv87mMSun2EvpUTp8QWpppCeLQvXUaKLNeAFBKH8N6CEYyX1ILpPy7sn-6XnJgLy9yAhBt9y97NI-HWOHaIR-6gHT6WQNpF7D_1WReyTB94ON_GJcCl5-38q0BCq8DJUDEJf6At4BPUOauRWJsyOveD3pBRt8e-yUnk2hQAEY9-EusJXOBkyTLPcgK92aD8eax-2OBGyT98UisJXTeRPL3PcgKOe8pl5ouJ58Z74CavnCGYua6Akqd5yU9BRuR8jVTv0pJ_cVbJGaDgE8ZAkqZ2_hmiJ2M56faCa-qTRsi82twNZxpxGYaLVz-zwcH7V3IW89DOcx676PFcUzsYkEh72VX3RQsfFXnbY_PTkzLSpP6hgesble__c9Xo2rUIDjaYa5YJdD1bHtwwQoOfF1M-c-Yjrzmowaq0BgWQqADtyGIvtZLzRnqFfQqP0icPB4IOWBSVmADtyGIvTiSmaR3RXNdC..; isg=BKCgjKAn3vOx5mA95heOqqmwca5yqYRzYlzx_Rq6crvRFVE_yr3dAqZjraWVojxL; ' + authHeaders
        },
        data: data
    };
    let response = await axios.request(config);
    return response.data;
}
