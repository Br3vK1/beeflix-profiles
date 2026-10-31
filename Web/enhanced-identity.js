/* BeeFlix Profiles — Jellyfin Enhanced review identity integration.
 * Replaces the generic BeeFlix member label with the author's equipped reward
 * directly beneath the review date, tints the card, and links author/avatar to profile.
 * Enhanced review data and ratings are never modified.
 */
(() => {
  'use strict';

  const STYLE_ID = 'beeflix-enhanced-identity-style';
  const CARD_SELECTOR = '.tmdb-review-card.je-user-review-card';
  const identityCache = new Map();
  let scheduled = false;

  const api = () => window.ApiClient;

  function userIdFromCard(card) {
    const avatar = card.querySelector('img.je-user-avatar, .je-user-review-avatar-wrapper img, img[src*="/Users/"]');
    const src = avatar?.getAttribute('src') || '';
    const match = src.match(/\/Users\/([a-f0-9-]{32,36})\/Images\/Primary/i);
    return match ? match[1].replaceAll('-', '').toLowerCase() : null;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bf-enhanced-reward-tag {
        display:inline-flex; align-items:center; width:max-content; max-width:100%;
        min-height:19px; margin-top:4px; padding:2px 7px;
        border:1px solid color-mix(in srgb, var(--bf-reward-color, #f2c94c) 58%, transparent);
        border-radius:999px; color:var(--bf-reward-color, #f2c94c);
        background:color-mix(in srgb, var(--bf-reward-color, #f2c94c) 15%, transparent);
        box-shadow:0 0 12px color-mix(in srgb, var(--bf-reward-color, #f2c94c) 12%, transparent);
        font-size:10px; font-weight:800; line-height:1.2; letter-spacing:.01em;
        white-space:nowrap;
      }
      .bf-enhanced-reward-line { display:flex; flex-direction:column; align-items:flex-start; }
      .tmdb-review-card.je-user-review-card.bf-enhanced-reward-card {
        --bf-review-accent: var(--bf-reward-color, #f2c94c);
        border-color:color-mix(in srgb, var(--bf-review-accent) 62%, rgba(255,255,255,.16)) !important;
        border-left:3px solid var(--bf-review-accent) !important;
        background:
          linear-gradient(115deg,
            color-mix(in srgb, var(--bf-review-accent) 13%, transparent),
            transparent 58%),
          var(--jf-palette-background-paper, rgba(24,35,53,.72)) !important;
        box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--bf-review-accent) 10%, transparent),
          0 5px 18px color-mix(in srgb, var(--bf-review-accent) 9%, transparent);
        transition:border-color .18s ease, background .18s ease, box-shadow .18s ease;
      }
      .tmdb-review-card.je-user-review-card.bf-enhanced-reward-card:hover {
        border-color:color-mix(in srgb, var(--bf-review-accent) 82%, white 18%) !important;
        box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--bf-review-accent) 17%, transparent),
          0 7px 22px color-mix(in srgb, var(--bf-review-accent) 14%, transparent);
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

  function removeGenericMemberLabel(card) {
    const label = [...card.querySelectorAll('*')].find(node =>
      node.children.length === 0 &&
      node.textContent.trim().toUpperCase() === 'BEEFLIX MEMBER'
    );
    if (label) label.remove();
  }

  function placeRewardBelowDate(card, author, tag) {
    const info = author.closest('.tmdb-review-author-info') || author.parentElement;
    if (!info) return;
    let line = info.querySelector(':scope > .bf-enhanced-reward-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'bf-enhanced-reward-line';
      const date = info.querySelector('.tmdb-review-date');
      if (date && date.parentElement === info) {
        date.insertAdjacentElement('afterend', line);
      } else {
        info.appendChild(line);
      }
    }
    if (tag.parentElement !== line) line.appendChild(tag);
  }

  function applyIdentity(card, identity) {
    const author = card.querySelector('.tmdb-review-author');
    if (!author || !identity || !identity.tag) return;

    removeGenericMemberLabel(card);

    let tag = card.querySelector('.bf-enhanced-reward-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'bf-enhanced-reward-tag';
    }

    const rewardColor = identity.tagColor || '#F2C94C';
    tag.textContent = identity.tag;
    tag.style.setProperty('--bf-reward-color', rewardColor);
    tag.title = 'BeeFlix member reward: ' + identity.tag;
    placeRewardBelowDate(card, author, tag);

    card.classList.add('bf-enhanced-reward-card');
    card.style.setProperty('--bf-reward-color', rewardColor);

    const userId = String(identity.userId || '').replaceAll('-', '').toLowerCase();
    if (userId) {
      makeProfileLink(author, userId);
      makeProfileLink(card.querySelector('.je-user-review-avatar-wrapper'), userId);
    }
    card.dataset.bfIdentityApplied = 'true';
  }

  async function enhanceCard(card) {
    const userId = userIdFromCard(card);
    if (!userId || card.dataset.bfIdentityApplied === 'true') return;
    try {
      const identity = await getIdentity(userId);
      if (card.isConnected) applyIdentity(card, identity);
    } catch (error) {
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
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleScan);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
