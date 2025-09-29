import nodeCron from "node-cron";
import { startProcessOfAccountCreation } from "./utility.js";
// export default async function main({ req, res }: any) {
//     await startProcessOfAccountCreation();
// }
nodeCron.schedule("* * * * *", async () => {
    await startProcessOfAccountCreation();
});
