import nodeCron from "node-cron";
import { sleep, startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant, EnvConstants } from "./constants.js";
import { startProcessOfAccountLogin } from "./login.js";
import { constants } from "buffer";
import { registerToDremaniaAi } from "./dremaniaRegister.js";

// const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
let isJobInProgress: boolean = false;


// (async () => { await starterFunction("login"); })();

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

        default:
            console.log("Invalid action");
            break;
    }
}

nodeCron.schedule(EnvConstants.ENV_SCHEDULAR_TIME, async () => {
    if (isJobInProgress) {
        console.log("An ongoing process is going on, Hence skipping thisone on: " + new Date().toLocaleString());
        return;
    }

    try {
        isJobInProgress = true;
        let listOfActions: string[] = EnvConstants.ENV_ACTION?.split(",") || [];

        for (const action of listOfActions) {
            await starterFunction(action);
            await sleep(30000);
        }
    } catch (error) {
        console.log("Somethig went wrong in job: " + error);
    } finally {
        isJobInProgress = false;
    }
}, { timezone: Constant.ASIA_KOLKATA_TIME_ZONE })