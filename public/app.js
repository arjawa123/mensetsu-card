const token = localStorage.getItem('token');
if (!token) window.location.href = '/login.html';

const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + localStorage.getItem('token');
    const res = await originalFetch(url, options);
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    }
    return res;
};

let allCards = [];
let filteredCards = [];
let currentIndex = 0;
let isEditingCardBack = false;
let isEditingJikoshoukai = false;
let sessionHistory = []; // Track { cardId, wasBelum } to allow undo

// Persist session state across page refreshes
const savedBelum = JSON.parse(localStorage.getItem('sessionBelumIds') || '[]');
let sessionBelumIds = new Set(savedBelum);

function saveSession() {
    localStorage.setItem('sessionBelumIds', JSON.stringify([...sessionBelumIds]));
    localStorage.setItem('sessionCurrentIndex', currentIndex);
}

function clearSession() {
    sessionBelumIds.clear();
    currentIndex = 0;
    localStorage.removeItem('sessionBelumIds');
    localStorage.removeItem('sessionCurrentIndex');
}

/**
 * Extract meaningful words from tips text (>= 3 chars, non-Japanese excluded from short).
 * Returns array of unique strings sorted by length desc (longest first to avoid partial replacement).
 */
function extractVocabWords(tipsText) {
    if (!tipsText) return [];
    // Split by common separators: newlines, commas, bullets, colons, slashes
    const raw = tipsText.split(/[\n,、。・:：\/\\|]+/);
    const words = new Set();
    raw.forEach(segment => {
        // Take the first 'word' part (before space or equal sign) if present
        const cleaned = segment.replace(/[()（）\[\]\-_=～~*#]/g, ' ').trim();
        // Split by whitespace
        cleaned.split(/\s+/).forEach(w => {
            if (w.length >= 2) words.add(w);
        });
        // Also try whole segment trimmed
        if (cleaned.length >= 2 && cleaned.length <= 30) words.add(cleaned);
    });
    return [...words].sort((a, b) => b.length - a.length);
}

/**
 * Apply .vocab-mark highlight to words from tips found inside .bubble-text elements.
 */
function applyVocabHighlight(vocabWords) {
    if (!vocabWords || vocabWords.length === 0) return;
    document.querySelectorAll('#chat-bubbles .bubble-text').forEach(el => {
        let text = el.textContent;
        // Escape regex special chars
        const pattern = vocabWords
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
        if (!pattern) return;
        const regex = new RegExp(`(${pattern})`, 'g');
        // Only replace if match exists
        if (!regex.test(text)) return;
        el.innerHTML = text.replace(
            new RegExp(`(${pattern})`, 'g'),
            '<mark class="vocab-mark">$1</mark>'
        );
    });
}

const els = {
    progress: document.getElementById('progress-text'),
    hafalBadge: document.getElementById('hafal-count'),
    q: document.getElementById('q-content'),
    qEdit: document.getElementById('q-edit'),
    aEdit: document.getElementById('a-content'),
    tEdit: document.getElementById('t-content'),
    card: document.getElementById('card'),
    cardStage: document.getElementById('card-stage'),
    resultScreen: document.getElementById('result-screen'),
    hafalBadge: document.getElementById('hafal-count'),
    belumBadge: document.getElementById('belum-count'),
    finalHafal: document.getElementById('final-hafal'),
    finalBelum: document.getElementById('final-belum'),
    unlearnedCount: document.getElementById('unlearned-count'),
    studyUnlearnedBtn: document.getElementById('study-unlearned-btn'),
    restartProgressBtn: document.getElementById('restart-progress-btn'),
    alertModal: document.getElementById('custom-alert'),
    alertTitle: document.getElementById('alert-title'),
    alertMsg: document.getElementById('alert-message'),
    alertOk: document.getElementById('alert-ok'),
    alertCancel: document.getElementById('alert-cancel'),
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
    fuLabel: document.getElementById('followup-label'),
    addTipsBtn: document.getElementById('add-tips-btn'),
    tipEditBtn: document.getElementById('tip-edit-btn'),
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

    // Restore session index if exists
    const savedIndex = parseInt(localStorage.getItem('sessionCurrentIndex') || '0');

    applyFilters();

    // Setelah filteredCards terisi, restore currentIndex jika masih valid
    if (savedIndex > 0 && savedIndex < filteredCards.length) {
        currentIndex = savedIndex;
        renderReview();
    }

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
    if (!await showModal("Hapus kartu ini selamanya?", "Konfirmasi", true)) return;
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
    if (!body.question || !body.answer) return showModal("Mohon isi pertanyaan dan jawaban.", "Peringatan");

    await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    els.addCardModal.style.display = "none";
    init();
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Optional: toast notification would be good here
        console.log('Copied');
    });
}

