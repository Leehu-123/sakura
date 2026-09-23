#!/bin/bash
# Run after uploading a pre-built source release. Does not touch nginx or other apps.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
release=${1:-}
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$ ]] || { echo 'Invalid release'; exit 1; }
target="/srv/sakura/releases/$release"
[[ -d "$target" && ! -L "$target" && $(realpath "$target") == "$target" ]] || exit 1
for file in package-lock.json apps/platform-api/dist/main.js apps/sale-web/dist/index.html packages/database/prisma/schema.prisma; do
 [[ -f "$target/$file" ]] || { echo "Missing $file"; exit 1; }
done
exec 8>/srv/sakura/shared/deploy.lock
flock -n 8 || { echo 'Another deployment is running'; exit 1; }
previous=$(readlink -f /srv/sakura/current)
[[ "$previous" != "$target" ]] || { echo 'Already current'; exit 0; }
chown -R sakura:sakura "$target"
unit="sakura-prepare-$(date +%s)"
systemd-run --quiet --wait --pipe --collect --unit="$unit" --uid=sakura \
 -p "WorkingDirectory=$target" -p MemoryMax=320M -p CPUQuota=35% -p Nice=15 \
 --setenv=PATH=/opt/sakura/node/bin:/usr/bin:/bin \
 --setenv=HOME=/srv/sakura/shared/npm-cache \
 --setenv=npm_config_cache=/srv/sakura/shared/npm-cache \
 /bin/bash -c 'set -e; npm ci --omit=optional --ignore-scripts --no-audit --no-fund; npm run db:generate'
chown -R root:root "$target"
chmod -R go-w "$target"
systemctl start sakura-backup.service
# Migration plans must remain compatible with the old version if code rollback is required.
systemctl stop sakura-api
if ! (cd "$target" && /opt/sakura/node/bin/node --env-file=/srv/sakura/shared/app.env node_modules/prisma/build/index.js migrate deploy --schema=packages/database/prisma/schema.prisma); then
 echo 'Migration failed. API remains stopped. Review database before restarting the previous release.'
 exit 1
fi
ln -sfn "$previous" /srv/sakura/previous
ln -s "$target" /srv/sakura/current.next
mv -Tf /srv/sakura/current.next /srv/sakura/current
systemctl start sakura-api
for n in {1..45}; do
 if curl --silent --fail http://127.0.0.1:3100/api/v1/health >/dev/null; then
  echo "Sakura release active: $release"; exit 0
 fi
 sleep 1
done
echo 'Health check failed. Previous code remains at /srv/sakura/previous. Check schema compatibility before rollback.'
exit 1
