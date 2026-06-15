import fspromise from 'fs/promises';
import fs from 'fs';
import { ContinuousCinematicVideoSequence, RefrenceImageDetails, Scene } from './wan-video-object-models.js';
import { fileTypeFromFile } from 'file-type';
import { searchOnChatGpt } from './chatgpt.js';
import { createFolderIfNotExist, deleteAllFiles, deleteFilesEndingWith, downloadVideoByLink, extractJSON, extractLastFrameOfDownloadedVideo, globalVars, mergeVideos, normalizeVideo, saveFile, sleep } from './utility.js';
import { imageSize } from 'image-size';
import { getRestResponse } from './restTemplate.js';
import { ApiURLs } from './constants.js';
import { GenerateWANAiVideosByApi } from './generate-wan-videos-api.js';

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { GenerateWANAiVideos } from './generate-wan-ai-video.js';
import { searchOnGemini } from './gemini.js';


ffmpeg.setFfmpegPath(ffmpegPath!);
ffmpeg.setFfprobePath(ffprobe.path);

export let refrenceImageList: RefrenceImageDetails[] = [];
export let refrenceStartFrame: RefrenceImageDetails = {} as RefrenceImageDetails;
export let videoResolution = "16:9"
const geminiFinalTouchUpPrompt = [
    `I am seeing some scenes where the dialouges are too long and will not fit in single 5 second video, Can you create continuous multiple scenes for long dialouges.`,
    `Also there are some scenes where the action is performed and then the dialogue is said, Can you create continuous multiple scenes for such cases, where in first scene only action is performed and in second scene dialogue is said. Please make sure to keep the scene transition natural between such scenes.`,
    `Avoid using he/she/him/they/her in the prompt, Instead use the character's alias name which refer to the character, it will help in better video generation. Keep the sequence id sequencial and generate every scene prompt in scene sequence in detail.`]



export async function generateScene() {
    // Your scene generation logic here
    try {
        let refrenceVideoPromptScenes: ContinuousCinematicVideoSequence = globalVars.useExistingResponse ?
            await (async () => {
                refrenceImageList = JSON.parse(await fspromise.readFile('input/refrence-details.json', 'utf8'));
                return JSON.parse(await fspromise.readFile('input/chatgpt-response.json', 'utf8')) as ContinuousCinematicVideoSequence;
                // await generatePromptForScene();
            })() : globalVars.searchOnModel == "chatgpt" ?
                await generateScenesFromChatGpt() : await generateScenesFromGemini();

        if (refrenceVideoPromptScenes.scene_sequence.length > 0 && refrenceVideoPromptScenes.scene_sequence[0].scene_id == 1) {
            await saveFile("input/chatgpt-backup-response.json", JSON.stringify(refrenceVideoPromptScenes, null, 2));
        }

        await saveFile("input/chatgpt-response.json", JSON.stringify(refrenceVideoPromptScenes, null, 2));

        while (refrenceVideoPromptScenes.scene_sequence.length > 0) {
            let scene = refrenceVideoPromptScenes.scene_sequence[0];
            console.log("We started a new scene again...", scene.scene_id);

            let retryCount = 5;
            try {
                await generateSceneSequence(scene);
            } catch (error) {
                if (retryCount > 0) {
                    console.error(`Error generating video for scene ${scene.scene_id}. Retries left: ${retryCount}. Error:`, error);
                    retryCount--;
                    await generateSceneSequence(scene);
                }
                throw error; // Rethrow the error if all retries are exhausted
            }

            let tempScenes: ContinuousCinematicVideoSequence = JSON.parse(await fspromise.readFile('input/chatgpt-response.json', 'utf8')) as ContinuousCinematicVideoSequence;
            tempScenes.scene_sequence = tempScenes.scene_sequence.filter(s => s.scene_id != scene.scene_id);
            await saveFile("input/chatgpt-response.json", JSON.stringify(tempScenes, null, 2));
            refrenceVideoPromptScenes = tempScenes;
        }

        console.log("All video sequences generated, Now merging the videos");

        let files: string[] = await fspromise.readdir("input/assets/output-videos");

        let allVideoSequences = files
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(file => `input/assets/output-videos/${file}`);

        allVideoSequences = await Promise.all(allVideoSequences.map(async (element, index) => {
            await normalizeVideo(element, `input/assets/output-videos/${index + 1}-normalized.mp4`);
            return `input/assets/output-videos/${index + 1}-normalized.mp4`;
        }));

        await mergeVideos(allVideoSequences, "merged-video.mp4", "input/assets/output-videos");
        await deleteAllFiles("input/assets/output-videos");
        await deleteFilesEndingWith("temp/images", "-last-frame.jpg");

    } catch (error: any) {
        console.error('Error occurred while generating scene:', error?.message ?? error);
    }
}


