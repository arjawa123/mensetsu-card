let allCards = [];
let filteredCards = [];
let currentIndex = 0;
let isEditingCard = false;
let isEditingJikoshoukai = false;

const els = {
    progress: document.getElementById('progress-text'),
    hafalBadge: document.getElementById('hafal-count'),
    q: document.getElementById('q-content'),
    qEdit: document.getElementById('q-edit'),
    aEdit: document.getElementById('a-content'),
    tEdit: document.getElementById('t-content'),
    card: document.getElementById('card'),
    editBtn: document.getElementById('edit-card-btn'),
    editBtnFront: document.getElementById('edit-card-btn-front'),
    jikoshoukai: document.getElementById('jikoshoukai-editor'),
    jikoshoukaiBtn: document.getElementById('edit-jikoshoukai-btn'),
    jikoshoukaiStatus: document.getElementById('jikoshoukai-status'),
    chatBubbles: document.getElementById('chat-bubbles'),
    addFollowQ: document.getElementById('add-follow-q'),
    addFollowA: document.getElementById('add-follow-a'),
    tipsContainer: document.getElementById('tips-container'),
    tDisplay: document.getElementById('t-display'),
    fuModal: document.getElementById('followup-modal'),
    fuInput: document.getElementById('followup-input'),
    fuSave: document.getElementById('followup-save-btn'),
    fuClose: document.getElementById('followup-close-btn'),
    fuTitle: document.getElementById('followup-modal-title'),
    // Card Management
    cardsList: document.getElementById('cards-list'),
    statTotal: document.getElementById('stat-total'),
    statHafal: document.getElementById('stat-hafal'),
    statFu: document.getElementById('stat-fu'),
    addCardBtn: document.getElementById('add-card-btn'),
    cardSearch: document.getElementById('card-search'),
    addCardModal: document.getElementById('add-card-modal'),
    newQ: document.getElementById('new-q'),
    newA: document.getElementById('new-a'),
    newT: document.getElementById('new-t'),
    addModalSave: document.getElementById('add-modal-save'),
    addModalClose: document.getElementById('add-modal-close'),
    themeToggle: document.getElementById('theme-toggle')
};

async function init() {
    // Theme Init
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        els.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    const res = await fetch('/api/cards');
    const data = await res.json();
    allCards = data.cards;
    els.jikoshoukai.value = data.jikoshoukai || "";

    applyFilters();
    refreshStats();
}

// --- NAVIGATION ---
document.querySelectorAll('.tab-item').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.view, .tab-item').forEach(el => el.classList.remove('active'));
        const target = btn.dataset.target;
        document.getElementById(target).classList.add('active');
        btn.classList.add('active');
        if (target === 'view-cards') {
            refreshStats();
            renderManagementList();
        }
    };
});

// --- CARD MANAGEMENT ---
els.cardSearch.oninput = () => renderManagementList();

async function refreshStats() {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    els.statTotal.innerText = stats.total;
    els.statHafal.innerText = stats.hafal;
    els.statFu.innerText = stats.followUps;
}

