# QA requirement coverage

Source: the user's written requirements and handwritten attachment, compared on 2026-11-07. Defaults: invitation-only accounts; Admin and QA see workspace reports; Developers see assigned cases and the containing report; QA manages dashboard title/widgets and filtering; reports can contain multiple bugs and test cases. All QA users may verify/close/reopen workspace cases.

| Requested requirement | Implemented location/behavior |
|---|---|
| Website's own login | `/login`, `/api/auth`; email/password, independent sessions, logout, password change, Admin reset links; no platform identity fallback |
| Admin, Developer, QA roles | Persisted member roles, role-specific UI, server authorization in both QA and original project routes |
| User management | Admin user list; invite/link renewal; role changes; account disable/enable; membership removal; reset links; owner protection |
| Admin reads QA/developer comments and reports | Admin QA state includes all workspace reports/cases/discussions and history |
| Admin adds comments and performs all operations | Create/edit/report/case, comments/moderation, files, Developer responses, QA closure/reopen, dashboard and membership administration |
| Developer reads QA report | Assigned-case access includes report metadata, report discussion/evidence and assigned-case details |
| Developer fixed/not-fixed reply | Explicit outcome, required explanation, optional HTTP(S) resource link, case file uploads; every reply retained in history |
| QA opens cases | Create Bug or Test case in a report; explicit Open initial state |
| QA closes cases | Verification notes; bug closure after Developer Fixed; test case execution supported; Admin override logged |
| QA reopens cases | Explicit Reopened state with reason; next Developer response can be verified again |
| QA adds more bugs | Multiple independent case records per report; add/edit/assign/reassign, severity, expected/actual, steps |
| QA reports to relevant developer | Required Developer/Admin assignee; case notifications; Developer-specific access and filters |
| Test-case reporting/upload | Report build/environment/scope; bug/test-case type; Not run/Passed/Failed/Blocked execution results; real report/case evidence files |
| Developer comments and uploads | Report/case discussion plus assigned-case fix files; controlled edit/delete and download permissions |
| Reports view | Report list/details; associated cases; status/severity/developer/text filters; archive/restore; CSV and browser Print/PDF |
| Dashboard | Counts, status/severity/developer distribution, verification queue and test-execution widgets |
| QA dashboard management | Persistent workspace title, widget selection/order; view filters; Developer write prohibition |
| History and reporting retention | Append-only history route surface; version conflicts; atomic case-status/history update; soft case Trash and report archive |
| Integrate with existing app | Landing/login entry to QA; navigation to original project workspace; original project features preserved under new sessions and roles |

Operational details: invitation/reset links must be shared privately; no outbound email is configured. PDF is the browser's Print / Save as PDF, not a separate PDF generation service. Uploaded resources are downloadable attachments, not embedded executable previews. Admins can remove workspace membership while retaining report history; physical account/history deletion is not offered.
