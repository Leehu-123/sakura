#!/bin/bash
set -euo pipefail
cd /srv/sakura/current
exec 9>/srv/sakura/shared/backups/backup.lock
flock -n 9 || exit 0
available=$(df --output=avail -B1 /srv/sakura/shared/backups | tail -1)
if (( available < 1073741824 )); then echo 'Backup refused: less than 1 GiB free'; exit 1; fi
/opt/sakura/node/bin/node --env-file=/srv/sakura/shared/app.env scripts/ops/backup.cjs create
/opt/sakura/node/bin/node --env-file=/srv/sakura/shared/app.env scripts/ops/backup.cjs verify
# Preserve the initial migration snapshot and the seven latest complete daily backups.
/opt/sakura/node/bin/node <<'JS'
const fs=require('fs/promises'),path=require('path');
(async()=>{
 const root='/srv/sakura/shared/backups';
 const names=(await fs.readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^\d{4}-\d{2}-\d{2}T[0-9TZ.-]+-[a-f0-9]{8}$/.test(x.name)).map(x=>x.name).sort().reverse();
 const complete=[];
 for(const n of names)if(await fs.stat(path.join(root,n,'COMPLETE.json')).catch(()=>false))complete.push(n);
 for(const n of complete.slice(7)){
  const dest=path.resolve(root,n);
  if(path.dirname(dest)!==root || (await fs.lstat(dest)).isSymbolicLink())throw Error('Unsafe backup path');
  await fs.rm(dest,{recursive:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
JS
