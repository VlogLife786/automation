import { startProcessOfAccountCreation } from "./utility.js";
export default async function main({ req, res }) {
    await startProcessOfAccountCreation();
    return res.json({ message: "Hello from Appwrite Function 🚀" });
}
// nodeCron.schedule("* * * * *", () => {
//     main();
// })
