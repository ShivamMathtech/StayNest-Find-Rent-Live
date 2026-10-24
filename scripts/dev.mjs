import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const args=process.argv.slice(2), portAt=args.indexOf('--port');
const port=portAt>=0?args[portAt+1]:(process.env.PORT||'3000');
if(!/^\d{1,5}$/.test(port)||Number(port)>65535){console.error('Invalid port');process.exit(1);}
const mode=args.includes('--production')?'start':'dev';
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),mode,...(mode==='dev'?['--webpack']:[]),'--hostname','0.0.0.0','--port',port],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
