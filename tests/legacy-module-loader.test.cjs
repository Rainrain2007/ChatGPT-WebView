const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const acorn=require('../ChatGPTWeb/Resources/Vendor/acorn.js');
const source=fs.readFileSync(path.join(__dirname,'../ChatGPTWeb/Resources/legacy-module-loader.js'),'utf8');
const section=source.slice(source.indexOf('  const editsApply'),source.indexOf('  function load('));
const cache=new Map();
const stats={fastPaths:0,planHits:0,analysed:0,analyseMs:0,patched:0};
const ctx=vm.createContext({acorn,URL,performance,stats,allowed:u=>u.origin==='https://chatgpt.com',
 cacheable:()=>true,fingerprint:async text=>require('node:crypto').createHash('sha256').update(text).digest('hex'),
 readPlan:async (url,length,digest)=>cache.get(url+'|'+digest)||null,
 savePlan:(url,length,digest,plan)=>cache.set(url+'|'+digest,plan),load:async url=>'blob:'+url,
 window:{__legacyRegExp:(pattern,flags)=>new RegExp(pattern,flags)}});
vm.runInContext(section+';globalThis.compile=transform;',ctx);
const fixtures=[
 'export const x=1;',
 'import x from "./a.123abc.js";export {x};',
 'export/*comment*/{x}from "./a.123abc.js";',
 'export // comment\n * from "./a.123abc.js";',
 'export async function f(){return import("./a.123abc.js")}',
 'export const x=import.meta.url;',
 'export class A{static{x=1}}',
 'export const x=/(?<=a)b/g;',
 'export class A{static{this.value=3}}'
];
(async()=>{
 for(let i=0;i<fixtures.length;i++){
  const url=`https://chatgpt.com/cdn/assets/${i}.123abc.js`,text=fixtures[i];
  const first=await ctx.compile(text,url),second=await ctx.compile(text,url);
  assert.equal(second,first,'cached plan must reconstruct current imports');
  assert(!/\bstatic\s*\{/.test(first),'static block must be transformed');
  assert(!first.includes('from "./a.'),'imports must be rewritten');
  if(text.includes('import.meta'))assert(!first.includes('import.meta.url'));
  if(text.includes('/(?<='))assert(first.includes('window.__legacyRegExp'));
 }
 const transformed=await ctx.compile('class A{static{this.value=3}};globalThis.value=A.value','https://chatgpt.com/cdn/assets/a.abc123.js');
 vm.runInContext(transformed,ctx);assert.equal(ctx.value,3,'static initializer must retain class this');
 assert(stats.fastPaths>=2);assert(stats.planHits>=8);
 const changed=await ctx.compile('export const x=/(?<=a)c/g;','https://chatgpt.com/cdn/assets/7.123abc.js');
 assert(changed.includes('(?<=a)c'),'changed source must not reuse stale recipe');
 console.log('Module transformation, cache recipes, digest invalidation and class this passed');
})().catch(error=>{console.error(error);process.exitCode=1});
