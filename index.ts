import nodeCron from "node-cron";
import { startProcessOfAccountCreation } from "./utility.js";


export default async function main({ req, res }: any) {
    await startProcessOfAccountCreation();
     return res.json({ message: "Hello from Appwrite Function 🚀" });
}

// nodeCron.schedule("* * * * *", () => {
//     main();
// })