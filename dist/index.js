import nodeCron from "node-cron";
import { startProcessOfAccountCreation } from "./utility.js";
import { Configs } from "./constants.js";
// export default async function main({ req, res }: any) {
//     await startProcessOfAccountCreation();
// }
nodeCron.schedule(Configs.SCHEDULAR_CONFIG, async () => {
    await startProcessOfAccountCreation();
});
