import InstalledDetails = chrome.runtime.InstalledDetails;

function listenOnInstalled(details: InstalledDetails) {
    console.log(details);
}


function listenOnMessage(message: any, sender: any, sendResponse: any) {
    console.log(message);
}

chrome.runtime.onInstalled.addListener(listenOnInstalled);
chrome.runtime.onMessage.addListener(listenOnMessage);

console.log("test");

async function test() {
    const url = "https://live.nicovideo.jp/front/api/pages/follow/v1/programs?status=onair&offset=0";
    const response = await fetch(url);
    const json = await response.json();
    console.log(json);
    console.log(json.data.programs);
}

test();