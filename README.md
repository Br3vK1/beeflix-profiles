# BeeFlix Profiles — shareable member profiles

A lightweight Jellyfin 12 plugin that reuses the reviews and ratings already stored by Jellyfin Enhanced. BeeFlix Profiles does not create a duplicate ratings database and does not modify Enhanced's review data.

**Preview release:** validate on a test Jellyfin instance before rolling out broadly. Build success does not prove runtime behavior or privacy parity for every Enhanced version.

## Current candidate

Source branch: `feature/shareable-member-profiles-v0.5.0`

Planned version: `0.5.0.0`

This milestone adds:
- Shareable links that open a specific member's profile directly.
- Permission-aware handling for profiles that are not visible to the signed-in viewer.
- Profile-wide review count, rated review count, and average rating (calculated across all visible reviews, not just the first page).
- Newest-first review history, with a Load more button for older entries.
- A profile share button, responsive layout, and links from TMDB IDs to the matching TMDB title page.
- Existing member search and avatar picker retained.

## How profile links work

Open BeeFlix Community from Jellyfin. Choose a member and use **Share profile link**. The link opens the same profile view on your BeeFlix Jellyfin server for signed-in users who are allowed to view that member. Profiles are not public to the internet without signing into Jellyfin, and a link does not bypass the plugin's member visibility checks.

## Native Jellyfin plugin repository

Manifest URL:

`https://raw.githubusercontent.com/Br3vK1/beeflix-profiles/main/manifest.json`

The repository is public so Jellyfin can fetch the manifest and release ZIP without authentication.

## Publish after validation

Open [Actions → Publish BeeFlix Profiles](https://github.com/Br3vK1/beeflix-profiles/actions/workflows/release.yml), choose **Run workflow**, select branch `main`, set the version to `0.5.0.0`, and use source branch `feature/shareable-member-profiles-v0.5.0`. The workflow builds the source, creates a release ZIP, and updates the plugin manifest.

Do not publish until the branch's Build BeeFlix Profiles workflow passes and the share-link flow has been tested on the target Jellyfin version.

## Not included yet

- Click-through profile links from the existing BeeFlix review carousel.
- Proper movie/show titles and posters resolved from the local Jellyfin library; reviews still show TMDB IDs and link out to TMDB.
- Genre/taste summaries, recent activity beyond reviews, badges, and milestones.
- Full automated privacy-parity tests against every Jellyfin Enhanced version.

## Build locally

```bash
dotnet restore BeeFlix.Profiles.csproj
dotnet build BeeFlix.Profiles.csproj --configuration Release
```

The build workflow also runs `node --check Web/profiles.js` and packages `BeeFlixProfiles-jellyfin12.zip` for Jellyfin 12 / .NET 10.
