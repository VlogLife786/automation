import { startProcessOfAccountCreation } from "./utility.js";
export default async function main() {
    await startProcessOfAccountCreation();
}
// nodeCron.schedule("* * * * *", () => {
//     main();
// })
