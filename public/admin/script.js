function getLoggedInUser() {
    try {
        return JSON.parse(localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser') || 'null');
    } catch {
        return null;
    }
}

function requireAdminOrRedirect() {
    const user = getLoggedInUser();
    if (!user || user.isGuest === true || user.role !== 'admin') {
        alert('Admin access only. Please log in with an admin account.');
        window.location.href = '/Rivals.html';
        return false;
    }
    return true;
}

function getAdminHeaders() {
    const user = getLoggedInUser();
    return {
        'x-admin-email': user?.email || '',
        'x-admin-role': user?.role || ''
    };
}

function formatBanStatus(bannedUntil) {
    if (!bannedUntil) return 'Active';
    const until = new Date(bannedUntil);
    if (Number.isNaN(until.getTime())) return 'Active';
    if (until.getTime() <= Date.now()) return 'Active';
    return `Banned until ${until.toLocaleString()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAdminOrRedirect()) return;

    setupBanModal();

    if (document.getElementById('userTableBody')) {
        await loadUsers();
    }
    if (document.getElementById('addUserForm')) {
        document.getElementById('addUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, password })
                });
                
                if (response.ok) {
                    window.location.href = 'index.html';
                } else {
                    const error = await response.json();
                    alert('Error: ' + error.error);
                }
            } catch (error) {
                alert('Error adding user: ' + error.message);
            }
        });
    }
    if (document.getElementById('editUserForm')) {
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('id');
        
        if (userId) {
            try {
                const response = await fetch(`/users/${userId}`);
                if (response.ok) {
                    const user = await response.json();
                    document.getElementById('userId').value = user._id;
                    document.getElementById('name').value = user.name;
                    document.getElementById('email').value = user.email;
                } else {
                    alert('User not found');
                    window.location.href = 'index.html';
                }
            } catch (error) {
                alert('Error loading user: ' + error.message);
            }
        }
        
        document.getElementById('editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('userId').value;
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const updateData = { name, email };
            if (password) {
                updateData.password = password;
            }
            
            try {
                const response = await fetch(`/users/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    window.location.href = 'index.html';
                } else {
                    const error = await response.json();
                    alert('Error: ' + error.error);
                }
            } catch (error) {
                alert('Error updating user: ' + error.message);
            }
        });
    }
});

let banTargetUserId = null;
let banTargetUserName = null;

function setupBanModal() {
    const overlay = document.getElementById('banModalOverlay');
    const closeBtn = document.getElementById('banModalClose');
    const cancelBtn = document.getElementById('banCancelBtn');
    const confirmBtn = document.getElementById('banConfirmBtn');
    const minutesInput = document.getElementById('banMinutesInput');

    if (!overlay || !closeBtn || !cancelBtn || !confirmBtn || !minutesInput) return;

    function close() {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        banTargetUserId = null;
        banTargetUserName = null;
        minutesInput.value = '';
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('show')) close();
    });

    overlay.querySelectorAll('.ban-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = Number(btn.getAttribute('data-minutes'));
            if (Number.isFinite(mins)) minutesInput.value = String(mins);
            minutesInput.focus();
        });
    });

    confirmBtn.addEventListener('click', async () => {
        if (!banTargetUserId) return;
        const raw = Number(minutesInput.value);
        const minMinutes = 5;
        const maxMinutes = 1440;
        const minutes = Math.floor(raw);

        if (!Number.isFinite(minutes) || minutes < minMinutes || minutes > maxMinutes) {
            alert(`Please enter a valid ban duration between ${minMinutes} and ${maxMinutes} minutes.`);
            return;
        }

        try {
            const response = await fetch(`/users/${banTargetUserId}/ban`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAdminHeaders()
                },
                body: JSON.stringify({ minutes })
            });
            const data = await response.json();
            if (response.ok) {
                close();
                window.location.reload();
            } else {
                alert('Error: ' + (data.error || 'Failed to ban user'));
            }
        } catch (error) {
            alert('Error banning user: ' + error.message);
        }
    });

    // Expose close for other functions if needed
    window.__closeBanModal = close;
}

function openBanModal(id, name) {
    const overlay = document.getElementById('banModalOverlay');
    const title = document.getElementById('banModalTitle');
    const userText = document.getElementById('banModalUserText');
    const minutesInput = document.getElementById('banMinutesInput');

    if (!overlay || !title || !userText || !minutesInput) return;

    banTargetUserId = id;
    banTargetUserName = name || 'User';

    title.textContent = 'Ban User';
    userText.textContent = `Ban ${banTargetUserName}. Choose a duration (max 24 hours).`;

    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    // Default suggestion
    if (!minutesInput.value) minutesInput.value = '60';
    minutesInput.focus();
}

function getPostCountForUser(userId) {
    try {
        const postsStr = localStorage.getItem('rivals_community_posts');
        if (!postsStr) return 0;
        const posts = JSON.parse(postsStr);
        if (!Array.isArray(posts)) return 0;
        // Count posts by userId (match both string and ObjectId formats)
        return posts.filter(p => String(p.userId) === String(userId) || String(p.userId) === String(userId)).length;
    } catch {
        return 0;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch {
        return 'N/A';
    }
}

async function loadUsers() {
    const userTableBody = document.getElementById('userTableBody');
    if (!userTableBody) {
        console.error('User table body not found');
        return;
    }

    // Show loading state
    userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading users...</td></tr>';

    try {
        const response = await fetch('/users');
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to load users:', response.status, errorText);
            userTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">
                Error loading users (${response.status}). 
                <br>Make sure MongoDB is connected and the server is running.
                <br><small>Check browser console (F12) for details.</small>
            </td></tr>`;
            return;
        }

        const users = await response.json();
        
        if (!Array.isArray(users)) {
            console.error('Invalid response format:', users);
            userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">Invalid response from server</td></tr>';
            return;
        }

        if (users.length === 0) {
            userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No users found. Add a user first.</td></tr>';
            return;
        }

        userTableBody.innerHTML = '';
        
        // Sort users by creation date (newest first)
        users.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
        });

        console.log(`Loaded ${users.length} user(s) from database`);
        
        users.forEach(user => {
            const isBanned = !!user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
            const isAdmin = user.role === 'admin';
            const postCount = getPostCountForUser(user._id);
            const createdDate = formatDate(user.createdAt);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${createdDate}</td>
                <td>${postCount}</td>
                <td>${formatBanStatus(user.bannedUntil)}</td>
                <td>
                    <a href="edit-user.html?id=${user._id}">Edit</a>
                    ${isAdmin ? '' : isBanned
                        ? `<button onclick="unbanUser('${user._id}')">Unban</button>`
                        : `<button onclick="openBanModal('${user._id}', '${String(user.name || 'User').replace(/'/g, '&#39;')}')">Ban</button>`
                    }
                </td>
            `;
            userTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        userTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">
            Error: ${error.message}
            <br><small>Check browser console (F12) for details.</small>
        </td></tr>`;
    }
}

async function unbanUser(id) {
    if (!confirm('Unban this user?')) return;
    try {
        const response = await fetch(`/users/${id}/unban`, {
            method: 'PATCH',
            headers: {
                ...getAdminHeaders()
            }
        });
        const data = await response.json();
        if (response.ok) {
            window.location.reload();
        } else {
            alert('Error: ' + (data.error || 'Failed to unban user'));
        }
    } catch (error) {
        alert('Error unbanning user: ' + error.message);
    }
}

