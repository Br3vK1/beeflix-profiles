(() => {
  'use strict';

  const pageSelector = '#BeeFlixProfilesPage';

  function setStatus(root, message, isError) {
    const status = root.querySelector('#bf-status');
    if (!status) return;
    status.textContent = message;
    if (isError) status.classList.add('bf-error');
  }

  function initializePage(root) {
    if (!root || root.dataset.bfScriptState === 'loading' || root.dataset.bfScriptState === 'loaded') return;
    root.dataset.bfScriptState = 'loading';

    window.BeeFlixProfilesPageInitialized = false;

    const script = document.createElement('script');
    script.async = true;
    script.dataset.beeflixVersion = '0.7.0';
    script.src = window.ApiClient && typeof window.ApiClient.getUrl === 'function'
      ? window.ApiClient.getUrl('/BeeFlixProfiles/profiles.js?v=0.7.0')
      : '/BeeFlixProfiles/profiles.js?v=0.7.0';

    script.onload = () => {
      root.dataset.bfScriptState = window.BeeFlixProfilesPageInitialized ? 'loaded' : 'error';
      if (!window.BeeFlixProfilesPageInitialized) {
        setStatus(root, 'BeeFlix Community script loaded but did not initialize. Build 0.7.0; check the browser console for the exact cause.', true);
      }
    };
    script.onerror = () => {
      root.dataset.bfScriptState = 'error';
      setStatus(root, 'Could not load BeeFlix Community JavaScript (build 0.7.0). Check the Jellyfin server logs.', true);
    };
    document.head.appendChild(script);
  }

  function scanForPage() {
    const roots = Array.from(document.querySelectorAll(pageSelector));
    const root = roots.filter(candidate =>
      candidate.isConnected &&
      candidate.getClientRects().length > 0 &&
      getComputedStyle(candidate).visibility !== 'hidden' &&
      !candidate.closest('[hidden]')
    ).at(-1) || roots.at(-1);
    if (root) initializePage(root);
  }

  const observer = new MutationObserver(scanForPage);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scanForPage();
})();

// Release gate: publish the latest 0.7.0 preview candidate.
