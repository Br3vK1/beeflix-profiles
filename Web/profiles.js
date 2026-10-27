(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const status = $('#bf-status');
  const profileContainer = $('#bf-profile-result');
  const pickerToggle = $('#bf-member-picker-toggle');
  const pickerMenu = $('#bf-member-picker-menu');
  const selectedName = $('#bf-selected-name');
  const selectedAvatar = $('#bf-selected-avatar');
  const memberSearch = $('#bf-member-search');
  const memberList = $('#bf-member-list');

  if (!status || !profileContainer || !pickerToggle || !pickerMenu ||
      !selectedName || !selectedAvatar || !memberSearch || !memberList) {
    console.error('[BeeFlix Profiles] Expected page elements were not found.');
    return;
  }

  if (!window.ApiClient) {
    status.textContent = 'The page loaded, but Jellyfin ApiClient is unavailable. Refresh Jellyfin and try again.';
    status.classList.add('bf-error');
    return;
  }

  window.BeeFlixProfilesPageInitialized = true;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  let members = [];
  let selectedMember = null;
  let isMemberListOpen = false;

  function avatarUrl(userId, width = 96) {
    return ApiClient.getUrl(`/Users/${encodeURIComponent(userId)}/Images/Primary?width=${width}&quality=90`);
  }

  function setPickerOpen(open) {
    isMemberListOpen = open;
    pickerMenu.hidden = !open;
    pickerToggle.setAttribute('aria-expanded', String(open));
    const icon = pickerToggle.querySelector('.bf-chevron');
    if (icon) icon.textContent = open ? 'expand_less' : 'expand_more';
    if (open) {
      memberSearch.value = '';
      renderMemberList('');
      memberSearch.focus();
    }
  }

  function renderMemberList(filterText) {
    const query = String(filterText || '').trim().toLocaleLowerCase();
    const visibleMembers = members.filter(member => member.userName.toLocaleLowerCase().includes(query));
    memberList.replaceChildren();

    if (!visibleMembers.length) {
      const empty = document.createElement('div');
      empty.className = 'bf-empty-members';
      empty.textContent = members.length ? 'No members match that search.' : 'No members are available.';
      memberList.appendChild(empty);
      return;
    }

    for (const member of visibleMembers) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bf-member-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(selectedMember?.userId === member.userId));
      button.dataset.userId = member.userId;

      const image = document.createElement('img');
      image.className = 'bf-member-avatar';
      image.alt = '';
      image.loading = 'lazy';
      image.src = avatarUrl(member.userId, 96);
      image.onerror = () => {
        image.removeAttribute('src');
        image.style.visibility = 'hidden';
      };

      const name = document.createElement('span');
      name.className = 'bf-member-name';
      name.textContent = member.userName;

      button.append(image, name);
      button.addEventListener('click', () => selectMember(member));
      memberList.appendChild(button);
    }
  }

  function selectMember(member) {
    selectedMember = member;
    selectedName.textContent = member.userName;
    selectedAvatar.src = avatarUrl(member.userId, 96);
    selectedAvatar.alt = '';
    selectedAvatar.hidden = false;
    setPickerOpen(false);
    renderMemberList(memberSearch.value);
    loadProfile(member);
  }

  async function loadMembers() {
    status.textContent = 'Loading members…';
    status.classList.remove('bf-error');
    memberList.replaceChildren();

    try {
      const endpoint = ApiClient.getUrl('/BeeFlixProfiles/users');
      const data = await ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' });
      const source = Array.isArray(data.members) ? data.members : [];
      members = source
        .filter(member => member && typeof member.userId === 'string' && typeof member.userName === 'string')
        .map(member => ({ userId: member.userId, userName: member.userName }))
        .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }));

      renderMemberList('');
      if (!members.length) {
        selectedName.textContent = 'No members found';
        status.textContent = 'The server returned no eligible members for BeeFlix profiles.';
        return;
      }

      status.textContent = `Loaded ${members.length} members. Choose someone to see their reviews.`;
      const currentUserId = ApiClient.getCurrentUserId?.();
      const currentMember = members.find(member => member.userId.toLowerCase() === String(currentUserId || '').replaceAll('-', '').toLowerCase());
      if (currentMember) selectMember(currentMember);
    } catch (error) {
      console.error('[BeeFlix Profiles] Failed to load member directory:', error);
      selectedName.textContent = 'Could not load members';
      status.textContent = `Could not load the member directory: ${error?.message || error}. Check the plugin version and server logs.`;
      status.classList.add('bf-error');
      memberList.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'bf-empty-members';
      empty.textContent = 'Could not load members. Refresh the page to try again.';
      memberList.appendChild(empty);
    }
  }

  async function loadProfile(member) {
    const id = member.userId;
    status.textContent = `Loading ${member.userName}’s reviews…`;
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

      const avatar = document.createElement('img');
      avatar.className = 'bf-avatar';
      avatar.alt = '';
      avatar.src = avatarUrl(id, 144);
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
      section.querySelector('#bf-member-name').textContent = member.userName;
      section.querySelector('#bf-review-count').textContent = `${data.total ?? reviews.length} reviews`;
      section.querySelector('#bf-average-rating').textContent = `Average rating: ${average}`;

      const history = document.createElement('section');
      history.className = 'bf-card';
      const heading = document.createElement('h2');
      heading.textContent = 'Review history';
      const reviewsList = document.createElement('div');

      if (reviews.length) {
        for (const review of reviews) {
          const article = document.createElement('article');
          article.className = 'bf-review';

          const top = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = `${String(review.mediaType || 'MEDIA').toUpperCase()} · TMDB ${review.tmdbId || '?'}`;
          top.appendChild(title);

          if (review.rating != null) {
            const rating = document.createElement('span');
            rating.className = 'bf-rating';
            rating.textContent = `★ ${review.rating}/5`;
            top.appendChild(rating);
          }

          const body = document.createElement('p');
          body.textContent = review.content || 'Rated without a written review';
          const date = document.createElement('small');
          date.className = 'bf-muted';
          date.textContent = review.updatedAt || review.createdAt || '';
          article.append(top, body, date);
          reviewsList.appendChild(article);
        }
      } else {
        const empty = document.createElement('p');
        empty.className = 'bf-muted';
        empty.textContent = 'No visible reviews yet. This member has not written any reviews that are available to you.';
        reviewsList.appendChild(empty);
      }

      history.append(heading, reviewsList);
      profileContainer.replaceChildren(section, history);
      status.textContent = `Loaded ${reviews.length} of ${data.total ?? reviews.length} visible reviews for ${member.userName}.`;
    } catch (error) {
      console.error('[BeeFlix Profiles] Failed to load profile:', error);
      status.textContent = `Could not load ${member.userName}’s profile: ${error?.message || error}. Check the plugin version and server logs.`;
      status.classList.add('bf-error');
    }
  }

  pickerToggle.addEventListener('click', () => setPickerOpen(!isMemberListOpen));
  memberSearch.addEventListener('input', () => renderMemberList(memberSearch.value));
  document.addEventListener('click', event => {
    if (isMemberListOpen && !event.target.closest('.bf-member-picker')) setPickerOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isMemberListOpen) {
      setPickerOpen(false);
      pickerToggle.focus();
    }
  });

  loadMembers();
})();
