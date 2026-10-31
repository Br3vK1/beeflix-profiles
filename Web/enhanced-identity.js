/* BeeFlix Profiles — Jellyfin Enhanced review identity integration.
 * Adds the review author's equipped BeeFlix reward beside their name and links
 * their name/avatar to their BeeFlix profile. Enhanced review data is untouched.
 */
(() => {
  'use strict';

  const STYLE_ID = 'beeflix-enhanced-identity-style';
  const CARD_SELECTOR = '.tmdb-review-card.je-user-review-card';
  const identityCache = new Map();
  let observer;
  let scheduled = false;

  const api = () => window.ApiClient;

  function userIdFromCard(card) {
    const avatar = card.querySelector('img.je-user-avatar');
    const src = avatar?.getAttribute('src') || '';
    const match = src.match(/\/Users\/([a-f0-9-]{32,36})\/Images\/Primary/i);
    return match ? match[1].replaceAll('-', '').toLowerCase() : null;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bf-enhanced-author-line { display:inline-flex; align-items:center; flex-wrap:wrap; gap:6px; }
      .bf-enhanced-reward-tag {
        display:inline-flex; align-items:center; min-height:19px; padding:2px 7px;
        border:1px solid color-mix(in srgb, var(--bf-reward-color, #f2c94c) 48%, transparent);
        border-radius:999px; color:var(--bf-reward-color, #f2c94c);
        background:color-mix(in srgb, var(--bf-reward-color, #f2c94c) 12%, transparent);
        font-size:10px; font-weight:750; line-height:1.2; letter-spacing:.01em;
        vertical-align:middle; white-space:nowrap;
      }
      .tmdb-review-author.bf-enhanced-profile-link,
      .je-user-review-avatar-wrapper.bf-enhanced-profile-link { cursor:pointer; }
      .tmdb-review-author.bf-enhanced-profile-link:hover { text-decoration:underline; }
    `;
    document.head.appendChild(style);
  }

  function profileHref(userId) {
    return '#/beeflix-profiles?profileUserId=' + encodeURIComponent(userId);
  }

  function makeProfileLink(node, userId) {
    if (!node || node.dataset.bfProfileBound === 'true') return;
    node.dataset.bfProfileBound = 'true';
    node.classList.add('bf-enhanced-profile-link');
    node.setAttribute('role', 'link');
    node.setAttribute('tabindex', '0');
    const navigate = event => {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      event.stopPropagation();
      window.location.hash = profileHref(userId);
    };
    node.addEventListener('click', navigate);
    node.addEventListener('keydown', navigate);
    node.title = 'View BeeFlix member profile';
  }

  async function getIdentity(userId) {
    if (identityCache.has(userId)) return identityCache.get(userId);
    const client = api();
    if (!client || typeof client.ajax !== 'function' || typeof client.getUrl !== 'function') {
      throw new Error('Jellyfin ApiClient is unavailable');
    }
    const request = client.ajax({
      type: 'GET',
      url: client.getUrl('/BeeFlixProfiles/users/' + encodeURIComponent(userId) + '/identity'),
      dataType: 'json'
    }).catch(error => {
      identityCache.delete(userId);
      throw error;
    });
    identityCache.set(userId, request);
    return request;
  }

  function applyIdentity(card, identity) {
    const author = card.querySelector('.tmdb-review-author');
    const authorInfo = card.querySelector('.tmdb-review-author-info');
    if (!author || !authorInfo || !identity || !identity.tag) return;

    let line = author.parentElement?.classList.contains('bf-enhanced-author-line')
      ? author.parentElement : null;
    if (!line) {
      line = document.createElement('span');
      line.className = 'bf-enhanced-author-line';
      author.parentNode.insertBefore(line, author);
      line.appendChild(author);
    }

    let tag = line.querySelector('.bf-enhanced-reward-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'bf-enhanced-reward-tag';
      line.appendChild(tag);
    }
    tag.textContent = identity.tag;
    tag.style.setProperty('--bf-reward-color', identity.tagColor || '#F2C94C');
    tag.title = 'BeeFlix member reward: ' + identity.tag;

    const userId = String(identity.userId || '').replaceAll('-', '').toLowerCase();
    if (userId) {
      makeProfileLink(author, userId);
      makeProfileLink(card.querySelector('.je-user-review-avatar-wrapper'), userId);
    }
    card.dataset.bfIdentityApplied = 'true';
  }

  async function enhanceCard(card) {
    const userId = userIdFromCard(card);
    if (!userId) return;
    if (card.dataset.bfIdentityApplied === 'true') return;
    try {
      const identity = await getIdentity(userId);
      if (card.isConnected) applyIdentity(card, identity);
    } catch (error) {
      // Missing plugin/API or hidden member: leave Enhanced's original card untouched.
      console.debug('[BeeFlix Profiles] Review identity unavailable for this author.', error);
    }
  }

  function scan() {
    scheduled = false;
    addStyles();
    document.querySelectorAll(CARD_SELECTOR).forEach(card => { void enhanceCard(card); });
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(scan, 180);
  }

  function start() {
    addStyles();
    scan();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleScan);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
