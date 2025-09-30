import nodeCron from "node-cron";
import { startProcessOfAccountCreation } from "./utility.js";
import { Configs, Constant } from "./constants.js";
import { configDotenv } from "dotenv";
import { login } from "./login.js";

configDotenv();
const schedularTime: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;

// export default async function main({ req, res }: any) {
//     await startProcessOfAccountCreation();
// }

nodeCron.schedule(schedularTime, async () => {
    switch (process.env.ACTION) {
        case Constant.ACTION_REGISTER:
            await startProcessOfAccountCreation();
            break;

        case Constant.ACTION_LOGIN:
            await login();
            break;

        default:
            console.log("Invalid action");
            break;
    }
})