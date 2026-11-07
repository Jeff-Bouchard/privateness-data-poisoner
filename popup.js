const patternInput = document.getElementById("domainInput");
const addBtn = document.getElementById("addDomain");
const list = document.getElementById("whitelist");

function refreshList() {
  chrome.storage.local.get({ whitelist: [] }, (res) => {
    list.innerHTML = "";
    res.whitelist.forEach((pattern, i) => {
      const li = document.createElement("li");
      li.textContent = pattern;
      const rm = document.createElement("button");
      rm.textContent = "✖";
      rm.onclick = () => {
        const newList = res.whitelist.filter((_, idx) => idx !== i);
        chrome.storage.local.set({ whitelist: newList });
        refreshList();
      };
      li.appendChild(rm);
      list.appendChild(li);
    });
  });
}

addBtn.onclick = () => {
  const pattern = patternInput.value.trim().toLowerCase();
  if (!pattern) return;
  chrome.storage.local.get({ whitelist: [] }, (res) => {
    if (!res.whitelist.includes(pattern)) {
      res.whitelist.push(pattern);
      chrome.storage.local.set({ whitelist: res.whitelist });
      patternInput.value = "";
      refreshList();
    }
  });
};

refreshList();
