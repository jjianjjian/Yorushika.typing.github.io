/* ==========================================================
   hangul.js
   한글 완성형 음절을 자모(초성/중성/종성) 단위로 분해하고,
   입력값과 목표 텍스트를 자모 단위로 비교하는 유틸리티.
   2벌식 자판을 그대로 사용하는 OS/브라우저 IME 조합 결과(완성형 문자열)를
   비교 대상으로 삼아, 음절 하나가 몇 개의 자모로 이루어졌는지 계산한다.
   ========================================================== */

const Hangul = (() => {
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  const SBASE = 0xAC00, SLAST = 0xD7A3;

  function isSyllable(ch){
    const c = ch.codePointAt(0);
    return c >= SBASE && c <= SLAST;
  }

  // 완성형 음절 하나 -> [초성, 중성, (종성)] 배열. 완성형이 아니면 [문자] 그대로.
  function decomposeChar(ch){
    if(!ch) return [];
    const code = ch.codePointAt(0);
    if(code >= SBASE && code <= SLAST){
      const idx = code - SBASE;
      const cho = Math.floor(idx / 588);
      const jung = Math.floor((idx % 588) / 28);
      const jong = idx % 28;
      const out = [CHO[cho], JUNG[jung]];
      if(jong > 0) out.push(JONG[jong]);
      return out;
    }
    return [ch];
  }

  // 문자열 -> 자모 배열 전체 flatten
  function flatten(str){
    const out = [];
    for(const ch of str){
      out.push(...decomposeChar(ch));
    }
    return out;
  }

  // target 문자열에서 각 "글자(char)"가 자모 배열의 어느 구간을 차지하는지 인덱스 매핑을 만든다.
  // 반환: { jamo: [...], map: [{char, start, len}] }
  function buildTargetMap(str){
    const jamo = [];
    const map = [];
    for(const ch of str){
      const d = decomposeChar(ch);
      map.push({ char: ch, start: jamo.length, len: d.length });
      jamo.push(...d);
    }
    return { jamo, map };
  }

  // typed 입력 문자열을 자모로 변환해 target 자모와 비교.
  // 반환: 각 target 글자에 대한 상태 배열 ('pending' | 'correct' | 'wrong' | 'current')
  //       + 통계(typedJamoCount, correctJamoCount, wrongJamoCount)
  function evaluate(targetStr, typedStr){
    const { jamo: targetJamo, map } = buildTargetMap(targetStr);
    const typedJamo = flatten(typedStr);

    let correctCount = 0, wrongCount = 0;
    const jamoStatus = new Array(targetJamo.length).fill('pending');

    for(let i = 0; i < typedJamo.length; i++){
      if(i >= targetJamo.length) break; // 오버타이핑은 무시(길이 초과분)
      if(typedJamo[i] === targetJamo[i]){
        jamoStatus[i] = 'correct';
        correctCount++;
      } else {
        jamoStatus[i] = 'wrong';
        wrongCount++;
      }
    }

    // 글자 단위 상태로 변환
    const charStatus = map.map(({start, len}) => {
      const slice = jamoStatus.slice(start, start + len);
      if(slice.every(s => s === 'pending')) return 'pending';
      if(slice.some(s => s === 'wrong')) return 'wrong';
      if(slice.length === len && slice.every(s => s === 'correct')) return 'correct';
      return 'current'; // 아직 이 글자를 다 치지 않음(부분 입력 중)
    });

    const done = typedJamo.length >= targetJamo.length &&
                 jamoStatus.every(s => s === 'correct');

    return {
      charStatus,
      typedJamoCount: Math.min(typedJamo.length, targetJamo.length),
      totalJamoCount: targetJamo.length,
      correctJamoCount: correctCount,
      wrongJamoCount: wrongCount,
      done
    };
  }

  return { decomposeChar, flatten, buildTargetMap, evaluate, isSyllable };
})();
