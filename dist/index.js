import nodeCron from "node-cron";
import { sleep, startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant } from "./constants.js";
import { configDotenv } from "dotenv";
import { startProcessOfAccountLogin } from "./login.js";
import { registerToDremaniaAi } from "./dremaniaRegister.js";
configDotenv();
const schedularTime = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
let isJobInProgress = false;
// (async function main() {
//     switch (process.env.ACTION) {
//         case Constant.ACTION_REGISTER:
//             await startProcessOfAccountCreation();
//             break;
//         case Constant.ACTION_LOGIN:
//             await startProcessOfAccountLogin();
//             break;
//         case Constant.DREMANIA_REGISTER:
//             await registerToDremaniaAi();
//             break;
//         default:
//             console.log("Invalid action");
//             break;
//     }
// })();
nodeCron.schedule(schedularTime, async () => {
    if (isJobInProgress) {
        console.log("An ongoing process is going on, Hence skipping thisone on: " + new Date().toLocaleString());
        return;
    }
    try {
        isJobInProgress = true;
        let listOfActions = process.env.ACTION?.split(",") || [];
        for (const action of listOfActions) {
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
                default:
                    console.log("Invalid action");
                    break;
            }
            await sleep(30000);
        }
    }
    catch (error) {
        console.log("Somethig went wrong in job: " + error);
    }
    finally {
        isJobInProgress = false;
    }
}, { timezone: Constant.ASIA_KOLKATA_TIME_ZONE });
