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
    static readonly SCHEDULAR_CONFIG: string = "* * * * *";
}

export class ApiURLs {
    static readonly USER_DETAILS_API: string = "https://randomuser.me//api?nat=IN";
    static readonly USER_DETAILS_GOOGLE_SHEET: string = "https://script.google.com/macros/s/AKfycbyEFiVjlCIkoffoVFrNXs3MRVCK_lDC57rXwZSE_YUkcys8nEJYbJOoPSxyhrwRWo9g/exec";
}

export class Constant{
    static readonly CHECK_IN_TO : string = "Check in to";
    static readonly ACTION_REGISTER : string = "register";
    static readonly ACTION_LOGIN : string = "login";
    static readonly DREMANIA_REGISTER : string = "dremania_register";
}