const CHALK_BASE = "https://chalk-tan.vercel.app";

function buildChalkUrl() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get("v");
  if (!videoId) return null;

  const url = new URL(`${CHALK_BASE}/watch`);
  url.searchParams.set("v", videoId);
  url.searchParams.set("autoplay", "1");

  const t = params.get("t");
  if (t) url.searchParams.set("t", t);

  const list = params.get("list");
  if (list) url.searchParams.set("list", list);

  return url.toString();
}

/** Pause the YouTube video reliably */
function pauseYouTubeVideo() {
  const video = document.querySelector("video");
  if (video && !video.paused) {
    video.pause();
  }
}

/**
 * Find the actions container next to Like/Share/Save.
 * YouTube changes DOM frequently — try multiple selectors in priority order.
 */
function findActionsBar() {
  const selectors = [
    "ytd-watch-metadata #actions #top-level-buttons-computed",
    "ytd-watch-metadata #actions ytd-menu-renderer #top-level-buttons-computed",
    "#actions ytd-menu-renderer #top-level-buttons-computed",
    "ytd-watch-metadata #actions-inner #menu ytd-menu-renderer #top-level-buttons-computed",
    "#top-level-buttons-computed",
    "ytd-watch-metadata #actions-inner #menu ytd-menu-renderer",
    "ytd-watch-metadata #actions ytd-menu-renderer",
    "#info #menu-container ytd-menu-renderer #top-level-buttons-computed",
    "ytd-watch-metadata ytd-menu-renderer",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function injectButton() {
  if (document.getElementById("chalk-button")) return;

  const actionsBar = findActionsBar();
  if (!actionsBar) return false;

  const chalkUrl = buildChalkUrl();
  if (!chalkUrl) return false;

  const btn = document.createElement("a");
  btn.id = "chalk-button";
  btn.href = chalkUrl;
  btn.target = "_blank";
  btn.rel = "noopener";
  btn.className = "chalk-yt-btn";

  // Phosphor ChalkboardSimple icon — no background, just the icon outline
  btn.innerHTML =
    '<svg viewBox="0 0 256 256" width="24" height="24" class="chalk-yt-icon">' +
    '<path d="M240,192h-8V168a8,8,0,0,0-8-8H160a8,8,0,0,0-8,8v24H40V56H216v80a8,8,0,0,0,16,0V56a16,16,0,0,0-16-16H40A16,16,0,0,0,24,56V192H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16Zm-72-16h48v16H168Z" fill="currentColor"/>' +
    "</svg>" +
    "<span>Explore in Chalk</span>";

  // Pause YouTube video before opening Chalk
  btn.addEventListener("click", (e) => {
    pauseYouTubeVideo();
    // Small delay to ensure pause registers before tab switch
    // Don't prevent default — let the link open normally
  });

  actionsBar.appendChild(btn);
  return true;
}

// Retry injection with increasing delays (YouTube renders async)
function injectWithRetry(attempts = 0) {
  if (attempts > 20) return;
  if (document.getElementById("chalk-button")) return;
  if (window.location.pathname !== "/watch") return;

  if (!injectButton()) {
    setTimeout(() => injectWithRetry(attempts + 1), 500 + attempts * 200);
  }
}

// YouTube is an SPA — re-inject on client-side navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    const old = document.getElementById("chalk-button");
    if (old) old.remove();
  }
  if (window.location.pathname === "/watch") {
    injectButton();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial injection with retry
injectWithRetry();
