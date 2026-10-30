# BeeFlix Community Hub — v0.6.0 implementation notes

## Goal

Turn BeeFlix Profiles into a feed-first community hub while preserving Jellyfin Enhanced as the source of truth for reviews and Jellyfin as the source of truth for playback state.

This work is being developed on `feature/community-hub-achievements-v0.6.0`. The existing `feature/shareable-member-profiles-v0.5.0` branch and `v0.5.1.0-preview` release are not part of this work.

## Product direction

- Community Activity is the landing view.
- Members directory and individual profiles are secondary destinations.
- Feed cards identify the author, title, media type, rating, review text, and date.
- Profiles show watched movies, completed TV series, review totals, achievements, and equipped cosmetics.
- Movie and TV achievements have separate progressions.
- Achievements are retroactive and permanent once earned.
- Cosmetic rewards are earned through activity, selectable by the member, and purely visual.

## Existing sources of truth

### Reviews

Continue reading reviews from Jellyfin Enhanced's existing review store. Do not create a second review database and do not modify TMDB/IMDb ratings or metadata.

The current controller discovers Enhanced's active plugin instance and its `UserConfigurationManager.GetAllReviews()` method through reflection. The current review endpoint already applies hidden/disabled-member visibility checks. A future feed endpoint must use the same policy and must not expose activity from members who are not visible to the requesting viewer.

### Playback history

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

## Cosmetics

Initial reward categories:

- Profile banners
- Profile backgrounds
- Review-card accent and styling options

Unlocks are permanent. Members can equip and change unlocked cosmetics freely. Cosmetic styling must never change review visibility, ratings, voting rights, or moderation.

Persist only BeeFlix-owned cosmetic selections/unlock metadata. Do not duplicate playback history or review content. Match cosmetic/profile visibility to the existing member visibility policy.

## Delivery sequence

1. **Data and privacy foundation:** inspect Jellyfin 12 query/playstate behavior; define tested movie and series counting rules; factor shared member visibility logic so feed and profile APIs cannot drift.
2. **Community feed:** add a paginated chronological endpoint over Enhanced reviews and make the feed the default page.
3. **Navigation and profiles:** add Feed / Members navigation and profile deep links without removing existing shareable URLs.
4. **Watch stats and achievements:** add movie and completed-series counts, milestone progress, and retroactive unlock calculations.
5. **Cosmetics:** add persistence, unlock mapping, equipment API, and customization UI.
6. **Validation:** JavaScript syntax checks, .NET 10 build, API/privacy tests where practical, and manual Jellyfin 12 verification before any release.

## Non-goals

- No merge to `main` or release publication without explicit approval.
- No changes to Jellyfin Enhanced's review data.
- No external TMDB/IMDb score manipulation.
- No public exposure of hidden/disabled member activity.
- No duplicate watch-history database.
