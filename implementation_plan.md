# Implementation Plan - Recover Workflows + Package Version

## Objective
Recover deleted CI/CD workflow files from the commit before `chore: remove all project files` and restore deploy readiness for the published extension.

## Investigated History
- Deletion commit: `d197882`
- Last good commit before deletion: `6e32f01`
- Deleted targets confirmed:
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `package.json`

## Execution Steps
1. Recreate `.github/workflows/ci.yml` and `.github/workflows/release.yml` based on deleted content from `6e32f01`.
2. Update workflow commands to match the current repository toolchain (`npm`) while preserving release intent (build, test, package, publish).
3. Update `package.json`:
   - keep extension identity aligned with published marketplace extension (`name: sap-tools`, `publisher: dongtran`)
   - bump version to `0.1.10`
   - ensure release scripts exist for VSIX packaging/publishing.
4. Update lockfile metadata for package name/version consistency.
5. Run validation (`npm run validate` + `npm --prefix e2e test`).
6. Stage, commit, push to `main`.
7. Monitor workflow runs using `gh` CLI and report status.

## Files To Change
- `.github/workflows/ci.yml` (new)
- `.github/workflows/release.yml` (new)
- `package.json`
- `package-lock.json`

## Risks
- Release publish token secret may not exist in repo settings.
- CI can fail if dependencies/scripts drift from workflow assumptions.

## Mitigation
- Keep workflow steps explicit and aligned with current scripts.
- Verify local validate and e2e before commit/push.