function renderManagementList() {
    const query = els.cardSearch.value.toLowerCase();
    const filtered = allCards.filter(c =>
        c.question.toLowerCase().includes(query) ||
        c.answer.toLowerCase().includes(query)
    );

    els.cardsList.innerHTML = filtered.map(c => `
        <div class="m-card">
            <div class="m-card-info">
                <h3>${c.question}</h3>
                <p>${c.answer}</p>
            </div>
            <div class="m-card-actions">
                <button class="m-card-btn edit" onclick="editFromList(${c.id})"><i class="fas fa-eye"></i></button>
                <button class="m-card-btn delete" onclick="deleteFromList(${c.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function editFromList(id) {
    const idx = allCards.findIndex(c => c.id === id);
    if (idx !== -1) {
        filteredCards = [...allCards];
        currentIndex = idx;
        renderReview();
        document.querySelector('.tab-item[data-target="view-review"]').click();
    }
}

async function deleteFromList(id) {
    if (!confirm("Hapus kartu ini selamanya?")) return;
    await fetch(`/api/cards/${id}`, { method: 'DELETE' });
    allCards = allCards.filter(c => c.id !== id);
    applyFilters();
    refreshStats();
    renderManagementList();
}

els.addCardBtn.onclick = () => {
    els.newQ.value = "";
    els.newA.value = "";
    els.newT.value = "";
    els.addCardModal.style.display = "block";
};

els.addModalClose.onclick = () => els.addCardModal.style.display = "none";

els.addModalSave.onclick = async () => {
    const body = { question: els.newQ.value, answer: els.newA.value, tips: els.newT.value };
    if (!body.question || !body.answer) return alert("Question and Answer are required.");

    await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    els.addCardModal.style.display = "none";
    init();
};

// --- REVIEW LOGIC ---
function applyFilters() {
    filteredCards = allCards.filter(c => c.status === 0);
    if (filteredCards.length === 0) filteredCards = [...allCards];
    currentIndex = 0;
    renderReview();
}

function renderReview() {
    isEditingCard = false;
    [els.editBtn, els.editBtnFront].forEach(btn => {
        btn.classList.remove('editing');
        btn.innerHTML = '<i class="fas fa-edit"></i>';
    });
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
    els.qEdit.value = current.question;

    let html = `<div class="bubble left">${current.question}</div>`;

    if (isEditingCard) {
        html += `<div class="bubble right"><textarea id="a-inline-edit" class="bubble-edit" spellcheck="false">${current.answer}</textarea></div>`;
    } else {
        html += `<div class="bubble right">${current.answer}</div>`;
    }

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            html += `
                <div class="bubble ${side}">
                    ${f.content}
                    <button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button>
                </div>`;
        });
    }
    els.chatBubbles.innerHTML = html;

    const hasTips = current.tips && current.tips.trim().length > 0;
    els.tipsContainer.classList.toggle('hidden', !hasTips && !isEditingCard);
    els.tDisplay.innerText = current.tips || "No tips added.";
    els.tEdit.value = current.tips || "";

    els.card.classList.remove('flipped');
}

function toggleEditVisibility(editing) {
    if (editing) {
        els.q.classList.add('hidden');
        els.qEdit.classList.remove('hidden');
        els.chatBubbles.classList.remove('hidden');
        els.tipsContainer.classList.remove('hidden');
        els.tDisplay.classList.add('hidden');
        els.tEdit.classList.remove('hidden');
        document.querySelector('.follow-up-actions').classList.add('hidden');
        document.getElementById('card').classList.add('editing');
        renderReviewForEdit();
    } else {
        els.q.classList.remove('hidden');
        els.qEdit.classList.add('hidden');
        els.chatBubbles.classList.remove('hidden');
        const current = filteredCards[currentIndex % filteredCards.length];
        const hasTips = current && current.tips && current.tips.trim().length > 0;
        els.tipsContainer.classList.toggle('hidden', !hasTips);
        els.tDisplay.classList.remove('hidden');
        els.tEdit.classList.add('hidden');
        document.querySelector('.follow-up-actions').classList.remove('hidden');
        document.getElementById('card').classList.remove('editing');
        renderReviewAfterSave();
    }
}

function renderReviewForEdit() {
    const current = filteredCards[currentIndex % filteredCards.length];
    let html = `<div class="bubble left">${current.question}</div>`;
    html += `<div class="bubble right"><textarea id="a-inline-edit" class="bubble-edit" spellcheck="false">${current.answer}</textarea></div>`;

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            html += `<div class="bubble ${side}">${f.content}<button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button></div>`;
        });
    }
    els.chatBubbles.innerHTML = html;
    document.getElementById('a-inline-edit').focus();
}

function renderReviewAfterSave() {
    const current = filteredCards[currentIndex % filteredCards.length];
    let html = `<div class="bubble left">${current.question}</div>`;
    html += `<div class="bubble right">${current.answer}</div>`;

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            html += `<div class="bubble ${side}">${f.content}<button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button></div>`;
        });
    }
    els.chatBubbles.innerHTML = html;
}

let currentFuType = 'q';
function openFollowUpModal(type) {
    currentFuType = type;
    els.fuTitle.innerText = type === 'q' ? "Add Follow-up Question" : "Add Follow-up Answer";
    els.fuInput.value = "";
    els.fuModal.style.display = "block";
    els.fuInput.focus();
}

async function saveFollowUp() {
    const content = els.fuInput.value.trim();
    if (!content) return;
    const current = filteredCards[currentIndex % filteredCards.length];

    await fetch(`/api/cards/${current.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, type: currentFuType })
    });

    els.fuModal.style.display = "none";
    await refreshCards(current.id);
}

async function deleteFollowUp(e, id) {
    e.stopPropagation();
    if (!confirm("Hapus follow-up ini?")) return;
    await fetch(`/api/follow-ups/${id}`, { method: 'DELETE' });
    const current = filteredCards[currentIndex % filteredCards.length];
    await refreshCards(current.id);
}

