import nodeCron from "node-cron";
import { startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant } from "./constants.js";
import { configDotenv } from "dotenv";
import { startProcessOfAccountLogin } from "./login.js";
import { registerToDremaniaAi } from "./dremaniaRegister.js";
configDotenv();
const schedularTime = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
// (async function main() {
//     await registerToDremaniaAi();
// })();
nodeCron.schedule(schedularTime, async () => {
    switch (process.env.ACTION) {
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
});
