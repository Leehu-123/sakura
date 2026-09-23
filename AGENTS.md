# Sakura deployment context

Production is https://sakura.ldhuy.name.vn on shared VPS 103.124.94.254. Read `docs/VPS-DEPLOYMENT-2026-09-21.md` before deployment work.

## Required PC / GitHub / VPS synchronization

- Repository: https://github.com/Leehu-123/sakura.git; production branch: `main`.
- The user requires every completed project code change to be synchronized across this PC, GitHub and the active Sakura VPS release. This is standing authorization for routine commits, pushes and Sakura-only deployments within the boundaries below.
- Read `docs/CODE-SYNC.md`. Never call work complete with uncommitted changes, unpushed commits or an older production release. If credentials, checks or deployment fail, explicitly report which locations are out of sync; never claim success or bypass checks.
- Build/test, commit and push the reviewed source, then use `npm run sync:package` to build a release from the clean, pushed Git commit. Deploy through the existing Sakura update script. Verify the release manifest and commit on the VPS, health, and Tomeco preservation, then run `npm run sync:check` on the PC.
- Never force-push or overwrite remote changes. Fetch and reconcile them first. Do not edit production application source in place; urgent fixes must return to PC/Git and ship as a separate release.
- Synchronize source code only. Production/local databases, uploads, tokens, `.env`, backups and dependencies are separate; never copy company data to Git or restore a database to make code versions match.

## Shared VPS boundaries

- Another application (Tomeco) runs from `/var/www/tomeco` through PM2 on port 3001 and the existing Nginx default virtual host. Preserve its files, process, dependencies and routes.
- Sakura owns `/srv/sakura`, `/opt/sakura`, `sakura-*` systemd services/timers, `/etc/nginx/sites-available/sakura`, its enabled symlink, and `/etc/nginx/conf.d/sakura-log.conf`.
- Sakura API binds 127.0.0.1:3100; its PostgreSQL binds 127.0.0.1:55432. Runtime Node is `/opt/sakura/node`; do not replace system Node.
- Do not run `compose.production.yaml` on this VPS: its 80/443 bindings conflict with the existing Nginx. Do not run PM2 restart all, reboot, stop shared Nginx or upgrade shared packages as part of normal Sakura updates.
- Code updates use separate releases and `/srv/sakura/bin/update.sh`. Build and test locally first; preserve the resource limits, back up before migrations, and never restore over working company data as a shortcut.
- Routine code changes need only a Sakura API restart. If a Sakura virtual host change is required, validate the entire Nginx configuration, use graceful reload, and verify the other app still serves the same content and process.
- Keep root-owned release files read-only to the application. Keep media/database/config outside release directories so later updates cannot overwrite them.
- Read the exact current environment and service state before modifying it; this document records deployment-time facts, not live status.

## Secrets and data

- Do not print `.env`, `/srv/sakura/shared/app.env`, encrypted configuration contents, SSH passwords, tokens, or session credentials. Inspect redacted properties only.
- Keep the original `MESSENGER_CONFIG_KEY` when restoring database snapshots. Do not place private environment files in web roots, source archives or documentation.
- Localhost and VPS databases are independent after migration. New local test data is not automatically production data; avoid overwriting newer VPS orders/customers during updates.
- Webhook self-tests do not prove Meta subscribed successfully. Preserve this distinction and do not send messages to real customers without user authorization.
