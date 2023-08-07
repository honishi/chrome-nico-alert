import InstalledDetails = chrome.runtime.InstalledDetails;

function listenOnInstalled(details: InstalledDetails) {
    console.log(details);
}


function listenOnMessage(message: any, sender: any, sendResponse: any) {
    console.log(message);
}

chrome.runtime.onInstalled.addListener(listenOnInstalled);
chrome.runtime.onMessage.addListener(listenOnMessage);
