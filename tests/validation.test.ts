import test from 'node:test';
import assert from 'node:assert/strict';
import {canTransition,validVisitDate,password,registerSchema,imageUrl} from '../lib/validation';
import {checkOrigin,HttpError,digest} from '../lib/auth';
test('Reject impossible calendar dates and visits in the past',()=>{
 const now=new Date('2026-02-01T00:00:00Z').getTime();
 assert.equal(validVisitDate('2026-02-31','09:00',now),false);
 assert.equal(validVisitDate('2026-01-31','09:00',now),false);
 assert.equal(validVisitDate('2026-02-02','09:00',now),true);
 assert.equal(validVisitDate('2026-09-01','09:00',now),false);
 assert.equal(validVisitDate('2026-02-02','03:15',now),false);
});
test('Viewing boundaries use UTC+3, not the server timezone',()=>{
 assert.equal(validVisitDate('2026-02-02','09:00',new Date('2026-02-02T05:59:00Z').getTime()),true);
 assert.equal(validVisitDate('2026-02-02','09:00',new Date('2026-02-02T06:01:00Z').getTime()),false);
});
test('Only the host can confirm and only elapsed confirmed visits can complete',()=>{
 assert.equal(canTransition('pending','confirmed',false,false),false);
 assert.equal(canTransition('pending','confirmed',true,false),true);
 assert.equal(canTransition('confirmed','completed',true,false),false);
 assert.equal(canTransition('confirmed','completed',true,true),true);
 assert.equal(canTransition('cancelled','confirmed',true,true),false);
 assert.equal(canTransition('completed','cancelled',false,true),false);
 assert.equal(canTransition('confirmed','cancelled',false,false),true);
});
test('Signup rejects administrator privileges and unrecognized fields',()=>{
 const good={name:'Jamie Morgan',email:'JAMIE@example.com',password:'Valid-password-123',role:'tenant'};
 assert.equal(registerSchema.parse(good).email,'jamie@example.com');
 assert.equal(registerSchema.safeParse({...good,role:'admin'}).success,false);
 assert.equal(registerSchema.safeParse({...good,verified:true}).success,false);
});
test('Password length is bounded by bcrypt byte capacity',()=>{
 assert.equal(password.safeParse('a'.repeat(72)).success,true);
 assert.equal(password.safeParse('a'.repeat(73)).success,false);
 assert.equal(password.safeParse('🔐'.repeat(20)).success,false);
 assert.equal(password.safeParse('short').success,false);
});
test('Image URLs cannot execute scripts or use insecure remote URLs',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,bad','http://example.com/a.jpg','//evil.test/a.jpg','https://user:secret@example.com/a.jpg'])assert.equal(imageUrl.safeParse(url).success,false,url);
 assert.equal(imageUrl.safeParse('/images/villa.jpg').success,true);
 assert.equal(imageUrl.safeParse('https://images.example.com/a.jpg').success,true);
});
test('Cross-origin writes are rejected while same-origin writes are accepted',()=>{
 assert.throws(()=>checkOrigin(new Request('https://staynest.test/api/profile',{method:'PATCH',headers:{Origin:'https://evil.test'}})),HttpError);
 assert.throws(()=>checkOrigin(new Request('https://staynest.test/api/profile',{method:'PATCH',headers:{'Sec-Fetch-Site':'cross-site'}})),HttpError);
 assert.doesNotThrow(()=>checkOrigin(new Request('https://staynest.test/api/profile',{method:'PATCH',headers:{Origin:'https://staynest.test'}})));
});
test('Sessions are hashed rather than stored as bearer tokens',()=>{
 assert.equal(digest('private-token').length,64);
 assert.notEqual(digest('private-token'),digest('other-token'));
});
