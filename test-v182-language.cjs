const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const source = read('app-v18-2.js');
const db = JSON.parse(source.split('\n')[0].slice(9, -1));
const version = JSON.parse(read('version.json'));
assert.equal(db.version, version.version);
assert.equal(db.words.length, 650);
assert.equal(new Set(db.words.map(word => word.id)).size, 650);
assert.equal(db.modules.length, 10);
assert.equal(db.scenarios.length, 23);
const spoken = JSON.parse(source.match(/^const SPOKEN=(.*);$/m)[1]);
assert.equal(spoken.length, 204);
assert.equal(new Set(spoken.map(line => line.id)).size, spoken.length);

const normalize = text => text.toLowerCase().replace(/[\s\p{P}]+/gu, '');
const zh = /[\u3400-\u9fff]/u;
const context = vm.createContext({ DB: db });
vm.runInContext(source.slice(source.indexOf('function extensionSentence('), source.indexOf('function modById(')), context);
const byId = vm.runInContext('byId', context);
const baseWordId = vm.runInContext('baseWordId', context);

for (const word of db.words) {
    for (const field of ['zh', 'definition', 'collocationZh', 'exampleZh', 'distinction']) {
        assert.match(word[field], zh, `${word.id} ${field}`);
    }
    assert.ok(word.term.trim() && word.collocation.trim() && word.example.trim(), word.id);
    assert.ok(word.extension.en.trim(), word.id);
    assert.match(word.extension.zh, zh, word.id);
    const sentences = [word.example, word.extension.en, ...word.dialogue.map(line => line.en)];
    assert.equal(new Set(sentences.map(normalize)).size, sentences.length, word.id);
    assert.ok(new Set(word.dialogue.map(line => line.role)).size >= 2, word.id);
    word.dialogue.forEach((line, index) => {
        assert.match(line.zh, zh, word.id);
        const id = word.id + '~dialogue-' + (index + 1);
        assert.equal(byId(id).example, line.en);
        assert.equal(byId(id).exampleZh, line.zh);
        assert.equal(baseWordId(id), word.id);
    });
    if (word.usage) assert.notEqual(normalize(word.usage), normalize(word.distinction), word.id);
    const extensionId = word.id + (word.legacyExtraBookmark ? '~expansion' : '~extra');
    assert.equal(byId(extensionId).example, word.extension.en);
    assert.equal(byId(extensionId).exampleZh, word.extension.zh);
    if (word.legacyDialogueBookmark) {
        assert.equal(byId(word.id + '~ext').example, word.legacyDialogueBookmark.en);
        assert.equal(byId(word.id + '~ext').exampleZh, word.legacyDialogueBookmark.zh);
    }
    if (word.legacyExtraBookmark) {
        assert.equal(byId(word.id + '~extra').example, word.legacyExtraBookmark.en);
        assert.equal(byId(word.id + '~extra').exampleZh, word.legacyExtraBookmark.zh);
    }
    assert.equal(byId(word.id + '~dialogue-0'), undefined, word.id);
    if (!word.ipaUK || !word.ipaUS) assert.match(word.ipaReview, /待补证/, word.id);
    if (word.ipaReview === '完整词头英美音标文本核对') {
        assert.match(word.ipaSource, /^https:\/\/dictionary\.cambridge\.org\//u, word.id);
    }
}
const fallback = read('index.html').match(/<noscript>([\s\S]*?)<\/noscript>/g);
assert.equal(fallback.length, 1);
assert.equal((fallback[0].match(/<details>/g) || []).length, 650);
assert.equal((fallback[0].match(/<section>/g) || []).length, 10);
console.log('PASS 650 reviewed core entries, unique independent extensions, bilingual dialogue, both bookmark generations, IPA disclosures, and static fallback');
