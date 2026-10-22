set -u
cd "/d/Program/dsh-phoneharness/plugin" || exit 1
echo '=== 实测 apkDownloadName / meta.name ==='
node -e "
import('./index.js').then(()=>{}).catch(()=>{})
" 2>/dev/null || true
node --input-type=module -e "
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const file='assets/dsh-phone.apk';
const st=fs.statSync(file);
const side=JSON.parse(fs.readFileSync(file+'.json','utf8'));
console.log('side.versionName =', side.versionName);
console.log('推导下载名 =', side.versionName ? 'dsh-phone-'+side.versionName+'.apk' : 'dsh-phone.apk');
console.log('文件大小 =', st.size);
"