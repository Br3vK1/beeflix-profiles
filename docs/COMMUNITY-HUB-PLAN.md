# BeeFlix Community Hub — v0.6.0 implementation notes

## Goal

Turn BeeFlix Profiles into BeeFlix's social activity hub while preserving Jellyfin Enhanced as the source of truth for reviews, Jellyfin as the source of truth for playback state, and BeeFlix as the owner of its achievement/cosmetic layer.

This work is being developed on `feature/community-hub-achievements-v0.6.0`. The existing `feature/shareable-member-profiles-v0.5.0` branch and `v0.5.1.0-preview` release are not part of this work.

## Product direction

The Community tab opens to a unified, chronological activity timeline across all members visible to the viewer. It should feel like the social activity stream in Jellyfin Enhanced, but be BeeFlix-branded and extensible with BeeFlix achievements.

### Landing page layout

1. **Profile search at the top:** searchable member picker/directory. Selecting a result opens that member's profile. Existing shareable profile URLs remain supported.
2. **Community navigation:** Activity (default), Members, and profile detail. The directory is a secondary destination, not the default landing experience.
3. **Unified timeline:** one newest-first stream, not separate Watch History and Reviews sections. Each row has the member avatar/name, activity verb, title or achievement, timestamp, and relevant poster/badge visual.
4. **Refresh and progressive reveal:** refresh recent events and reveal older entries from the fetched batch. The current Enhanced endpoint accepts a `limit` (maximum 200) but does not expose an offset cursor, so true server-side pagination requires a later BeeFlix-side paging strategy.
5. **No live presence in Community:** do not show active sessions, currently-watching indicators, or live-presence polling to regular members. BeeFlix does not integrate with or display live sessions; the user's existing separate live-stream plugin remains independent and outside this project.

### Activity types

- **Playback history:** distinguish a partial watch recorded by Enhanced from a completed watch. These are historical playback-stop events, not live playback or a claim that someone is currently watching.
- **Reviewed/rated:** use Jellyfin Enhanced's review store; include rating and review excerpt where present.
- **Achievement unlocked:** BeeFlix-generated event, shown when a member crosses a permanent achievement threshold.
- **Future-compatible:** favorites and other supported Enhanced activity types can be included when enabled and useful.

### Hyperlink behavior

- Every member name/avatar links to that member's BeeFlix profile.
- Every movie, series, season, or episode title/poster links to the corresponding Jellyfin detail page.
- Every achievement badge links to the member's achievements/profile section or achievement detail.
- Search results, profile cards, and activity cards should be keyboard-accessible links/buttons with clear focus states.

## Existing sources of truth and integration

### Jellyfin Enhanced activity

The current Jellyfin Enhanced Activity Feed implementation exposes `/JellyfinEnhanced/activity?limit=50` (limit clamped to 1–200; response `{ items: [...] }`). It requires an authenticated existing Jellyfin user and returns 404 when Activity Feed is disabled. Its row model includes `ActivityType`, `UserId`, `UserName`, `UserHasPrimaryImage`, Unix-millisecond `Timestamp`, item summary, nullable `Rating`/`Content`, `Completed`, and `Progress`.

The existing Enhanced renderer separates active streams, watch history, and reviews/favorites into sections. BeeFlix consumes only the historical activity API and merges supported historical event types into one chronological timeline. The endpoint applies per-viewer filtering for hidden/disabled authors and library access; its `ActivityFeedOwnOnlyForNonAdmins` option defaults to false in the inspected Enhanced version. Live-session visibility is deliberately excluded from the member-facing Community experience. The existing separate live-stream plugin remains independent and is not integrated with BeeFlix. Confirm the installed Enhanced version's route contract and response shape before coding against it; do not assume every version has identical endpoints.

Enhanced's activity builder applies user visibility and item-access checks. BeeFlix must not bypass those checks. If consuming the API as the authenticated viewer, retain that server-side filtering. If building a BeeFlix-side merged feed from lower-level stores, reproduce the same effective filtering for member visibility and library access. Fail closed on uncertain privacy state.

### Reviews

