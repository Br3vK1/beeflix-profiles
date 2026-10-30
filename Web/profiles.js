(() => {
  'use strict';

  // Jellyfin's SPA can retain previous plugin-page DOM nodes during navigation.
  // Always bind this script instance to the newest visible BeeFlix page root.
  const pageRoots = Array.from(document.querySelectorAll('#BeeFlixProfilesPage'));
  const pageRoot = pageRoots.filter(root =>
    root.isConnected &&
    root.getClientRects().length > 0 &&
    getComputedStyle(root).visibility !== 'hidden' &&
    !root.closest('[hidden]')
  ).at(-1) || pageRoots.at(-1);
  if (!pageRoot) {
    console.error('[BeeFlix Profiles] No active Community page root was found.');
    return;
  }
  const $ = (selector) => pageRoot.querySelector(selector);
  const status = $('#bf-status');
  const profileContainer = $('#bf-profile-result');
  const feedContainer = $('#bf-community-feed');
  const pickerToggle = $('#bf-member-picker-toggle');
  const pickerMenu = $('#bf-member-picker-menu');
  const selectedName = $('#bf-selected-name');
  const selectedAvatar = $('#bf-selected-avatar');
  const memberSearch = $('#bf-member-search');
  const memberList = $('#bf-member-list');

  if (!status || !profileContainer || !feedContainer || !pickerToggle || !pickerMenu ||
      !selectedName || !selectedAvatar || !memberSearch || !memberList) {
    console.error('[BeeFlix Profiles] Expected page elements were not found.');
    return;
  }

  if (!window.ApiClient) {
    status.textContent = 'The page loaded, but Jellyfin ApiClient is unavailable. Refresh Jellyfin and try again.';
    status.classList.add('bf-error');
    return;
  }

  // Jellyfin may reuse the page root while replacing its child elements. A boolean
  // flag on the root is not sufficient: it can suppress initialization even though
  // all the controls it was bound to have been replaced. Track the actual elements.
  const instanceMap = window.__BeeFlixProfilesPageInstances
    || (window.__BeeFlixProfilesPageInstances = new WeakMap());
  const previousInstance = instanceMap.get(pageRoot);
  if (previousInstance &&
      previousInstance.status === status &&
      previousInstance.profileContainer === profileContainer &&
      previousInstance.pickerToggle === pickerToggle &&
      previousInstance.memberList === memberList) {
    console.info('[BeeFlix Profiles] This page instance is already initialized; skipping duplicate execution.');
    return;
  }
  previousInstance?.cleanup?.();
  window.BeeFlixProfilesPageInitialized = true;

  let activeView = 'community';
  let activityRequestSequence = 0;

  function setActiveView(view) {
    activeView = view === 'profile' ? 'profile' : 'community';
    const showProfile = activeView === 'profile';
    pageRoot.classList.toggle('bf-view-profile', showProfile);
    const profileSearchbar = profileContainer.querySelector('.bf-profile-searchbar');
    const picker = pageRoot.querySelector('.bf-member-picker');
    const pickerHost = showProfile ? profileSearchbar : pageRoot.querySelector('.bf-directory-card .bf-member-picker');
    if (pickerHost && picker && picker.parentElement !== pickerHost) pickerHost.appendChild(picker);
    profileContainer.hidden = !showProfile;
    feedContainer.hidden = showProfile;
    if (showProfile) {
      profileContainer.removeAttribute('hidden');
      profileContainer.style.setProperty('display', 'block', 'important');
      profileContainer.style.setProperty('visibility', 'visible', 'important');
      profileContainer.style.setProperty('opacity', '1', 'important');
      profileContainer.style.setProperty('min-height', '1px', 'important');
    } else {
      profileContainer.style.removeProperty('min-height');
      profileContainer.style.removeProperty('display');
      profileContainer.style.removeProperty('visibility');
      profileContainer.style.removeProperty('opacity');
    }
  }

  function revealProfileContainer() {
    setActiveView('profile');
  }

  const buildLabel = $('#bf-build-version');
  if (buildLabel) {
    ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('/BeeFlixProfiles/health'), dataType: 'json' })
      .then(info => {
        buildLabel.textContent = 'Build ' + String(info.version || 'unknown');
        buildLabel.title = 'BeeFlix Profiles server build ' + String(info.version || 'unknown');
      })
      .catch(error => {
        buildLabel.textContent = 'Build unavailable · health check failed';
        buildLabel.title = 'The page script is running, but the health endpoint could not be reached: ' + String(error);
      });
  }

  let members = [];
  let selectedMember = null;
  let isMemberListOpen = false;
  let profileRequestSequence = 0;
  let profileState = { userId: null, total: 0, reviews: [], stats: null, achievements: null };
  let activityState = { items: [], visibleCount: 50, total: 0, loading: false };

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

  // Local SVG fallback keeps member cards consistent when no Jellyfin primary image exists.
  function fallbackAvatarUrl(name) {
    const initials = String(name || '?').trim().split(/\\s+/).slice(0, 2)
      .map(part => part.charAt(0).toLocaleUpperCase()).join('') || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f4d35e"/><stop offset="1" stop-color="#d9a928"/>
      </linearGradient></defs>
      <rect width="96" height="96" rx="48" fill="url(#g)"/>
      <circle cx="48" cy="35" r="17" fill="#252b38" opacity=".92"/>
      <path d="M15 86c2-20 15-31 33-31s31 11 33 31" fill="#252b38" opacity=".92"/>
      <text x="48" y="91" text-anchor="middle" font-family="Arial,sans-serif" font-size="1" fill="#252b38">${initials}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function useFallbackAvatar(image, name) {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallbackAvatarUrl(name);
      image.classList.add('bf-avatar-fallback');
    };
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
      useFallbackAvatar(image, member.userName);

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
    useFallbackAvatar(selectedAvatar, member.userName);
    selectedAvatar.hidden = false;
    setPickerOpen(false);
    renderMemberList(memberSearch.value);
    if (options.updateUrl !== false) updateProfileUrl(member);
    activityRequestSequence += 1; // invalidate any feed request started before this navigation
    revealProfileContainer();
    loadProfile(member, false);
  }

  function addStat(container, label, value, iconName) {
    const card = document.createElement('div');
    card.className = 'bf-stat';
    const icon = document.createElement('span');
    icon.className = 'material-icons bf-stat-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconName;
    const valueNode = document.createElement('strong');
    valueNode.textContent = String(value);
    const labelNode = document.createElement('span');
    labelNode.className = 'bf-muted';
    labelNode.textContent = label;
    card.append(icon, valueNode, labelNode);
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


  function activityDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function findMember(userId, userName) {
    return members.find(member => normalizeId(member.userId) === normalizeId(userId))
      || { userId: String(userId || ''), userName: String(userName || 'BeeFlix member') };
  }

  function buildActivityCard(entry) {
    const card = document.createElement('article');
    card.className = 'bf-activity-card';

    const member = findMember(entry.UserId, entry.UserName);
    const avatarLink = document.createElement('a');
    avatarLink.className = 'bf-activity-avatar-link';
    avatarLink.href = profileUrl(member);
    avatarLink.title = 'Open member profile';
    avatarLink.addEventListener('click', event => {
      event.preventDefault();
      selectMember(member);
    });
    const avatar = document.createElement('img');
    avatar.className = 'bf-activity-avatar';
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.src = avatarUrl(member.userId, 96);
    useFallbackAvatar(avatar, member.userName);
    avatarLink.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'bf-activity-body';
    const headline = document.createElement('p');
    headline.className = 'bf-activity-headline';
    const author = document.createElement('a');
    author.className = 'bf-activity-author';
    author.href = profileUrl(member);
    author.textContent = member.userName;
    author.addEventListener('click', event => {
      event.preventDefault();
      selectMember(member);
    });

    const type = String(entry.ActivityType || '');
    const verb = document.createElement('span');
    if (type === 'Reviewed') verb.textContent = ' reviewed ';
    else if (type === 'Favorited') verb.textContent = ' added to favorites ';
    else if (type === 'Watched') verb.textContent = entry.Completed ? ' finished watching ' : ' watched ';
    else if (type === 'AchievementUnlocked') verb.textContent = ' unlocked ';
    else verb.textContent = ' had activity on ';

    const item = entry.Item || {};
    const itemId = String(item.Id || '');
    const title = document.createElement('a');
    title.className = 'bf-activity-title';
    title.textContent = type === 'AchievementUnlocked'
      ? String(entry.AchievementName || 'an achievement')
      : String(item.SeriesName
        ? item.SeriesName + (item.SeasonNumber != null && item.EpisodeNumber != null
          ? ` · S${item.SeasonNumber}:E${item.EpisodeNumber} · ${item.Name || ''}` : '')
        : item.Name || 'an unavailable title');
    if (type === 'AchievementUnlocked') {
      title.href = profileUrl(member);
      title.title = 'View this member’s achievements';
      title.addEventListener('click', event => {
        event.preventDefault();
        selectMember(member);
      });
    } else if (/^[0-9a-f]{32}$/i.test(itemId)) {
      title.href = `#/details?id=${encodeURIComponent(itemId)}`;
      title.title = 'Open in Jellyfin';
    } else {
      title.removeAttribute('href');
    }

    headline.append(author, verb, title);
    body.appendChild(headline);

    if (type === 'Reviewed' && entry.Rating != null) {
      const rating = document.createElement('div');
      rating.className = 'bf-activity-rating';
      rating.textContent = `★ ${Number(entry.Rating).toFixed(1).replace(/\.0$/, '')}/5`;
      body.appendChild(rating);
    }
    if (type === 'Reviewed' && entry.Content) {
      const excerpt = document.createElement('p');
      excerpt.className = 'bf-activity-excerpt';
      excerpt.textContent = String(entry.Content);
      body.appendChild(excerpt);
    }
    if (type === 'Watched' && !entry.Completed && Number(entry.Progress) > 0) {
      const progress = document.createElement('span');
      progress.className = 'bf-activity-progress-label';
      progress.textContent = `Playback progress: ${Math.round(Math.max(0, Math.min(1, Number(entry.Progress))) * 100)}%`;
      body.appendChild(progress);
    }

    const time = document.createElement('time');
    time.className = 'bf-activity-time';
    time.textContent = activityDate(entry.Timestamp);
    if (Number.isFinite(Number(entry.Timestamp))) time.dateTime = new Date(Number(entry.Timestamp)).toISOString();
    body.appendChild(time);

    const visual = document.createElement('a');
    visual.className = 'bf-activity-visual';
    if (/^[0-9a-f]{32}$/i.test(itemId)) {
      visual.href = `#/details?id=${encodeURIComponent(itemId)}`;
      const poster = document.createElement('img');
      poster.loading = 'lazy';
      poster.alt = '';
      poster.src = ApiClient.getUrl(`/Items/${encodeURIComponent(itemId)}/Images/Primary?width=220&quality=85`);
      poster.onerror = () => { visual.textContent = '🎬'; };
      visual.appendChild(poster);
    } else {
      if (type === 'AchievementUnlocked') {
        visual.href = profileUrl(member);
        visual.textContent = '🏅';
        visual.title = 'View this member’s achievements';
        visual.addEventListener('click', event => {
          event.preventDefault();
          selectMember(member);
        });
      } else {
        visual.textContent = type === 'Reviewed' ? '★' : type === 'Favorited' ? '♥' : '▶';
        visual.setAttribute('aria-hidden', 'true');
      }
    }
    card.append(avatarLink, body, visual);
    return card;
  }

  function renderCommunityFeed() {
    const section = document.createElement('section');
    section.className = 'bf-card bf-community-card';
    const heading = document.createElement('div');
    heading.className = 'bf-section-heading';
    const title = document.createElement('h2');
    title.textContent = 'Community activity';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'bf-feed-refresh';
    refresh.textContent = activityState.loading ? 'Refreshing…' : 'Refresh';
    refresh.disabled = activityState.loading;
    refresh.addEventListener('click', () => loadCommunityFeed(false));
    heading.append(title, refresh);

    const list = document.createElement('div');
    list.className = 'bf-activity-list';
    if (!activityState.items.length) {
      const empty = document.createElement('p');
      empty.className = 'bf-muted';
      empty.textContent = activityState.loading ? 'Loading recent activity…' : 'No community activity has been recorded yet.';
      list.appendChild(empty);
    } else {
      activityState.items.slice(0, activityState.visibleCount).forEach(entry => list.appendChild(buildActivityCard(entry)));
    }
    section.append(heading, list);

    if (activityState.visibleCount < activityState.items.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'raised emby-button bf-load-more';
      more.disabled = activityState.loading;
      more.textContent = 'Load older activity';
      more.addEventListener('click', () => {
        activityState.visibleCount = Math.min(activityState.visibleCount + 50, activityState.items.length);
        renderCommunityFeed();
        status.textContent = `Showing ${activityState.visibleCount} of ${activityState.items.length} available recent events.`;
      });
      section.appendChild(more);
    }
    feedContainer.replaceChildren(section);
  }

  async function loadCommunityFeed(append) {
    // Feed refreshes must never take over the UI after a member profile is opened.
    if (activeView !== 'community' || activityState.loading) return;
    const requestId = ++activityRequestSequence;
    activityState.loading = true;
    setActiveView('community');
    status.textContent = append ? 'Loading older community activity…' : 'Loading recent community activity…';
    status.classList.remove('bf-error');
    renderCommunityFeed();
    try {
      const endpoint = ApiClient.getUrl(`/JellyfinEnhanced/activity?limit=200`);
      const [data, beeFlixActivity] = await Promise.all([
        ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' }),
        ApiClient.ajax({
          type: 'GET',
          url: ApiClient.getUrl('/BeeFlixProfiles/activity/achievements?limit=100'),
          dataType: 'json'
        }).catch(error => {
          console.warn('[BeeFlix Profiles] Achievement activity unavailable:', error);
          return { items: [] };
        })
      ]);
      if (requestId !== activityRequestSequence || activeView !== 'community') return;
      const enhancedItems = Array.isArray(data.items) ? data.items : [];
      const achievementItems = Array.isArray(beeFlixActivity.items) ? beeFlixActivity.items : [];
      const page = enhancedItems.concat(achievementItems)
        .sort((a, b) => Number(b.Timestamp || 0) - Number(a.Timestamp || 0))
        .slice(0, 200);
      activityState = {
        items: append ? activityState.items.concat(page) : page,
        visibleCount: append ? activityState.visibleCount : 50,
        total: page.length,
        loading: false
      };
      renderCommunityFeed();
      status.textContent = activityState.items.length
        ? `Showing ${Math.min(activityState.visibleCount, activityState.items.length)} of ${activityState.items.length} available recent events${activityState.items.length === 200 ? ' (Enhanced API limit)' : ''}.`
        : 'No community activity is available yet.';
    } catch (error) {
      if (requestId !== activityRequestSequence || activeView !== 'community') return;
      activityState.loading = false;
      const reason = await describeApiError(error);
      if (requestId !== activityRequestSequence || activeView !== 'community') return;
      renderCommunityFeed();
      const message = /404/.test(reason)
        ? 'Jellyfin Enhanced Activity Feed is disabled or unavailable. An administrator needs to enable Activity Feed in Jellyfin Enhanced settings.'
        : `Could not load community activity: ${reason}`;
      status.textContent = message;
      status.classList.add('bf-error');
      const hint = document.createElement('p');
      hint.className = 'bf-muted bf-feed-hint';
      hint.textContent = 'BeeFlix uses Enhanced for historical watch and review events. It does not access live streams.';
      feedContainer.querySelector('.bf-community-card')?.appendChild(hint);
    }
  }

  function showCommunity() {
    selectedMember = null;
    profileRequestSequence += 1; // ignore a profile response that finishes after leaving it
    selectedName.textContent = 'Browse members';
    selectedAvatar.hidden = true;
    updateProfileUrl(null);
    activityState.loading = false;
    setActiveView('community');
    loadCommunityFeed(false);
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

  function renderAchievementsPage(member, achievementData) {
    const page = document.createElement('section');
    page.className = 'bf-card bf-achievements-full-page';
    const heading = document.createElement('div');
    heading.className = 'bf-section-heading';
    const title = document.createElement('h2');
    title.textContent = member.userName + ' · Achievements';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'bf-inline-link';
    back.textContent = '← Back to profile';
    back.addEventListener('click', () => loadProfile(member, false));
    heading.append(title, back);
    const summary = document.createElement('p');
    summary.className = 'bf-muted';
    summary.textContent = achievementData
      ? `${(achievementData.achievements || []).filter(item => item.unlocked).length} of ${(achievementData.achievements || []).length} achievements unlocked · ${achievementData.movieCount || 0} movies watched · ${achievementData.watchedSeriesCount || 0} series watched`
      : 'Achievement data is unavailable.';
    const grid = document.createElement('div');
    grid.className = 'bf-achievement-grid';
    const achievements = Array.isArray(achievementData?.achievements) ? achievementData.achievements : [];
    achievements.forEach(item => {
      const card = document.createElement('article');
      card.className = 'bf-achievement' + (item.unlocked ? ' is-unlocked' : ' is-locked');
      const icon = document.createElement('span');
      icon.className = 'bf-achievement-icon';
      icon.textContent = item.unlocked ? '🏅' : '🔒';
      icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div');
      copy.className = 'bf-achievement-copy';
      const name = document.createElement('h3');
      name.textContent = item.name || 'Achievement';
      const description = document.createElement('p');
      description.textContent = item.description || '';
      const track = document.createElement('div');
      track.className = 'bf-achievement-track';
      const fill = document.createElement('span');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, Number(item.progress) || 0)) * 100)}%`;
      track.appendChild(fill);
      const progress = document.createElement('small');
      progress.className = 'bf-muted';
      progress.textContent = item.unlocked
        ? (item.retroactive ? 'Earned from existing library history' : 'Unlocked')
        : `${Number(item.currentCount) || 0} / ${Number(item.threshold) || 0}`;
      copy.append(name, description, track, progress);
      card.append(icon, copy);
      grid.appendChild(card);
    });
    if (!achievements.length) {
      const empty = document.createElement('p');
      empty.className = 'bf-muted';
      empty.textContent = achievementData ? 'No achievements are available yet.' : 'Achievement data could not be loaded.';
      grid.appendChild(empty);
    }
    page.append(heading, summary, grid);
    profileContainer.replaceChildren(page);
    revealProfileContainer();
  }

  function renderProfile(member, stats, reviews, total, isLoadingMore, achievementData, profileActivity = []) {
    const section = document.createElement('section');
    section.className = 'bf-card bf-profile-card';

    const profileSearchbar = document.createElement('div');
    profileSearchbar.className = 'bf-profile-searchbar';
    profileSearchbar.setAttribute('role', 'search');
    const hero = document.createElement('div');
    hero.className = 'bf-profile-hero';
    const backdropLayer = document.createElement('div');
    backdropLayer.className = 'bf-hero-backdrops';
    const heroItemIds = [...profileActivity.map(entry => String(entry.Item?.Id || '')),
      ...reviews.map(review => String(review.jellyfinItemId || ''))]
      .filter((id, index, all) => /^[0-9a-f]{32}$/i.test(id) && all.indexOf(id) === index)
      .slice(0, 3);
    heroItemIds.forEach(id => {
      const image = document.createElement('img');
      image.className = 'bf-hero-backdrop';
      image.alt = '';
      image.loading = 'lazy';
      image.src = ApiClient.getUrl(`/Items/${encodeURIComponent(id)}/Images/Backdrop?maxWidth=1800&quality=85`);
      image.onerror = () => {
        image.onerror = null;
        image.src = ApiClient.getUrl(`/Items/${encodeURIComponent(id)}/Images/Primary?maxWidth=1800&quality=85`);
      };
      backdropLayer.appendChild(image);
    });
    hero.appendChild(backdropLayer);

    const heroContent = document.createElement('div');
    heroContent.className = 'bf-profile-hero-content';

    const header = document.createElement('div');
    header.className = 'bf-profile-head';
    const avatar = document.createElement('img');
    avatar.className = 'bf-avatar';
    avatar.alt = '';
    avatar.src = avatarUrl(member.userId, 180);
    useFallbackAvatar(avatar, member.userName);

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
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'raised emby-button bf-community-back';
    back.textContent = '← Community activity';
    back.addEventListener('click', showCommunity);
    actions.appendChild(back);
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'raised emby-button bf-share-button';
    share.textContent = 'Share profile link';
    share.addEventListener('click', () => copyText(profileUrl(member)));
    actions.appendChild(share);
    const heroBrand = document.createElement('p');
    heroBrand.className = 'bf-profile-hero-brand';
    const heroBrandIcon = document.createElement('span');
    heroBrandIcon.className = 'material-icons';
    heroBrandIcon.textContent = 'groups';
    heroBrand.append(heroBrandIcon, document.createTextNode('BEEFLIX · COMMUNITY'));
    heroContent.append(heroBrand, header, actions);
    hero.appendChild(heroContent);
    section.appendChild(hero);

    const statGrid = document.createElement('div');
    statGrid.className = 'bf-stat-grid';
    const reviewCount = stats?.reviewCount ?? total;
    addStat(statGrid, 'Movies watched', achievementData?.movieCount ?? '—', 'movie');
    addStat(statGrid, 'Series watched', achievementData?.watchedSeriesCount ?? '—', 'live_tv');
    addStat(statGrid, 'Reviews', reviewCount, 'rate_review');
    const avg = stats?.averageRating == null ? '—' : Number(stats.averageRating).toFixed(1) + ' / 5';
    addStat(statGrid, 'Average rating', avg, 'star');
    section.appendChild(statGrid);

    const achievements = Array.isArray(achievementData?.achievements) ? achievementData.achievements : [];
    const achievementSection = document.createElement('section');
    achievementSection.className = 'bf-card bf-achievements-card';
    achievementSection.id = 'bf-achievements';
    const achievementHeading = document.createElement('div');
    achievementHeading.className = 'bf-section-heading';
    const achievementTitle = document.createElement('h2');
    achievementTitle.textContent = 'Achievements';
    const achievementCounts = document.createElement('span');
    achievementCounts.className = 'bf-muted';
    achievementCounts.textContent = achievementData
      ? `${achievements.filter(item => item.unlocked).length} / ${achievements.length} unlocked`
      : 'Viewing milestones';
    achievementHeading.append(achievementTitle, achievementCounts);
    achievementSection.appendChild(achievementHeading);

    const achievementPreview = document.createElement('div');
    achievementPreview.className = 'bf-achievement-preview';
    const recentUnlocks = achievements.filter(item => item.unlocked)
      .sort((a, b) => String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || '')))
      .slice(0, 3);
    const almostThere = achievements.filter(item => !item.unlocked && Number(item.progress) > 0)
      .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
      .slice(0, 2);
    const addAchievementPreview = (item, locked) => {
      const row = document.createElement('div');
      row.className = 'bf-achievement-preview-row' + (locked ? ' is-locked' : ' is-unlocked');
      const icon = document.createElement('span');
      icon.className = 'bf-achievement-icon';
      icon.textContent = locked ? '🔒' : '🏅';
      const copy = document.createElement('div');
      copy.className = 'bf-achievement-copy';
      const name = document.createElement('strong');
      name.textContent = item.name || 'Achievement';
      const detail = document.createElement('small');
      detail.className = 'bf-muted';
      const progressValue = Math.max(0, Math.min(100, Math.round((Number(item.progress) || (item.unlocked ? 1 : 0)) * 100)));
      detail.textContent = locked
        ? `${Number(item.currentCount) || 0} / ${Number(item.threshold) || 0} · ${progressValue}%`
        : (item.retroactive ? 'Earned from existing library history' : 'Recently unlocked');
      const track = document.createElement('div');
      track.className = 'bf-achievement-mini-track';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(progressValue));
      const fill = document.createElement('span');
      fill.style.width = progressValue + '%';
      track.appendChild(fill);
      copy.append(name, detail, track);
      row.append(icon, copy);
      achievementPreview.appendChild(row);
    };
    recentUnlocks.forEach(item => addAchievementPreview(item, false));
    almostThere.forEach(item => addAchievementPreview(item, true));
    if (!recentUnlocks.length && !almostThere.length) {
      const emptyAchievements = document.createElement('p');
      emptyAchievements.className = 'bf-muted';
      emptyAchievements.textContent = achievementData
        ? 'No recent unlocks yet. Your next milestone is waiting.'
        : 'Achievement data is unavailable.';
      achievementPreview.appendChild(emptyAchievements);
    }
    achievementSection.appendChild(achievementPreview);
    const achievementOpen = document.createElement('button');
    achievementOpen.type = 'button';
    achievementOpen.className = 'bf-achievements-view-all';
    achievementOpen.textContent = 'View all achievements →';
    achievementOpen.addEventListener('click', () => renderAchievementsPage(member, achievementData));
    achievementSection.appendChild(achievementOpen);

    const activitySection = document.createElement('section');
    activitySection.className = 'bf-card bf-profile-activity';
    const activityHeading = document.createElement('div');
    activityHeading.className = 'bf-section-heading';
    const activityTitle = document.createElement('h2');
    activityTitle.textContent = 'Recent activity';
    const activityCount = document.createElement('span');
    activityCount.className = 'bf-muted';
    activityCount.textContent = profileActivity.length ? `${profileActivity.length} events` : '';
    activityHeading.append(activityTitle, activityCount);
    const activityList = document.createElement('div');
    activityList.className = 'bf-activity-list';
    const activityVisibleCount = 2;
    if (profileActivity.length) {
      profileActivity.slice(0, activityVisibleCount).forEach(entry => activityList.appendChild(buildActivityCard(entry)));
    } else {
      const emptyActivity = document.createElement('p');
      emptyActivity.className = 'bf-muted';
      emptyActivity.textContent = 'No recent activity recorded for this member.';
      activityList.appendChild(emptyActivity);
    }
    activitySection.append(activityHeading, activityList);
    if (profileActivity.length > activityVisibleCount) {
      const showMore = document.createElement('button');
      showMore.type = 'button';
      showMore.className = 'bf-inline-link bf-activity-show-more';
      showMore.textContent = `Show more (${profileActivity.length - activityVisibleCount})`;
      showMore.addEventListener('click', () => {
        const expanded = activityList.dataset.expanded === 'true';
        activityList.dataset.expanded = String(!expanded);
        activityList.replaceChildren();
        profileActivity.slice(0, expanded ? activityVisibleCount : profileActivity.length)
          .forEach(entry => activityList.appendChild(buildActivityCard(entry)));
        showMore.textContent = expanded ? `Show more (${profileActivity.length - activityVisibleCount})` : 'Show less ↑';
      });
      activitySection.appendChild(showMore);
    }

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
    const overview = document.createElement('div');
    overview.className = 'bf-profile-overview';
    const mainColumn = document.createElement('div');
    mainColumn.className = 'bf-profile-main';
    const sideColumn = document.createElement('aside');
    sideColumn.className = 'bf-profile-sidebar';
    mainColumn.append(activitySection, history);
    sideColumn.appendChild(achievementSection);
    overview.append(mainColumn, sideColumn);
    profileContainer.replaceChildren(profileSearchbar, section, overview);
    const picker = pageRoot.querySelector('.bf-member-picker');
    if (picker) profileSearchbar.appendChild(picker);
    revealProfileContainer();
  }

  async function loadProfile(member, append) {
    const id = member.userId;
    const requestId = ++profileRequestSequence;
    const isSameProfile = normalizeId(profileState.userId) === normalizeId(id);
    const existingReviews = append && isSameProfile ? profileState.reviews : [];
    const offset = existingReviews.length;
    const cachedStats = append && isSameProfile ? profileState.stats : null;
    const cachedTotal = append && isSameProfile ? profileState.total : 0;
    const cachedAchievements = append && isSameProfile ? profileState.achievements : null;

    status.textContent = append
      ? `Loading more of ${member.userName}’s reviews…`
      : `Loading ${member.userName}’s profile…`;
    status.classList.remove('bf-error');
    if (!append) {
      profileContainer.replaceChildren();
      const loading = document.createElement('section');
      loading.className = 'bf-card bf-profile-loading';
      loading.setAttribute('role', 'status');
      loading.textContent = `Loading ${member.userName}’s BeeFlix profile…`;
      profileContainer.appendChild(loading);
    } else if (isSameProfile) {
      renderProfile(member, cachedStats, existingReviews, cachedTotal, true, cachedAchievements, profileState.activity || []);
    }

    try {
      const endpoint = ApiClient.getUrl(`/BeeFlixProfiles/users/${encodeURIComponent(id)}/reviews?limit=50&offset=${offset}`);
      const [data, achievementData, activityData, achievementActivityData] = await Promise.all([
        ApiClient.ajax({ type: 'GET', url: endpoint, dataType: 'json' }),
        append && cachedAchievements
          ? Promise.resolve(cachedAchievements)
          : ApiClient.ajax({
              type: 'GET',
              url: ApiClient.getUrl(`/BeeFlixProfiles/users/${encodeURIComponent(id)}/achievements`),
              dataType: 'json'
            }).catch(error => {
              console.warn('[BeeFlix Profiles] Achievement data unavailable:', error);
              return null;
            }),
        append ? Promise.resolve({ items: profileState.activity || [] }) :
          ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('/JellyfinEnhanced/activity?limit=200'), dataType: 'json' })
            .catch(error => { console.warn('[BeeFlix Profiles] Profile activity unavailable:', error); return { items: [] }; }),
        append ? Promise.resolve({ items: [] }) :
          ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('/BeeFlixProfiles/activity/achievements?limit=200'), dataType: 'json' })
            .catch(error => { console.warn('[BeeFlix Profiles] Profile achievement activity unavailable:', error); return { items: [] }; })
      ]);
      if (requestId !== profileRequestSequence) return;

      const page = Array.isArray(data.reviews) ? data.reviews : [];
      const stats = data.stats || cachedStats;
      const total = Number.isFinite(Number(data.total)) ? Number(data.total) : cachedTotal;
      const combinedReviews = append ? existingReviews.concat(page) : page;
      const profileActivity = append
        ? (profileState.activity || [])
        : [...(Array.isArray(activityData.items) ? activityData.items : []),
           ...(Array.isArray(achievementActivityData.items) ? achievementActivityData.items : [])]
          .filter(entry => normalizeId(entry.UserId || entry.userId) === normalizeId(id))
          .sort((a, b) => Number(b.Timestamp || b.timestamp || 0) - Number(a.Timestamp || a.timestamp || 0))
          .slice(0, 50);
      profileState = { userId: id, total, reviews: combinedReviews, stats, achievements: achievementData, activity: profileActivity };

      renderProfile(member, stats, combinedReviews, total, false, achievementData, profileActivity);
      status.textContent = `Showing ${combinedReviews.length} of ${total} visible reviews for ${member.userName}.`;
    } catch (error) {
      if (requestId !== profileRequestSequence) return;
      console.error('[BeeFlix Profiles] Failed to load profile:', error);
      const reason = await describeApiError(error);
      const message = `Could not load ${member.userName}’s profile: ${reason}. Check the plugin version and server logs.`;
      status.textContent = message;
      status.classList.add('bf-error');
      if (append && isSameProfile) {
        renderProfile(member, cachedStats, existingReviews, cachedTotal, false, cachedAchievements, profileState.activity || []);
      } else {
        const errorCard = document.createElement('section');
        errorCard.className = 'bf-card bf-profile-error bf-error';
        errorCard.setAttribute('role', 'alert');
        errorCard.textContent = message;
        profileContainer.replaceChildren(errorCard);
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

      status.textContent = `Loaded ${members.length} members. Browse the community activity or choose a profile.`;
      selectedName.textContent = 'Browse members';
      selectedAvatar.hidden = true;
      setActiveView('community');
      loadCommunityFeed(false);
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
  const onDocumentClick = event => {
    if (isMemberListOpen && !event.target.closest('.bf-member-picker')) setPickerOpen(false);
  };
  const onDocumentKeydown = event => {
    if (event.key === 'Escape' && isMemberListOpen) {
      setPickerOpen(false);
      pickerToggle.focus();
    }
  };
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  instanceMap.set(pageRoot, {
    status,
    profileContainer,
    pickerToggle,
    memberList,
    cleanup: () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeydown);
    }
  });

  loadMembers();
})();