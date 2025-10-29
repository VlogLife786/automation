import { configDotenv } from "dotenv";
configDotenv();
export var PageNames;
(function (PageNames) {
    PageNames["WAN_AI"] = "Wan AI";
    PageNames["YOPMAIL"] = "YOPmail";
    PageNames["INBOX"] = "Inbox";
    PageNames["TEMP_EMAIL_SO"] = "Your Temporary Email Address";
    PageNames["DREMANIA_AI"] = "Dreamina";
})(PageNames || (PageNames = {}));
export class Flags {
}
Flags.BROWSER_LOCAL = true;
Flags.BROWSER_SERVER = false;
export class Configs {
}
Configs.SCHEDULAR_CONFIG = "* * * * *";
export class ApiURLs {
}
ApiURLs.USER_DETAILS_API = "https://randomuser.me//api?nat=IN";
ApiURLs.USER_DETAILS_GOOGLE_SHEET = "https://script.google.com/macros/s/AKfycbz7_3cq_Z7lKdpf03PrjvFCEkjj33z6i-x27zlam6KdnpDYtxBdPHlrG3EvBpv7_mcB/exec";
export class Constant {
}
Constant.CHECK_IN_TO = "Check in to";
Constant.ACTION_REGISTER = "register";
Constant.ACTION_LOGIN = "login";
Constant.DREMANIA_REGISTER = "dremania_register";
Constant.ASIA_KOLKATA_TIME_ZONE = "Asia/Kolkata";
export class EnvConstants {
}
EnvConstants.ENV_SCHEDULAR_TIME = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
EnvConstants.ENV_ACTION = process.env.ACTION;
EnvConstants.ENV_ENABLE_SCREEN_SHOT = process.env.ENABLE_SCREEN_SHOT || 'false';
