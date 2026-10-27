# BeeFlix Profiles

A lightweight Jellyfin 12 plugin preview that reuses Jellyfin Enhanced reviews and ratings for community member profiles.

**Preview only. Test on a non-production Jellyfin instance before using this build on your live BeeFlix server.**

## Current source

The working profile page is on branch `feature/member-picker-v0.4.2`. It adds a searchable dropdown with Jellyfin member avatars, a server-side member directory API, and the existing review-history view.

## Native Jellyfin plugin repository

Manifest URL:

`https://raw.githubusercontent.com/Br3vK1/beeflix-profiles/main/manifest.json`

This GitHub repository is public so Jellyfin can fetch the feed and release ZIP without authentication.

## Publish the member picker preview (0.4.0.2)

Open [Actions → Publish BeeFlix Profiles](https://github.com/Br3vK1/beeflix-profiles/actions/workflows/release.yml), choose **Run workflow**, select branch `main`, and leave the defaults:

- Release version: `0.4.0.2`
- Source branch: `feature/member-picker-v0.4.2`

Click **Run workflow**. When the run completes successfully, the workflow creates GitHub Release `0.4.0.2`, attaches `BeeFlixProfiles-jellyfin12.zip`, and updates `manifest.json` with the new version and checksum.

Then in Jellyfin, open **Dashboard → Plugins → Repositories**, refresh the BeeFlix Profiles repository/catalog, and check for plugin updates. Install version `0.4.0.2` and restart Jellyfin when prompted. If Jellyfin does not show the update immediately, save the repository again and refresh the plugin catalog.

## Current preview functionality

- Searchable member dropdown with Jellyfin avatars.
- Server-side list of eligible members, excluding users hidden or disabled according to the Jellyfin Enhanced review visibility settings (the signed-in member and admins retain their expected access).
- Profile avatar, review count, average rating of the reviews loaded, and review history sourced from Enhanced.

## Not implemented yet

- Click-through profile links from the existing BeeFlix review carousel.
- Proper movie/show titles and posters instead of TMDB IDs.
- Complete cross-page statistics, genre/taste profiles, recent activity, badges, and milestones.

The Enhanced integration uses reflection, and the review visibility behavior has not been fully runtime-tested against the exact installed server. Do not treat build success as proof of runtime or privacy correctness.
