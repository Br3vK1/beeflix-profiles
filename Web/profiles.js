(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const status = $('#bf-status');
  const profileContainer = $('#bf-profile-result');
  const idInput = $('#bf-user-id');
  const openButton = $('#bf-open-profile');

  if (!status || !profileContainer || !idInput || !openButton) {
    console.error('[BeeFlix Profiles] Expected page elements were not found.');
    return;
  }

  if (!window.ApiClient) {
    status.textContent = 'The profile page loaded, but Jellyfin ApiClient is unavailable. Refresh Jellyfin and try again.';
    status.classList.add('bf-error');
    return;
  }

  window.BeeFlixProfilesPageInitialized = true;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  async function loadProfile(id) {
    status.textContent = 'Loading member reviews…';
    status.classList.remove('bf-error');
    profileContainer.replaceChildren();

    try {
      const endpoint = ApiClient.getUrl(`/BeeFlixProfiles/users/${encodeURIComponent(id)}/reviews?limit=50&offset=0`);
      const data = await ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' });
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];
      const ratings = reviews.map(review => Number(review.rating)).filter(n => Number.isFinite(n) && n > 0);
      const average = ratings.length
        ? (ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1)
        : '—';

      let member = null;
      try {
        member = await ApiClient.getUser(id);
      } catch (_) {
        // User lookup may fail if the viewer cannot access that user; review API remains authoritative.
      }

      const avatarUrl = ApiClient.getUrl(`/Users/${encodeURIComponent(id)}/Images/Primary?width=144&quality=90`);
      const displayName = member?.Name || reviews[0]?.userName || 'BeeFlix member';
      const reviewMarkup = reviews.length ? reviews.map(review => `
        <article class="bf-review">
          <div>
            <strong>${escapeHtml((review.mediaType || 'Media').toUpperCase())} · TMDB ${escapeHtml(review.tmdbId || '?')}</strong>
            ${review.rating != null ? `<span class="bf-rating">★ ${escapeHtml(review.rating)}/5</span>` : ''}
          </div>
          <p>${escapeHtml(review.content || 'Rated without a written review')}</p>
          <small class="bf-muted">${escapeHtml(review.updatedAt || review.createdAt || '')}</small>
        </article>`).join('') : '<p class="bf-muted">No visible reviews were returned for this member.</p>';

      const avatar = document.createElement('img');
      avatar.className = 'bf-avatar';
      avatar.alt = '';
      avatar.src = avatarUrl;
      avatar.onerror = () => { avatar.style.visibility = 'hidden'; };

      const section = document.createElement('section');
      section.className = 'bf-card';
      section.innerHTML = `
        <div class="bf-profile-head">
          <div id="bf-avatar-placeholder" aria-hidden="true"></div>
          <div>
            <h2 id="bf-member-name"></h2>
            <span class="bf-pill" id="bf-review-count"></span>
            <span class="bf-pill" id="bf-average-rating"></span>
          </div>
        </div>`;
      section.querySelector('#bf-avatar-placeholder').replaceWith(avatar);
      section.querySelector('#bf-member-name').textContent = displayName;
      section.querySelector('#bf-review-count').textContent = `${data.total ?? reviews.length} reviews`;
      section.querySelector('#bf-average-rating').textContent = `Average rating: ${average}`;

      const history = document.createElement('section');
      history.className = 'bf-card';
      const heading = document.createElement('h2');
      heading.textContent = 'Review history';
      const reviewsList = document.createElement('div');
      reviewsList.innerHTML = reviewMarkup;
      history.append(heading, reviewsList);

      profileContainer.replaceChildren(section, history);
      status.textContent = `Loaded ${reviews.length} of ${data.total ?? reviews.length} visible reviews.`;
    } catch (error) {
      console.error('[BeeFlix Profiles] Failed to load profile:', error);
      status.textContent = `Could not load profile: ${error?.message || error}. Check the plugin status and Jellyfin server logs.`;
      status.classList.add('bf-error');
    }
  }

  openButton.addEventListener('click', () => {
    const id = idInput.value.trim();
    if (id) {
      loadProfile(id);
    } else {
      status.textContent = 'Enter a Jellyfin user ID first.';
    }
  });

  idInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') openButton.click();
  });

  status.textContent = 'Profile tools loaded. Enter a Jellyfin user ID to look up its reviews.';
})();
