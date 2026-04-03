import nodeCron from "node-cron";
import express from 'express';
import { sleep, startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant, EnvConstants } from "./constants.js";
import { startProcessOfAccountLogin } from "./login.js";
import { constants } from "buffer";
import { registerToDremaniaAi } from "./dremaniaRegister.js";
import { GenerateWANAiVideos } from "./generate-wan-ai-video.js";

// const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
let isJobInProgress: boolean = false;

const app = express();
app.use(express.json());
const queue: (() => Promise<void>)[] = [];
let running = false;

app.get('/', (req, res) => res.send('Puppeteer API running!'));

app.post('/generate/video', async (req, res) => {
    const { userEmail, userPassword, textPrompt } = req.body;
    if (!userEmail || !userPassword || !textPrompt) return res.status(400).send({ error: 'Missing important details.' });

    try {
        queue.push(async () => {
            await GenerateWANAiVideos(textPrompt,
                userEmail,
                userPassword
            );
        });

        runNext();

        res.json({ success: true, message: "Task execution is in progress." });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: 'Failed to schedule task videos' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// (async () => { await starterFunction(Constant.WAN_AI_GENERATE_VIDEO); })();

async function starterFunction(action: string) {
    switch (action) {
        case Constant.ACTION_REGISTER:
            await startProcessOfAccountCreation();
            break;

        case Constant.ACTION_LOGIN:
            await startProcessOfAccountLogin();
            break;

        case Constant.DREMANIA_REGISTER:
            await registerToDremaniaAi();
            break;

        case Constant.WAN_AI_GENERATE_VIDEO:
            await GenerateWANAiVideos("Boy Playing cricket on ground with ninja hattori",
                "hornet14892@mailshan.com",
                "rzIfsb6HAUWg"
            );
            break;

        default:
            console.log("Invalid action");
            break;
    }
}

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




const runNext = async () => {
    if (running || queue.length === 0) return;

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