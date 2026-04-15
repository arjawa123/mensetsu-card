const express = require('express');
const { query, run } = require('./db');
const parseData = require('./parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const fs = require('fs');
const crypto = require('crypto');

const JWT_SECRET = 'mensetsu-secret-key-123';

const app = express();
app.use(express.json());

// Hash file untuk cache busting
function fileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    } catch {
        return Date.now().toString(36);
    }
}

// Sajikan static files dengan cache 1 tahun (browser cache baik)
// Tapi index.html SELALU no-cache agar hash terbaru selalu dikirim
app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    maxAge: '1y',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
    }
}));

// Sajikan index.html dengan cache-busting otomatis pada CSS & JS
app.get(['/', '/index.html'], (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const cssHash = fileHash(path.join(__dirname, 'public', 'style.css'));
    const jsHash = fileHash(path.join(__dirname, 'public', 'app.js'));

    html = html
        .replace('href="style.css"', `href="style.css?v=${cssHash}"`)
        .replace('src="app.js"', `src="app.js?v=${jsHash}"`);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});


// Auth middleware
const auth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await query("SELECT * FROM users WHERE username = ?", [username]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ user_id: user.id, username: user.username }, JWT_SECRET);
        res.json({ token, username: user.username });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Me route
app.get('/api/user/me', auth, (req, res) => res.json({ username: req.user.username }));

parseData().catch(console.error);

// Cards
app.get('/api/cards', auth, async (req, res) => {
    try {
        const cards = await query(
            "SELECT * FROM cards WHERE user_id = ? ORDER BY is_starred DESC, id ASC",
            [req.user.user_id]
        );
        const followUps = await query("SELECT f.* FROM follow_ups f JOIN cards c ON f.card_id = c.id WHERE c.user_id = ? ORDER BY sort_order ASC", [req.user.user_id]);
        const jikoshoukaiRows = await query("SELECT value FROM settings WHERE key = 'jikoshoukai' AND user_id = ?", [req.user.user_id]);

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

app.post('/api/cards/:id/follow-up', auth, async (req, res) => {
    try {
        const { content, type } = req.body;
        const cardId = req.params.id;

        const card = await query("SELECT id FROM cards WHERE id = ? AND user_id = ?", [cardId, req.user.user_id]);
        if (card.length === 0) return res.status(404).json({ error: 'Card not found' });

        const maxOrder = await query("SELECT MAX(sort_order) as m FROM follow_ups WHERE card_id = ?", [cardId]);
        const order = (maxOrder[0]?.m || 0) + 1;

        await run("INSERT INTO follow_ups (card_id, content, type, sort_order) VALUES (?, ?, ?, ?)",
            [cardId, content, type, order]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/update', auth, async (req, res) => {
    try {
        const { question, answer, tips } = req.body;
        await run("UPDATE cards SET question = ?, answer = ?, tips = ? WHERE id = ? AND user_id = ?", [question, answer, tips, req.params.id, req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/status', auth, async (req, res) => {
    try {
        await run("UPDATE cards SET status = ? WHERE id = ? AND user_id = ?", [req.body.status, req.params.id, req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/archive', auth, async (req, res) => {
    try {
        const rows = await query("SELECT is_archived FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.user_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Card not found' });
        const newVal = rows[0].is_archived ? 0 : 1;
        await run("UPDATE cards SET is_archived = ? WHERE id = ? AND user_id = ?", [newVal, req.params.id, req.user.user_id]);
        res.json({ success: true, is_archived: newVal });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/:id/star', auth, async (req, res) => {
    try {
        const rows = await query("SELECT is_starred FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.user_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Card not found' });
        const newVal = rows[0].is_starred ? 0 : 1;
        await run("UPDATE cards SET is_starred = ? WHERE id = ? AND user_id = ?", [newVal, req.params.id, req.user.user_id]);
        res.json({ success: true, is_starred: newVal });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cards/:id', auth, async (req, res) => {
    try {
        await run("DELETE FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards', auth, async (req, res) => {
    try {
        const { question, answer, tips } = req.body;
        const result = await run("INSERT INTO cards (user_id, question, answer, tips) VALUES (?, ?, ?, ?)", [req.user.user_id, question, answer, tips]);
        res.json({ id: result.lastID, question, answer, tips, status: 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', auth, async (req, res) => {
    try {
        const total = await query("SELECT COUNT(*) as count FROM cards WHERE user_id = ?", [req.user.user_id]);
        const hafal = await query("SELECT COUNT(*) as count FROM cards WHERE status = 1 AND user_id = ? AND is_archived = 0", [req.user.user_id]);
        const followUps = await query("SELECT COUNT(*) as count FROM follow_ups f JOIN cards c ON f.card_id = c.id WHERE c.user_id = ? AND c.is_archived = 0", [req.user.user_id]);
        res.json({
            total: total[0].count,
            hafal: hafal[0].count,
            followUps: followUps[0].count
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reset', auth, async (req, res) => {
    try {
        await run("UPDATE cards SET status = 0 WHERE user_id = ?", [req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Jikoshoukai
app.post('/api/jikoshoukai', auth, async (req, res) => {
    try {
        await run("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'jikoshoukai', ?)", [req.user.user_id, req.body.text]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Notes
app.get('/api/notes', auth, async (req, res) => {
    try {
        const notes = await query("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC", [req.user.user_id]);
        res.json(notes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        const result = await run("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)", [req.user.user_id, title, content]);
        res.json({ id: result.lastID, title, content });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notes/:id', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        await run("UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?", [title, content, req.params.id, req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
    try {
        await run("DELETE FROM notes WHERE id = ? AND user_id = ?", [req.params.id, req.user.user_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/follow-ups/:id', auth, async (req, res) => {
    try {
        const check = await query("SELECT c.id FROM follow_ups f JOIN cards c ON f.card_id = c.id WHERE f.id = ? AND c.user_id = ?", [req.params.id, req.user.user_id]);
        if (check.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });

        await run("DELETE FROM follow_ups WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/follow-ups/:id', auth, async (req, res) => {
    try {
        const { content } = req.body;
        const check = await query("SELECT c.id FROM follow_ups f JOIN cards c ON f.card_id = c.id WHERE f.id = ? AND c.user_id = ?", [req.params.id, req.user.user_id]);
        if (check.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });

        await run("UPDATE follow_ups SET content = ? WHERE id = ?", [content, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
