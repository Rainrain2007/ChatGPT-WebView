const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ChatGPTWeb/Resources/legacy-regexp.js','utf8').replace("try { new NativeRegExp('(?<=a)b'); return; } catch (_) {}",'');
const context=vm.createContext({window:{},RegExp});vm.runInContext(source,context);const legacy=context.window.__legacyRegExp;
const patterns=[
 ['(?:([ \\t]+))|(?:((?<==)(?:true|false)))|(?:((?<==)-?\\d+))|(?:((?<==)\x27[^\x27]*\x27))','g',['flag=true count=42 text=\x27hi\x27','true false 42','x=false y=-12']],
 ['(x)(?<!`)(a)\\2','g',['xaa','xaa xaa','`xaa']],

 ['|(?:(?:(?<==)(?:true|false)))','g',['true','x=true','false=false','(=true)']],
 ['(?:(?:(?<==)(?:true|false)))','g',['true','x=true','false=false','(=true)']],
 ['(?<=\\n)','g',['','a','a\n','a\nb\n','\n\n','a\nb']],
 ['(?<==)(?:true|false)','g',['true','x=true false=false','=false','false=true']],
 ['(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)','gu',['x@y.com','a x@y.com','wordx@y.com','😀x@y.com','中x@y.com']],
 ['(?<![\\p{L}\\p{N}_$\\\\])\\$sites(?![\\p{L}\\p{N}_$-])','gu',['$sites','foo$sites','\\$sites','😀$sites','中$sites','$sites-other']],
 ['(?<!`)(?<b>`+)[^`]+\\k<b>(?!`)','g',['`abc`','``abc``','``abc`','`a``b`','x`a`y','```abc``']],
 ['\\[(?:[^\\[\\]`]|(?<!`)(?<a>`+)[^`]+\\k<a>(?!`))*?\\]\\((?:\\\\[\\s\\S]|[^\\\\\\(\\)]|\\((?:\\\\[\\s\\S]|[^\\\\\\(\\)])*\\))*\\)','g',['[a](url)','[`x`](url)','[``x``](url)','[`a``b`](url)','[before `a` after](url)']]
];
function matches(regex,text){return Array.from(text.matchAll(regex),m=>({text:m[0],index:m.index,groups:Array.from(m).slice(1)}));}
let comparisons=0;
for(const [pattern,flags,inputs] of patterns)for(const input of inputs){assert.deepEqual(matches(legacy(pattern,flags),input),matches(new RegExp(pattern,flags),input),pattern+' '+JSON.stringify(input));comparisons++;}
for(const input of ['','a','a\n','a\nb\n','\n\n']){assert.deepEqual([...input.split(legacy('(?<=\\n)'))],input.split(/(?<=\n)/));comparisons++;}
for(const input of ['=true','x=true','true'])for(let index=0;index<=input.length;index++){let actual=legacy('(?<==)(?:true|false)','y'),expected=/(?<==)(?:true|false)/y;actual.lastIndex=expected.lastIndex=index;assert.deepEqual(actual.exec(input)?.[0],expected.exec(input)?.[0]);assert.equal(actual.lastIndex,expected.lastIndex);comparisons++;}
assert.equal(legacy('(?<==)(?:true|false)').source,'(?<==)(?:true|false)');
assert.throws(()=>legacy('(?<=unknown)a'),e=>e.name==='SyntaxError');
for (const prefix of ['😀','中','a',' ', 'a\u0301','\uD800','\uDC00','x'.repeat(100000)+'😀']) {
  for (const [pattern,suffix] of [
    ['(?<=^|\\s|\\p{P}|\\p{S})x@y.com','x@y.com'],
    ['(?<![\\p{L}\\p{N}_$\\\\])\\$sites','$sites']
  ]) {
    const input=prefix+suffix;
    assert.deepEqual(matches(legacy(pattern,'gu'),input),matches(new RegExp(pattern,'gu'),input));comparisons++;
  }
}
const mooAttributePattern="(?:(?:((?:(?:[ \\t\\v\\f\\ufeff]+))))|(?:((?:(?:[.#](?:(?!-?\\d)(?:[a-zA-Z0-9\\xA0-\\uFFFF_-])+)))))|(?:((?:(?:(?<==)(?:true|false)))))|(?:((?:(?:(?<==)-?(?:(?:0[xX][\\da-fA-F](?:_?[\\da-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*)n?|-?0n|-?[1-9](?:_?\\d)*n|(?:(?:0(?!\\d)|0\\d*[89]\\d*|[1-9](?:_?\\d)*)(?:\\.(?:\\d(?:_?\\d)*)?)?|\\.\\d(?:_?\\d)*)(?:[eE][+-]?\\d(?:_?\\d)*)?|-?0[0-7]+)))))|(?:((?:(?:(?<==)'(?!.*&[0-9a-zA-Z]+;)[^'\\\\]*(?:\\\\.|\\\\n[^\"\\\\]*|&[^0-9a-zA-Z;]*)*'))))|(?:((?:(?:(?<==)\"(?!.*&[0-9a-zA-Z]+;)[^\"\\\\]*(?:\\\\.|\\\\n[^\"\\\\]*|&[^0-9a-zA-Z;]*)*\"))))|(?:((?:(?:(?<==)[^\"\\s'`=<>\\x00]+))))|(?:((?:(?:(?:(?![\\s\\x00\\x22\\x27\\x3E\\x2F\\x3D\\x00-\\x1F\\x7F-\\x9F])[^\\s\\x00-\\x1F\\x7F-\\x9F\\x22\\x27\\x3E\\x2F\\x3D])+))))|(?:((?:(?:(?:=))))))";
function scanAttributeLexer(compile,input){
  const regex=compile(mooAttributePattern);
  regex.lastIndex=0;
  const tokens=[];
  while(regex.lastIndex<input.length){
    const match=regex.exec(input);
    assert.ok(match,'Moo attribute lexer failed at '+regex.lastIndex+' in '+JSON.stringify(input));
    assert.ok(match[0].length>0,'Moo attribute lexer returned an empty token');
    tokens.push({text:match[0],index:match.index,captures:Array.from(match).slice(1),lastIndex:regex.lastIndex});
  }
  return tokens;
}
for(const input of ['index="0"','index=0','enabled=true','enabled="true"','data-x=nonquoted']){
  const actual=scanAttributeLexer(pattern=>legacy(pattern,'ym'),input);
  const expected=scanAttributeLexer(pattern=>new RegExp(pattern,'ymd'),input);
  assert.deepEqual(actual,expected,'Moo full-token scan '+JSON.stringify(input));
}
assert.deepEqual(scanAttributeLexer(pattern=>legacy(pattern,'ym'),'index="0"').map(token=>token.text),['index','=','"0"']);
assert.deepEqual(scanAttributeLexer(pattern=>legacy(pattern,'ym'),'index=0').map(token=>token.text),['index','=','0']);
assert.deepEqual(scanAttributeLexer(pattern=>legacy(pattern,'ym'),'enabled=true').map(token=>token.text),['enabled','=','true']);
comparisons+=5;
console.log(comparisons+' native/legacy match, split and sticky comparisons passed');
