#!/usr/bin/env node
/**
 * build-manifest.js
 * -----------------------------------------------------------
 * /data/{korean,english,japanese}/{작가}/{제목}.txt 구조를 스캔하여
 * js/data-manifest.js 파일(window.DATA_MANIFEST = {...};)을 생성한다.
 *
 * - 새 지문을 추가/삭제/수정한 뒤에는 아래 명령으로 다시 생성해야 사이트에 반영된다.
 *     node scripts/build-manifest.js
 *
 * - 일본어(.txt) 파일은 "원문" 다음 줄에 "---" 구분선을 넣고,
 *   그 아래에 원문 전체의 히라가나 읽기(후리가나)를 동일한 문장 구조로 적어야 한다.
 *   구분선이 없으면 원문 자체를 읽기로 간주한다(가나만으로 된 글일 경우).
 * -----------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(ROOT, "js", "data-manifest.js");

const LANGS = ["korean", "english", "japanese"];
const SHORT_MIN = { korean: 15, english: 25, japanese: 8 };
const SHORT_MAX = { korean: 70, english: 110, japanese: 45 };

function listDirs(p){
  if(!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}
function listTxt(p){
  if(!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith(".txt"))
    .map(d => d.name)
    .sort();
}

// 문장 단위로 분리(구두점을 포함해서 유지)
function splitSentences(text, lang){
  const clean = text.replace(/\r\n/g, "\n").trim();
  const delimRe = lang === "english" ? /(?<=[.!?])\s+/ : /(?<=[.!?。！？])\s*\n*/;
  return clean
    .split(/\n+/)
    .join(" ")
    .split(delimRe)
    .map(s => s.trim())
    .filter(Boolean);
}

function makeId(...parts){
  return parts.join("__").replace(/\s+/g, "_");
}

function buildKoreanOrEnglish(lang){
  const langDir = path.join(DATA_DIR, lang);
  const works = [];
  const shortPool = [];

  for(const author of listDirs(langDir)){
    const authorDir = path.join(langDir, author);
    for(const file of listTxt(authorDir)){
      const title = file.replace(/\.txt$/i, "");
      const raw = fs.readFileSync(path.join(authorDir, file), "utf-8").trim();
      const id = makeId(lang, author, title);
      works.push({ id, author, title, content: raw });

      const sentences = splitSentences(raw, lang);
      sentences.forEach((s, idx) => {
        if(s.length >= SHORT_MIN[lang] && s.length <= SHORT_MAX[lang]){
          shortPool.push({ id: makeId(id, "s", idx), author, title, text: s });
        }
      });
    }
  }
  return { works, shortPool };
}

function buildJapanese(){
  const langDir = path.join(DATA_DIR, "japanese");
  const works = [];
  const shortPool = [];

  for(const author of listDirs(langDir)){
    const authorDir = path.join(langDir, author);
    for(const file of listTxt(authorDir)){
      const title = file.replace(/\.txt$/i, "");
      const raw = fs.readFileSync(path.join(authorDir, file), "utf-8").trim();
      const parts = raw.split(/\n-{3,}\n/);
      const text = parts[0].trim();
      const reading = (parts[1] || parts[0]).trim();
      const id = makeId("japanese", author, title);
      works.push({ id, author, title, text, reading });

      const textSentences = splitSentences(text, "japanese");
      const readingSentences = splitSentences(reading, "japanese");

      if(textSentences.length === readingSentences.length){
        textSentences.forEach((s, idx) => {
          const r = readingSentences[idx];
          if(s.length >= SHORT_MIN.japanese && s.length <= SHORT_MAX.japanese){
            shortPool.push({ id: makeId(id, "s", idx), author, title, text: s, reading: r });
          }
        });
      } else {
        console.warn(`[경고] ${author}/${file}: 원문과 읽기의 문장 수가 달라 짧은글 풀에서 제외됩니다. (원문 ${textSentences.length} / 읽기 ${readingSentences.length})`);
      }
    }
  }
  return { works, shortPool };
}

function main(){
  const manifest = {
    korean: buildKoreanOrEnglish("korean"),
    english: buildKoreanOrEnglish("english"),
    japanese: buildJapanese(),
    generatedAt: new Date().toISOString()
  };

  const banner =
`/* 자동 생성 파일입니다. 직접 수정하지 마세요.
   /data 폴더 내용을 바꾼 뒤 다음 명령으로 다시 생성하세요:
     node scripts/build-manifest.js
   생성 시각: ${manifest.generatedAt} */
`;
  const content = `${banner}window.DATA_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, content, "utf-8");

  const summary = LANGS.map(l => `${l}: 작품 ${manifest[l].works.length}개 / 짧은글 ${manifest[l].shortPool.length}개`).join("\n  ");
  console.log(`매니페스트 생성 완료 -> ${path.relative(ROOT, OUT_FILE)}\n  ${summary}`);
}

main();
