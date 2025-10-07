import nodeCron from "node-cron";
import { sleep, startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant } from "./constants.js";
import { configDotenv } from "dotenv";
import { startProcessOfAccountLogin } from "./login.js";
import { constants } from "buffer";
import { registerToDremaniaAi } from "./dremaniaRegister.js";

configDotenv();
const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
let isJobInProgress: boolean = false;


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
        return;
    }

    try {
        isJobInProgress = true;
        let listOfActions: string[] = process.env.ACTION?.split(",") || [];

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
            await sleep(60000);
        }
    } catch (error) {
        console.log("Somethig went wrong in job: " + error);
    } finally {
        isJobInProgress = false;
    }
})