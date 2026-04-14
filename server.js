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
        const jikoshoukaiRows = await query("SELECT value FROM settings WHERE key = 'jikoshoukai'");
        res.json({ 
            cards, 
            jikoshoukai: jikoshoukaiRows[0]?.value || "" 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/update', async (req, res) => {
    try {
        const { answer, tips } = req.body;
        await run("UPDATE cards SET answer = ?, tips = ? WHERE id = ?", [answer, tips, req.params.id]);
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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
