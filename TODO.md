# TODO

## Retire `--temp-dir` in favor of `--automation`

### Background and purpose

On 2026-10-27, we adopted a staged migration from `--temp-dir` to `--automation` for automation calls.

Historically, `--temp-dir` combined workspace allocation with temporary-project management: it generated a Runner-side directory, created or reused a project, and marked that project with `Project.tempDir`. Project-level rules then controlled visibility and retention for its sessions. A `Session.tempDir` marker was added later, but much of the behavior still depends on the parent project.

Automation calls need a session-level identity and visibility policy. Reusing the temporary-project marker for an individual automation session could affect other sessions sharing the same project. We therefore introduced `--automation`, which records `automation: true` in `session.json`, creates no project, and allocates a dedicated Runner-side workspace under the Runner configuration directory's `automation-workspaces/`. Automation sessions are hidden by default and can be shown explicitly through Admin Settings.

The purpose of removing `--temp-dir` is to eliminate the overlapping legacy automation workflow and its project-level lifecycle coupling, leaving `--automation` as the supported option for dedicated automation calls. `--no-path` remains a separate option for standalone sessions.

### Timing and removal conditions

`--temp-dir` was deprecated as part of the 2026-10-27 implementation. During the transition, its existing behavior remains unchanged and the CLI emits a warning on stderr. It is not an alias for `--automation`.

No removal date or release has been scheduled. Remove it in a later change only after CLI/API automation callers and internal callers have migrated, existing temporary-project/session data has a migration plan, and the replacement behavior has regression coverage. The implementation checklist below tracks that work.

### Implementation checklist

- [ ] Remove the deprecated `--temp-dir` option after automation callers have migrated to `--automation`.
  - Remove CLI parsing, validation, help text, and the deprecation warning for `--temp-dir`.
  - Migrate internal callers, including `decide`, away from legacy temporary-project behavior.
  - Retire the legacy API `tempDir` workspace-creation option and Runner directory allocation logic after checking API callers.
  - Define a migration for existing `Project.tempDir` and `Session.tempDir` records before removing their visibility, notification, and retention handling. Preserve user workspaces and session history.
  - Keep `--automation --once` and caching supported; remove their dependency on legacy temporary projects.
  - Update README, project context, bundled CLI skill documentation, and affected tests.
