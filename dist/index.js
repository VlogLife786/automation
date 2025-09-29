import { startProcessOfAccountCreation } from "./utility.js";
export async function main() {
    await startProcessOfAccountCreation();
}
// nodeCron.schedule("* * * * *", () => {
//     main();
// })
