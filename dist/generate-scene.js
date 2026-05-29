import fspromise from 'fs/promises';
import fs from 'fs';
import { searchOnChatGpt } from './chatgpt.js';
import { createFolderIfNotExist, deleteAllFiles, deleteFilesEndingWith, downloadVideoByLink, extractJSON, extractLastFrameOfDownloadedVideo, mergeVideos, normalizeVideo, saveFile } from './utility.js';
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
        let textPrompt = await generatePromptForScene();
        let chatgptResponse = await searchOnChatGpt(textPrompt);
        let refrenceVideoPromptScenes = extractJSON(chatgptResponse);
        await saveFile("input/chatgpt-response.json", JSON.stringify(refrenceVideoPromptScenes, null, 2));
        // let refrenceVideoPromptScenes = {
        //     "title": "Royal Walk in the Garden",
        //     "characters": {
        //         "char_1": {
        //             "name": "@Image1",
        //             "appearance": "A regal warrior king with a strong build, sharp eyes, traditional royal attire with intricate golden embroidery, saffron turban, layered pearl necklaces, metal arm guards, royal sword at the waist, confident and calm expression"
        //         },
        //         "char_2": {
        //             "name": "@Image2",
        //             "appearance": "A majestic elephant with large curved tusks, decorated royal forehead ornaments, silk fabric draped across the back, calm demeanor, slow graceful movement"
        //         }
        //     },
        //     "global_style": {
        //         "genre": "Historical cinematic drama",
        //         "camera": "Smooth cinematic tracking shots with slow dolly movement, occasional aerial view, shallow depth of field, anamorphic lens look",
        //         "lighting": "Golden hour sunlight with soft warm highlights, realistic shadows, atmospheric volumetric light through trees",
        //         "quality": "Ultra realistic, highly detailed, cinematic film quality, 4K HDR",
        //         "aspect_ratio": "16:9",
        //         "fps": 24
        //     },
        //     "scene_sequence": [
        //         {
        //             "scene_id": 1,
        //             "duration": "5s",
        //             "prompt": "Wide cinematic establishing shot of @Image3 during golden hour. @Image1 slowly walks along a stone pathway beside @Image2. Trees sway gently in the breeze, flower petals move naturally, sunlight filters through leaves creating cinematic volumetric rays. Camera performs a slow forward tracking shot from a low angle, emphasizing royal presence and scale. Realistic walking animation synchronized between @Image1 and @Image2, ultra detailed environment, soft depth of field, atmospheric cinematic mood.",
        //             "transition_to_next": "Continue the forward walking motion seamlessly while the camera slowly moves closer to the characters for a medium tracking shot.",
        //             "reference_previous_video_last_frame": false
        //         },
        //         {
        //             "scene_id": 2,
        //             "duration": "5s",
        //             "prompt": "Reference the final frame from the previous scene for exact character positioning and walking continuity. Medium cinematic tracking shot from the side showing @Image1 walking confidently beside @Image2 through @Image3. The elephant gently swings its trunk while walking naturally. Warm sunlight reflects from the royal attire and elephant ornaments. Camera smoothly tracks parallel to the movement with subtle handheld stabilization for realism. Background flowers and trees move consistently with the breeze. Cinematic shallow depth of field, highly realistic textures, seamless motion continuity.",
        //             "transition_to_next": "Camera slowly arcs around toward the front of the characters while maintaining continuous walking motion and environmental consistency.",
        //             "reference_previous_video_last_frame": true
        //         },
        //         {
        //             "scene_id": 3,
        //             "duration": "5s",
        //             "prompt": "Reference the final frame from the previous scene to maintain seamless continuity. Front-facing cinematic shot of @Image1 and @Image2 walking toward the camera inside @Image3. Camera performs a smooth backward dolly movement while maintaining stable framing. Golden sunlight creates dramatic rim lighting around the characters. Dust particles and flower petals float naturally in the air. The elephant walks calmly beside @Image1 with synchronized pacing. Cinematic realism, soft lens flares, detailed facial expressions, atmospheric depth, epic historical mood.",
        //             "transition_to_next": "Fade naturally into the continuing forward walk with the camera lifting slightly upward for a cinematic closing perspective.",
        //             "reference_previous_video_last_frame": true
        //         },
        //         {
        //             "scene_id": 4,
        //             "duration": "5s",
        //             "prompt": "Reference the final frame from the previous scene for seamless positioning and movement continuity. Cinematic semi-aerial closing shot of @Image1 and @Image2 continuing their walk through @Image3 as the camera slowly rises upward and backward. Long shadows stretch across the pathway under warm sunset lighting. Trees and flowers create a majestic royal atmosphere. Smooth continuous movement, realistic environmental animation, cinematic color grading, ultra detailed textures, epic historical finale with elegant pacing.",
        //             "transition_to_next": "End with a slow cinematic fade out while maintaining the walking direction and lighting consistency.",
        //             "reference_previous_video_last_frame": true
        //         }
        //     ]
        // }
        for (const scene of refrenceVideoPromptScenes.scene_sequence) {
            console.log(`Generating video for scene ${scene.scene_id} with prompt: ${scene.prompt}`);
            let startImageName = "";
            let creds = await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=getAvailableUser`);
            await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateUserStatus&rowNumber=${creds.message.rowNumber}&status=Not Available`);
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
    let finalPrompt = `I have some reference images details below: 
    `;
    refrenceImageList = JSON.parse(await fspromise.readFile('input/refrence-details.json', 'utf8'));
    if (refrenceImageList && refrenceImageList.length > 5) {
        throw Error("Refrence images are more than allowed, Please keep refrence image upto 5.");
    }
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
${index + 1}. Image of ${image.originalName} has alias of ${image.imageAlias} is a ${image.imageType}.
`;
    });
    // console.log(refrenceImageList);
    const schemaJson = await fspromise.readFile('input/input-schema.json', 'utf8');
    const inputPrompt = (await fspromise.readFile('input/text-prompt.txt', 'utf8')).replace(/\r?\n|\r/g, ' ') // replace line breaks with space
        .replace(/\s+/g, ' ') // collapse multiple spaces/tabs
        .trim();
    finalPrompt += `
Read, Analyze and understand the below context and give me a video generation prompt in json format for below story for WAN AI:

${inputPrompt}

Keep the below points in mind while creating the prompt json: 
1. Use the alias name of image in the prompt instead of their original name only for character refrence, But in dialouge use original name.
2. As my AI video generator generates video for 5 seconds at a time create scenes in such a way so that the final output will be look like a single continuous video without distortion and narrates the full story.
3. You can add the camera angle and lighting details in the prompt if not already mentioned in the scenes to make the video more cinematic.
4. Make sure to add the reference of previous video last frame in the prompt for the next scene if needed to make the video more continuous and cinematic.
5. Don't add any backgroud music details in the prompt of any scenes as I will be adding it later manually, focus on creating cinematic video with perfect camera angles and lighting to make the video more engaging.

Provide me json output in the below format strictly without any changes:

${JSON.stringify(JSON.parse(schemaJson), null, 2)}
`;
    // console.log(finalPrompt);
    return finalPrompt;
}
// (async () => {
//     await generateScene();
// })();
