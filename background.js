function updateWhitelistRules(domains) {
  const rules = domains.map((d, i) => ({
    id: 1000 + i,
    priority: 2,
    action: { type: "allow" },
    condition: {
      urlFilter: "||" + d + "^",
      resourceTypes: ["main_frame","sub_frame","xmlhttprequest","fetch"]
    }
  }));
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ whitelist: [] }, (res) => {
    updateWhitelistRules(res.whitelist);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.whitelist) {
    updateWhitelistRules(changes.whitelist.newValue || []);
  }
});
