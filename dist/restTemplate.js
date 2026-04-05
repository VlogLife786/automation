export async function postRestResponse(url, body) {
    const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
    return await response.json();
}
export async function postRestFormResponse(url, formData) {
    const response = await fetch(url, {
        method: "POST",
        body: formData,
    });
    return await response.json();
}
export async function getRestResponse(url) {
    const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    });
    return await response.json();
}
