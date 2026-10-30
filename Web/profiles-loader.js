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

    const script = document.createElement('script');
    script.async = true;
    script.dataset.beeflixVersion = '0.6.0.2';
    script.src = window.ApiClient && typeof window.ApiClient.getUrl === 'function'
      ? window.ApiClient.getUrl('/BeeFlixProfiles/profiles.js?v=0.6.0.2')
      : '/BeeFlixProfiles/profiles.js?v=0.6.0.2';

    script.onload = () => {
      root.dataset.bfScriptState = window.BeeFlixProfilesPageInitialized ? 'loaded' : 'error';
      if (!window.BeeFlixProfilesPageInitialized) {
        setStatus(root, 'BeeFlix Community script loaded but did not initialize. Build 0.6.0.2; check the browser console for the exact cause.', true);
      }
    };
    script.onerror = () => {
      root.dataset.bfScriptState = 'error';
      setStatus(root, 'Could not load BeeFlix Community JavaScript (build 0.6.0.2). Check the Jellyfin server logs.', true);
    };
    document.head.appendChild(script);
  }

  function scanForPage() {
    const root = document.querySelector(pageSelector);
    if (root) initializePage(root);
  }

  const observer = new MutationObserver(scanForPage);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scanForPage();
})();
