// Generate random captcha
function generateCaptcha() {
    const num = Math.floor(Math.random() * 9000) + 1000;
    return num.toString();
}

// Initialize captcha
let currentCaptcha = generateCaptcha();
document.getElementById('captcha-text').textContent = currentCaptcha;

// Refresh captcha
document.getElementById('refreshCaptcha').addEventListener('click', () => {
    currentCaptcha = generateCaptcha();
    document.getElementById('captcha-text').textContent = currentCaptcha;
    document.getElementById('reg-captcha').value = '';
});

// Enable/disable registration button based on form validity
function checkRegistrationForm() {
    const form = document.getElementById('registrationForm');
    const submitBtn = document.getElementById('reg-submit-btn');
    const email = document.getElementById('reg-email').value;
    const nickname = document.getElementById('reg-nickname').value;
    const password = document.getElementById('reg-password').value;
    const passwordRepeat = document.getElementById('reg-password-repeat').value;
    const captcha = document.getElementById('reg-captcha').value;
    const terms = document.getElementById('reg-terms').checked;

    const isValid = 
        email && 
        nickname && 
        password && 
        password === passwordRepeat && 
        captcha === currentCaptcha && 
        terms;

    submitBtn.disabled = !isValid;
}

// Add event listeners for registration form validation
['reg-email', 'reg-nickname', 'reg-password', 'reg-password-repeat', 'reg-captcha', 'reg-terms'].forEach(id => {
    document.getElementById(id).addEventListener('input', checkRegistrationForm);
    document.getElementById(id).addEventListener('change', checkRegistrationForm);
});

// Password match validation
document.getElementById('reg-password-repeat').addEventListener('input', function() {
    const password = document.getElementById('reg-password').value;
    const passwordRepeat = this.value;
    
    if (passwordRepeat && password !== passwordRepeat) {
        this.setCustomValidity('Passwords do not match');
    } else {
        this.setCustomValidity('');
    }
    checkRegistrationForm();
});

// Registration Form Submission
document.getElementById('registrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('reg-email').value;
    const nickname = document.getElementById('reg-nickname').value;
    const password = document.getElementById('reg-password').value;
    const passwordRepeat = document.getElementById('reg-password-repeat').value;
    const captcha = document.getElementById('reg-captcha').value;
    
    // Validate captcha
    if (captcha !== currentCaptcha) {
        showError('Invalid captcha code. Please try again.');
        currentCaptcha = generateCaptcha();
        document.getElementById('captcha-text').textContent = currentCaptcha;
        document.getElementById('reg-captcha').value = '';
        return;
    }
    
    // Validate password match
    if (password !== passwordRepeat) {
        showError('Passwords do not match.');
        return;
    }
    
    try {
        const response = await fetch('/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                name: nickname, 
                email: email, 
                password: password 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Registration successful - switch to login
            showSuccess('Account created successfully! Please log in.');
            setTimeout(() => {
                switchToLogin();
                // Pre-fill email
                document.getElementById('login-email').value = email;
            }, 1500);
        } else {
            showError(data.error || 'Registration failed. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
        console.error('Registration error:', error);
    }
});

// Login Form Submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Persist login state so admin-only UI (like /public/admin) can detect role.
            const loggedInUser = {
                id: data.user?.id || data.user?._id,
                name: data.user?.name,
                username: data.user?.username || data.user?.name,
                email: data.user?.email || email,
                avatar: data.user?.avatar || 'Images/Rival.png',
                bio: data.user?.bio || '',
                favoriteCharacter: data.user?.favoriteCharacter || 'Not set',
                rank: data.user?.rank || 'Unranked',
                winrate: data.user?.winrate || 0,
                createdAt: data.user?.createdAt || new Date().toISOString(),
                role: data.user?.role || 'user',
                isGuest: false
            };
            localStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
            sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
            localStorage.removeItem('isGuest');
            sessionStorage.removeItem('isGuest');
            localStorage.removeItem('guestUser');
            sessionStorage.removeItem('guestUser');

            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showError(data.error || 'Invalid email or password.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
        console.error('Login error:', error);
    }
});

// Switch to Login Section
function switchToLogin() {
    // Expand the login form if it's collapsed
    const expandContent = document.getElementById('expandContent');
    const expandBtn = document.getElementById('expandLink');
    if (expandContent.hidden) {
        expandContent.hidden = false;
        expandBtn.setAttribute('aria-expanded', 'true');
    }
    
    // Scroll to login section on mobile
    if (window.innerWidth <= 968) {
        document.querySelector('.login-section').scrollIntoView({ behavior: 'smooth' });
    }
}

document.getElementById('switchToLogin').addEventListener('click', switchToLogin);

// Artstorm Login Button (placeholder)
document.getElementById('artstormLogin').addEventListener('click', () => {
    showError('Artstorm login integration coming soon!');
});

// Expandable Section Toggle
document.getElementById('expandLink').addEventListener('click', function() {
    const expandContent = document.getElementById('expandContent');
    const isExpanded = !expandContent.hidden;
    
    expandContent.hidden = isExpanded;
    this.setAttribute('aria-expanded', !isExpanded);
});

// Close Modal
document.querySelector('.modal-close').addEventListener('click', () => {
    window.location.href = '/';
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.location.href = '/';
    }
});

// Error/Success Message Display
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.background = 'rgba(220, 53, 69, 0.95)';
    errorEl.hidden = false;
    
    setTimeout(() => {
        errorEl.hidden = true;
    }, 5000);
}

function showSuccess(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.background = 'rgba(40, 167, 69, 0.95)';
    errorEl.hidden = false;
    
    setTimeout(() => {
        errorEl.hidden = true;
    }, 3000);
}

// Language Selector (placeholder)
document.getElementById('languageSelect').addEventListener('change', function() {
    // Language switching functionality can be added here
    console.log('Language changed to:', this.value);
});
