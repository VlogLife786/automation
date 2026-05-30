import fspromise from 'fs/promises';
import fs from 'fs';
import { searchOnChatGpt } from './chatgpt.js';
import { createFolderIfNotExist, deleteAllFiles, deleteFilesEndingWith, downloadVideoByLink, extractJSON, extractLastFrameOfDownloadedVideo, globalVars, mergeVideos, normalizeVideo, saveFile, sleep } from './utility.js';
import { imageSize } from 'image-size';
import { getRestResponse } from './restTemplate.js';
import { ApiURLs } from './constants.js';
import { GenerateWANAiVideosByApi } from './generate-wan-videos-api.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);
export let refrenceImageList = [];
export let refrenceStartFrame = {};
export let videoResolution = "16:9";
let allVideoSequences = [];
export async function generateScene() {
    // Your scene generation logic here
    try {
        let refrenceVideoPromptScenes = globalVars.useExistingResponse ?
            await (async () => {
                await generatePromptForScene();
                return JSON.parse(await fspromise.readFile('input/chatgpt-response.json', 'utf8'));
            })() :
            await generateScenesFromChatGpt();
        await saveFile("input/chatgpt-response.json", JSON.stringify(refrenceVideoPromptScenes, null, 2));
        for (const scene of refrenceVideoPromptScenes.scene_sequence) {
            await sleep(5000);
            console.log(`Generating video for scene ${scene.scene_id} with prompt: ${scene.prompt}`);
            let startImageName = "";
            let creds = await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=getAvailableUserByCreds&credit=${globalVars.videoDuration * 2}`);
            if (creds && creds.status == 'failure') {
                throw Error("No available user found with sufficient credits to generate video.");
            }
            await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateUserStatus&rowNumber=${creds.message.rowNumber}&status=${encodeURIComponent("Not Available")}`);
            if (scene.reference_previous_video_last_frame) {
                await extractLastFrameOfDownloadedVideo(`input/assets/output-videos/${scene.scene_id - 1}.mp4`, `temp/images/scene-${scene.scene_id - 1}-last-frame.jpg`);
                startImageName = `scene-${scene.scene_id - 1}-last-frame.jpg`;
            }
            console.log(creds);
            const videoUrl = await GenerateWANAiVideosByApi({
                rowNumber: creds.message.rowNumber,
                emailToSendVideo: creds.message.email,
                loginEmail: creds.message.email,
                loginPassword: creds.message.password,
                prompt: scene.prompt,
                videoTitle: "This is the GPT video",
                webhookUrl: "",
                startImageName: startImageName,
                audioFileName: "",
                refrenceImageList: scene.prompt.includes('@Image') ? refrenceImageList : [],
                sendEmail: false
            });
            console.log("Generated video URL:", videoUrl);
            await createFolderIfNotExist("input/assets/output-videos");
            await downloadVideoByLink(videoUrl, `input/assets/output-videos/${scene.scene_id}.mp4`);
            allVideoSequences.push(`input/assets/output-videos/${scene.scene_id}.mp4`);
        }
        console.log("All video sequences generated, Now merging the videos");
        allVideoSequences.forEach(async (element, index) => {
            await normalizeVideo(element, `input/assets/output-videos/${index + 1}-normalized.mp4`);
            allVideoSequences[index] = `input/assets/output-videos/${index + 1}-normalized.mp4`;
        });
        await mergeVideos(allVideoSequences, "merged-video.mp4", "input/assets/output-videos");
        await deleteAllFiles("input/assets/output-videos");
        await deleteFilesEndingWith("temp/images", "-last-frame.jpg");
    }
    catch (error) {
        console.error('Error occurred while generating scene:', error?.message ?? error);
    }
}
async function generatePromptForScene() {
    refrenceImageList = JSON.parse(await fspromise.readFile('input/refrence-details.json', 'utf8'));
    if (refrenceImageList && refrenceImageList.length > 5) {
        throw Error("Refrence images are more than allowed, Please keep refrence image upto 5.");
    }
    let finalPrompt = refrenceImageList.length > 0 ? `Please find the list of reference images details below: 
    ` : ``;
    refrenceImageList.forEach(async (image, index) => {
        let imagePath = `temp/images/${image.imageName}`;
        image.imageAlias = `@Image${index + 1}`;
        image.imageId = crypto.randomUUID();
        image.imageFile = fs.createReadStream(imagePath);
        const buffer = fs.readFileSync(imagePath);
        const dimensions = imageSize(buffer);
        image.width = dimensions.width ?? 0;
        image.height = dimensions.height ?? 0;
        finalPrompt += `
${index + 1}. Image of ${image.originalName} has alias of ${image.imageAlias} is a ${image.imageType}.`;
    });
    // console.log(refrenceImageList);
    finalPrompt += `
Below are the story details:.

${await fspromise.readFile('input/text-prompt.txt', 'utf8')}
`;
    // console.log(finalPrompt);
    return finalPrompt;
}
async function generateScenesFromChatGpt() {
    let videoGenerationStory = await generatePromptForScene();
    const instructionPrompt = `${await fspromise.readFile('input/scene-generation-instructions.txt', 'utf8')}

${await fspromise.readFile('input/input-schema.json', 'utf8')}`;
    await searchOnChatGpt(instructionPrompt, [], 5, false);
    let chatgptResponse = await searchOnChatGpt(videoGenerationStory, [], 5, true);
    return extractJSON(chatgptResponse);
}
(async () => {
    await generateScene();
})();
