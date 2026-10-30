# BeeFlix Profiles — BeeFlix Community

BeeFlix Profiles is a Jellyfin 12 plugin for community profiles built on the reviews and ratings already stored by Jellyfin Enhanced. It does not create a duplicate ratings database or modify Enhanced's review data.

**Preview release:** the build is validated by CI, but the live navigation, metadata matching, and privacy behavior still need to be smoke-tested against the target BeeFlix server.

## Development build

Source branch: `feature/community-hub-achievements-v0.6.0`

Development version: `0.6.0.1` (not yet released)

### Included in this milestone

- A clearer BeeFlix visual language using honey-gold accents, layered surfaces, responsive layouts, and better spacing.
- A normal user-facing **BeeFlix Community** menu entry through Plugin Pages.
- Shareable member links that open the chosen profile for signed-in users who are allowed to see that member.
- Server-side protection so a copied or guessed profile URL does not bypass member visibility checks.
- Profile-wide review count, rated review count, and average rating across all visible reviews.
- Newest-first review history with a **Load more reviews** control.
- Unified historical community activity from Jellyfin Enhanced, with member and media links.
- Movie and completed-series milestones calculated from Jellyfin per-user playstate.
- Permanent BeeFlix achievement unlocks stored in BeeFlix plugin configuration; no duplicate playback-history database.
- New milestone unlocks appear in the Community activity feed after Jellyfin playback completion or an explicit watched-state change triggers a debounced background recalculation. Existing history is backfilled without flooding the feed.
- Local Jellyfin library lookup for review TMDB IDs, so cards can show a real title, year, poster, and a link to the title in Jellyfin.
- A TMDB lookup link and clear fallback when the media item cannot be matched in the local Jellyfin library.
- Searchable member picker and Jellyfin avatars retained from the earlier preview.

## Required for the end-user menu

The user-facing menu entry uses these compatible Jellyfin 12.2 plugins:

- [Plugin Pages](https://github.com/IAmParadox27/jellyfin-plugin-pages/releases) — provides registered pages inside Jellyfin's normal user menu.
- [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases) — required by Plugin Pages to inject its menu integration into Jellyfin Web.

The upstream `3.0.2.0` releases include `12.2.0` packages. Install compatible builds of both plugins, then restart Jellyfin once after the combined upgrade. If either plugin is missing, BeeFlix Profiles logs a warning and the user-facing menu link will not appear.

## Privacy and review data

- Profiles require an authenticated Jellyfin session.
- Users can only open members returned by the directory's visibility rules, and the review API independently enforces the same hidden/disabled-member check for direct URLs.
- Jellyfin Enhanced remains the source of truth for reviews and ratings.
- Movie/show names and posters are looked up locally by TMDB provider ID. If a review no longer matches a library item, the UI shows a title-unavailable fallback with a TMDB lookup link rather than pretending the ID is a title.
- Profile statistics use the set of reviews visible to that viewer.

## Native Jellyfin plugin repository

Manifest URL:

`https://raw.githubusercontent.com/Br3vK1/beeflix-profiles/main/manifest.json`

## Release policy

Development builds are built and validated on the isolated feature branch. Do not install a package until CI succeeds and the Jellyfin 12 server compatibility has been reviewed. The existing preview branch and main remain unchanged until the user approves promotion.

## Not included yet

- Click-through profile links from the existing BeeFlix review carousel.
- Remote TMDB metadata fetch for reviewed titles that are not in the local Jellyfin library.
- Achievement-unlock events merged into the Community activity timeline.
- Achievement cosmetics, profile banners, review styling, and profile backgrounds.
- Server-side activity pagination beyond the newest 200 Enhanced events.
- Automated privacy-parity tests against every Jellyfin Enhanced version.

## Build locally

```bash
dotnet restore BeeFlix.Profiles.csproj
dotnet build BeeFlix.Profiles.csproj --configuration Release
```

The GitHub Actions build checks `Web/profiles.js` and `Web/profiles-loader.js` syntax and packages `BeeFlixProfiles-jellyfin12.zip` for Jellyfin 12 / .NET 10.
