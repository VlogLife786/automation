export enum PageNames {
    WAN_AI = "Wan AI",
    YOPMAIL = "YOPmail",
    INBOX = "Inbox",
    TEMP_EMAIL_SO = "Your Temporary Email Address"
}

export class Flags {
    static readonly BROWSER_LOCAL: boolean = true;
    static readonly BROWSER_SERVER: boolean = false;
}

export class Configs{
    static readonly SCHEDULAR_CONFIG: string = "*/15 * * * *";
}

export class ApiURLs {
    static readonly USER_DETAILS_API: string = "https://randomuser.me//api?nat=IN";
    static readonly USER_DETAILS_GOOGLE_SHEET: string = "https://script.google.com/macros/s/AKfycbzLN32quemx9ycVuT3jrT-FcF9VtfEGKkIvQnje6id_Tq-R2jubHyNJvDebZ4BwyBce/exec";
}