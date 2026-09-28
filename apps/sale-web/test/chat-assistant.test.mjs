import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
for(const key of ['window','document','navigator','FormData']) Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const {createRoot}=await import('react-dom/client');
const bundle=await build({stdin:{contents:`export {ChatAssistantDialog} from './src/messenger/ChatAssistant';export {ChatAssistantSettings} from './src/messenger/ChatAssistantSettings';export {createDraftStore} from './src/messenger/drafts';`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react/jsx-runtime','lucide-react'],plugins:[{name:'fixture',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:'export const api=(...a)=>globalThis.assistantHttp(...a);'}));}}]});
const compiled={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {ChatAssistantDialog,ChatAssistantSettings,createDraftStore}=compiled.exports;
const node=document.getElementById('root');
async function mount(C,props){const root=createRoot(node);await act(async()=>root.render(React.createElement(C,props)));return root;}
async function click(text){const b=[...node.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>b.click());}
test('Local draft is explicit, generation never sends, applying preserves the draft ID',async()=>{
 const calls=[];let applied;
 globalThis.assistantHttp=async(...args)=>{calls.push(args);if(args[1]==='POST')return{id:'draft-1',reply:'Xin hỏi thêm nhu cầu',warnings:['Chưa kết nối AI.'],products:[],expiresAt:new Date(Date.now()+600000).toISOString()};return{mode:'LOCAL',enabled:true,instructions:'Không hứa còn hàng',hasPolicy:true,hasProducts:true,catalogAllowed:true,messages:[{role:'khách',text:'Tôi muốn xem mẫu'}]};};
 const root=await mount(ChatAssistantDialog,{id:'c1',templates:[],replaceExisting:true,close:()=>{},apply:v=>{applied=v;}});
 assert.match(node.textContent,/Chưa kết nối AI/);assert.match(node.textContent,/Không hứa còn hàng/);
 await click('Tạo bản nháp nội bộ');
 assert.deepEqual(calls.find(c=>c[1]==='POST'),['/messenger/assistant/conversations/c1/drafts','POST',{kind:'ASK',variantIds:[]}]);
 assert.match(node.textContent,/thay nội dung văn bản đang soạn/);
 await click('Đưa vào ô nhập để duyệt gửi');assert.equal(applied.id,'draft-1');
 assert.ok(!calls.some(c=>c[0].includes('/reply')));
 await act(async()=>root.unmount());
});
test('Disabled Page cannot compose; settings persist only local Page configuration',async()=>{
 globalThis.assistantHttp=async()=>({mode:'LOCAL',enabled:false,instructions:'',hasPolicy:false,hasProducts:false,catalogAllowed:false,messages:[]});
 let root=await mount(ChatAssistantDialog,{id:'c2',templates:[],replaceExisting:false,close:()=>{},apply:()=>{}});
 assert.ok([...node.querySelectorAll('button')].find(b=>b.textContent==='Tạo bản nháp nội bộ').disabled);
 await act(async()=>root.unmount());
 const calls=[];const page={pageId:'p1',name:'Page thử',version:1,enabled:false,instructions:'Hướng dẫn',greeting:'Dạ',policy:'Chính sách',productIds:[],products:[]};
 globalThis.assistantHttp=async(...args)=>{calls.push(args);return{mode:'LOCAL',pages:[page]};};
 root=await mount(ChatAssistantSettings,{});
 await click('Cấu hình trợ lý');
 await act(async()=>node.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(calls.find(c=>c[1]==='PATCH'),['/messenger/assistant/pages/p1','PATCH',{version:1,enabled:false,instructions:'Hướng dẫn',greeting:'Dạ',policy:'Chính sách',productIds:[]}]);
 assert.ok(!node.querySelector('input[type=password]'));
 await act(async()=>root.unmount());
});
test('Assistant origin survives editing/reload and images, clears with discard/account switch',()=>{
 const map=new Map();const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const id='11111111-1111-4111-8111-111111111111',aid='22222222-2222-4222-8222-222222222222';
 let store=createDraftStore(()=>storage);store.activate('staff');store.edit(id,{text:'Bản nháp',aiDraftId:aid});store.edit(id,{text:'Đã sửa'});
 store=createDraftStore(()=>storage);store.activate('staff');assert.equal(store.get(id).aiDraftId,aid);
 store.edit(id,{image:{id:'33333333-3333-4333-8333-333333333333',title:'Ảnh'}});
 const attempt=store.begin(id);store.settle(id,attempt,'SENT');assert.equal(store.get(id).aiDraftId,aid);assert.equal(store.get(id).text,'Đã sửa');
 store.edit(id,{text:'',aiDraftId:null});assert.equal(store.get(id),undefined);
 store.edit(id,{text:'Bản nháp',aiDraftId:aid});store.activate('other');assert.equal(store.get(id),undefined);
});
