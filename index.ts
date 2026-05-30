import nodeCron from "node-cron";
import express from 'express';
import { globalVars, sleep } from "./utility.js";
import { ApiURLs, Configs, Constant, EnvConstants } from "./constants.js";
import { startProcessOfAccountLogin } from "./login.js";
import { constants } from "buffer";
import { registerToDremaniaAi } from "./dremaniaRegister.js";
import { GenerateWANAiVideos } from "./generate-wan-ai-video.js";
import { GenerateWANAiVideosByApi } from "./generate-wan-videos-api.js";
import multer from "multer";
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { error } from "console";
import { startProcessOfAccountCreation } from "./wan-ai-registration.js";
import { claimDailyCredits } from "./claim-wan-ai-credits.js";
import { getRestResponse } from "./restTemplate.js";

// const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
// let isJobInProgress: boolean = false;

const app = express();
app.use(express.json());
const queue: (() => Promise<void>)[] = [];
let running = false;

// Store files in a temporary folder inside container
const upload = multer({
    dest: Configs.UPLOADED_IMAGE_DIR, // auto-created, temporary
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});



// Store audio files in a temporary folder inside container
const uploadAudio = multer({
    dest: Configs.UPLOADED_AUDIO_DIR, // auto-created, temporary
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['audio/mpeg', 'audio/wav'];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});


app.get('/', (req, res) => res.send('Puppeteer API running!'));

app.post('/generate/video', async (req, res) => {
    const { userEmail, userPassword, textPrompt, emailToSendVideo, rowNumber, webhookUrl, videoTitle, startImageName, audioFileName } = req.body;
    if (!userEmail || !userPassword || !textPrompt || !emailToSendVideo || !webhookUrl || !videoTitle) return res.status(400).send({ error: 'Missing important details.' });

    try {
        queue.push(async () => {
            await GenerateWANAiVideosByApi({
                rowNumber: rowNumber,
                emailToSendVideo: emailToSendVideo,
                loginEmail: userEmail,
                loginPassword: userPassword,
                prompt: textPrompt,
                videoTitle: videoTitle,
                webhookUrl: webhookUrl,
                startImageName: startImageName,
                audioFileName: audioFileName,
                refrenceImageList: [],
                sendEmail: true
            });
        });

        runNext();

        res.json({ success: true, message: "Task execution is in progress." });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: 'Failed to schedule task videos' });
    }
});


// app.post('/chatgpt/text-to-text', async (req, res) => {
//     const { textPrompt } = req.body;

//     try {

//         // let response = await chatgptPrompt(textPrompt);
//         res.json({ success: true, message: "response" });
//     } catch (err: any) {
//         console.error(err);
//         res.status(500).send({ success: false, error: err?.message });
//     }
// });



app.post(
    '/upload-image',
    upload.single('file'),
    (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: false,
                    message: 'No file uploaded'
                });
            }

            console.log('Uploaded file:', req.file);

            res.json({
                status: true,
                message: 'Image uploaded successfully',
                fileName: req.file.filename,
            });
        } catch (error) {
            return res.status(400).json({
                status: false,
                message: 'No file uploaded',
                error: error
            });
        }
    }
);


app.post(
    '/upload-audio',
    uploadAudio.single('file'),
    (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: false,
                    message: 'No file uploaded'
                });
            }

            console.log('Uploaded file:', req.file);

            res.json({
                status: true,
                message: 'Audio uploaded successfully',
                fileName: req.file.filename,
            });
        } catch (error) {
            return res.status(400).json({
                status: false,
                message: 'No file uploaded',
                error: error
            });
        }
    }
);

app.delete('/delete-files', async (req, res) => {
    try {

        let response: any = {
            message: 'All files deleted',
        }
        let listOfFilesDirectory = [Configs.UPLOADED_IMAGE_DIR, Configs.UPLOADED_AUDIO_DIR];
        for (const fileDir of listOfFilesDirectory) {
            if (!fs.existsSync(fileDir)) {
                return res.status(404).json({ message: 'Folder not found' });
            }

            const files = await fs.promises.readdir(fileDir);

            if (files.length === 0) {
                continue;
            }

            await Promise.all(
                files.map((file) =>
                    fs.promises.unlink(path.join(fileDir, file))
                )
            );

            const parts = fileDir.split('/').filter(Boolean); // remove empty strings
            response[parts[parts.length - 1]] = files.length;
        }


        res.json(response);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Delete failed' });
    }
});

