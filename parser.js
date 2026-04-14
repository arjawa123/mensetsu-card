const fs = require('fs');
const { query, run } = require('./db');

async function parseData() {
    const rows = await query("SELECT COUNT(*) as count FROM cards");
    if (rows[0].count > 0) return;

    if (!fs.existsSync('data.txt')) return;

    console.log("Parsing data.txt into database.db...");
    const content = fs.readFileSync('data.txt', 'utf8');
    const blocks = content.split(/\n\s*\n/);

    for (let block of blocks) {
        let lines = block.split('\n').map(l => l.trim()).filter(l => l !== "");
        if (lines.length < 2) continue;

        if (lines[0].match(/^[①-⑩\d]\.?\s+/)) {
            if (lines.length === 1) continue;
            lines.shift();
        }

        if (lines.length < 1) continue;
        let q = "", a = "", t = "";

        const hasMarkers = lines.some(l => /^[QAT]:|質問:|回答:|Tips:/.test(l));

        if (hasMarkers) {
            lines.forEach(line => {
                if (line.match(/^(Q:|質問:)/i)) q = line.replace(/^(Q:|質問:)\s*/i, '');
                else if (line.match(/^(A:|回答:)/i)) a = line.replace(/^(A:|回答:)\s*/i, '');
                else if (line.match(/^(T:|Tips:)/i)) t = line.replace(/^(T:|Tips:)\s*/i, '');
            });
        } else {
            q = lines[0];
            a = lines.slice(1).join('\n');
            if (a.includes('＝')) {
                const parts = a.split('\n');
                a = parts.filter(p => !p.includes('＝')).join('\n');
                t = parts.filter(p => p.includes('＝')).join('\n');
            }
        }

        if (q && a) {
            await run("INSERT INTO cards (question, answer, tips) VALUES (?, ?, ?)", [q, a, t]);
        }
    }
    console.log("Import complete.");
}

module.exports = parseData;
