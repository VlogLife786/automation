import { startProcessOfAccountCreation } from "./utility.js";
import { Constant } from "./constants.js";
import { startProcessOfAccountLogin } from "./login.js";
import { registerToDremaniaAi } from "./dremaniaRegister.js";
import { GenerateWANAiVideos } from "./generate-wan-ai-video.js";
// const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
let isJobInProgress = false;
(async () => { await starterFunction(Constant.WAN_AI_GENERATE_VIDEO); })();
async function starterFunction(action) {
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
            await GenerateWANAiVideos("Boy Playing cricket on ground with ninja hattori");
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
