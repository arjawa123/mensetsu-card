const express = require('express');
const { query, run } = require('./db');
const parseData = require('./parser');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

parseData().catch(console.error);

// Cards
app.get('/api/cards', async (req, res) => {
    try {
        const cards = await query("SELECT * FROM cards");
        const followUps = await query("SELECT * FROM follow_ups ORDER BY sort_order ASC");
        const jikoshoukaiRows = await query("SELECT value FROM settings WHERE key = 'jikoshoukai'");
        
        // Group follow ups by card id
        cards.forEach(card => {
            card.followUps = followUps.filter(f => f.card_id === card.id);
        });

        res.json({ 
            cards, 
            jikoshoukai: jikoshoukaiRows[0]?.value || "" 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/follow-up', async (req, res) => {
    try {
        const { content, type } = req.body;
        const cardId = req.params.id;
        const maxOrder = await query("SELECT MAX(sort_order) as m FROM follow_ups WHERE card_id = ?", [cardId]);
        const order = (maxOrder[0]?.m || 0) + 1;
        
        await run("INSERT INTO follow_ups (card_id, content, type, sort_order) VALUES (?, ?, ?, ?)", 
                  [cardId, content, type, order]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/update', async (req, res) => {
    try {
        const { question, answer, tips } = req.body;
        await run("UPDATE cards SET question = ?, answer = ?, tips = ? WHERE id = ?", [question, answer, tips, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/status', async (req, res) => {
    try {
        await run("UPDATE cards SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cards/:id', async (req, res) => {
    try {
        await run("DELETE FROM cards WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards', async (req, res) => {
    try {
        const { question, answer, tips } = req.body;
        const result = await run("INSERT INTO cards (question, answer, tips) VALUES (?, ?, ?)", [question, answer, tips]);
        res.json({ id: result.lastID, question, answer, tips, status: 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
    try {
        const total = await query("SELECT COUNT(*) as count FROM cards");
        const hafal = await query("SELECT COUNT(*) as count FROM cards WHERE status = 1");
        const followUps = await query("SELECT COUNT(*) as count FROM follow_ups");
        res.json({ 
            total: total[0].count, 
            hafal: hafal[0].count, 
            followUps: followUps[0].count 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reset', async (req, res) => {
    try {
        await run("UPDATE cards SET status = 0");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Jikoshoukai
app.post('/api/jikoshoukai', async (req, res) => {
    try {
        await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jikoshoukai', ?)", [req.body.text]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Notes
app.get('/api/notes', async (req, res) => {
    try {
        const notes = await query("SELECT * FROM notes ORDER BY created_at DESC");
        res.json(notes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { title, content } = req.body;
        const result = await run("INSERT INTO notes (title, content) VALUES (?, ?)", [title, content]);
        res.json({ id: result.lastID, title, content });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notes/:id', async (req, res) => {
    try {
        const { title, content } = req.body;
        await run("UPDATE notes SET title = ?, content = ? WHERE id = ?", [title, content, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await run("DELETE FROM notes WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/follow-ups/:id', async (req, res) => {
    try {
        await run("DELETE FROM follow_ups WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
