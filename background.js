// Forum Image Collector - Service Worker
// Keeps the extension alive across browser restarts

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
});