async function generatePromptForScene() {
    refrenceImageList = JSON.parse(await fspromise.readFile('input/refrence-details.json', 'utf8'));

    // if (refrenceImageList && refrenceImageList.length > 5) {
    //     throw Error("Refrence images are more than allowed, Please keep refrence image upto 5.")
    // }

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
${index + 1}. Image of ${image.originalName} has alias of ${image.imageName} is a ${image.imageType}.`;
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

${await fspromise.readFile('input/input-schema.json', 'utf8')}`

    await saveFile('input/manual-text-prompt.txt', `${instructionPrompt}

-----------------------------------------------------------------------------------------------------------------

${videoGenerationStory}`);


    await searchOnChatGpt(instructionPrompt, [], 5, false);
    let chatgptResponse = await searchOnChatGpt(videoGenerationStory, [], 5, true);

    return extractJSON(chatgptResponse);
}



async function generateScenesFromGemini() {
    let videoGenerationStory = await generatePromptForScene();
    const instructionPrompt = `${await fspromise.readFile('input/scene-generation-instructions.txt', 'utf8')}

${await fspromise.readFile('input/input-schema.json', 'utf8')}`

    await saveFile('input/manual-text-prompt.txt', `${instructionPrompt}

-----------------------------------------------------------------------------------------------------------------

${videoGenerationStory}`);


    await searchOnGemini(instructionPrompt, [], 5, false);
    await searchOnGemini(videoGenerationStory, [], 5, false);
    for (const prompt of geminiFinalTouchUpPrompt.filter((p, index) => index < geminiFinalTouchUpPrompt.length - 1)) {
        await searchOnGemini(prompt, [], 5, false);
    }
    let geminiResponse = await searchOnGemini(geminiFinalTouchUpPrompt[geminiFinalTouchUpPrompt.length - 1], [], 5, true);

    return extractJSON(geminiResponse);
}


async function generateSceneSequence(scene: Scene) {
    await sleep(5000);

    console.log(`Generating video for scene ${scene.scene_id} with prompt: ${scene.prompt}`);

    let startImageName = "";

    let creds: any = await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=getAvailableUserByCreds&credit=${globalVars.videoDuration * 2}`);

    if (creds && creds.status == 'failure') {
        throw Error("No available user found with sufficient credits to generate video.");
    }

    await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateUserStatus&rowNumber=${creds.message.rowNumber}&status=${encodeURIComponent("Not Available")}`);

    if (scene.reference_previous_video_last_frame) {
        await extractLastFrameOfDownloadedVideo(`input/assets/output-videos/${scene.scene_id - 1}.mp4`, `temp/images/scene-${scene.scene_id - 1}-last-frame.jpg`);
        startImageName = `scene-${scene.scene_id - 1}-last-frame.jpg`;
    }

    console.log(creds);

    const videoUrl = await GenerateWANAiVideos({
        rowNumber: creds.message.rowNumber,
        emailToSendVideo: creds.message.email,
        loginEmail: creds.message.email,
        loginPassword: creds.message.password,
        prompt: scene.prompt,
        videoTitle: "This is the GPT video",
        webhookUrl: "",
        startImageName: startImageName,
        audioFileName: "",
        refrenceImageList: scene.prompt.includes('.png') ? refrenceImageList : [],
        sendEmail: false
    });

    console.log("Generated video URL:", videoUrl);
    await createFolderIfNotExist("input/assets/output-videos");
    await createFolderIfNotExist("input/assets/backup-clips");
    let downloadVideoRetryCount = 5;
    while (downloadVideoRetryCount > 0) {
        try {
            await downloadVideoByLink(videoUrl, `input/assets/output-videos/${scene.scene_id}.mp4`);
            break; // Break the loop if download is successful
        } catch (error) {
            downloadVideoRetryCount--;
            console.error(`Error downloading video (attempt ${5 - downloadVideoRetryCount}):`, error);
            await sleep(10000); // Wait before retrying
        }
    }
    while (downloadVideoRetryCount > 0) {
        try {
            await downloadVideoByLink(videoUrl, `input/assets/backup-clips/${scene.scene_id}.mp4`);
            break; // Break the loop if download is successful
        } catch (error) {
            downloadVideoRetryCount--;
            console.error(`Error downloading video (attempt ${5 - downloadVideoRetryCount}):`, error);
            await sleep(10000); // Wait before retrying
        }
    }
}


(async () => {
    await generateScene();
})();