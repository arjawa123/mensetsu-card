let allCards = [];
let filteredCards = [];
let notes = [];
let currentIndex = 0;
let currentNoteId = null;
let isEditingCard = false;

const els = {
    progress: document.getElementById('progress-text'),
    hafalBadge: document.getElementById('hafal-count'),
    q: document.getElementById('q-content'),
    aDisplay: document.getElementById('a-display'),
    tDisplay: document.getElementById('t-display'),
    aEdit: document.getElementById('a-content'),
    tEdit: document.getElementById('t-content'),
    card: document.getElementById('card'),
    editBtn: document.getElementById('edit-card-btn'),
    jikoshoukai: document.getElementById('jikoshoukai-editor'),
    notesList: document.getElementById('notes-list'),
    noteModal: document.getElementById('note-modal'),
    noteTitle: document.getElementById('note-title'),
    noteBody: document.getElementById('note-body')
};

async function init() {
    const res = await fetch('/api/cards');
    const data = await res.json();
    allCards = data.cards;
    els.jikoshoukai.value = data.jikoshoukai || "";
    
    await fetchNotes();
    applyFilters();
}

async function fetchNotes() {
    const res = await fetch('/api/notes');
    notes = await res.json();
    renderNotes();
}

// --- NAVIGATION ---
document.querySelectorAll('.tab-item').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.view, .tab-item').forEach(el => el.classList.remove('active'));
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.classList.add('active');
    };
});

// --- REVIEW LOGIC ---
function applyFilters() {
    filteredCards = allCards.filter(c => c.status === 0);
    if (filteredCards.length === 0) filteredCards = [...allCards];
    currentIndex = 0;
    renderReview();
}

function renderReview() {
    isEditingCard = false;
    els.editBtn.classList.remove('editing');
    els.editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    toggleEditVisibility(false);

    const total = filteredCards.length;
    const hafal = allCards.filter(c => c.status === 1).length;
    els.hafalBadge.innerText = hafal;

    if (total === 0) {
        els.q.innerText = "No data loaded.";
        els.progress.innerText = "0 / 0";
        return;
    }

    const current = filteredCards[currentIndex % total];
    els.progress.innerText = `${(currentIndex % total) + 1} / ${total}`;
    els.q.innerText = current.question;
    
    // Set display and edit values
    els.aDisplay.innerText = current.answer;
    els.tDisplay.innerText = current.tips || "No tips added.";
    els.aEdit.value = current.answer;
    els.tEdit.value = current.tips || "";
    
    els.card.classList.remove('flipped');
}

function toggleEditVisibility(editing) {
    if (editing) {
        els.aDisplay.classList.add('hidden');
        els.tDisplay.classList.add('hidden');
        els.aEdit.classList.remove('hidden');
        els.tEdit.classList.remove('hidden');
    } else {
        els.aDisplay.classList.remove('hidden');
        els.tDisplay.classList.remove('hidden');
        els.aEdit.classList.add('hidden');
        els.tEdit.classList.add('hidden');
    }
}

async function toggleEditMode(e) {
    if (e) e.stopPropagation();
    isEditingCard = !isEditingCard;
    
    if (isEditingCard) {
        els.editBtn.classList.add('editing');
        els.editBtn.innerHTML = '<i class="fas fa-save"></i>';
        toggleEditVisibility(true);
        els.aEdit.focus();
    } else {
        els.editBtn.classList.remove('editing');
        els.editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        toggleEditVisibility(false);
        await saveCardChanges();
    }
}

async function updateStatus(status) {
    const current = filteredCards[currentIndex % filteredCards.length];
    await fetch(`/api/cards/${current.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    
    const original = allCards.find(c => c.id === current.id);
    if (original) original.status = status;

    if (status === 1) {
        filteredCards.splice(currentIndex % filteredCards.length, 1);
        if (filteredCards.length === 0) {
            allCards.forEach(c => c.status = 0);
            applyFilters();
        } else {
            renderReview();
        }
    } else {
        currentIndex++;
        renderReview();
    }
}

async function deleteCard() {
    const current = filteredCards[currentIndex % filteredCards.length];
    if (!confirm("Hapus kartu ini selamanya?")) return;
    
    await fetch(`/api/cards/${current.id}`, { method: 'DELETE' });
    allCards = allCards.filter(c => c.id !== current.id);
    applyFilters();
}

async function saveCardChanges() {
    const current = filteredCards[currentIndex % filteredCards.length];
    const body = { answer: els.aEdit.value, tips: els.tEdit.value };
    
    els.aDisplay.innerText = body.answer;
    els.tDisplay.innerText = body.tips || "No tips added.";
    
    await fetch(`/api/cards/${current.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    current.answer = body.answer;
    current.tips = body.tips;
    
    const original = allCards.find(c => c.id === current.id);
    if (original) {
        original.answer = body.answer;
        original.tips = body.tips;
    }
}

// --- JIKOSHOUKAI ---
let saveTimeout;
els.jikoshoukai.oninput = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await fetch('/api/jikoshoukai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: els.jikoshoukai.value })
        });
    }, 1000);
};

// --- NOTES ---
function renderNotes() {
    els.notesList.innerHTML = notes.map(n => `
        <div class="note-card" onclick="openNote(${n.id})">
            <h3>${n.title || 'Untitled'}</h3>
            <p>${n.content || ''}</p>
        </div>
    `).join('');
}

function openNote(id = null) {
    currentNoteId = id;
    if (id) {
        const n = notes.find(note => note.id === id);
        els.noteTitle.value = n.title;
        els.noteBody.value = n.content;
        document.getElementById('modal-delete-btn').style.display = "block";
    } else {
        els.noteTitle.value = "";
        els.noteBody.value = "";
        document.getElementById('modal-delete-btn').style.display = "none";
    }
    els.noteModal.style.display = "block";
}

document.getElementById('add-note-btn').onclick = () => openNote();
document.getElementById('modal-close-btn').onclick = () => els.noteModal.style.display = "none";

document.getElementById('modal-save-btn').onclick = async () => {
    const body = { title: els.noteTitle.value, content: els.noteBody.value };
    if (currentNoteId) {
        await fetch(`/api/notes/${currentNoteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } else {
        await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }
    els.noteModal.style.display = "none";
    await fetchNotes();
};

document.getElementById('modal-delete-btn').onclick = async () => {
    if (!confirm("Hapus catatan ini?")) return;
    await fetch(`/api/notes/${currentNoteId}`, { method: 'DELETE' });
    els.noteModal.style.display = "none";
    await fetchNotes();
};

// --- EVENT LISTENERS ---
document.getElementById('card').onclick = (e) => {
    if (!['TEXTAREA', 'BUTTON', 'I'].includes(e.target.tagName)) {
        els.card.classList.toggle('flipped');
    }
};

document.getElementById('btn-hafal').onclick = () => updateStatus(1);
document.getElementById('btn-belum').onclick = () => updateStatus(0);
document.getElementById('delete-card-btn').onclick = (e) => { e.stopPropagation(); deleteCard(); };
document.getElementById('edit-card-btn').onclick = toggleEditMode;

document.getElementById('shuffle-btn').onclick = () => {
    filteredCards.sort(() => Math.random() - 0.5);
    currentIndex = 0;
    renderReview();
};

document.getElementById('reset-btn').onclick = async () => {
    if (confirm("Reset progress?")) { await fetch('/api/reset', { method: 'POST' }); location.reload(); }
};

init();
