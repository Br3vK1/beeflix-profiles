# BeeFlix Profiles

A lightweight Jellyfin 12 plugin prototype for private community profiles that reuses Jellyfin Enhanced reviews and ratings.

**Preview only. Do not treat this as production-ready until runtime and privacy behavior are tested.**

## Source

The prototype source and build workflow are on the `prototype/v0.4` branch.

## Native Jellyfin plugin repository

The repository feed will be:

`https://raw.githubusercontent.com/Br3vK1/beeflix-profiles/main/manifest.json`

GitHub repository visibility must be **public** for Jellyfin to fetch the manifest and GitHub Release ZIP without authentication. Making this repository public exposes the source code, prototype branch, and commit history. Keep it private until you explicitly choose to publish it.

## First preview release

The first release tag already exists. To finish publishing its downloadable ZIP and create the manifest, open [Actions → Publish BeeFlix Profiles](https://github.com/Br3vK1/beeflix-profiles/actions/workflows/release.yml), choose **Run workflow**, select branch `main`, enter release tag `0.4.0.0`, and run it. When it finishes successfully, `manifest.json` should exist on `main` and the release should have a `BeeFlixProfiles-jellyfin12.zip` asset.

For future releases:

1. Open **Releases → Draft a new release**.
2. Create tag `v0.4.0.0`, targeting branch `prototype/v0.4`.
3. Publish the release. The `Publish BeeFlix Profiles` workflow builds the plugin for Jellyfin 12 / .NET 10, uploads `BeeFlixProfiles-jellyfin12.zip`, calculates its MD5 checksum, and writes the feed to `main/manifest.json`.
4. After the workflow finishes successfully and the repository is public, copy the manifest URL above.

## Install from the Jellyfin dashboard

1. Open **Dashboard → Plugins → Repositories / Manage Repositories**.
2. Add a repository named `BeeFlix Profiles` with the manifest URL above.
3. Save, then open the plugin catalog and install **BeeFlix Profiles**.
4. Restart Jellyfin when prompted.

After later releases, the release workflow updates the manifest. Jellyfin can then discover the new plugin version through the same repository URL.

## Preview limitations

This build has a basic member profile page, authenticated review API, avatar, review count, average rating on the loaded page, and reviews sourced from Jellyfin Enhanced. Item titles/posters, genre/taste profiles, recent activity, badges, and direct profile links from the existing review carousel are not implemented yet.

The Enhanced integration uses reflection, so the API route, auth claims, and visibility behavior must be tested against the exact installed Jellyfin Enhanced build. Start with a test instance; don't install this preview on the only production BeeFlix server until that test succeeds.
