/* ==========================================================
   romaji.js
   히라가나(후리가나) 읽기 문자열을 "모라(mora)" 단위로 분해하고,
   헵번식을 기본으로 하되 흔히 쓰이는 변형 표기(시/し=shi/si 등)를
   폭넓게 허용하는 실시간 로마자 입력 매칭기를 제공한다.
   ========================================================== */

const Romaji = (() => {

  // 단독 가나 -> 허용 로마자 후보들 (헵번식을 1순위로)
  const BASE = {
    "あ":["a"], "い":["i"], "う":["u"], "え":["e"], "お":["o"],
    "か":["ka"], "き":["ki"], "く":["ku"], "け":["ke"], "こ":["ko"],
    "さ":["sa"], "し":["shi","si"], "す":["su"], "せ":["se"], "そ":["so"],
    "た":["ta"], "ち":["chi","ti"], "つ":["tsu","tu"], "て":["te"], "と":["to"],
    "な":["na"], "に":["ni"], "ぬ":["nu"], "ね":["ne"], "の":["no"],
    "は":["ha"], "ひ":["hi"], "ふ":["fu","hu"], "へ":["he"], "ほ":["ho"],
    "ま":["ma"], "み":["mi"], "む":["mu"], "め":["me"], "も":["mo"],
    "や":["ya"], "ゆ":["yu"], "よ":["yo"],
    "ら":["ra"], "り":["ri"], "る":["ru"], "れ":["re"], "ろ":["ro"],
    "わ":["wa"], "ゐ":["wi","i"], "ゑ":["we","e"], "を":["wo","o"],
    "が":["ga"], "ぎ":["gi"], "ぐ":["gu"], "げ":["ge"], "ご":["go"],
    "ざ":["za"], "じ":["ji","zi"], "ず":["zu"], "ぜ":["ze"], "ぞ":["zo"],
    "だ":["da"], "ぢ":["ji","di","zi"], "づ":["zu","du"], "で":["de"], "ど":["do"],
    "ば":["ba"], "び":["bi"], "ぶ":["bu"], "べ":["be"], "ぼ":["bo"],
    "ぱ":["pa"], "ぴ":["pi"], "ぷ":["pu"], "ぺ":["pe"], "ぽ":["po"],
    "ん":["n","nn"], // 문맥에 따라 build() 단계에서 후보를 조정함
  };

  // 요음(拗音) 2글자 조합 -> 후보 (예: きゃ -> kya)
  const YOON = {
    "きゃ":["kya"], "きゅ":["kyu"], "きょ":["kyo"],
    "しゃ":["sha","sya"], "しゅ":["shu","syu"], "しょ":["sho","syo"],
    "ちゃ":["cha","tya","cya"], "ちゅ":["chu","tyu","cyu"], "ちょ":["cho","tyo","cyo"],
    "にゃ":["nya"], "にゅ":["nyu"], "にょ":["nyo"],
    "ひゃ":["hya"], "ひゅ":["hyu"], "ひょ":["hyo"],
    "みゃ":["mya"], "みゅ":["myu"], "みょ":["myo"],
    "りゃ":["rya"], "りゅ":["ryu"], "りょ":["ryo"],
    "ぎゃ":["gya"], "ぎゅ":["gyu"], "ぎょ":["gyo"],
    "じゃ":["ja","zya","jya"], "じゅ":["ju","zyu","jyu"], "じょ":["jo","zyo","jyo"],
    "びゃ":["bya"], "びゅ":["byu"], "びょ":["byo"],
    "ぴゃ":["pya"], "ぴゅ":["pyu"], "ぴょ":["pyo"],
    "ちぇ":["che"], "しぇ":["she"], "じぇ":["je"],
    "ふぁ":["fa"], "ふぃ":["fi"], "ふぇ":["fe"], "ふぉ":["fo"],
    "てぃ":["ti"], "でぃ":["di"], "とぅ":["tu"], "どぅ":["du"],
    "うぃ":["wi"], "うぇ":["we"], "うぉ":["wo"],
    "ゔぁ":["va"], "ゔぃ":["vi"], "ゔ":["vu"], "ゔぇ":["ve"], "ゔぉ":["vo"],
  };

  // 모라의 대표 모음(장음 ー 처리를 위함)
  const VOWEL_OF = {};
  for(const [k, arr] of Object.entries(BASE)){
    const last = arr[0][arr[0].length-1];
    if("aiueo".includes(last)) VOWEL_OF[k] = last;
  }
  for(const [k, arr] of Object.entries(YOON)){
    const last = arr[0][arr[0].length-1];
    if("aiueo".includes(last)) VOWEL_OF[k] = last;
  }

  // 원문에 섞여 나오는 일본어 구두점을 실제 입력 가능한 ASCII 문자로 대응시킨다.
  const PUNCT = {
    "、": [",", " "],
    "。": [".", " "],
    "！": ["!"],
    "？": ["?"],
    "「": ["["], "」": ["]"],
    "『": ["["], "』": ["]"],
    "・": ["/"],
    "　": [" "], // 전각 공백
    " ": [" "],
  };

  function kataToHira(str){
    return str.replace(/[\u30A1-\u30F6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  // な행(な,に,ぬ,ね,の) 및 や/ん 등 "n"이 헷갈릴 수 있는 행 시작 여부 판별용
  const NA_ROW_STARTS_WITH_N = true; // な행 로마자가 전부 n으로 시작

  /**
   * 히라가나 읽기 문자열 -> 모라 배열
   * 각 원소: { kana, candidates:[...], display }
   */
  function segment(readingRaw){
    const reading = kataToHira(readingRaw);
    const chars = Array.from(reading);
    const morae = [];
    let i = 0;
    let pendingSokuon = false;

    while(i < chars.length){
      const c = chars[i];

      if(c === "っ"){
        pendingSokuon = true;
        i++;
        continue;
      }
      if(c === "ー"){
        const prev = morae[morae.length-1];
        const vowel = prev ? VOWEL_OF[prev.kana] : null;
        const cands = vowel ? [vowel, "-"] : ["-"];
        morae.push({ kana:"ー", candidates:cands, display:"ー" });
        i++;
        continue;
      }

      // 요음(2글자) 우선 확인
      const two = chars.slice(i, i+2).join("");
      let kana, baseCandidates;
      if(YOON[two]){
        kana = two; baseCandidates = YOON[two]; i += 2;
      } else if(BASE[c]){
        kana = c; baseCandidates = BASE[c]; i += 1;
      } else if(PUNCT[c]){
        morae.push({ kana:c, candidates:PUNCT[c], display:c });
        i += 1;
        continue;
      } else {
        // 매핑에 없는 문자(한자가 섞여 들어온 경우 등)는 해당 문자 자체를 그대로 요구한다.
        morae.push({ kana:c, candidates:[c], display:c });
        i += 1;
        continue;
      }

      let candidates = baseCandidates.slice();

      // ん 문맥 처리: 다음 모라가 모음(あ행) 또는 や/ゆ/よ 로 시작하면 "な" 등과 혼동될 수 있으므로
      // 반드시 이중 n(또는 n')을 요구한다. 그 외(자음행, な행, 문장 끝 등)에는 단일 n으로 바로 확정한다.
      // ※ な행(な,に,ぬ,ね,の)은 그 자체가 n으로 시작하므로 뒤에 이어 쳐도 자연스럽게 겹낫이 되어 별도 처리가 필요 없다.
      if(kana === "ん"){
        const nextChar = chars[i]; // 이미 i는 다음 문자를 가리킴
        const ambiguous = nextChar && /[あいうえおやゆよ]/.test(nextChar);
        candidates = ambiguous ? ["nn","n'"] : ["n"];
      }

      // っ(촉음) 처리: 다음 모라 첫 자음을 중복
      if(pendingSokuon){
        const doubled = new Set();
        for(const cand of candidates){
          const first = cand[0];
          if("aiueo".includes(first)){
            doubled.add(cand); // 모음으로 시작하면 이중화 생략(드문 경우)
          } else {
            doubled.add(first + cand);
          }
        }
        candidates = Array.from(doubled);
        pendingSokuon = false;
      }

      morae.push({ kana, candidates, display: kana });
    }

    return morae;
  }

  /**
   * 실시간 매칭기
   */
  class Matcher{
    constructor(readingStr){
      this.morae = segment(readingStr);
      this.moraIndex = 0;
      this.buffer = "";
      this.typedRomaji = ""; // 완성되어 확정된 로마자 누적
      this.errorCount = 0;
      this.keystrokeCount = 0;
    }
    get done(){ return this.moraIndex >= this.morae.length; }
    get currentMora(){ return this.morae[this.moraIndex]; }
    get progressRatio(){ return this.morae.length ? this.moraIndex / this.morae.length : 1; }

    // 키 입력 한 글자 처리. 반환: { accepted, advanced, done }
    feed(charRaw){
      if(this.done) return { accepted:false, advanced:false, done:true };
      const ch = charRaw.toLowerCase();
      this.keystrokeCount++;
      const mora = this.currentMora;
      const newBuf = this.buffer + ch;
      const alive = mora.candidates.filter(c => c.startsWith(newBuf));

      if(alive.length === 0){
        this.errorCount++;
        return { accepted:false, advanced:false, done:false };
      }

      this.buffer = newBuf;
      const exact = alive.filter(c => c === newBuf);
      const longer = alive.filter(c => c.length > newBuf.length);

      let advanced = false;
      if(exact.length > 0 && longer.length === 0){
        this.typedRomaji += this.buffer;
        this.buffer = "";
        this.moraIndex++;
        advanced = true;
      }
      return { accepted:true, advanced, done:this.done };
    }

    backspace(){
      if(this.buffer.length > 0){
        this.buffer = this.buffer.slice(0, -1);
        return true;
      }
      return false;
    }
  }

  return { segment, Matcher, kataToHira };
})();
