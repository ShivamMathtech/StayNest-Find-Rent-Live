import fs from 'node:fs';
import crypto from 'node:crypto';
if(!fs.existsSync('.env.local')){
 const template=fs.readFileSync('.env.example','utf8').replace('SESSION_SECRET=','SESSION_SECRET='+crypto.randomBytes(32).toString('hex'));
 fs.writeFileSync('.env.local',template,{mode:0o600});console.log('Created .env.local with a unique session secret.');
}else console.log('.env.local already exists; preserved your settings.');
console.log('Run npm run dev. Local demo database initializes automatically on first request.');
