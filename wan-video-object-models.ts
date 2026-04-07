export interface ExecutionRequestModel {
    prompt: string,
    loginEmail: string,
    loginPassword: string,
    emailToSendVideo: string,
    webhookUrl: string,
    videoTitle: string,
    rowNumber: number | 0
}



export interface LoginRequestModel {
    username: string,
    password: string,
    enableOAuth2: boolean | false
}

export interface StartVideoGenerationResponse {
    success: boolean;
    httpCode: number;
    errorCode: string;
    data: string;
    requestId: string;
    failed: boolean;
    traceId: string;
}


export interface TaskResultByIdResponse extends GenericApiResponse {
    data: TaskData;
}

export interface TaskData {
    id: number;
    gmtCreate: string;
    gmtCreateTimeStamp: number;
    taskId: string;
    dashTraceId: string;
    status: number;
    taskInput: TaskInput;
    taskType: string;
    taskResult: TaskResult[];
    taskRate: number;
    memberLevelList: unknown[]; // can refine if structure is known
    groupKey: string;
    mediaType: string;
    createScene: string;
}

export interface TaskInput {
    subType: string;
    prompt: string;
    selectedResolution: string;
    ratio: string;
    displayResolution: string;
    duration: number;
    generationMode: string;
    multiShots: string;
    videoSoundSwitch: string;
    modelIds: unknown[]; // update if type is known
    modelVersion: string;
    startTimeStamp: number;
    endTimeStamp: number;
}

export interface TaskResult {
    resourceId: string;
    ossPath: string;
    url: string;
    resizeUrl: string;
    isSecurity: boolean;
    taskId: string;
    vagueUrl: string;
    downloadUrl: string;
    downloadUrlWithLogo: string;
    videoFirstFrameUrl: string;
    isCollected: boolean;
    squareSubmissionStatus: string;
    noWaterMark: boolean;
    resizeUrlWithoutLogo: string;
    resolution: string;
    musicCover: string;
}


export interface GenericApiResponse {
    success: boolean | true;
    httpCode: number;
    errorCode: string;
    requestId: string;
    failed: boolean;
    traceId: string;
}

export interface AvailableCreditsApiResponse {
    success: boolean;
    httpCode: number;
    errorCode: string;
    data: Data;
    requestId: string;
    failed: boolean;
    traceId: string;
}

interface Data {
    availableCount: number;
    totalCount: number;
    amount: Amount;
}

interface Amount {
    total: number;
    member: number;
    topUp: number;
    bonus: number;
}