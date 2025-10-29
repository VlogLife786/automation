import { configDotenv } from "dotenv";

configDotenv();

export enum PageNames {
    WAN_AI = "Wan AI",
    YOPMAIL = "YOPmail",
    INBOX = "Inbox",
    TEMP_EMAIL_SO = "Your Temporary Email Address",
    DREMANIA_AI = "Dreamina"
}

export class Flags {
    static readonly BROWSER_LOCAL: boolean = true;
    static readonly BROWSER_SERVER: boolean = false;
}

export class Configs {
    static readonly SCHEDULAR_CONFIG: string = "* * * * *";
}

export class ApiURLs {
    static readonly USER_DETAILS_API: string = "https://randomuser.me//api?nat=IN";
    static readonly USER_DETAILS_GOOGLE_SHEET: string = "https://script.google.com/macros/s/AKfycbz7_3cq_Z7lKdpf03PrjvFCEkjj33z6i-x27zlam6KdnpDYtxBdPHlrG3EvBpv7_mcB/exec";
}

export class Constant {
    static readonly CHECK_IN_TO: string = "Check in to";
    static readonly ACTION_REGISTER: string = "register";
    static readonly ACTION_LOGIN: string = "login";
    static readonly DREMANIA_REGISTER: string = "dremania_register";
    static readonly ASIA_KOLKATA_TIME_ZONE: string = "Asia/Kolkata";
}


export class EnvConstants {
    static readonly ENV_SCHEDULAR_TIME: string = process.env.SCHEDULAR_TIME || Configs.SCHEDULAR_CONFIG;
    static readonly ENV_ACTION: string | undefined = process.env.ACTION;
    static readonly ENV_ENABLE_SCREEN_SHOT: string = process.env.ENABLE_SCREEN_SHOT || 'false';
}