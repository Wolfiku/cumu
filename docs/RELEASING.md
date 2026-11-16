# Releasing cumu

A push to `main` never reaches the servers. A new version is published only
when you create a release; then Docker servers (Watchtower pulls `latest`) and
installations without Docker (`cumu-update`, daily cronjob) update to it.

## Steps

1. Set the new version in `package.json`, e.g. `"version": "0.6.1-alpha"`.
   Optional: write the release notes to
   `docs/release-notes/RELEASE_NOTES_v0.6.1-alpha.md` (shown on the release page).
2. Commit and merge this into `main`.
3. Start the release, either way:
   - **GitHub:** Actions → *Release* → *Run workflow* → version `v0.6.1-alpha`
   - **Git:** `git tag v0.6.1-alpha && git push origin v0.6.1-alpha`

The workflow first checks that the version is valid, matches `package.json`
and does not exist yet. Then it builds the Docker image (`0.6.1-alpha`, `0.6`,
`latest`), the Android APK and the `.deb`, and publishes the GitHub release
with all files.

## What servers do

| Installation | Update source | When |
|---|---|---|
| Docker + Watchtower | image `ghcr.io/wolfiku/cumu:latest` | within ~5 minutes after the release |
| Install script / `.deb` | `cumu-update`: latest GitHub release | daily cronjob, or the admin button |

`cumu-update` never installs an older release over a newer installation.
