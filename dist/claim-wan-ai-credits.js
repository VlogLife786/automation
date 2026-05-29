import axios from "axios";
import crypto from "crypto";
import { globalVars, sleep } from "./utility.js";
import { getRestResponse } from "./restTemplate.js";
import { ApiURLs } from "./constants.js";
let authHeaders = "";
let isUserLoggedIn = false;
export async function claimDailyCredits() {
    let creds = await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=getNotCreditClaimedUser`);
    if (creds && creds.status && creds.status !== 'success') {
        console.log("No user found for claiming credits.");
        return;
    }
    try {
        let loginResponse = await loginToWanAIForCredits({
            username: creds.message.email,
            password: creds.message.password,
            enableOAuth2: false
        });
        if (!loginResponse.success) {
            throw new Error("Authentication failed, Please check credentials.");
        }
        isUserLoggedIn = true;
        callCountApiForCredits();
        console.log("Login done with user credentials.");
        await sleep(5000);
        await claimDailyRewardCredits();
        console.log("Daily reward claimed.");
        await sleep(5000);
        let availableCredits = await getAvailableCreditsForDailyCheck();
        await sleep(5000);
        await getRestResponse(`${ApiURLs.USER_DETAILS_GOOGLE_SHEET}?action=updateCredit&email=${creds.message.email}&credit=${availableCredits.data.availableCount}`);
        await sleep(5000);
    }
    catch (error) {
        console.log("Error: " + error?.message);
        throw error;
    }
    finally {
        isUserLoggedIn = false;
        try {
            await logoutCurrentUserCredits();
            console.log("Logout done.");
        }
        catch (error) {
            console.log("Internal error happened...");
            console.log(error);
        }
        authHeaders = "";
        console.log("Execution completed.");
    }
}
export async function loginToWanAIForCredits(loginrequest) {
    try {
        loginrequest.password = crypto
            .createHash("sha256")
            .update(loginrequest.password)
            .digest("hex");
        let data = JSON.stringify(loginrequest);
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/public/user/login',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="' + globalVars.chromeVersion + '", "Not-A.Brand";v="24", "Google Chrome";v="' + globalVars.chromeVersion + '"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-xsrf-token': 'e12fe403-3ad2-42e3-9c65-91b660e2fbd0',
                // 'Cookie': 'visitId=786F386206704E0DAFB9BD52F842F049; WANX_SESSION=YTkzNDMwMWYtZGM5Yi00YTc0LTk3MWYtYmM3YTJmOTNhYzdl; _ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; atpsida=1a929dbf4289ff71ad3a1b34_1775458444_3; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458447$j60$l0$h0; tfstk=gc0-KkTZzKvl0UYXBaxm-yKHJnODsncyrYl1-J2lAxHxdXmkaJArD9Mnnksnqp7Kp-a7Y023EJUKTAdDIFYiabzUldvMSmqX1-47N7aQRBabO5O0NMZPoX4URdvcmwZyWykRu9rTFjOYtWyCAvZ7lrN_hWs7Rvwbc5NGFyaIdIUbZWP5dW_ChZw4Oy_7dvGXMW2bNyaIdjOYTbNRwJf7pwnbhLtW2_SPJw3Ywuedqr7L0qbg4R9znwQLe7ERqbwARwgxAacbz8tNiJzuUjF-LF7zPknIrrgWheasbx3LfPKHauGKDvzolBs7C0Dul4iOOwGYy-EnrlBJHRgrGVzbmFOtGqkoaqhhOeNmI-GrPyL6_zU7FrFq-K77pmiIruzFFpeEkjgSvgWESVCFWO2TtgOvMMSUVSrMwezrDLDFYSeMiijFYoV4MRAvMMSUVSPYIIYcYMr0g; isg=BGtrOFYIhmGxVtq1lSU1QydR-o9VgH8C0gt9Pt3pmaoBfIneR1RDUo-a1qQS3Nf6; wanx-sg-remember-me=aGFtZXJrb3AxMDY0MiU0MG1haWxzaGFuLmNvbToxNzc3OTg4ODE4NjU2OlNIQTI1NjpkZjQwN2VlNTY3YmM1MTliNDQwZDE0YTllMWEwOTgxOTU1ZmM1Nzk1YTQxZTYwOWFjMGNhMTcwMzZmNGY5MTJi; visitId=7ED1893D1DE64CFF8E6F43B8EE1654E7'
            },
            data: data
        };
        let response = await axios.request(config);
        if (response.status == 200) {
            authHeaders = await extractAuthHeaderForDailyCheck(["visitId", "wanx-sg-remember-me", "WANX_SESSION"], response.headers["set-cookie"] || []);
        }
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function claimDailyRewardCredits() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/inspiration/dailySignReward',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="' + globalVars.chromeVersion + '", "Not-A.Brand";v="24", "Google Chrome";v="' + globalVars.chromeVersion + '"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458543$j60$l0$h0; atpsida=1a929dbf4289ff71ad3a1b34_1775458572_7; tfstk=gcbrpRDdWzUzWhwG_1YU07pVVRTJ4eysaw9Bt6fHNLvueHge81BwxYZROiohFOjWFUbFD25O9aNJR7LRweL3CRa1L_CJJDyo0V_yoIAe_yGoroT0mMswQRa_5_qkwe10Cg9YlsAHteAkEe00gBOnKBXHxKfDHBdnEB0ugsvvnBDor4fmoBdIx2XH-S5DHBYHZ9xugsvvtevnNbpHCqRwq7-zG85Qe2-WI_vq-Vkva34daDgE8YOkqdxD32AfuQ-yI_bMvadXiZ_2fnGQeEfOcTA27zk9aifwrB7LsDJeYaL23OziJIIlUZxFlWERgwJyjaxqs21v8BXHYieZ5Q850h7P2WHcZO9PjUCI_812bi-9incEqUs11wKGrzk9hhdF3hszQ4WG4IMpinoGJgknY3AvgdN4grfHC5QOHV9SvDKRDIJ_w7nKv3AvgdN4gDnp2Ed2C7FR.; isg=BGdnUEodwq3cwEYhcTlxv9ul9psx7DvOvl-ByjnUJPYdKIbqQblaHsRuSjC2wBNG; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        if (response.status == 200) {
            return true;
        }
        return false;
    }
    catch (error) {
        throw error;
    }
}
export async function logoutCurrentUserCredits() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/logout',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate',
                'sec-ch-ua': '"Chromium";v="' + globalVars.chromeVersion + '", "Not-A.Brand";v="24", "Google Chrome";v="' + globalVars.chromeVersion + '"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=1a929dbf4289ff71ad3a1b34_1775459276_8; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775459248$j60$l0$h0; tfstk=gHNSeCsgq3xSE5_Rv372lTmFOLhB5NWV_jTQSPneaph8cDaQfaAFryKKOoi2LzShrkZbXlMUUvWoJBGug8RE4gcQJllCbG5N_z4oiXINbxfJT_htPQdJYvdxMXuQ_Vtcuz4otEY2vOyYr69LHxuK9khxD20Z9pnKJZMx72hpwvdJHnnmJXhKpQKvD20sv23KvZaxm2hKvkHRljnmJXnLvXhSRigcF0U5JMgEXH-ft5oX9BFjkaDUPULKiug7Oca8N8w8GCDSXznX9g64AuoIm5IVhrqLeuu0A1sj6RqbOAhCNh07HPGx4fB6hba4q5G81gOruvi7H7HXJBUSi0DYdusWE0ezcA0xHe1iuloYr7ef-nU8b0G-kx5O5rHL37DgaidS6R4raJEO0Lo8C2IyxCo1hovBlAAIlc7flpvn-Mhh0Cf4HID-oqPNlZtWKY3mlc7flpvneq0qQZ_XVpf..; isg=BLy90XWk-ZzOpM3AHhB6DuysjVputWDfycZKK5YlnafPYXjriMaVb8mXQZEZKZg3; ' + authHeaders
            },
            data: data
        };
        await axios.request(config);
    }
    catch (error) {
        throw error;
    }
}
export async function getAvailableCreditsForDailyCheck() {
    try {
        let data = JSON.stringify({});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imagineCount',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="' + globalVars.chromeVersion + '", "Not-A.Brand";v="24", "Google Chrome";v="' + globalVars.chromeVersion + '"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '1293031729177674722',
                'x-xsrf-token': '91591d0d-db4b-4e44-9157-ead729910e87',
                'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; sca=0c24b11f; xlly_s=1;_ga_Z4KVB8RMTT=GS2.1.s1775561641$o45$g1$t1775562514$j42$l0$h0; cnaui=1293031729177674722; aui=1293031729177674722; atpsida=300d0aaf90c489f2ec91de63_1775562544_6; tfstk=gNpZdJaveAHNGr0k43XqTFinvcXOMtu7bK_fmnxcfNbiWswV33LPiPG9cBPD5UA15Ov29--JDdiOhcB9XtBmP4MWuhKOHwdQScJNKMjcbxZgnX6ntIOPz4MSFhcGXttnPC_Jb6SVmtjGSt4nYis0jiYcsvXhJiI0Si2iYHbd-PVgn-D3xij8ItXDoHmFDwjGnsYDxDSA-Zcm4Zb7Lg5ib6UGzWGDQ17kjwyyypsiLakRR-2DLG-FrhVYn-vFb1JE2V3IW1OD2_p6qxydC3RhKiJxqS7VaIv1Kd0nE6CDKejH5mNAYI-DeOBzmAxFQN5kK1EbCUxemQ1ed0DRQObMGOKb4VteQFt9LnZ0tOW6T_JNEYUGlBty3iJxkv8ym3dcTKzN4FUAx6PkHCz0g1jdYaiEYvxcP0Q_8mBUMSC99M7SXcFYM1jdYaiEYSFA69IFPcnO.; isg=BBkZJAItlFyIaEnGh8iXcXhHKAXzpg1Y3AUPZDvOAcC_QjrUgPOCKOUURB40eqWQ; ' + authHeaders
            },
            data: data
        };
        let response = await axios.request(config);
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function callCountApiForCredits() {
    try {
        while (isUserLoggedIn) {
            let data = JSON.stringify({});
            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: 'https://create.wan.video/wanx/api/common/task/progress/count',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9',
                    'bx-v': '2.5.36',
                    'content-type': 'application/json',
                    'origin': 'https://create.wan.video',
                    'priority': 'u=1, i',
                    'referer': 'https://create.wan.video/generate',
                    'sec-ch-ua': '"Chromium";v="' + globalVars.chromeVersion + '", "Not-A.Brand";v="24", "Google Chrome";v="' + globalVars.chromeVersion + '"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + globalVars.chromeVersion + '.0.0.0 Safari/537.36',
                    'x-platform': 'web',
                    'x-wan-uid': '5857469546000430138',
                    'x-xsrf-token': '0d2dcbd1-a2aa-414d-b6bc-081f5aa0ec4c',
                    'Cookie': '_ga=GA1.1.1888983041.1759128751; cna=shphIWhQYjYCAcqUPRFOtYiF; sca=0c24b11f; xlly_s=1; cnaui=5857469546000430138; aui=5857469546000430138; _ga_Z4KVB8RMTT=GS2.1.s1775571800$o46$g1$t1775572374$j60$l0$h0; atpsida=6320e525b10888f277407f0e_1775572404_8; tfstk=gLJs3M0kSP4_DMntkPoUAKoEY96X6Dkr1osvqneaDOBOlsLyl-RwDRWXGwtybKoGQeaXzeRN0fb4hlvBP-yZSfxYhtWxz4krUhmGnt3PRlE975jP2lH46RBGpzcqKCMrUhxTbGnyvYRaU5Sf0ZBA6NKLvwj4WRLA6kUd-ijYWietAHQhJGEOXsCL9gjYHrLAHDtd-iBAXECtAHQhDtQxN2gCxf_9fm3T2ssuObKfR-evdMnGyhMbFGJdf9_JXpJD3pwh1aKOR-3s3Dxllwv-8XtHkCLNxEMSRTdkRK1RhAalfBK5pNW-NW66YFv5BLg_QM5f5BpOOoevf9bG9ITs55b9_e1lv6EjEM8PJhv9Om4pXU71BMCEe0tdMBJGZduLCTdkbORvy2PNWQsA4ZePPXT3Gk1uhM_rADN0ii0An2uwlr1f6MjeUDiQ5SfOxM_rADN0i1IhY_oIAPNc.; isg=BOPj8-wwjh-3rkMkKca98_4xcieN2HcamvOFxhVCk8KYVAJ2naoiaqDKTjzadM8S; ' + authHeaders
                },
                data: data
            };
            await axios.request(config);
            console.log("Count API executed in interval");
            await sleep(2000);
        }
    }
    catch {
        console.log("Count API failed.");
    }
}
export async function extractAuthHeaderForDailyCheck(headers, cookies) {
    let universalHeaders = "";
    for (let cookie of cookies) {
        for (let header of headers) {
            const regex = new RegExp(`${header}=([^;]+)`);
            const match = cookie.match(regex);
            // const impIds = match ? match[1] : null;
            if (match) {
                universalHeaders += `${header}=${match[1]}; `;
            }
        }
    }
    return universalHeaders.slice(0, -1);
}
