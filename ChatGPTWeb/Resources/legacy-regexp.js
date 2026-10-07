(() => {
  const NativeRegExp = RegExp;
  try { new NativeRegExp('(?<=a)b'); return; } catch (_) {}
  const nativeExec = NativeRegExp.prototype.exec;
  const boundary = new NativeRegExp('[\\s\\p{P}\\p{S}]$', 'u');
  const identifier = new NativeRegExp('[\\p{L}\\p{N}_$\\\\]$', 'u');
  function compile(pattern, flags) {
    const original = pattern instanceof NativeRegExp ? pattern.source : String(pattern === undefined ? '' : pattern);
    flags = flags === undefined && pattern instanceof NativeRegExp ? pattern.flags : String(flags === undefined ? '' : flags);
    if (!original.includes('(?<=') && !original.includes('(?<!')) return new NativeRegExp(original, flags);
    const assertions = [
      ['(?<=\\n)', (s,p) => p>0 && s[p-1]==='\n'],
      ['(?<==)', (s,p) => p>0 && s[p-1]==='='],
      ['(?<!`)', (s,p) => p===0 || s[p-1]!=='`'],
      ['(?<=^|\\s|\\p{P}|\\p{S})', (s,p) => p===0 || boundary.test(s.slice(0,p))],
      ['(?<![\\p{L}\\p{N}_$\\\\])', (s,p) => p===0 || !identifier.test(s.slice(0,p))]
    ];
    const markers=[], captures=[], backrefs=[];
    let source='', inClass=false, actualCapture=0, originalCapture=0;
    for(let i=0;i<original.length;) {
      const char=original[i];
      if(char==='\\') {
        const ref=!inClass && /^\\([1-9][0-9]*)/.exec(original.slice(i));
        if(ref) {backrefs.push({start:source.length,end:source.length+ref[0].length,index:Number(ref[1])});source+=ref[0];i+=ref[0].length;}
        else {source+=original.slice(i,i+2);i+=2;}
        continue;
      }
      if(char==='[')inClass=true;
      if(char===']')inClass=false;
      if(char==='(' && !inClass) {
        if(original.startsWith('(?<=',i) || original.startsWith('(?<!',i)) {
          const known=assertions.find(([text])=>original.startsWith(text,i));
          if(!known) {window.__legacyUnsupportedPattern=original;throw new SyntaxError('Unsupported legacy lookbehind pattern');}
          let name='__wvAssert'+markers.length;
          while(original.includes(name))name+='X';
          markers.push({name,index:++actualCapture,test:known[1]});
          source+='(?<'+name+'>)';i+=known[0].length;continue;
        }
        if(original[i+1]!=='?' || (original[i+2]==='<' && original[i+3]!=='=' && original[i+3]!=='!')) captures[++originalCapture]=++actualCapture;
      }
      source+=char;i++;
    }
    for(const ref of backrefs.reverse()) {
      if(ref.index<=originalCapture)source=source.slice(0,ref.start)+'\\'+captures[ref.index]+source.slice(ref.end);
    }
    const internalFlags=flags.includes('d')?flags:flags+'d';
    const regex = new NativeRegExp(source, internalFlags);
    const search = new NativeRegExp(source, internalFlags.includes('g') || internalFlags.includes('y') ? internalFlags : internalFlags+'g');
    Object.defineProperties(regex, {
      source: {value: original, configurable: true},
      flags: {value: flags, configurable: true},
      hasIndices: {value: flags.includes('d'), configurable: true},
      constructor: {value: LegacyRegExp, configurable: true},
      exec: {configurable: true, value: function(value) {
        const input = String(value), initial = this.lastIndex;
        search.lastIndex = this.global || this.sticky ? initial : 0;
        let match;
        while ((match = nativeExec.call(search, input))) {
          if (markers.every(marker=>{
            const position=match.indices.groups[marker.name];
            return position===undefined || marker.test(input,position[0]);
          })) {
            if (this.global || this.sticky) this.lastIndex = search.lastIndex;
            const values=[match[0]],indices=[match.indices[0]];
            for(let i=1;i<=originalCapture;i++){values.push(match[captures[i]]);indices.push(match.indices[captures[i]]);}
            values.index=match.index;values.input=match.input;
            const groups=Object.assign(Object.create(null),match.groups),indexGroups=Object.assign(Object.create(null),match.indices.groups);
            for(const marker of markers){delete groups[marker.name];delete indexGroups[marker.name];}
            values.groups=Object.keys(groups).length?groups:undefined;
            if(flags.includes('d')){indices.groups=Object.keys(indexGroups).length?indexGroups:undefined;values.indices=indices;}
            return values;
          }
          if (this.sticky) break;
          let next = match.index+1;
          if (this.unicode && /[\uD800-\uDBFF]/.test(input[match.index]) && /[\uDC00-\uDFFF]/.test(input[next])) next++;
          search.lastIndex = next;
        }
        if (this.global || this.sticky) this.lastIndex = 0;
        return null;
      }}
    });
    return regex;
  }
  function LegacyRegExp(pattern, flags) {
    if (!new.target && flags === undefined && pattern instanceof NativeRegExp && pattern.constructor === LegacyRegExp) return pattern;
    return compile(pattern, flags);
  }
  LegacyRegExp.prototype = NativeRegExp.prototype;
  for (const key of Reflect.ownKeys(NativeRegExp)) {
    if (['prototype','name','length'].includes(key) || key === Symbol.species) continue;
    try {Object.defineProperty(LegacyRegExp,key,Object.getOwnPropertyDescriptor(NativeRegExp,key));} catch (_) {}
  }
  Object.defineProperty(LegacyRegExp, Symbol.species, {get: () => LegacyRegExp});
  window.__legacyRegExp = compile;
  window.RegExp = LegacyRegExp;
})();