Continue reading reviews from Jellyfin Enhanced's existing review store. Do not create a second review database and do not modify TMDB/IMDb ratings or metadata.

The current controller discovers Enhanced's active plugin instance and its `UserConfigurationManager.GetAllReviews()` method through reflection. The current review endpoint already applies hidden/disabled-member visibility checks. Feed and profile APIs must share the same policy so copied URLs cannot bypass it.

### Playback history and achievements

Jellyfin 12 exposes `IUserDataManager.GetUserData(User user, BaseItem item)`, returning `UserItemData`. The user data model includes `Played`, `PlayCount`, `LastPlayedDate`, and `PlaybackPositionTicks`. `IUserDataManager` also exposes batch retrieval with `GetUserDataBatch(IReadOnlyList<BaseItem> items, User user)`.

Jellyfin's `InternalItemsQuery` supports a user context and an `IsPlayed` filter. Prefer user-scoped queries and batch user-data reads over per-item database calls.

## Achievement definitions

### Movies

| Watched movies | Achievement |
| ---: | --- |
| 10 | Reel Deal |
| 25 | Double Feature |
| 50 | Popcorn Regular |
| 100 | Film Enthusiast |
| 250 | Film Buff |
| 500 | Movie Addict |
| 1,000 | Master Archivist |
| 2,500 | Legendary Viewer |

A movie counts when Jellyfin records it as played for that user.

### Completed TV series

| Completed series | Achievement |
| ---: | --- |
| 1 | Pilot Season |
| 5 | Binge Watcher |
| 10 | Series Regular |
| 25 | TV Enthusiast |
| 50 | Small Screen Veteran |
| 100 | Television Legend |
| 250 | Ultimate Binger |

A series counts once, not once per episode. Completion must be based on its eligible episodes and the member's playstate, not on an assumed series-container `Played` flag alone.

### TV completion policy — implementation requirement

Before shipping series counts, explicitly define and test how specials, unaired episodes, missing episodes, alternate versions, and newly added episodes affect completion. A newly released season must not silently revoke an already-earned achievement. The implementation should distinguish a series that was complete at the time it was counted from one that is still in progress, or use a clearly documented eligibility policy that keeps earned milestones stable.

### Achievement activity events

When an achievement is newly earned, generate a BeeFlix activity event that can appear in the unified feed. Avoid generating duplicate unlock events on every page load. Existing users should receive retroactive unlocks, but the product should distinguish initial backfill from new unlock moments so a first install does not flood the feed with years of old milestones.

## Cosmetics

Initial reward categories:

- Profile banners
- Profile backgrounds
- Review-card accent and styling options

Unlocks are permanent. Members can equip and change unlocked cosmetics freely. Cosmetic styling must never change review visibility, ratings, voting rights, or moderation.

Persist only BeeFlix-owned cosmetic selections/unlock metadata. Do not duplicate playback history or review content. Match cosmetic/profile visibility to the existing member visibility policy.

## Delivery sequence

1. **Data and privacy foundation:** inspect Enhanced historical activity API compatibility and Jellyfin 12 query/playstate behavior; factor shared member visibility checks. Explicitly exclude live-session data from Community.
2. **Unified activity feed:** implemented initial BeeFlix timeline UI consuming Enhanced historical activity, with member/profile and media links, refresh, and progressive reveal within the newest 200 events. Next: validate in Jellyfin, then add BeeFlix achievement events and true paging if needed.
3. **Navigation and profiles:** Activity default, Members directory secondary, clickable profile deep links, preserve current shareable URLs.
4. **Watch stats and achievements:** add movie and completed-series counts, milestone progress, retroactive unlock calculations, and BeeFlix achievement activity events.
5. **Cosmetics:** add persistence, unlock mapping, equipment API, and customization UI.
6. **Validation:** JavaScript syntax checks, .NET 10 build, API/privacy tests where practical, and manual Jellyfin 12 verification before any release.

## Non-goals

- No merge to `main` or release publication without explicit approval.
- No changes to Jellyfin Enhanced's review data.
- No external TMDB/IMDb score manipulation.
- No public exposure of hidden/disabled member activity.
- No duplicate watch-history database or duplicate Enhanced watch-event capture.
