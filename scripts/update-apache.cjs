const { spawnSync, execSync } = require('child_process');
const fs = require('fs');

const pass = execSync(
  'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\deploy-password.ps1 -Mode get',
  { encoding: 'utf8' }
).trim();

const apacheConf = `<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^/hp-registry$ /hp-registry/ [R=301,L]
</IfModule>

ProxyPreserveHost On

ProxyPass /hp-registry/api/ http://127.0.0.1:3200/api/
ProxyPassReverse /hp-registry/api/ http://127.0.0.1:3200/api/

ProxyPass /hp-registry/ http://127.0.0.1:3200/
ProxyPassReverse /hp-registry/ http://127.0.0.1:3200/
`;

fs.writeFileSync('temp_apache.conf', apacheConf, 'utf8');

spawnSync(
  'C:\\Program Files\\PuTTY\\pscp.exe',
  ['-batch', '-P', '22', '-pw', pass, 'temp_apache.conf', 'srimuang@192.168.1.241:/tmp/hp-registry.conf']
);
try { fs.unlinkSync('temp_apache.conf'); } catch {}

const remoteCmd = `echo "${pass}" | sudo -S cp /tmp/hp-registry.conf /etc/httpd/conf.d/hp-registry.conf && echo "${pass}" | sudo -S systemctl reload httpd && rm -f /tmp/hp-registry.conf`;

spawnSync(
  'C:\\Program Files\\PuTTY\\plink.exe',
  ['-batch', '-ssh', '-P', '22', '-pw', pass, 'srimuang@192.168.1.241', remoteCmd]
);

console.log('APACHE_UPDATED');

