document.getElementById('login-btn').onclick = async () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const err = document.getElementById('error-msg');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });

        const data = await res.json();
        if (!res.ok) {
            err.innerText = data.error || 'Login failed';
            err.classList.remove('hidden');
            return;
        }

        localStorage.setItem('token', data.token);
        window.location.href = '/index.html';
    } catch (e) {
        err.innerText = "Network error";
        err.classList.remove('hidden');
    }
}
