# Automated testing in Relay

Open **Quality → Reports → Test case → Automated testing**. Admins and QA can save a plan, queue a run, or cancel a queued run. Developers can review runs for cases assigned to them. The latest 15 runs show the outcome and step timings. Failed runs without text entry can include a failure screenshot. Review the run before updating the official QA result.

## Enable locally or for Vercel

1. Apply `postgres/0002_automation.sql` and then `postgres/0003_automation_watch.sql` to Relay's PostgreSQL database. Deploy the updated Relay build using the existing Next.js Vercel configuration and restart the Relay runner.
2. Run the Relay browser process from this repository on a machine that can reach the same PostgreSQL database. Install dependencies and install full Chromium with `npx playwright-core install chromium` (and its required OS dependencies). To use a locally installed Chromium-based browser, set `RELAY_BROWSER_CHANNEL=msedge` or `RELAY_BROWSER_CHANNEL=chrome`. For a compatible executable at a custom location, set `RELAY_BROWSER_PATH` instead of the channel. Restart the runner after changing these settings.
3. Configure `POSTGRES_URL` and `RELAY_AUTOMATION_ORIGINS` for the browser process. The latter is a comma-separated list of exact approved HTTPS origins, including explicitly approved redirect and asset origins needed by the tested sites. Keep secrets in the process environment or the ignored local `.dev.vars`.
4. Start the process with `npm run automation:runner`. Keep it running while tests are queued. Deploy it under a supervisor on a dedicated, isolated non-root host or container with the Chromium sandbox enabled. Restrict network egress so the browser cannot directly reach internal services or the database. Use this release with a trusted workspace and approved test sites.

Use `RELAY_AUTOMATION_ASSET_ORIGINS` for HTTPS hosts that serve scripts, styles, images or fonts. Use `RELAY_AUTOMATION_READ_API_ORIGINS` for HTTPS API hosts needed for read-only requests. Test navigation still requires an approved target origin. Set each variable as a comma-separated list of exact origins.

The browser process is part of Relay. Testers interact with the QA screen and don't need their own Playwright installation.

## First test plan

Enter the approved website origin, pick Desktop or Mobile, and add **Open page** with a relative path such as `/login`. Add **Click** with a selector such as `button[type="submit"]`, then **Check text** with the validation message selector and expected text. Inspect the actual test page for its selectors. Save the plan, then choose **Run in background** or **Run and watch**.

**Run in background** starts full Chromium in headless mode and reports the outcome in Run history. **Run and watch** shows a read-only browser preview with refreshed frames and step progress in Relay. Vercel serves the latest frame from PostgreSQL, so the runner can be hosted separately. Preview frames are cleared when the run ends. Both modes start a fresh browser context.

For a visible Chromium window on your own PC, set `RELAY_AUTOMATION_HEADED=1` for the runner and start it in your signed-in desktop session. This setting only affects **Run and watch**. Leave it unset for a server without a desktop. Use test data only when sharing a live preview.

If the target returns HTTP 403 on navigation, the run is **Blocked**. A site may permit a regular browser session while rejecting a fresh automated session. For sites that require approval for automation, use an environment or access route approved by the site operator. When a page opens but a check fails, review the origins listed in Run history to see whether the runner blocked a required script or API request. Approve only the origins needed for the test and use the asset or read-only API allowlist where applicable.

The Chromium editor supports up to 40 steps. Use navigation (open, reload, back and forward), click, double-click, hover, focus, scroll to element, type, press keys, select a native dropdown option by value, check or uncheck, and drag between two selectors. Add checks for visibility, hidden elements, text, URL, title, field value, checked or enabled state, item count and attributes. Custom menus can be tested with click and text checks.

Plans accept test data only. Authenticated test fixtures and secret injection, file transfers, additional browsers, network mocking, full traces, and custom Playwright scripts are future extensions.