// (async () => {
//     await GenerateWANAiVideosByApi({
//         rowNumber: 4,
//         emailToSendVideo: "siddhesh@yopmail.com",
//         loginEmail: "capybara43671@mailshan.com",
//         loginPassword: "2gIYo9I2NZtd",
//         prompt: "A young fair boy walking slowly along a village path carrying a beautifully detailed Lord Ganesha idol on his head, holding it carefully with both hands, wearing traditional attire, calm and devotional expression. Cinematic 3D realistic animation, soft golden sunlight, gentle wind moving clothes, spiritual atmosphere. Drone shot from above slowly descending and circling, wide landscape view, smooth motion, ultra-detailed textures, realistic lighting, 4K quality.",
//         videoTitle: "River Dance Dream",
//         webhookUrl: "https://workflow-vhlk.onrender.com/webhook"

//     });
// })();


const runNext = async () => {
    if (running || queue.length === 0) return;

    console.log("New task found, Executing the task.");

    running = true;
    const task = queue.shift();
    if (task) {
        try {
            await task();
        } catch (err) {
            console.error('Task failed:', err);
        }
    }
    running = false;

    await sleep(10000);
    // Run the next task
    runNext();
};


const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {

    // console.log(
    // 'IST:',
    // new Date().toLocaleString('en-IN', {
    //   timeZone: 'Asia/Kolkata'
    // })
    //   );
    // await startProcessOfAccountCreation();
    // await chatgptPrompt();
    // await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=resetStatusOfClaimedCredit`);


    console.log(`Server running on port ${PORT}`)
}
);


// (async () => { await starterFunction(Constant.WAN_AI_GENERATE_VIDEO); })();

// async function starterFunction(action: string) {
//     switch (action) {
//         case Constant.ACTION_REGISTER:
//             await startProcessOfAccountCreation();
//             break;

//         case Constant.ACTION_LOGIN:
//             await startProcessOfAccountLogin();
//             break;

//         case Constant.DREMANIA_REGISTER:
//             await registerToDremaniaAi();
//             break;

//         // case Constant.WAN_AI_GENERATE_VIDEO:
//         //     await GenerateWANAiVideos("Boy Playing cricket on ground with ninja hattori",
//         //         "hornet14892@mailshan.com",
//         //         "rzIfsb6HAUWg"

//         //     );
//         //     break;

//         default:
//             console.log("Invalid action");
//             break;
//     }
// }

// nodeCron.schedule(EnvConstants.ENV_SCHEDULAR_TIME, async () => {
//     if (isJobInProgress) {
//         console.log("An ongoing process is going on, Hence skipping thisone on: " + new Date().toLocaleString());
//         return;
//     }

//     try {
//         isJobInProgress = true;
//         let listOfActions: string[] = EnvConstants.ENV_ACTION?.split(",") || [];

//         for (const action of listOfActions) {
//             await starterFunction(action);
//             await sleep(30000);
//         }
//     } catch (error) {
//         console.log("Somethig went wrong in job: " + error);
//     } finally {
//         isJobInProgress = false;
//     }
// }, { timezone: Constant.ASIA_KOLKATA_TIME_ZONE })





// nodeCron.schedule("*/5 * * * *", async () => {
//     console.log(`Checking for daily credits to claim at: ${new Intl.DateTimeFormat('en-IN', {
//         timeZone: 'Asia/Kolkata',
//         dateStyle: 'full',
//         timeStyle: 'long'
//     }).format(new Date())}`);
//     await claimDailyCredits();
// }, {
//     timezone: Constant.ASIA_KOLKATA_TIME_ZONE
// });

// nodeCron.schedule("0 0 * * *", async () => {
//     console.log(`Reseting status of all users for claiming daily credits at: ${new Intl.DateTimeFormat('en-IN', {
//         timeZone: Constant.ASIA_KOLKATA_TIME_ZONE,
//         dateStyle: 'full',
//         timeStyle: 'long'
//     }).format(new Date())}`);
//     await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=resetStatusOfClaimedCredit`);
// }, {
//     timezone: Constant.ASIA_KOLKATA_TIME_ZONE
// });