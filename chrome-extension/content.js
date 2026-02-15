const CHALK_BASE = "https://chalk-tan.vercel.app";

function buildChalkUrl() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get("v");
  if (!videoId) return null;

  const url = new URL(`${CHALK_BASE}/watch`);
  url.searchParams.set("v", videoId);

  const t = params.get("t");
  if (t) url.searchParams.set("t", t);

  const list = params.get("list");
  if (list) url.searchParams.set("list", list);

  return url.toString();
}

function injectButton() {
  if (document.getElementById("chalk-button")) return;

  const actionsBar = document.querySelector(
    "#top-level-buttons-computed, ytd-menu-renderer #top-level-buttons-computed"
  );
  if (!actionsBar) return;

  const chalkUrl = buildChalkUrl();
  if (!chalkUrl) return;

  const btn = document.createElement("a");
  btn.id = "chalk-button";
  btn.href = chalkUrl;
  btn.target = "_blank";
  btn.rel = "noopener";
  btn.className = "chalk-yt-btn";
  btn.innerHTML =
    '<svg viewBox="0 0 256 256" width="18" height="18" class="chalk-yt-icon">' +
    '<rect width="256" height="256" rx="48" fill="currentColor"/>' +
    '<g transform="translate(32,32) scale(0.75)">' +
    '<path d="M240,192h-8V168a8,8,0,0,0-8-8H160a8,8,0,0,0-8,8v24H40V56H216v80a8,8,0,0,0,16,0V56a16,16,0,0,0-16-16H40A16,16,0,0,0,24,56V192H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16Zm-72-16h48v16H168Z" fill="#3b82f6"/>' +
    "</g></svg>" +
    "<span>Study in Chalk</span>";

  actionsBar.appendChild(btn);
}

// YouTube is an SPA — re-inject on client-side navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Remove old button so it gets fresh URL params
    const old = document.getElementById("chalk-button");
    if (old) old.remove();
  }
  if (window.location.pathname === "/watch") {
    injectButton();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial injection
setTimeout(injectButton, 1500);
