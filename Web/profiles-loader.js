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
    script.src = window.ApiClient && typeof window.ApiClient.getUrl === 'function'
      ? window.ApiClient.getUrl('/BeeFlixProfiles/profiles.js')
      : '/BeeFlixProfiles/profiles.js';

    script.onload = () => {
      root.dataset.bfScriptState = 'loaded';
      if (!window.BeeFlixProfilesPageInitialized) {
        root.dataset.bfScriptState = 'error';
        setStatus(root, 'The page loaded, but profile tools did not initialize. Refresh Jellyfin and check the browser console.', true);
      }
    };

    script.onerror = () => {
      root.dataset.bfScriptState = 'error';
      setStatus(root, 'The profile page loaded, but its JavaScript file could not be fetched. Refresh the page or check the Jellyfin server logs.', true);
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