// --- REVIEW LOGIC ---
async function showModal(msg, title = "Notification", showCancel = false) {
    els.alertTitle.innerText = title;
    els.alertMsg.innerText = msg;
    els.alertModal.style.display = "block";
    els.alertCancel.classList.toggle('hidden', !showCancel);

    return new Promise((resolve) => {
        els.alertOk.onclick = () => {
            els.alertModal.style.display = "none";
            resolve(true);
        };
        els.alertCancel.onclick = () => {
            els.alertModal.style.display = "none";
            resolve(false);
        };
    });
}

function applyFilters() {
    filteredCards = allCards.filter(c => c.status === 0);
    currentIndex = 0;
    // Note: jangan clear sessionBelumIds di sini agar counter persist saat refresh
    if (filteredCards.length === 0 && allCards.length > 0) {
        showResultScreen();
    } else {
        renderReview();
    }
}

function renderReview() {
    isEditingCardBack = false;
    isEditingCardFront = false;

    // Reset buttons
    els.editBtn.classList.remove('editing');
    els.editBtn.classList.add('hidden'); // Selalu sembunyi di mode baca
    els.editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    els.editBtnFront.classList.remove('editing', 'hidden');
    els.editBtnFront.innerHTML = '<i class="fas fa-edit"></i>';

    toggleEditVisibility(false);

    const totalReview = filteredCards.length;
    const hafalTotalCount = allCards.filter(c => c.status === 1).length;
    const belumSessionCount = sessionBelumIds.size;

    els.hafalBadge.innerText = hafalTotalCount;
    els.belumBadge.innerText = belumSessionCount;

    // Pastikan currentIndex tidak melebihi batas
    if (currentIndex >= totalReview && totalReview > 0) {
        showResultScreen();
        return;
    }

    if (totalReview === 0) {
        showResultScreen();
        return;
    }

    els.resultScreen.classList.add('hidden');
    els.cardStage.classList.remove('hidden');
    document.querySelector('.status-actions-nav').classList.remove('hidden');

    const current = filteredCards[currentIndex];
    els.progress.innerText = `${currentIndex + 1} / ${allCards.length}`;

    els.q.innerText = current.question;
    els.qEdit.value = current.question;

    let html = `
        <div class="bubble left">
            <div class="bubble-text">${current.question}</div>
            <div class="bubble-actions">
                <button onclick="copyToClipboard(\`${current.question.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
            </div>
        </div>`;

    if (isEditingCardBack) {
        html += `
            <div class="bubble right editing-focus">
                <textarea id="a-inline-edit" class="bubble-edit" spellcheck="false">${current.answer}</textarea>
            </div>`;
    } else {
        html += `
            <div class="bubble right">
                <div class="bubble-text">${current.answer}</div>
                <div class="bubble-actions">
                    <button onclick="copyToClipboard(\`${current.answer.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
                    <button onclick="toggleEditMode(event, 'main')" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                </div>
            </div>`;
    }

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            html += `
                <div class="bubble ${side}">
                    <div class="bubble-text">${f.content}</div>
                    <div class="bubble-actions">
                        <button onclick="copyToClipboard(\`${f.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
                        <button onclick="toggleEditMode(event, ${f.id})" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                    </div>
                    <button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button>
                </div>`;
        });
    }
    els.chatBubbles.innerHTML = html;

    const hasTips = current.tips && current.tips.trim().length > 0;
    els.tipsContainer.classList.toggle('hidden', !hasTips);
    // Show tips as plain text (pre-wrap via CSS)
    els.tDisplay.textContent = current.tips || "No tips added.";
    els.tEdit.value = current.tips || "";

    // Apply vocab highlight to bubbles based on tips words
    if (hasTips) {
        const vocabWords = extractVocabWords(current.tips);
        applyVocabHighlight(vocabWords);
    }

    els.card.classList.remove('flipped');
}

