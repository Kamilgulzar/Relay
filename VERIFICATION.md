# Current verification — 2026-11-07

The independent-account QA release supersedes the platform-auth/Editor/Viewer version described below.

| Current check | Actual result |
|---|---|
| TypeScript | Passed for independent auth, QA API/UI, original project compatibility, and migrations |
| Release build | Passed; includes /login, /qa, /workspace, /api/auth, /api/qa, /api/qa-files and original APIs |
| Domain tests | 14 passed |
| QA/auth + integration suite | 23 passed against the built local Worker on port 5174 |
| Landing/login entry | Passed desktop, preview switching, own-login navigation, mobile menu/overflow and reduced-motion checks on the restarted development server |
| Browser errors | None recorded in the QA, landing and project workflow checks |

The 23 checks cover independent session authentication (platform headers do not authenticate), first-admin setup, incorrect-password and cross-origin rejection, Admin/QA/Developer roles, single-use invitations, assigned-case isolation, required report/case fields, developer Fixed/Not fixed replies and resources, QA verification/close/reopen, conflict rejection, comments/moderation, real file upload/download/delete/access control, dashboard persistence, test execution, Trash/restore, owner protection, role management, account disable/enable, reset and session revocation, tenant boundaries, report CSV export, mobile layout, the full report-to-fix-to-verification flow through the UI, original project/task/comment/private-project/view compatibility, user-management/password-change screens and logout.

Screenshots/results are local ignored artifacts under outputs/: qa-dashboard.png, qa-case.png, qa-mobile.png and qa-results.json. Tests use isolated fictional accounts and a separate headless Chrome. The user's Chrome/Asana session is not controlled. Temporary test accounts and the recorded verification workspace are removed after the final run; the application is left at initial Admin setup, with no preset password.

A production-only issue found during verification was fixed: rejected POST bodies are drained within a bounded limit before returning an origin error, avoiding a subsequent local Worker proxy request cancellation. Password hashing uses native scrypt with N=32768,r=8,p=3; rationale follows the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and the runtime's [native crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/). No external security certification is claimed.

See [QA-REQUIREMENTS.md](QA-REQUIREMENTS.md) for each requested requirement and its implementation, and [README.md](README.md) for startup, roles, migration and operational limits. Hosted publication remains pending explicit source-transfer approval. Broad production-scale load, simultaneous invitation/bootstrap stress, disaster recovery and enterprise compliance have not been verified.

---

## Historical project-only verification — 2026-11-06

The following records describe the previous authentication/role model; their 23+13 suites are archived in tests/historical and should not be counted as current independent-auth tests.

# Verification and feature coverage

Verified on 2026-11-06 (Asia/Karachi), using local D1/R2 and a separate headless Chrome. The user's existing Asana browser was not controlled or modified during implementation/testing.

## Checks

| Suite | Result | Scope |
|---|---|---|
| TypeScript | Passed | All authored app/server/UI TypeScript |
| Release build | Passed | Vinext client, server and Worker output |
| Domain tests | 14 passed | Text/date/enum/graph validation and limits |
| API + browser integration | 23 passed | Authentication boundary, persistence, version conflicts, task/subtask/comment writes, recurrence/rules, forms, files, preferences, views, search, task creation, dragging/order and mobile navigation |
| Permission tests | 13 passed | Admin/editor/viewer roles, invitation matching, tenant boundary, private projects/tasks/files, owner protection, cross-member notification updates and deep parent cycles |

The permission suite runs against the built local Worker, simulating the identity headers the hosting platform supplies. This tests the app's authorization layer; it is not a penetration test of Sites or a claim about Asana's security.

## Implemented behavior

| Area | Working behavior |
|---|---|
| Identity/workspaces | Platform sign-in; user-owned workspace provisioning; workspace switching/creation/rename; membership checks |
| Roles/access | Admin/editor/viewer; workspace or selected-project-member access; protected task/comment/file operations |
| Projects | Blank/structured templates, sections, names/descriptions/dates/colors, members, stars and archive/restore |
| Tasks | Saved create/update/duplicate/trash/restore; version conflict rejection; shared state across views |
| Subtasks/dependencies | Parent association, child completion, dependency lookup and cycle rejection |
| Planning | Start/due dates, priorities/status, recurring task creation, estimated/tracked time |
| Views | List, drag-and-drop/reordering Board, monthly Calendar, dated Timeline, computed Dashboard, Overview and file gallery |
| Search/querying | Client-side query across accessible loaded work, view filters, sorting/grouping and completed-task toggle |
| Collaboration | Stored comments and edits/deletion, activity history, collaborator subscriptions and in-app updates |
| Attachments | R2-backed upload/download/removal, bounded 10 MB files, access checks and attachment-only response delivery |
| Teams/portfolios/goals | Persistent authoring, member/project associations, portfolio progress and editable numeric goal progress |
| Forms | Configurable required questions; authorized submission creates a project task |
| Rules | Create/complete/section-change triggers; assignment, priority/status and section actions |
| Documents | Persistent project notes/briefs, stored as plain text/Markdown |
| Preferences | Name/theme/week-start/compact mode; workspace export; shortcuts and responsive layout |

## Deliberate limits

Not full enterprise Asana parity. External integrations, outbound email, production SSO/SCIM, billing, an external AI model, advanced timeline dependency drawing, workload capacity planning, full-text server indexing, push transports and enterprise compliance are not implemented. In-app notification updates poll every 20 seconds while visible. Search operates over records accessible to the current user, loaded from the server.

Bulk workspace data is returned in a single authorized snapshot. This suits small workspaces; large installations should add bounded server pagination/search, rate limiting/quotas and operational monitoring. Domain document updates use version checks; activity/notification writes follow a successful task update and are not a distributed exactly-once transaction. Simultaneous invitation/bootstrap and broad production-scale load were not stress-tested.

The app can be used as delivered for its implemented workflows. The limits above remain work for a larger enterprise release and must not be described as completed features.
