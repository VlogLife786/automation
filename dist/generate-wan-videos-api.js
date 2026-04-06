import axios from "axios";
import crypto from "crypto";
import { sleep } from "./utility.js";
import { postRestResponse } from "./restTemplate.js";
let authHeaders = "";
export async function GenerateWANAiVideosByApi(requestModel) {
    let executionSteps = [];
    console.log("Received the request of execution...");
    try {
        let loginResponse = await loginToWanAI({
            username: requestModel.loginEmail,
            password: requestModel.loginPassword,
            enableOAuth2: false
        });
        if (!loginResponse.success) {
            throw new Error("Authentication failed, Please check credentials.");
        }
        executionSteps.push("Login done with user credentials.");
        await sleep(5000);
        await claimDailyReward();
        executionSteps.push("Daily reward claimed.");
        await sleep(5000);
        let videoGenerationResponse = await startVideoGeneration(requestModel.prompt);
        executionSteps.push("Video generation started.");
        await sleep(3000);
        let videoDownloadUrl = "";
        if (videoGenerationResponse.success && videoGenerationResponse.data) {
            for (let index = 0; index < 100; index++) {
                let taskResultResponse = await getTaskDetailsById(videoGenerationResponse.data);
                // console.log(taskResultResponse);
                if (taskResultResponse?.data?.taskResult && taskResultResponse.data.taskResult.length > 0
                    && taskResultResponse.data.taskResult[0].downloadUrl) {
                    // console.log(taskResultResponse.data.taskResult[0].downloadUrl);
                    videoDownloadUrl = taskResultResponse.data.taskResult[0].downloadUrl;
                    executionSteps.push("Video generation is completed, Now sending video link over email.");
                    await postRestResponse(requestModel.webhookUrl + "/send-video-link", {
                        "rowNumber": requestModel.rowNumber,
                        "videoUrlToSend": videoDownloadUrl,
                        "emailToSendVideo": requestModel.emailToSendVideo,
                        "videoTitle": requestModel.videoTitle
                    });
                    executionSteps.push("Generated video link is shared over email.");
                    break;
                }
                console.log("Video generation is in progress, Wait for sometime.");
                await sleep(6000);
            }
            if (videoDownloadUrl == "") {
                throw new Error("Video is not generated or taking too much time for " + requestModel.loginEmail);
            }
        }
        await logoutCurrentUser();
        executionSteps.push("Logout done.");
    }
    catch (error) {
        executionSteps.push("Error: " + error?.message);
        await postRestResponse(requestModel.webhookUrl + "/send/error-email", {
            "executionSteps": JSON.stringify(executionSteps),
            "videoTitle": requestModel.videoTitle,
            "rowNumber": requestModel.rowNumber
        });
        throw error;
    }
    finally {
        authHeaders = "";
        console.log("Execution completed.");
    }
}
export async function loginToWanAI(loginrequest) {
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
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-xsrf-token': 'e12fe403-3ad2-42e3-9c65-91b660e2fbd0',
                // 'Cookie': 'visitId=786F386206704E0DAFB9BD52F842F049; WANX_SESSION=YTkzNDMwMWYtZGM5Yi00YTc0LTk3MWYtYmM3YTJmOTNhYzdl; _ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; atpsida=1a929dbf4289ff71ad3a1b34_1775458444_3; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458447$j60$l0$h0; tfstk=gc0-KkTZzKvl0UYXBaxm-yKHJnODsncyrYl1-J2lAxHxdXmkaJArD9Mnnksnqp7Kp-a7Y023EJUKTAdDIFYiabzUldvMSmqX1-47N7aQRBabO5O0NMZPoX4URdvcmwZyWykRu9rTFjOYtWyCAvZ7lrN_hWs7Rvwbc5NGFyaIdIUbZWP5dW_ChZw4Oy_7dvGXMW2bNyaIdjOYTbNRwJf7pwnbhLtW2_SPJw3Ywuedqr7L0qbg4R9znwQLe7ERqbwARwgxAacbz8tNiJzuUjF-LF7zPknIrrgWheasbx3LfPKHauGKDvzolBs7C0Dul4iOOwGYy-EnrlBJHRgrGVzbmFOtGqkoaqhhOeNmI-GrPyL6_zU7FrFq-K77pmiIruzFFpeEkjgSvgWESVCFWO2TtgOvMMSUVSrMwezrDLDFYSeMiijFYoV4MRAvMMSUVSPYIIYcYMr0g; isg=BGtrOFYIhmGxVtq1lSU1QydR-o9VgH8C0gt9Pt3pmaoBfIneR1RDUo-a1qQS3Nf6; wanx-sg-remember-me=aGFtZXJrb3AxMDY0MiU0MG1haWxzaGFuLmNvbToxNzc3OTg4ODE4NjU2OlNIQTI1NjpkZjQwN2VlNTY3YmM1MTliNDQwZDE0YTllMWEwOTgxOTU1ZmM1Nzk1YTQxZTYwOWFjMGNhMTcwMzZmNGY5MTJi; visitId=7ED1893D1DE64CFF8E6F43B8EE1654E7'
            },
            data: data
        };
        let response = await axios.request(config);
        if (response.status == 200) {
            authHeaders = await extractAuthHeader(["visitId", "wanx-sg-remember-me", "WANX_SESSION"], response.headers["set-cookie"] || []);
        }
        return response.data;
    }
    catch (error) {
        throw error;
    }
}
export async function claimDailyReward() {
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
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
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
export async function startVideoGeneration(textPrompt) {
    try {
        let data = JSON.stringify({
            "deductMode": "credit_mode",
            "taskType": "text_to_video",
            "taskInput": {
                "modelVersion": "2_6",
                "duration": 5,
                "generationMode": "imaginative",
                "prompt": textPrompt,
                "promptMeta": {
                    "originPrompt": textPrompt,
                    "orderedKeys": [],
                    "refs": {}
                },
                "selectedResolution": "720P",
                "ratio": "9:16",
                "multiShots": "single",
                "subType": "basic",
                "modelIds": []
            }
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/imageGen',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-ua': '231!dq03zAmUD1R+j7/40A7wMB0oUAGvmIUlW2PKK+t1BjPfrHGGugULjx7uafPhUQ/URkw+b1CFsksEtvzKgZRVGrK0x971XY27d0DIyvSBFJD7zqghY+1xdWwVhr4cavHk+I1kik3PYeFF3BouK0za4dKnRI8nHoupb/TXdSNaQw80mj2bwa+PPtqG1OcNtjciJckI+yjcztMvdjTCOVsSLoKVj+U/m/c6f/XjllA+zwXiqdZlQhWjV4YyvtNzR2gYAu5YEzp5zRtncCJhY3gohS7qXn8bXqyOovRxfBlo4hKR3kmr0Q3oyE+jauHhUYuK3IUGHkE+++3+qCS4+ItUgk6eU72Co+4+tMASq/rWt4RqfHhK+y4cYbyHhN2J0cJSpZ13tHnF4ifMtBsLk/mGXbJrXTIPXYzUO0E04pmhPe822hGVxqk1d1GQSE0rseCw5QK6lEqdfTFdxbL6krvWFfCfZ51VhfpkJ2XhLzDS7Ig1tmoVUVvgzTz0ary5R0sp3k2QckuIB5VUUi6Kx6yyAMyv1EJtM/plX8MV+L5xni562HNxOkgbSxEt7mhNPuQCrc3gsdCY7603RNcE4xrcZBwbGMqIZ+V0/iE+BHI1iASJfgXeqG8w1E7jWY9Lu5HgfTIBIf3ExGngMvqobuqscJd9bPyDYupkk791VQ2VpqHNvebShYyl/jMupIqsFPTy/KIRUR0WADUTzT8LorZczAPU7ydshM8kT2GmS3Kymca+GcLzKm7RjzBrTpUVJi4tHww4PjjvbA9LfqxeNbKWnYF2J2a2QJ0agarKygb4Ld5+7C0DXzKVSNwAk3DeYElAHbMTVEZZgZKMBdKN64JhR/skGJlgzhbl6+Mg6lxivJeXKvP0VtIrvHqK0NB7DyPrQk1LjEVTmddv+/nDZooU7wQVqfww3TLplmbuH0uXn03XGBUDGSqIv4uPsShqbLp3pIxJsyoqhclUXdKEug2pOY4pE/BqEgRNcPQbhjWcgQfhzQG1TC2dt/EEHhARWZX7TZupCTXKzKnSxAlYrCCc5BwsLxCFjR/I6x1Pu/SRE3FpTmkR4rVjbGwwkTZm9sAwvnK1j6zERzW/fLbmvTOfgCfSbH/P76DqjNQavlK3WTTJzR90zjcFPKLd4YrMichGojllb5b38lkiG3eY91pImBUMUIbfPYWslZxz2jFpm6XbcJ+lneqQizyiwFOer3/kx4UcWaA1yblEgsggSsVENntNN3d/LZ+aCYljnwGu7t+ku3qldSAGGwY+nb8qQs7xbuwbH7dt1CMplGC/Q1niao7VWW26n8inuVz9b/Whvj9ExLTVaZ4qCU58NtbsjJhBQAEya/9rCTW5pGoR0TgCQrIW01r3Pk9weqHLPymeHqo5fINWfRGaPMCI5nVP3tDM4lCqlp1sRF0ggfYEp9c6WAgRNZCua2kCK9BJNdqga7DNND8DKmFPiFti6SpHgnqvaDfWo4REQfAm7sTkS9H/J+2gIGcOvzNOdACGSkcj/uHT7JLJxB3AcCYQhg9602AtWP1ZJBx5FxaPwMDGwS+KrI7UVuPzHkGCVaLV3BgtMpYjUtbb1SzEfSo19DHpoqQtWKbi4opPVw14gMNVYD76',
                'bx-umidtoken': 'T2gAYP2nXVImyuOmxGs3WQmDrj2HeEw8C8oJ8E330zY4YsbRWH6N3GLzhmcW2Kd1f6s=',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775458543$j60$l0$h0; atpsida=1a929dbf4289ff71ad3a1b34_1775458572_7; tfstk=grttLYmybXcM8FiIwl0Hmi3X6Dkhe2jwQNA_mojcs2OdOIWDSV50DepWMZbfnFXYDB1eMZkNis1viKTiK0mkQdSVcihoq0jkO426MO_f1WMfnOFsKNafxk0Vcbcoxy2C7fjXIkPwF69CTtE1GlOfAM65Ui6fCiMdOtBzl5OfcvHdHTP_1i66dw6RFi1XGiMpd6WAcOOfcvpCTtG2IRC0CsEvR6GMhJyb-5VMvOQOMPbaDtOaqO15Z6ZjN1XTa_919oZfN5xvzppi6uJhbnORECmQXQpXUE_pDWGRgHpBfE9U6vsJpeYlWeh_D6xGHasfJ-ZXpMCFrnsSVWBeRdYXbCeYcO-MqZCPJxZVoMtlPUOT3YJCftOVznczb19XU38l2cFPBe9Rvg-eq3e427fRnPMKprzV597oBmSwJfA4u9CoKy44uwXFp_DKprzV59WdZvm3ur7hL; isg=BAsLyI7R5gHSSjpVNQXVY0cxmq_1oB8isivdXn0blsq_nAr-M3R6cmx6doRyvHca; ' + authHeaders
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
export async function getTaskDetailsById(taskId) {
    try {
        let data = JSON.stringify({
            "taskId": taskId
        });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://create.wan.video/wanx/api/common/v2/taskResult',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'bx-v': '2.5.36',
                'content-type': 'application/json',
                'origin': 'https://create.wan.video',
                'priority': 'u=1, i',
                'referer': 'https://create.wan.video/generate',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'x-platform': 'web',
                'x-wan-uid': '2262817915197336356',
                'x-xsrf-token': 'b9848eb7-3b71-401e-942b-4eac11c23b60',
                'Cookie': '_ga=GA1.1.610758391.1775458351; cna=N0ZaIsl/JDICAaN01DloGK/2; sca=96f51f3c; xlly_s=1; cnaui=2262817915197336356; aui=2262817915197336356; atpsida=1a929dbf4289ff71ad3a1b34_1775459276_8; _ga_Z4KVB8RMTT=GS2.1.s1775458350$o1$g1$t1775459248$j60$l0$h0; tfstk=gjKxEume0bcmTRmS9o0kjG36M0koJ4j231AbjljGi4ORNCWMoq5gXUpB6Nb1IEXTXQ1yiEvi3Ns9LBdO7x5G11dMCEDoxDv23GS1XXmnxMAS--OOhN1bNA6GHSMllX7itMjstXmur8_qiG904S55PL1PBo11CC17NOf5Crs61__5d9VffGOsea6CLS11hG_7P9551Gs61LMRI_6ffGO6FYBZgayAs-1TXU1SidwzMvN4g3BAk1UculBygkXfOK18fX1cH75Bh_E_f6NDXeJJnjEeEi-699AmVodpCp81yhFS91-JFnT6USH5vLLk-ZL-GlCkmOQCfae_fLIRawx1ADNRUU9D5nRYBl62mHbOTaH_bNjWxwTBMRkeFi66_w-iTo5XCp-e-MnYTtLWpgIy8HxLQkFh9O4jeYUa7Z6P-xnN0UhD_PWRtY4u7P7lUTCneYUa7Z6Pe6DoqPzNrT5..; isg=BOfnaMqdQi1ew8ah8bnxP1sldhuxbLtOPt8BSrlHfXaDqCZq9zienuDmyrA2QJPG; ' + authHeaders
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
export async function logoutCurrentUser() {
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
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
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
export async function extractAuthHeader(headers, cookies) {
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
