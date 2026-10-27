(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  async function loadProfile(id) {
    $('#status').textContent = 'Loading member reviews…';
    $('#status').classList.remove('error');
    $('#profile').replaceChildren();
    try {
      const endpoint = ApiClient.getUrl(`/BeeFlixProfiles/users/${encodeURIComponent(id)}/reviews?limit=50&offset=0`);
      const data = await ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' });
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];
      const ratings = reviews.map(review => Number(review.rating)).filter(n => Number.isFinite(n) && n > 0);
      const average = ratings.length ? (ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1) : '—';
      const member = await ApiClient.getUser(id).catch(() => null);
      const avatarUrl = ApiClient.getUrl(`/Users/${encodeURIComponent(id)}/Images/Primary?width=144&quality=90`);
      const displayName = member?.Name || reviews[0]?.userName || 'BeeFlix member';
      const reviewMarkup = reviews.length ? reviews.map(review => `
        <article class="review">
          <div><strong>${escapeHtml(review.mediaType || 'Media')} · TMDB ${escapeHtml(review.tmdbId || '?')}</strong>
          ${review.rating != null ? `<span class="rating">★ ${escapeHtml(review.rating)}/5</span>` : ''}</div>
          <p>${escapeHtml(review.content || 'Rated without a written review')}</p>
          <small class="muted">${escapeHtml(review.updatedAt || review.createdAt || '')}</small>
        </article>`).join('') : '<p class="muted">No reviews found for this member.</p>';

      $('#profile').innerHTML = `
        <section class="card">
          <div class="head">
            <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.style.visibility='hidden'">
            <div><h2>${escapeHtml(displayName)}</h2>
              <span class="pill">${escapeHtml(data.total ?? reviews.length)} reviews</span>
              <span class="pill">Average rating: ${average}</span>
            </div>
          </div>
        </section>
        <section class="card"><h2>Review history</h2>${reviewMarkup}</section>`;
      $('#status').textContent = `Loaded ${reviews.length} of ${data.total ?? reviews.length} visible reviews.`;
    } catch (error) {
      $('#status').textContent = `Could not load profile: ${error?.message || error}. Check the plugin status and server logs.`;
      $('#status').classList.add('error');
    }
  }

  $('#open').addEventListener('click', () => {
    const id = $('#uid').value.trim();
    if (id) loadProfile(id);
    else $('#status').textContent = 'Enter a Jellyfin user ID first.';
  });
  $('#uid').addEventListener('keydown', event => {
    if (event.key === 'Enter') $('#open').click();
  });
})();
