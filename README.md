# Relay — Project and QA workspace

Relay includes the original project-management workspace plus a dedicated QA reporting system with independent email/password accounts. The roles are **Admin**, **Developer**, and **QA**.

## Open the app

On this computer, run **Start Relay.cmd** and open <http://127.0.0.1:5173>.

- `/` — landing page.
- `/login` — Relay login, first administrator setup, invitation activation, and password reset links.
- `/qa` — QA dashboard, reports, bugs/test cases, updates, user management, and account settings.
- `/workspace` — existing projects, tasks, boards, calendar, timeline, forms, goals, and other project features.

The first visit to `/login` prompts you to create your own administrator email/password and workspace. No preset administrator password is shipped. Temporary verification accounts are removed after testing. The older development identity cannot authenticate to the application anymore. Previous project records remain in the local database; they are not automatically assigned to the new independent account.

## Roles

| Role | QA permissions |
|---|---|
| Admin | View every report, case, comment, file and history entry in the workspace; create/edit reports and cases; assign developers; respond to fixes; verify/close/reopen cases; manage dashboards; invite users, change roles, disable/enable single-workspace accounts, remove memberships and issue reset links. |
| QA | Create/edit reports and bugs/test cases; assign Developers or Admins; upload evidence; discuss reports/cases; record test execution; verify fixes and close/reopen cases; manage dashboard widgets and title. |
| Developer | Read reports containing assigned cases; read only their assigned cases and related files/discussion/history; comment; start development; submit Fixed/Not fixed responses with explanations and optional links/files. Cannot administer users, edit reports, configure dashboards, or verify/close cases. |

QA and Admin can work across the workspace's QA reports. Developers see assigned cases only. Admins retain all QA permissions. The workspace owner cannot be demoted, disabled, removed, or password-reset by another member; the owner can change their own password in Account settings. Accounts belonging to multiple workspaces cannot be globally reset/disabled by one workspace administrator: remove that workspace membership to revoke its access instead.

## Main workflow

1. Admin activates Relay and creates invitation links for QA and Developers.
2. Users open their single-use invitation links and set passwords.
3. QA creates a report with a title, scope, build, environment and optional linked project.
4. QA adds bugs/test cases with steps, expected/actual results, severity and a Developer assignment.
5. Developer reads the assigned case, discusses it, uploads resources, and responds **Fixed** or **Not fixed**, with an explanation.
6. **Fixed** moves the case to **Awaiting QA**, not Closed.
7. QA retests, records execution results, and closes the case with verification notes, or reopens it with a reason.
8. History retains previous responses, comments and transitions. Case status changes and their history entries commit together with version checks.

A QA user cannot close an unresolved bug before a developer marks it fixed. Test cases can be closed directly after QA execution. Admin can override case workflow where required, with a recorded note. Cases support reversible Trash; reports support archive/restore. Physical account deletion and case-history deletion are deliberately not exposed.

## Reporting and evidence

- Reports contain multiple bugs/test cases.
- Search by case/report text; filter by status, severity, developer, archived reports and Trash.
- CSV export for reports or filtered case lists; spreadsheet formula prefixes are escaped.
- Print/PDF uses the browser print dialog with a report-friendly stylesheet.
- Actual report evidence and case fix-resource files, up to 10 MB each, stored in R2.
- Report/case comments, own-comment editing/removal, Admin moderation and audit history.
- In-app assignment/status updates; visible pages poll every 20 seconds.
- QA dashboard metrics plus configurable/reorderable status, severity, Developer, verification and test-execution widgets.

## Accounts and security

Passwords are salted scrypt hashes using the native runtime crypto implementation (N=32768, r=8, p=3). Sessions are opaque random tokens stored hashed in the database. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS; sessions expire after seven days. Logout revokes the current session. Password change/reset and account disabling revoke existing sessions.

Account and QA writes use same-origin checks, bounded request bodies, validation, throttling and server-side role/object checks. Invitation links expire after 48 hours; Admin-issued reset links after one hour. Links are single use and stored hashed. No passwords or live invitation tokens are committed to source. On hosted installations the first administrator setup additionally requires the `RELAY_SETUP_TOKEN` runtime secret; local loopback setup does not. Invitations and resets are shared manually: outbound email is not configured.

## Existing project features