function toggleEditVisibility(editing) {
    const current = filteredCards[currentIndex % filteredCards.length];
    const hasTips = current && current.tips && current.tips.trim().length > 0;
    const isFlipped = els.card.classList.contains('flipped');

    if (editing) {
        if (!isFlipped) {
            // FRONT EDIT MODE
            els.q.classList.add('hidden');
            els.qEdit.classList.remove('hidden');
        } else {
            // BACK EDIT MODE
            els.chatBubbles.classList.add('editing-active'); // Utility class to hide elements if needed

            // Hide tip edit pencil when editing full card
            els.tipEditBtn.classList.add('hidden');
            // Hide add tips button during edit
            els.addTipsBtn.classList.add('hidden');

            if (editing === 'tips') {
                els.tipsContainer.classList.remove('hidden');
                els.tDisplay.classList.add('hidden');
                els.tEdit.classList.remove('hidden');
            } else {
                els.tipsContainer.classList.add('hidden');
            }

            document.querySelector('.follow-up-actions').classList.add('hidden');
            renderReviewForEdit(editing);
        }
        document.getElementById('card').classList.add('editing');
    } else {
        // READ MODE
        els.q.classList.remove('hidden');
        els.qEdit.classList.add('hidden');

        els.tipsContainer.classList.toggle('hidden', !hasTips);
        els.tDisplay.classList.toggle('hidden', !hasTips);
        els.tEdit.classList.add('hidden');

        // Mode baca: sembunyikan jika ada data, tampilkan jika kosong
        els.addTipsBtn.classList.toggle('hidden', hasTips);

        els.tipEditBtn.classList.toggle('hidden', !hasTips);

        document.querySelector('.follow-up-actions').classList.remove('hidden');
        document.getElementById('card').classList.remove('editing');
        renderReviewAfterSave();
    }
}

function renderReviewForEdit(targetId = null) {
    const current = filteredCards[currentIndex % filteredCards.length];
    let html = `
        <div class="bubble left">
            <div class="bubble-text">${current.question}</div>
            <div class="bubble-actions">
                <button onclick="copyToClipboard(\`${current.question.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
            </div>
        </div>`;

    const isMainFocus = targetId === 'main';
    html += `
        <div class="bubble right ${isMainFocus ? 'editing-focus' : ''}">
            <textarea id="a-inline-edit" class="bubble-edit" spellcheck="false" onfocus="highlightBubble(this)">${current.answer}</textarea>
        </div>`;

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            const isTarget = targetId == f.id;
            html += `
                <div class="bubble ${side} ${isTarget ? 'editing-focus' : ''}">
                    <textarea class="bubble-edit follow-up-edit" data-id="${f.id}" spellcheck="false" onfocus="highlightBubble(this)">${f.content}</textarea>
                    <button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button>
                </div>`;
        });
    }
    els.chatBubbles.innerHTML = html;

    // Auto resize untuk semua textarea edit (main + followups)
    const textareas = els.chatBubbles.querySelectorAll('.bubble-edit');
    textareas.forEach(textarea => {
        const adjustHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight + 2) + 'px';
        };
        textarea.addEventListener('input', adjustHeight);
        adjustHeight();
    });

    // Focus target
    if (targetId && targetId !== true) {
        if (targetId === 'main') {
            document.getElementById('a-inline-edit').focus();
        } else if (targetId === 'tips') {
            els.tEdit.focus();
        } else {
            const target = els.chatBubbles.querySelector(`textarea[data-id="${targetId}"]`);
            if (target) target.focus();
        }
    }
}

