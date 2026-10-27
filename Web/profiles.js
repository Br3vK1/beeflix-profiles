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

  let members = [];
  let selectedMember = null;
  let isMemberListOpen = false;
  let profileRequestSequence = 0;
  let profileState = { userId: null, total: 0, reviews: [], stats: null };

  function normalizeId(value) {
    return String(value || '').replaceAll('-', '').toLocaleLowerCase();
  }

  function getHashParts() {
    const hash = window.location.hash || '';
    const separator = hash.indexOf('?');
    return {
      route: separator >= 0 ? hash.slice(0, separator) : hash,
      params: new URLSearchParams(separator >= 0 ? hash.slice(separator + 1) : '')
    };
  }

  function requestedProfileId() {
    const fromHash = getHashParts().params.get('profileUserId');
    if (fromHash) return fromHash;
    return new URL(window.location.href).searchParams.get('profileUserId');
  }

  function profileUrl(member) {
    const url = new URL(window.location.href);
    const parts = getHashParts();
    if (parts.route) {
      parts.params.set('profileUserId', member.userId);
      url.hash = parts.route + '?' + parts.params.toString();
    } else {
      url.searchParams.set('profileUserId', member.userId);
    }
    return url.toString();
  }

  function updateProfileUrl(member) {
    const url = new URL(window.location.href);
    const parts = getHashParts();
    if (parts.route) {
      if (member) parts.params.set('profileUserId', member.userId);
      else parts.params.delete('profileUserId');
      url.hash = parts.route + (parts.params.toString() ? '?' + parts.params.toString() : '');
    } else if (member) {
      url.searchParams.set('profileUserId', member.userId);
    } else {
      url.searchParams.delete('profileUserId');
    }
    window.history.replaceState(null, '', url.toString());
  }

  async function describeApiError(error) {
    const response = error && typeof error.status === 'number'
      ? error
      : error?.response && typeof error.response.status === 'number'
        ? error.response
        : null;

    if (response) {
      let body = '';
      try {
        const readable = typeof response.clone === 'function' ? response.clone() : response;
        if (typeof readable.text === 'function') body = (await readable.text()).trim();
        else body = String(response.responseText || response.data || '').trim();
      } catch (_) {
        body = '';
      }

      if (body) {
        try {
          const parsed = JSON.parse(body);
          body = [parsed.message || parsed.error, parsed.detail].filter(Boolean).join(' — ') || body;
        } catch (_) {}
      }
      const statusLabel = [response.status, response.statusText].filter(Boolean).join(' ');
      return body ? `HTTP ${statusLabel}: ${body}` : `HTTP ${statusLabel}`;
    }

    if (typeof error === 'string') return error;
    if (error?.message && error.message !== '[object Response]') return error.message;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch (_) {}
    return String(error);
  }

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

  function selectMember(member, options = {}) {
    selectedMember = member;
    selectedName.textContent = member.userName;
    selectedAvatar.src = avatarUrl(member.userId, 96);
    selectedAvatar.alt = '';
    selectedAvatar.hidden = false;
    setPickerOpen(false);
    renderMemberList(memberSearch.value);
    if (options.updateUrl !== false) updateProfileUrl(member);
    loadProfile(member, false);
  }

  function addStat(container, label, value) {
    const card = document.createElement('div');
    card.className = 'bf-stat';
    const valueNode = document.createElement('strong');
    valueNode.textContent = String(value);
    const labelNode = document.createElement('span');
    labelNode.className = 'bf-muted';
    labelNode.textContent = label;
    card.append(valueNode, labelNode);
    container.appendChild(card);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }

  function buildReviewCard(review) {
    const article = document.createElement('article');
    article.className = 'bf-review';

    const posterFrame = document.createElement('div');
    posterFrame.className = 'bf-poster-frame';
    posterFrame.setAttribute('aria-hidden', 'true');

    const posterPlaceholder = document.createElement('div');
    posterPlaceholder.className = 'bf-poster-placeholder';
    posterPlaceholder.innerHTML = '<span class="material-icons">movie</span>';
    posterFrame.appendChild(posterPlaceholder);

    const itemId = String(review.jellyfinItemId || '');
    if (/^[0-9a-f]{32}$/i.test(itemId)) {
      const poster = document.createElement('img');
      poster.className = 'bf-review-poster';
      poster.loading = 'lazy';
      poster.alt = '';
      poster.src = ApiClient.getUrl(`/Items/${encodeURIComponent(itemId)}/Images/Primary?width=280&quality=85`);
      poster.onerror = () => poster.remove();
      poster.onload = () => posterPlaceholder.remove();
      posterFrame.appendChild(poster);
    }

    const details = document.createElement('div');
    details.className = 'bf-review-details';

    const top = document.createElement('div');
    top.className = 'bf-review-top';

    const mediaType = String(review.mediaType || 'media');
    const tmdbId = String(review.tmdbId || '');
    const isShow = /tv|series|show|episode/i.test(mediaType);
    const title = document.createElement('a');
    title.className = 'bf-review-title';
    title.textContent = review.title
      ? String(review.title)
      : 'Title unavailable';
    if (/^[0-9a-f]{32}$/i.test(itemId)) {
      title.href = `#/details?id=${encodeURIComponent(itemId)}`;
      title.title = 'Open this title in Jellyfin';
    } else if (/^\d+$/.test(tmdbId)) {
      title.href = `https://www.themoviedb.org/${isShow ? 'tv' : 'movie'}/${encodeURIComponent(tmdbId)}`;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
      title.title = 'Look up this title on TMDB';
    } else {
      title.removeAttribute('href');
    }

    const rating = document.createElement('span');
    rating.className = 'bf-rating';
    if (review.rating != null && Number.isFinite(Number(review.rating))) {
      rating.textContent = `★ ${Number(review.rating).toFixed(1).replace(/\.0$/, '')}/5`;
    } else {
      rating.textContent = 'Not rated';
      rating.classList.add('bf-rating-muted');
    }
    top.append(title, rating);

    const metadata = document.createElement('div');
    metadata.className = 'bf-review-meta';
    const kind = document.createElement('span');
    kind.className = 'bf-kind-pill';
    kind.textContent = isShow ? 'SERIES' : 'MOVIE';
    metadata.appendChild(kind);

    if (review.year != null && Number(review.year) > 1800) {
      const year = document.createElement('span');
      year.textContent = String(review.year);
      metadata.appendChild(year);
    }

    if (!review.title && /^\d+$/.test(tmdbId)) {
      const lookup = document.createElement('a');
      lookup.className = 'bf-tmdb-link';
      lookup.href = `https://www.themoviedb.org/${isShow ? 'tv' : 'movie'}/${encodeURIComponent(tmdbId)}`;
      lookup.target = '_blank';
      lookup.rel = 'noopener noreferrer';
      lookup.textContent = `Find on TMDB · ${tmdbId}`;
      metadata.appendChild(lookup);
    }

    const body = document.createElement('p');
    body.className = 'bf-review-content';
    body.textContent = review.content || 'Rated without a written review';

    const date = document.createElement('small');
    date.className = 'bf-review-date';
    date.textContent = formatDate(review.updatedAt || review.createdAt);

    details.append(top, metadata, body, date);
    article.append(posterFrame, details);
    return article;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        temporary.select();
        const success = document.execCommand('copy');
        temporary.remove();
        if (!success) throw new Error('Clipboard copy was blocked by this browser.');
      }
      status.textContent = 'Profile link copied. Anyone signed in to BeeFlix who is allowed to view this member can open it.';
      status.classList.remove('bf-error');
    } catch (error) {
      status.textContent = 'Could not copy automatically. You can copy this profile URL from the address bar: ' + text;
      status.classList.add('bf-error');
    }
  }

  function renderProfile(member, stats, reviews, total, isLoadingMore) {
    const section = document.createElement('section');
    section.className = 'bf-card bf-profile-card';

    const header = document.createElement('div');
    header.className = 'bf-profile-head';
    const avatar = document.createElement('img');
    avatar.className = 'bf-avatar';
    avatar.alt = '';
    avatar.src = avatarUrl(member.userId, 180);
    avatar.onerror = () => { avatar.style.visibility = 'hidden'; };

    const identity = document.createElement('div');
    identity.className = 'bf-profile-identity';
    const name = document.createElement('h2');
    name.className = 'bf-profile-name';
    name.textContent = member.userName;
    const subtitle = document.createElement('p');
    subtitle.className = 'bf-muted';
    subtitle.textContent = 'BeeFlix community member';
    identity.append(name, subtitle);
    header.append(avatar, identity);

    const actions = document.createElement('div');
    actions.className = 'bf-profile-actions';
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'raised emby-button bf-share-button';
    share.textContent = 'Share profile link';
    share.addEventListener('click', () => copyText(profileUrl(member)));
    actions.appendChild(share);
    section.append(header, actions);

    const statGrid = document.createElement('div');
    statGrid.className = 'bf-stat-grid';
    const reviewCount = stats?.reviewCount ?? total;
    addStat(statGrid, 'Reviews', reviewCount);
    addStat(statGrid, 'Rated reviews', stats?.ratedReviewCount ?? '—');
    const avg = stats?.averageRating == null ? '—' : Number(stats.averageRating).toFixed(1) + ' / 5';
    addStat(statGrid, 'Average rating', avg);
    section.appendChild(statGrid);

    const history = document.createElement('section');
    history.className = 'bf-card bf-history-card';
    const historyHeader = document.createElement('div');
    historyHeader.className = 'bf-section-heading';
    const heading = document.createElement('h2');
    heading.textContent = 'Reviews and ratings';
    const counter = document.createElement('span');
    counter.className = 'bf-muted';
    counter.textContent = `${reviews.length} of ${total}`;
    historyHeader.append(heading, counter);
    const reviewsList = document.createElement('div');
    reviewsList.className = 'bf-reviews-list';

    if (reviews.length) {
      reviews.forEach(review => reviewsList.appendChild(buildReviewCard(review)));
    } else {
      const empty = document.createElement('p');
      empty.className = 'bf-muted';
      empty.textContent = 'No visible reviews yet. This member has not written any reviews that are available to you.';
      reviewsList.appendChild(empty);
    }

    history.append(historyHeader, reviewsList);
    if (reviews.length < total) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'raised emby-button bf-load-more';
      more.disabled = isLoadingMore;
      more.textContent = isLoadingMore ? 'Loading more reviews…' : 'Load more reviews';
      more.addEventListener('click', () => loadProfile(member, true));
      history.appendChild(more);
    }
    profileContainer.replaceChildren(section, history);
  }

  async function loadProfile(member, append) {
    const id = member.userId;
    const requestId = ++profileRequestSequence;
    const isSameProfile = normalizeId(profileState.userId) === normalizeId(id);
    const existingReviews = append && isSameProfile ? profileState.reviews : [];
    const offset = existingReviews.length;
    const cachedStats = append && isSameProfile ? profileState.stats : null;
    const cachedTotal = append && isSameProfile ? profileState.total : 0;

    status.textContent = append
      ? `Loading more of ${member.userName}’s reviews…`
      : `Loading ${member.userName}’s profile…`;
    status.classList.remove('bf-error');
    if (!append) profileContainer.replaceChildren();
    else if (isSameProfile) renderProfile(member, cachedStats, existingReviews, cachedTotal, true);

    try {
      const endpoint = ApiClient.getUrl(`/BeeFlixProfiles/users/${encodeURIComponent(id)}/reviews?limit=50&offset=${offset}`);
      const data = await ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' });
      if (requestId !== profileRequestSequence) return;

      const page = Array.isArray(data.reviews) ? data.reviews : [];
      const stats = data.stats || cachedStats;
      const total = Number.isFinite(Number(data.total)) ? Number(data.total) : cachedTotal;
      const combinedReviews = append ? existingReviews.concat(page) : page;
      profileState = { userId: id, total, reviews: combinedReviews, stats };

      renderProfile(member, stats, combinedReviews, total, false);
      status.textContent = `Showing ${combinedReviews.length} of ${total} visible reviews for ${member.userName}.`;
    } catch (error) {
      if (requestId !== profileRequestSequence) return;
      console.error('[BeeFlix Profiles] Failed to load profile:', error);
      const reason = await describeApiError(error);
      status.textContent = `Could not load ${member.userName}’s profile: ${reason}. Check the plugin version and server logs.`;
      status.classList.add('bf-error');
      if (append && isSameProfile) {
        renderProfile(member, cachedStats, existingReviews, cachedTotal, false);
      }
    }
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

      const requestedId = requestedProfileId();
      if (requestedId) {
        const requestedMember = members.find(member => normalizeId(member.userId) === normalizeId(requestedId));
        if (requestedMember) {
          status.textContent = `Opening ${requestedMember.userName}’s profile…`;
          selectMember(requestedMember, { updateUrl: false });
        } else {
          selectedName.textContent = 'Profile unavailable';
          selectedAvatar.hidden = true;
          profileContainer.replaceChildren();
          status.textContent = 'That profile is unavailable or you do not have permission to view it.';
          status.classList.add('bf-error');
        }
        return;
      }

      status.textContent = `Loaded ${members.length} members. Choose a profile to explore.`;
      const currentUserId = ApiClient.getCurrentUserId?.();
      const currentMember = members.find(member => normalizeId(member.userId) === normalizeId(currentUserId));
      if (currentMember) selectMember(currentMember, { updateUrl: false });
    } catch (error) {
      console.error('[BeeFlix Profiles] Failed to load member directory:', error);
      selectedName.textContent = 'Could not load members';
      const reason = await describeApiError(error);
      status.textContent = `Could not load the member directory: ${reason}. Check the plugin version and server logs.`;
      status.classList.add('bf-error');
      memberList.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'bf-empty-members';
      empty.textContent = 'Could not load members. Refresh the page to try again.';
      memberList.appendChild(empty);
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