Persistent workspaces; project templates, sections, sharing, stars and archiving; tasks/subtasks, assignees, dates, priority/status, tags, custom fields, dependencies, recurrence, time tracking and Trash; List, Board, Calendar, Timeline, Dashboard, Overview and Files; comments/activity; file uploads; teams, portfolios, goals, forms, rules, documents, preferences, shortcuts and JSON export remain available.

Project roles now use Admin/Developer/QA. QA can manage project work; Developers can update assigned tasks and comment, while project/workspace administration is restricted. QA report data is separately authorized and does not leak through the original project API.

## Fresh local setup

Requires Node.js 22.13+ and npm. Existing dependencies and migrations on this computer are already prepared.

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_windy_earthquake.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_minor_lady_mastermind.sql
npm run dev -- --hostname 127.0.0.1 --port 5173
```

Apply each migration only once to a fresh database. `0001` adds account/session/invitation/throttle/setup tables and maps legacy Editor to Developer and Viewer to QA. The new records do not delete the original workspace data. Local and hosted databases/files are independent. Stop a built preview before rebuilding on Windows because it can hold `dist` files open.

## Run Relay with PostgreSQL

Create an empty PostgreSQL database for Relay. In pgAdmin, open that database's Query Tool and run [the PostgreSQL schema](postgres/0001_initial.sql) once. For command-line setup, set `POSTGRES_URL` in your shell and run:

```powershell
psql --dbname $env:POSTGRES_URL --set ON_ERROR_STOP=1 --file postgres/0001_initial.sql
```

Set `POSTGRES_URL` in the root `.dev.vars` file to your connection string, such as `postgresql://relay_user:YOUR_PASSWORD@127.0.0.1:5432/relay`. Keep that file private. Start the built app with `npm run build` and `npm start`. When no PostgreSQL connection is configured, Relay continues to use its existing D1 database. For a hosted Worker, use a `POSTGRES_URL` Worker secret or a Hyperdrive binding named `HYPERDRIVE`. Hosted first-time setup still requires the existing `RELAY_SETUP_TOKEN`. Attachments continue to use R2.

To bring over an existing local workspace, stop Relay to prevent new writes during the copy. With `POSTGRES_URL` set in your shell, run the following against an empty PostgreSQL database that already has the schema:

```powershell
node scripts/import-d1-to-postgres.mjs "<path-to-local-D1-SQLite-file>"
```

Use the workspace database file under `.wrangler/state/v3/d1`, excluding `metadata.sqlite`. The import keeps account credentials, workspace IDs, QA results, and attachment references. Sign in again and reissue any outstanding invitation or password-reset links. When using the same local R2 bucket, existing files stay accessible. For a move to a hosted bucket, copy the attachment objects too. Verify sign-in and workspace contents before sending users to the new database.

## Verification

- `npm run typecheck`
- `npm test` — 14 domain checks.
- `npm run test:landing` — anonymous landing, own-login entry, mobile navigation and reduced-motion checks on port 5173.
- `npm run test:qa` — independent-account and full role/workflow API/browser checks on a **fresh, unconfigured local auth installation**. The suite refuses non-loopback URLs and refuses an already configured administrator. It creates isolated test accounts; it is not intended to run against a workspace in actual use.
- Set `RELAY_TEST_URL=http://127.0.0.1:5174` to run the QA suite against `npm start -- --port 5174`.
- After a QA suite run, `node tests/cleanup-qa.mjs` removes only its recorded verification workspace/accounts and reopens initial setup. It validates the fixture identity before issuing local cleanup.

The platform-auth/Editor/Viewer test scripts are retained under `tests/historical/` as historical evidence. They are superseded and are not current runnable suites. See `VERIFICATION.md` for actual current results and `QA-REQUIREMENTS.md` for requirement coverage.

## Hosting status and limits

The Site ID remains `appgprj_6aeccc08b3808191bdd1583bd7e9e810`. No publication has occurred: source upload/private hosting was blocked by automatic approval review pending explicit approval for that external transfer. No deployment is being retried as part of this work.

This fulfills the specified QA workflow locally. It does not add unrelated enterprise Asana features such as billing, SSO/SCIM, external integrations, email delivery, external AI, capacity scheduling or compliance certification. Broad production-scale load, disaster recovery and cross-region operations are not verified. Reporting loads an authorized workspace snapshot, so larger installations will need pagination and operational monitoring.
