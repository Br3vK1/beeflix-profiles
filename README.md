# BeeFlix Profiles — Jellyfin 12 prototype

A small Jellyfin plugin prototype for Letterboxd-style community profiles, built around reviews already stored by Jellyfin Enhanced. It does not create a second ratings database.

**Status: prototype only. Do not install on the live BeeFlix server yet.**

## Included in this prototype

- A basic plugin dashboard page.
- Authenticated API endpoint: `GET /BeeFlixProfiles/users/{userId}/reviews?limit=50&offset=0`.
- Reflection-based discovery of Enhanced's existing review store.
- Conservative filtering for hidden/disabled reviewers.
- A simple profile view showing member avatar, review count, average of the reviews returned, and review history.
- GitHub Actions workflow targeting Jellyfin 12 / .NET 10 and packaging a ZIP artifact.

## Not implemented yet

- Click-through profile links from the existing BeeFlix review carousel.
- Full, reliable pagination in the UI (the API accepts limit/offset).
- Jellyfin item-name/poster lookup; this prototype displays TMDB IDs.
- Genre/taste profile, recent activity, badges, milestones, and aggregate stats across all pages.

## Build

The workflow builds with the .NET 10 SDK against Jellyfin 12 NuGet packages, then uploads `BeeFlixProfiles-jellyfin12.zip` as a workflow artifact. On GitHub, open **Actions → Build BeeFlix Profiles → the run → Artifacts**.

Manual source build:

```bash
dotnet restore BeeFlix.Profiles.csproj
dotnet build BeeFlix.Profiles.csproj --configuration Release
```

## Validation requirements before live install

1. Confirm the build succeeds.
2. Confirm Jellyfin discovers the plugin controller route and serves the embedded dashboard page.
3. Validate the API using a test user and test Jellyfin instance.
4. Verify privacy rules against the exact installed Jellyfin Enhanced version. This prototype's reflection-based integration is brittle and is not claimed to be an exact reimplementation of Enhanced's internal visibility rules.
5. Add the item/profile integration only after those checks pass.

The prototype intentionally does not modify Jellyfin Enhanced, BeeFlix's working CSS, or the existing JS injector.


## Packaging note

The build workflow places `BeeFlix.Profiles.dll` and `meta.json` at the root of the install ZIP so Jellyfin can extract them directly into the plugin's versioned directory.