function highlightBubble(el) {
    els.chatBubbles.querySelectorAll('.bubble').forEach(b => b.classList.remove('editing-focus'));
    el.closest('.bubble').classList.add('editing-focus');
}

function renderReviewAfterSave() {
    const current = filteredCards[currentIndex % filteredCards.length];

    // Sinkronkan text di bagian depan dan tab display
    els.q.innerText = current.question;
    els.tDisplay.textContent = current.tips || "No tips added.";

    let html = `
        <div class="bubble left">
            <div class="bubble-text">${current.question}</div>
            <div class="bubble-actions">
                <button onclick="copyToClipboard(\`${current.question.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
            </div>
        </div>`;
    html += `
        <div class="bubble right">
            <div class="bubble-text">${current.answer}</div>
            <div class="bubble-actions">
                <button onclick="copyToClipboard(\`${current.answer.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
                <button onclick="toggleEditMode(event, 'main')" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            </div>
        </div>`;

    if (current.followUps && current.followUps.length > 0) {
        current.followUps.forEach(f => {
            const side = f.type === 'q' ? 'left' : 'right';
            html += `
                <div class="bubble ${side}">
                    <div class="bubble-text">${f.content}</div>
                    <div class="bubble-actions">
                        <button onclick="copyToClipboard(\`${f.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Copy"><i class="far fa-copy"></i></button>
                        <button onclick="toggleEditMode(event, ${f.id})" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                    </div>
                    <button class="del-bubble" onclick="deleteFollowUp(event, ${f.id})"><i class="fas fa-times"></i></button>
                </div>`;
        });
    }
    els.chatBubbles.innerHTML = html;

    // Apply vocab highlight in after-save mode too
    const currentCard = filteredCards[currentIndex % filteredCards.length];
    if (currentCard && currentCard.tips) {
        applyVocabHighlight(extractVocabWords(currentCard.tips));
    }
}

