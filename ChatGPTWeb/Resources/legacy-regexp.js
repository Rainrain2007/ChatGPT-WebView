(() => {
  const NativeRegExp = RegExp;
  try { new NativeRegExp('(?<=a)b'); return; } catch (_) {}
  const nativeExec = NativeRegExp.prototype.exec;
  const boundary = new NativeRegExp('[\\s\\p{P}\\p{S}]$', 'u');
  const identifier = new NativeRegExp('[\\p{L}\\p{N}_$\\\\]$', 'u');
  // Examine one Unicode code point instead of copying the full input prefix.
  const previousCodePoint = (input, position) => {
    let start = position - 1;
    const last = input.charCodeAt(start);
    if (start > 0 && last >= 0xDC00 && last <= 0xDFFF) {
      const first = input.charCodeAt(start - 1);
      if (first >= 0xD800 && first <= 0xDBFF) start--;
    }
    return input.slice(Math.max(0, start), position);
  };
  function compile(pattern, flags) {
    const original = pattern instanceof NativeRegExp ? pattern.source : String(pattern === undefined ? '' : pattern);
    flags = flags === undefined && pattern instanceof NativeRegExp ? pattern.flags : String(flags === undefined ? '' : flags);
    if (!original.includes('(?<=') && !original.includes('(?<!')) return new NativeRegExp(original, flags);
    const assertions = [
      ['(?<=\\n)', (s,p) => p>0 && s[p-1]==='\n'],
      ['(?<==)', (s,p) => p>0 && s[p-1]==='='],
      ['(?<!`)', (s,p) => p===0 || s[p-1]!=='`'],
      ['(?<=<[A-Za-z][\\w.:-]*)', (s,p) => {
        let i=p;
        while(i>0) {
          const c=s.charCodeAt(i-1);
          if((c>=65&&c<=90)||(c>=97&&c<=122)||(c>=48&&c<=57)||c===95||c===46||c===58||c===45)i--;
          else break;
        }
        const first=s.charCodeAt(i);
        return i<p && i>0 && s.charCodeAt(i-1)===60 && ((first>=65&&first<=90)||(first>=97&&first<=122));
      }],
      ['(?<=^|\\s|\\p{P}|\\p{S})', (s,p) => p===0 || boundary.test(previousCodePoint(s,p))],
      ['(?<![\\p{L}\\p{N}_$\\\\])', (s,p) => p===0 || !identifier.test(previousCodePoint(s,p))]
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
    const searchFlags=internalFlags.includes('g') || internalFlags.includes('y') ? internalFlags : internalFlags+'g';
    const search = new NativeRegExp(source, searchFlags);
    const searchVariants=new Map();
    const searchForDisabledMarkers=disabled=>{
      if(!disabled.size)return search;
      const key=markers.map((_,i)=>disabled.has(i)?'1':'0').join('');
      let variant=searchVariants.get(key);
      if(variant)return variant;
      let variantSource=source;
      for(let i=0;i<markers.length;i++)if(disabled.has(i)){
        const group='(?<'+markers[i].name+'>)';
        variantSource=variantSource.split(group).join('(?<'+markers[i].name+'>(?!))');
      }
      variant=new NativeRegExp(variantSource,searchFlags);
      searchVariants.set(key,variant);
      return variant;
    };
    Object.defineProperties(regex, {
      source: {value: original, configurable: true},
      flags: {value: flags, configurable: true},
      hasIndices: {value: flags.includes('d'), configurable: true},
      constructor: {value: LegacyRegExp, configurable: true},
      exec: {configurable: true, value: function(value) {
        const profile = window.__legacyRegExpProfileEnabled ?
          (window.__legacyRegExpProfile ||= {calls:0, candidates:0, rejected:0, chars:0, elapsedMs:0}) : null;
        const started = profile ? performance.now() : 0;
        const input = String(value), initial = this.lastIndex;
        if (profile) {profile.calls++; profile.chars += input.length;}
        try {
        let searchFrom=this.global || this.sticky ? initial : 0;
        let match;
        while (true) {
          const disabledMarkers=new Set();
          let disabledAt=null;
          let candidateSearch=search;
          while(true){
            candidateSearch=searchForDisabledMarkers(disabledMarkers);
            candidateSearch.lastIndex=searchFrom;
            match=nativeExec.call(candidateSearch,input);
            if(!match){
              if(!this.sticky && disabledAt!==null){
                searchFrom=disabledAt+1;
                disabledMarkers.clear();
                disabledAt=null;
                if(this.unicode && /[\uD800-\uDBFF]/.test(input[searchFrom-1]) && /[\uDC00-\uDFFF]/.test(input[searchFrom]))searchFrom++;
                continue;
              }
              break;
            }
            if(disabledAt!==null && match.index!==disabledAt){
              disabledMarkers.clear();
              disabledAt=null;
              searchFrom=match.index;
              continue;
            }
            if (profile) profile.candidates++;
            const failedMarkers=[];
            for(let i=0;i<markers.length;i++){
              const marker=markers[i];
              if(!match.groups || match.groups[marker.name]===undefined)continue;
              const position=match.indices && match.indices.groups && match.indices.groups[marker.name];
              if(position===undefined || !marker.test(input,position[0]))failedMarkers.push(i);
            }
            if(failedMarkers.length){
              if (profile) profile.rejected++;
              // A failed assertion must reject only its current regex path.
              // Make that assertion impossible and retry at the same index so
              // the engine can select a later alternation, as native lookbehind
              // would. This preserves capture slots and token priority.
              let added=false;
              for(const index of failedMarkers)if(!disabledMarkers.has(index)){
                disabledMarkers.add(index);added=true;
              }
              if(added){if(disabledAt===null)disabledAt=match.index;searchFrom=match.index;continue;}
              if (this.sticky) break;
              searchFrom=match.index+1;
              disabledMarkers.clear();
              disabledAt=null;
              if(this.unicode && /[\uD800-\uDBFF]/.test(input[match.index]) && /[\uDC00-\uDFFF]/.test(input[searchFrom]))searchFrom++;
              continue;
            }
            if (this.global || this.sticky) this.lastIndex = candidateSearch.lastIndex;
            const values=[match[0]],indices=[match.indices[0]];
            for(let i=1;i<=originalCapture;i++){values.push(match[captures[i]]);indices.push(match.indices[captures[i]]);}
            values.index=match.index;values.input=match.input;
            const groups=Object.assign(Object.create(null),match.groups),indexGroups=Object.assign(Object.create(null),match.indices.groups);
            for(const marker of markers){delete groups[marker.name];delete indexGroups[marker.name];}
            values.groups=Object.keys(groups).length?groups:undefined;
            if(flags.includes('d')){indices.groups=Object.keys(indexGroups).length?indexGroups:undefined;values.indices=indices;}
            return values;
          }
          break;
        }
        if (this.global || this.sticky) this.lastIndex = 0;
        return null;
        } finally {if (profile) profile.elapsedMs += performance.now() - started;}
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