async function refreshCards(currentId) {
    const res = await fetch('/api/cards');
    const data = await res.json();
    allCards = data.cards;
    const newCurrent = allCards.find(c => c.id === currentId);
    if (newCurrent) {
        const idxInFiltered = filteredCards.findIndex(c => c.id === currentId);
        if (idxInFiltered !== -1) filteredCards[idxInFiltered] = newCurrent;
    }

    const wasFlipped = els.card.classList.contains('flipped');
    renderReview();
    if (wasFlipped) els.card.classList.add('flipped');
}

async function toggleEditMode(e) {
    if (e) e.stopPropagation();
    const wasFlipped = els.card.classList.contains('flipped');
    isEditingCard = !isEditingCard;

    if (isEditingCard) {
        [els.editBtn, els.editBtnFront].forEach(btn => {
            btn.classList.add('editing');
            btn.innerHTML = '<i class="fas fa-save"></i>';
        });
        toggleEditVisibility(true);
        if (!wasFlipped) {
            els.qEdit.focus();
        }
    } else {
        [els.editBtn, els.editBtnFront].forEach(btn => {
            btn.classList.remove('editing');
            btn.innerHTML = '<i class="fas fa-edit"></i>';
        });
        await saveCardChanges();
        toggleEditVisibility(false);
        if (wasFlipped) els.card.classList.add('flipped');
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
    refreshStats();
}

async function saveCardChanges() {
    const current = filteredCards[currentIndex % filteredCards.length];
    const inlineEdit = document.getElementById('a-inline-edit');
    const body = {
        question: els.qEdit.value,
        answer: inlineEdit ? inlineEdit.value : current.answer,
        tips: els.tEdit.value
    };

    await fetch(`/api/cards/${current.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    current.question = body.question;
    current.answer = body.answer;
    current.tips = body.tips;

    const original = allCards.find(c => c.id === current.id);
    if (original) {
        Object.assign(original, body);
    }
}

// --- JIKOSHOUKAI ---
els.jikoshoukaiBtn.onclick = async () => {
    isEditingJikoshoukai = !isEditingJikoshoukai;
    if (isEditingJikoshoukai) {
        els.jikoshoukai.readOnly = false;
        els.jikoshoukaiBtn.innerHTML = '<i class="fas fa-save"></i>';
        els.jikoshoukaiBtn.classList.add('editing');
        els.jikoshoukai.focus();
    } else {
        els.jikoshoukai.readOnly = true;
        els.jikoshoukaiBtn.innerHTML = '<i class="fas fa-edit"></i>';
        els.jikoshoukaiBtn.classList.remove('editing');
        await fetch('/api/jikoshoukai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: els.jikoshoukai.value })
        });
    }
};

let saveTimeout;
els.jikoshoukai.oninput = () => {
    if (isEditingJikoshoukai) {
        els.jikoshoukaiStatus.classList.remove('hidden');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await fetch('/api/jikoshoukai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: els.jikoshoukai.value })
            });
            els.jikoshoukaiStatus.classList.add('hidden');
        }, 1000);
    }
};

// --- EVENT LISTENERS ---
document.getElementById('card').onclick = (e) => {
    if (!['TEXTAREA', 'BUTTON', 'I'].includes(e.target.tagName) && !e.target.classList.contains('del-bubble')) {
        els.card.classList.toggle('flipped');
    }
};

document.getElementById('btn-hafal').onclick = () => updateStatus(1);
document.getElementById('btn-belum').onclick = () => updateStatus(0);
document.getElementById('delete-card-btn').onclick = (e) => { e.stopPropagation(); deleteCard(); };
document.getElementById('edit-card-btn').onclick = toggleEditMode;
document.getElementById('edit-card-btn-front').onclick = toggleEditMode;
document.getElementById('add-follow-q').onclick = (e) => { e.stopPropagation(); openFollowUpModal('q'); };
document.getElementById('add-follow-a').onclick = (e) => { e.stopPropagation(); openFollowUpModal('a'); };

els.themeToggle.onclick = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    els.themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
};

els.fuSave.onclick = saveFollowUp;
els.fuClose.onclick = () => els.fuModal.style.display = "none";

document.getElementById('shuffle-btn').onclick = () => {
    filteredCards.sort(() => Math.random() - 0.5);
    currentIndex = 0;
    renderReview();
};

document.getElementById('reset-btn').onclick = async () => {
    if (confirm("Reset progress?")) { await fetch('/api/reset', { method: 'POST' }); location.reload(); }
};

init();
