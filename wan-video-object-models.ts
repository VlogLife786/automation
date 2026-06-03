import { ReadStream } from "fs";
import { Browser } from "puppeteer-core";
import { VideoDuration } from "./constants.js";

export interface ExecutionRequestModel {
    prompt: string,
    loginEmail: string,
    loginPassword: string,
    emailToSendVideo: string,
    webhookUrl: string,
    videoTitle: string,
    rowNumber: number | 0,
    startImageName: string | "",
    audioFileName: string | "",
    refrenceImageList: RefrenceImageDetails[],
    sendEmail: boolean | false
}

export interface GlobalVariables {
    globalBrowser: Browser;
    chromeVersion: string;
    videoDuration: VideoDuration;
    useExistingResponse: boolean;
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
    errorMsg: string;
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


export interface GetPolicyApiResponse {
    success: boolean;
    httpCode: number;
    errorCode: string;
    data: GetPolicyData;
    requestId: string;
    failed: boolean;
    traceId: string;
}

export interface GetPolicyData {
    accessId: string;
    policy: string;
    signature: string;
    dir: string;
    host: string;
    expire: number;
    key: string;
}

export interface UploadedImageFileOssUrlResponse {
    success: boolean;
    httpCode: number;
    errorCode: string;
    data: string; // 👈 URL string
    requestId: string;
    failed: boolean;
    traceId: string;
}

export interface UploadedAudioCdnResponse {
    success: boolean;
    httpCode: number;
    errorCode: string;
    data: {
        cdnList: CdnItem[];
    };
    requestId: string;
    failed: boolean;
    traceId: string;
}

interface CdnItem {
    path: string;
    cdnlink: string;
}

export interface RefrenceImageDetails {
    imageId: string;
    imageName: string;
    imageAlias: string;
    imageUrl: string;
    imageFile: ReadStream;
    imageType: string;
    originalName: string;
    width: number;
    height: number;
}


export interface ContinuousCinematicVideoSequence {
    title: string;
    characters: {
        [key: `char_${number}`]: Character;
    };
    global_style: GlobalStyle;
    scene_sequence: Scene[];
}

export interface Character {
    name: string;
    appearance: string;
}

export interface GlobalStyle {
    genre: string;
    camera: string;
    lighting: string;
    quality: string;
    aspect_ratio: `${number}:${number}`;
    fps: number;
}

export interface Scene {
    scene_id: number;
    duration: `${number}s`;
    prompt: string;
    transition_to_next: string;
    reference_previous_video_last_frame: boolean;
}


export type RefItem = {
    type: string;
    payload: {
        id: string;
    };
};