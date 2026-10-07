(() => {
  if (location.hostname !== 'chatgpt.com' || window !== window.top) return;
  const modules = new Map(), urls = [], seenScripts = new WeakSet();
  const stats = window.__legacyWebKit = {loaded:0, patched:0, booted:0, errors:[], fetches:0};
  const allowed = u => u.origin === location.origin && /^\/cdn\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9._-]+\.js$/.test(u.pathname);
  const editsApply = (s, edits) => { edits.sort((a,b)=>b.start-a.start); for(const e of edits) s=s.slice(0,e.start)+e.text+s.slice(e.end); return s; };
  async function transform(source, base) {
    const ast = acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
    const edits=[], imports=[];
    let serial=0;
    const visit = n => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) {
        const u=new URL(n.source.value,base);
        if (u.href===base && n.type==='ImportDeclaration' && n.specifiers.length===1 && n.specifiers[0].type==='ImportNamespaceSpecifier') {
          edits.push({start:n.start,end:n.end,text:'const '+n.specifiers[0].local.name+'={__rspack_esm_id,__rspack_esm_ids,__webpack_modules__};'});
        } else if(allowed(u)) {
          imports.push(load(u.href).then(blob=>edits.push({start:n.source.start,end:n.source.end,text:JSON.stringify(blob)})));
        }
      }
      if(n.type==='MemberExpression' && n.object.type==='MetaProperty' && n.object.meta.name==='import' && n.property.name==='url') edits.push({start:n.start,end:n.end,text:JSON.stringify(base)});
      if(n.type==='ImportExpression') {
        edits.push({start:n.start,end:n.source.start,text:'window.__compatImport('});
        edits.push({start:n.source.end,end:n.end,text:','+JSON.stringify(base)+')'});
      }
      if(n.type==='StaticBlock') {
        edits.push({start:n.start,end:n.start+6,text:'static #__compatBlock'+(serial++)+'=(()=>'});
        edits.push({start:n.end,end:n.end,text:')();'});
        stats.patched++;
      }
      if(n.type==='Literal' && n.regex && /\(\?<([=!])/.test(n.regex.pattern)) {
        edits.push({start:n.start,end:n.end,text:'window.__legacyRegExp('+JSON.stringify(n.regex.pattern)+','+JSON.stringify(n.regex.flags)+')'});stats.patched++;
      }
      for(const k of Object.keys(n)) {
        if(k==='regex' || k==='start' || k==='end')continue;
        const v=n[k];if(Array.isArray(v))v.forEach(visit);else if(v && typeof v==='object')visit(v);
      }
    };
    visit(ast); await Promise.all(imports);
    return editsApply(source,edits)+'\n//# sourceURL='+base;
  }
  function load(href) {
    if(modules.has(href)) return modules.get(href);
    const promise=(async()=>{
      stats.fetches++;
      const response=await fetch(href,{credentials:'omit'});
      if(!response.ok)throw new Error('asset '+response.status+' '+new URL(href).pathname);
      const source=await transform(await response.text(),href);
      
      const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));urls.push(url);stats.loaded++;return url;
    })();modules.set(href,promise);return promise;
  }
  window.__compatImport = async (specifier,base) => {
    const u=new URL(specifier,base);
    return import(allowed(u)?await load(u.href):u.href);
  };
  async function boot(original) {
    if(seenScripts.has(original) || original.type!=='module' || original.src || !original.textContent.includes('/cdn/assets/'))return;
    seenScripts.add(original);
    try {
      const source=await transform(original.textContent,location.href);
      const script=document.createElement('script');script.type='module';script.nonce=original.nonce;script.src=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
      script.onerror=()=>{stats.errors.push('module bootstrap failed');reportFailure(new Error('Module bootstrap failed'));};
      seenScripts.add(script);script.dataset.legacyWebkit='true';document.head.appendChild(script);stats.booted++;
    } catch(e) {stats.errors.push(String(e));reportFailure(e);}
  }
  let candidate, failed=false;
  const reportFailure = error => {
    try {window.webkit.messageHandlers.shellState.postMessage({kind:'compatibilityFailure',url:location.href});} catch(_) {}
    if(window.__webShellOptions?.debug)console.error('Legacy WebKit loader',error);
  };
  const start = () => {if(candidate)boot(candidate);};
  const watch = script => {
    if(script.type!=='module' || script.src || !script.textContent.includes('/cdn/assets/'))return;
    candidate=script;
    script.addEventListener('error',()=>{failed=true;start();},{once:true});
    observer.disconnect();
    if(failed)start();
  };
  window.addEventListener('error',event=>{
    if(event.target instanceof HTMLScriptElement && event.target.type==='module') {failed=true;start();}
    else if(event.filename && event.filename.includes('/cdn/assets/') &&
      /regular expression|Unexpected token/.test(event.message||'')) {failed=true;start();}
  },true);
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
    if(node.nodeType!==1)continue;
    if(node.tagName==='SCRIPT')watch(node);else node.querySelectorAll?.('script[type=module]').forEach(watch);
  }});
  observer.observe(document,{childList:true,subtree:true});
  document.querySelectorAll('script[type=module]').forEach(watch);
})();
