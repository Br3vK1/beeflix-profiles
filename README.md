# BeeFlix Profiles

A lightweight Jellyfin 12 plugin preview that reuses Jellyfin Enhanced reviews and ratings for community member profiles.

**Preview only. Test on a non-production Jellyfin instance before using this build on your live BeeFlix server.**

## Current source

The latest consolidated preview source is on branch `fix/member-visibility-review-errors-v0.4.3`. Version `0.4.0.4` bundles the searchable member picker, member visibility fix, better profile API errors, and a corrected integration path for discovering Jellyfin Enhanced's review store from its active plugin assembly.

## Native Jellyfin plugin repository

Manifest URL:

`https://raw.githubusercontent.com/Br3vK1/beeflix-profiles/main/manifest.json`

This GitHub repository is public so Jellyfin can fetch the feed and release ZIP without authentication.

## Publish the consolidated preview (0.4.0.4)

Open [Actions → Publish BeeFlix Profiles](https://github.com/Br3vK1/beeflix-profiles/actions/workflows/release.yml), choose **Run workflow**, select branch `main`, and leave the defaults:

- Release version: `0.4.0.4`
- Source branch: `fix/member-visibility-review-errors-v0.4.3`

Click **Run workflow**. When the run completes successfully, the workflow creates GitHub Release `0.4.0.4`, attaches `BeeFlixProfiles-jellyfin12.zip`, and updates `manifest.json` with the new version and checksum.

Then in Jellyfin, open **Dashboard → Plugins → Repositories**, refresh the BeeFlix Profiles repository/catalog, and check for plugin updates. Install version `0.4.0.4` and restart Jellyfin when prompted. If Jellyfin does not show the update immediately, save the repository again and refresh the plugin catalog.

## Current preview functionality

- Searchable member dropdown with Jellyfin avatars.
- Server-side list of eligible members, filtering users hidden or disabled according to Enhanced's configuration (with self/admin behavior preserved).
- Profile avatar, review count, average rating of the reviews loaded, and review history sourced from Enhanced.
- Resolves Enhanced's review-store manager from the actual active plugin instance, avoiding a potentially mismatched assembly type from app-domain enumeration.
- Profile API error feedback includes HTTP status and response details where available.

## Not implemented yet

- Click-through profile links from the existing BeeFlix review carousel.
- Proper movie/show titles and posters instead of TMDB IDs.
- Complete cross-page statistics, genre/taste profiles, recent activity, badges, and milestones.

The Enhanced integration still uses reflection because it accesses a service owned by another plugin. The review-store integration has not been runtime-verified against the exact installed server. Do not treat build success as proof of runtime or privacy correctness.