let currentFuType = 'q';
function openFollowUpModal(type) {
    currentFuType = type;
    if (type === 'q') {
        els.fuTitle.innerText = "Add Follow-up Question";
        els.fuLabel.innerText = "Question";
    } else {
        els.fuTitle.innerText = "Add Follow-up Answer";
        els.fuLabel.innerText = "Answer";
    }
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
    if (!await showModal("Hapus follow-up ini?", "Konfirmasi", true)) return;
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

async function toggleEditMode(e, targetId = null) {
    if (e) e.stopPropagation();
    const isFlipped = els.card.classList.contains('flipped');

    if (!isFlipped) {
        // FRONT EDIT
        isEditingCardFront = !isEditingCardFront;
        if (isEditingCardFront) {
            els.editBtnFront.classList.add('editing');
            els.editBtnFront.innerHTML = '<i class="fas fa-save"></i>';
            toggleEditVisibility(true);
            els.qEdit.focus();
        } else {
            els.editBtnFront.classList.remove('editing');
            els.editBtnFront.innerHTML = '<i class="fas fa-edit"></i>';
            await saveCardChanges();
            toggleEditVisibility(false);
        }
    } else {
        // BACK EDIT
        isEditingCardBack = !isEditingCardBack;
        if (isEditingCardBack) {
            els.editBtn.classList.remove('hidden');
            els.editBtn.classList.add('editing');
            els.editBtn.innerHTML = '<i class="fas fa-save"></i>';
            toggleEditVisibility(targetId || true);
            if (targetId !== 'tips') {
                renderReviewForEdit(targetId);
            }
        } else {
            els.editBtn.classList.add('hidden');
            els.editBtn.classList.remove('editing');
            els.editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            await saveCardChanges();
            toggleEditVisibility(false);
        }
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
        sessionHistory.push({ cardId: current.id, wasBelum: false });
        currentIndex++;
    } else {
        sessionBelumIds.add(current.id);
        sessionHistory.push({ cardId: current.id, wasBelum: true });
        currentIndex++;
    }

    saveSession();

    if (currentIndex >= filteredCards.length) {
        showResultScreen();
    } else {
        renderReview();
    }
}

function showResultScreen() {
    const hafalCount = allCards.filter(c => c.status === 1).length;
    const belumCount = allCards.filter(c => c.status === 0).length;

    els.cardStage.classList.add('hidden');
    document.querySelector('.status-actions-nav').classList.add('hidden');
    els.resultScreen.classList.remove('hidden');

    els.finalHafal.innerText = hafalCount;
    els.finalBelum.innerText = sessionBelumIds.size;
    els.unlearnedCount.innerText = belumCount;

    els.progress.innerText = "Review Selesai";
}

els.restartProgressBtn.onclick = async () => {
    if (await showModal("Hapus semua progress dan mulai dari awal?", "Konfirmasi", true)) {
        await fetch('/api/reset', { method: 'POST' });
        clearSession();
        location.reload();
    }
};

els.studyUnlearnedBtn.onclick = () => {
    clearSession(); // Reset counter belum dan posisi kartu
    // Filter hanya kartu yang belum hafal (status 0)
    filteredCards = allCards.filter(c => c.status === 0);
    currentIndex = 0;
    saveSession();
    renderReview();
};

async function deleteCard() {
    const current = filteredCards[currentIndex % filteredCards.length];
    if (!await showModal("Hapus kartu ini selamanya?", "Konfirmasi", true)) return;

    await fetch(`/api/cards/${current.id}`, { method: 'DELETE' });
    allCards = allCards.filter(c => c.id !== current.id);
    applyFilters();
    refreshStats();
}

async function saveCardChanges() {
    const current = filteredCards[currentIndex % filteredCards.length];
    const inlineEdit = document.getElementById('a-inline-edit');

    // Save main card
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

    Object.assign(current, body);

    // Save follow-ups
    const fuEdits = els.chatBubbles.querySelectorAll('.follow-up-edit');
    for (const fuel of fuEdits) {
        const id = fuel.dataset.id;
        const content = fuel.value.trim();
        await fetch(`/api/follow-ups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        const fObj = current.followUps.find(f => f.id == id);
        if (fObj) fObj.content = content;
    }

    const original = allCards.find(c => c.id === current.id);
    if (original) {
        Object.assign(original, body);
        original.followUps = JSON.parse(JSON.stringify(current.followUps));
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
document.getElementById('card').onclick = async (e) => {
    if (!['TEXTAREA', 'BUTTON', 'I'].includes(e.target.tagName) && !e.target.classList.contains('del-bubble')) {
        // Jika sedang mengedit, simpan dulu baru flip
        if (isEditingCardFront || isEditingCardBack) {
            await toggleEditMode();
        }
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
    if (await showModal("Reset semua progress hafalan?\nSemua kartu akan dikembalikan ke status 'Belum Hafal'.", "Konfirmasi", true)) {
        await fetch('/api/reset', { method: 'POST' });
        clearSession();
        location.reload();
    }
};

document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
};

els.addTipsBtn.onclick = (e) => {
    e.stopPropagation();
    toggleEditMode(e, 'tips');
};

els.tipEditBtn.onclick = (e) => {
    e.stopPropagation();
    toggleEditMode(e, 'tips');
};

document.getElementById('undo-btn').onclick = async () => {
    if (currentIndex === 0 || sessionHistory.length === 0) return;

    const lastAction = sessionHistory.pop();
    const card = allCards.find(c => c.id === lastAction.cardId);

    if (card) {
        // Reset status to unlearned (0)
        card.status = 0;
        await fetch(`/api/cards/${card.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 0 })
        });

        if (lastAction.wasBelum) {
            sessionBelumIds.delete(card.id);
        }
    }

    currentIndex--;
    saveSession();
    renderReview();
};

init();
