const {test}=require('node:test');const assert=require('node:assert/strict');
const {aiContext,maskAiText,aiFingerprint}=require('../dist/messenger/ai-context');
test('Local assistant context is bounded, chronological and masks recognizable contact details',()=>{
 assert.equal(maskAiText('Gọi 0912345678 email user@example.com'), 'Gọi [số điện thoại] email [email]');
 const rows=aiContext(Array.from({length:25},(_,i)=>({direction:i%2?'OUTBOUND':'INBOUND',text:String(i)+'x'.repeat(2000)})));
 assert.ok(rows.length<=20);assert.ok(rows.reduce((n,r)=>n+r.text.length,0)<=12000);
 assert.equal(rows.at(-1).role,'khách');assert.ok(rows.at(-1).text.startsWith('0'));
 assert.notEqual(aiFingerprint({price:'100'}),aiFingerprint({price:'200'}));
});
