export async function postRestResponse(url: string, body: Record<string, unknown> | Record<string, unknown>[]) {
    const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });

    return await response.json();
}

export async function getRestResponse(url: string) {
    const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    });

    return await response.json();
}