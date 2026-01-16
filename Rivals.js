(function() {
  const root = document.documentElement;

  // First load this session: clear stale login stuff so everyone starts fresh
  (function initFirstBoot() {
    const FIRST_BOOT_KEY = 'rivals_first_boot_complete';
    const isFirstBoot = !sessionStorage.getItem(FIRST_BOOT_KEY);
    
    if (isFirstBoot) {
      // Clear all login state on first boot
      localStorage.removeItem('loggedInUser');
      sessionStorage.removeItem('loggedInUser');
      localStorage.removeItem('isGuest');
      sessionStorage.removeItem('isGuest');
      localStorage.removeItem('guestUser');
      sessionStorage.removeItem('guestUser');
      localStorage.removeItem('rivals_current_user');
      
      // Mark first boot as complete (only for this session)
      sessionStorage.setItem(FIRST_BOOT_KEY, 'true');
      console.log('🔄 First boot: Cleared login state for fresh start');
    }
  })();

  // Loader only on in-site hops; skip if you're coming home or back from elsewhere
  (function initPageLoader() {
    const pageLoader = document.getElementById('page-loader');
    if (!pageLoader) return;

    // Check if returning from external site (like YouTube)
    const referrer = document.referrer;
    const isReturningFromExternal = referrer && !referrer.includes(window.location.hostname) && !referrer.includes('localhost') && !referrer.includes('127.0.0.1');
    
    // Check if we're navigating away from home page
    const currentPage = window.location.pathname.split('/').pop() || '';
    const isHomePage = currentPage === 'Rivals.html' || currentPage === '' || currentPage === 'index.html';
    const previousPage = sessionStorage.getItem('previousPage') || '';
    const isReturningToHome = isHomePage && previousPage && previousPage !== 'Rivals.html' && previousPage !== '' && previousPage !== 'index.html';

    // Store current page for next navigation
    sessionStorage.setItem('previousPage', currentPage);

    // Don't show loader if returning from external site or returning to home
    if (isReturningFromExternal || isReturningToHome || isHomePage) {
      pageLoader.classList.remove('active');
      return;
    }

    // Show loader only for internal page navigation
    if (!isHomePage) {
      pageLoader.classList.add('active');
      
      // Hide loader after page loads
      window.addEventListener('load', () => {
        setTimeout(() => {
          pageLoader.classList.remove('active');
        }, 3000); // 3 seconds
      });
    } else {
      pageLoader.classList.remove('active');
    }

    // Intercept link clicks to show loader (only for internal links)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      
      // Don't show loader for download links (video downloads, file downloads, etc.)
      if (link.hasAttribute('download') || href.includes('.mp4') || href.includes('.mp3') || href.includes('.pdf') || href.includes('.zip')) {
        return; // Download link, don't show loader
      }
      
      // Don't show loader for external links
      if (href.startsWith('http://') || href.startsWith('https://')) {
        // Check if it's an external link
        try {
          const url = new URL(href, window.location.origin);
          if (url.hostname !== window.location.hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
            return; // External link, don't show loader
          }
        } catch (e) {
          // Invalid URL, skip
          return;
        }
      }
      
      const targetPage = href.split('/').pop() || '';
      const isHomeLink = targetPage === 'Rivals.html' || targetPage === '' || targetPage === 'index.html';
      const currentPageName = window.location.pathname.split('/').pop() || '';
      const isCurrentlyHome = currentPageName === 'Rivals.html' || currentPageName === '' || currentPageName === 'index.html';
      
      // Show loader if:
      // 1. Going from home to another page, OR
      // 2. Going from one page to another page
      // BUT NOT if going back to home
      if ((isCurrentlyHome && !isHomeLink) || (!isCurrentlyHome && !isHomeLink)) {
        pageLoader.classList.add('active');
      }
    });
  })();

  // Mobile drawer: hamburger toggles the slide-in nav on phones
  const hamburger = document.querySelector('.hamburger');
  const drawer = document.getElementById('mobile-drawer');
  if (hamburger && drawer) {
    function setOpen(open) {
      drawer.toggleAttribute('hidden', !open);
      drawer.toggleAttribute('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
    }
    hamburger.addEventListener('click', () => {
      const open = !drawer.hasAttribute('open');
      setOpen(open);
    });
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) setOpen(false);
    });
  }

  // Login popup: open/close, lock scroll, and keep guest vs login in sync
  const loginPopup = document.getElementById('login-popup');
  const loginBtn = document.getElementById('login-btn');
  const mobileLoginBtn = document.getElementById('mobile-login-btn');
  const loginClose = document.querySelector('.login-close');
  const loginOverlay = document.querySelector('.login-overlay');
  
  // Ensure popup starts closed
  if (loginPopup) {
    loginPopup.setAttribute('hidden', 'true');
    loginPopup.removeAttribute('open');
    sessionStorage.setItem('loginPopupOpen', 'false');
  }

  window.openLoginPopup = function openLoginPopup() {
    if (loginPopup) {
      loginPopup.removeAttribute('hidden');
      loginPopup.setAttribute('open', 'true');
      loginPopup.style.display = '';
      document.body.style.overflow = 'hidden';
      sessionStorage.setItem('loginPopupOpen', 'true');
      // Check guest status when popup opens
      setTimeout(() => {
        checkGuestStatus();
        renderAccountPanelState();
      }, 100);
    }
  }

  function closeLoginPopup() {
    if (loginPopup) {
      loginPopup.setAttribute('hidden', 'true');
      loginPopup.removeAttribute('open');
      document.body.style.overflow = '';
      sessionStorage.setItem('loginPopupOpen', 'false');
    }
  }

  if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); openLoginPopup(); });
  if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', (e) => { e.preventDefault(); openLoginPopup(); });
  if (loginClose) loginClose.addEventListener('click', closeLoginPopup);
  if (loginOverlay) loginOverlay.addEventListener('click', closeLoginPopup);

  // Trailer popup (and any page video) mutes site music while it plays
  const trailerModal = document.getElementById('trailer-modal');
  const watchTrailerBtn = document.getElementById('watch-trailer-btn');
  const trailerModalClose = document.getElementById('trailer-modal-close');
  const trailerModalBackdrop = document.getElementById('trailer-modal-backdrop');
  let trailerPlayer = null;
  const TRAILER_VIDEO_ID = '67FVMNGMFXU'; 
  // Store original music mute state before video plays
  let musicMutedBeforeVideo = null;
  let activeVideos = new Set(); // Track all playing videos
  
  function muteBackgroundMusic() {
    // Store current mute state only once
    if (musicMutedBeforeVideo === null) {
      musicMutedBeforeVideo = localStorage.getItem('musicMuted') === 'true';
    }
    // Mute music
    localStorage.setItem('musicMuted', 'true');
    // Trigger music player update if available
    if (window.globalIsMuted !== undefined) {
      window.globalIsMuted = true;
    }
    // Dispatch custom event for music player to listen
    window.dispatchEvent(new CustomEvent('musicMuteRequest', { detail: { mute: true } }));
  }
  
  function unmuteBackgroundMusic() {
    // Only unmute if no videos are playing
    if (activeVideos.size > 0) {
      return; // Still have videos playing
    }
    
    // Restore original mute state
    if (musicMutedBeforeVideo !== null) {
      localStorage.setItem('musicMuted', musicMutedBeforeVideo.toString());
      musicMutedBeforeVideo = null;
    } else {
      // If no stored state, check if user had it unmuted
      const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
      if (userManuallyUnmuted) {
        localStorage.setItem('musicMuted', 'false');
      }
    }
    // Trigger music player update if available
    if (window.globalIsMuted !== undefined) {
      window.globalIsMuted = localStorage.getItem('musicMuted') === 'true';
    }
    // Dispatch custom event for music player to listen
    window.dispatchEvent(new CustomEvent('musicMuteRequest', { detail: { mute: localStorage.getItem('musicMuted') === 'true' } }));
  }
  
  // Monitor all HTML5 video elements on the page
  function setupVideoMonitoring() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      // Skip muted/autoplay videos (like hero background video)
      if (video.muted && video.hasAttribute('autoplay')) {
        return; // Don't monitor background videos
      }
      
      const videoId = video.id || `video-${Math.random()}`;
      
      video.addEventListener('play', () => {
        activeVideos.add(videoId);
        muteBackgroundMusic();
      });
      
      video.addEventListener('pause', () => {
        activeVideos.delete(videoId);
        unmuteBackgroundMusic();
      });
      
      video.addEventListener('ended', () => {
        activeVideos.delete(videoId);
        unmuteBackgroundMusic();
      });
    });
  }
  
  // Setup video monitoring when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVideoMonitoring);
  } else {
    setupVideoMonitoring();
  }
  
  // Also monitor dynamically added videos
  const videoObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'VIDEO') {
            setupVideoMonitoring();
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              setupVideoMonitoring();
            }
          }
        }
      });
    });
  });
  
  videoObserver.observe(document.body, { childList: true, subtree: true });

  function initializeTrailerPlayer() {
    if (!trailerPlayer && window.YT && window.YT.Player) {
      const playerContainer = document.getElementById('trailer-player');
      if (playerContainer) {
        trailerPlayer = new window.YT.Player('trailer-player', {
          videoId: TRAILER_VIDEO_ID,
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1
          },
          events: {
            onReady: function(event) {
              event.target.playVideo();
            },
            onStateChange: function(event) {
              // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
              const videoId = 'youtube-trailer';
              if (event.data === window.YT.PlayerState.PLAYING) {
                // Video started playing - mute background music
                activeVideos.add(videoId);
                muteBackgroundMusic();
              } else if (event.data === window.YT.PlayerState.PAUSED || 
                         event.data === window.YT.PlayerState.ENDED) {
                // Video paused or ended - unmute background music
                activeVideos.delete(videoId);
                unmuteBackgroundMusic();
              }
            }
          }
        });
      }
    }
  }

  // Open trailer modal - waits for YT API if not loaded yet
  function openTrailerModal() {
    if (trailerModal) {
      trailerModal.toggleAttribute('hidden', false);
      document.body.style.overflow = 'hidden';
      
      if (window.YT && window.YT.Player) {
        initializeTrailerPlayer();
      } else if (window.onYouTubeIframeAPIReady) {
        // API is loading, wait for it
        const originalReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() {
          if (originalReady) originalReady();
          setTimeout(initializeTrailerPlayer, 100);
        };
      } else {
        window.onYouTubeIframeAPIReady = function() {
          setTimeout(initializeTrailerPlayer, 100);
        };
      }
    }
  }

  // Close trailer modal - stops video and unmutes background music
  function closeTrailerModal() {
    if (trailerModal) {
      trailerModal.toggleAttribute('hidden', true);
      document.body.style.overflow = '';
      
      activeVideos.delete('youtube-trailer');
      unmuteBackgroundMusic();
      
      if (trailerPlayer) {
        try {
          if (trailerPlayer.stopVideo) {
            trailerPlayer.stopVideo();
          }
          if (trailerPlayer.destroy) {
            trailerPlayer.destroy();
          }
        } catch (e) {
          console.error('Error stopping trailer player:', e);
        }
        trailerPlayer = null;
        
        // Clear the player container
        const playerContainer = document.getElementById('trailer-player');
        if (playerContainer) {
          playerContainer.innerHTML = '';
        }
      }
    }
  }

  if (watchTrailerBtn) {
    watchTrailerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openTrailerModal();
    });
  }

  if (trailerModalClose) {
    trailerModalClose.addEventListener('click', closeTrailerModal);
  }

  if (trailerModalBackdrop) {
    trailerModalBackdrop.addEventListener('click', closeTrailerModal);
  }

  // Escape key closes trailer modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trailerModal && !trailerModal.hasAttribute('hidden')) {
      closeTrailerModal();
    }
  });

  // Escape key closes login popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginPopup && loginPopup.hasAttribute('open')) {
      closeLoginPopup();
    }
  });

  // ============================================
  // AUTHENTICATION: email, passwords, captcha
  // ============================================
  
  // Only accept common email domains
  function isValidEmail(email) {
    const validDomains = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com'];
    if (!email || !email.includes('@')) return false;
    const emailLower = email.toLowerCase();
    return validDomains.some(domain => emailLower.endsWith(domain));
  }
  
  // Toggle password visibility (show/hide)
  function setupPasswordToggle(toggleId, inputId) {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (toggle && input) {
      // Clone to remove old listeners
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      
      newToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        
        // Swap the eye icons for hidden and revealed
        const svgs = newToggle.querySelectorAll('svg');
        if (svgs.length >= 2) {
          svgs[0].style.display = isPassword ? 'block' : 'none'; // eye icon
          svgs[1].style.display = isPassword ? 'none' : 'block'; // eye-off icon
        }
        newToggle.classList.toggle('hidden', isPassword);
      });
    }
  }
  
  // Wire up password toggles for reg and login forms
  setupPasswordToggle('popup-reg-password-toggle', 'popup-reg-password');
  setupPasswordToggle('popup-reg-password-repeat-toggle', 'popup-reg-password-repeat');
  setupPasswordToggle('popup-login-password-toggle', 'popup-login-password');
  
  // Switch between reg/login panels
  const popupSwitchToLogin = document.getElementById('popup-switchToLogin');
  const popupExpandLink = document.getElementById('popup-expandLink');
  const popupExpandContent = document.getElementById('popup-expandContent');
  
  if (popupSwitchToLogin) {
    popupSwitchToLogin.addEventListener('click', () => {
      if (popupExpandContent) {
        popupExpandContent.removeAttribute('hidden');
        if (popupExpandLink) {
          popupExpandLink.setAttribute('aria-expanded', 'true');
        }
      }
    });
  }
  
  if (popupExpandLink && popupExpandContent) {
    popupExpandLink.addEventListener('click', () => {
      const isCurrentlyExpanded = popupExpandLink.getAttribute('aria-expanded') === 'true';
      if (isCurrentlyExpanded) {
        popupExpandContent.setAttribute('hidden', '');
        popupExpandLink.setAttribute('aria-expanded', 'false');
      } else {
        popupExpandContent.removeAttribute('hidden');
        popupExpandLink.setAttribute('aria-expanded', 'true');
      }
    });
  }

  // Random 4-digit captcha
  let popupCaptcha = Math.floor(Math.random() * 9000) + 1000;
  const popupCaptchaText = document.getElementById('popup-captcha-text');
  if (popupCaptchaText) {
    popupCaptchaText.textContent = popupCaptcha.toString();
  }

  // Refresh button for captcha
  const popupRefreshCaptcha = document.getElementById('popup-refreshCaptcha');
  if (popupRefreshCaptcha) {
    popupRefreshCaptcha.addEventListener('click', () => {
      popupCaptcha = Math.floor(Math.random() * 9000) + 1000;
      if (popupCaptchaText) popupCaptchaText.textContent = popupCaptcha.toString();
      const captchaInput = document.getElementById('popup-reg-captcha');
      if (captchaInput) captchaInput.value = '';
    });
  }

  // Enable register button only when all fields are valid
  function checkPopupRegistrationForm() {
    const submitBtn = document.getElementById('popup-reg-submit-btn');
    if (!submitBtn) return;
    
    const email = document.getElementById('popup-reg-email')?.value;
    const nickname = document.getElementById('popup-reg-nickname')?.value;
    const password = document.getElementById('popup-reg-password')?.value;
    const passwordRepeat = document.getElementById('popup-reg-password-repeat')?.value;
    const captcha = document.getElementById('popup-reg-captcha')?.value;
    const terms = document.getElementById('popup-reg-terms')?.checked;

    const isValid = 
        email && 
        isValidEmail(email) &&
        nickname && 
        password && 
        password === passwordRepeat && 
        captcha === popupCaptcha.toString() && 
        terms;

    submitBtn.disabled = !isValid;
  }

  // Validate on every keystroke
  ['popup-reg-email', 'popup-reg-nickname', 'popup-reg-password', 'popup-reg-password-repeat', 'popup-reg-captcha', 'popup-reg-terms'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', checkPopupRegistrationForm);
      el.addEventListener('change', checkPopupRegistrationForm);
    }
  });

  // Check passwords match
  const popupPasswordRepeat = document.getElementById('popup-reg-password-repeat');
  if (popupPasswordRepeat) {
    popupPasswordRepeat.addEventListener('input', function() {
      const password = document.getElementById('popup-reg-password')?.value;
      const passwordRepeat = this.value;
      
      if (passwordRepeat && password !== passwordRepeat) {
        this.setCustomValidity('Passwords do not match');
      } else {
        this.setCustomValidity('');
      }
      checkPopupRegistrationForm();
    });
  }

  // ============================================
  // REGISTRATION SUBMIT
  // ============================================
  const popupRegistrationForm = document.getElementById('popup-registrationForm');
  if (popupRegistrationForm) {
    popupRegistrationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('popup-reg-email').value.trim();
      const nickname = document.getElementById('popup-reg-nickname').value.trim();
      const password = document.getElementById('popup-reg-password').value;
      const passwordRepeat = document.getElementById('popup-reg-password-repeat').value;
      const captcha = document.getElementById('popup-reg-captcha').value.trim();
      
      if (!isValidEmail(email)) {
        alert('Please enter a proper email address.\nAccepted domains: @gmail.com, @yahoo.com, @hotmail.com, @outlook.com');
        return;
      }
      
      if (password !== passwordRepeat) {
        alert('Passwords do not match. Please enter the same password in both fields.');
        return;
      }
      
      if (captcha !== popupCaptcha.toString()) {
        alert('Invalid verification code. Please enter the correct code shown above.');
        popupCaptcha = Math.floor(Math.random() * 9000) + 1000;
        if (popupCaptchaText) popupCaptchaText.textContent = popupCaptcha.toString();
        document.getElementById('popup-reg-captcha').value = '';
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
          }),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
        
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          throw new Error('Server response was not valid JSON. Make sure the server is running correctly.');
        }
        
        if (response.ok) {
          const creationDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          // Save locally so user stays logged in
          const newUser = {
            id: data._id || data.id || `user_${Date.now()}`,
            name: nickname,
            username: nickname,
            email: email,
            avatar: 'Images/Rival.png',
            bio: '',
            favoriteCharacter: 'Not set',
            rank: 'Unranked',
            winrate: 0,
            createdAt: data.createdAt || new Date().toISOString(),
            isGuest: false
          };
          
          localStorage.setItem('loggedInUser', JSON.stringify(newUser));
          sessionStorage.setItem('loggedInUser', JSON.stringify(newUser));
          localStorage.removeItem('isGuest');
          sessionStorage.removeItem('isGuest');
          
          // Trigger login event for other components
          window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: newUser } }));

          // Welcome email handled server-side to avoid duplicate sends

          alert('✅ Account created successfully!\n\nUsername: ' + nickname + '\nEmail: ' + email);
          
          // Reset form fields
          document.getElementById('popup-reg-email').value = '';
          document.getElementById('popup-reg-nickname').value = '';
          document.getElementById('popup-reg-password').value = '';
          document.getElementById('popup-reg-password-repeat').value = '';
          document.getElementById('popup-reg-captcha').value = '';
          document.getElementById('popup-reg-terms').checked = false;
          
          // New captcha for next time
          popupCaptcha = Math.floor(Math.random() * 9000) + 1000;
          if (popupCaptchaText) popupCaptchaText.textContent = popupCaptcha.toString();
          
          // Show login section with email pre-filled
          const expandContent = document.getElementById('popup-expandContent');
          const expandBtn = document.getElementById('popup-expandLink');
          if (expandContent && expandBtn) {
            expandContent.hidden = false;
            expandBtn.setAttribute('aria-expanded', 'true');
          }
          const loginEmail = document.getElementById('popup-login-email');
          if (loginEmail) loginEmail.value = email;
        } else {
          let errorMsg = data.error || data.message || 'Registration failed.';
          if (errorMsg.includes('duplicate') || errorMsg.includes('E11000')) {
            errorMsg = '❌ Email already registered!\n\nThis email address is already in use. Please use a different email or log in instead.';
          } else if (errorMsg.includes('validation')) {
            errorMsg = '❌ Invalid information!\n\n' + errorMsg;
          }
          alert(errorMsg);
        }
      } catch (error) {
        let errorMsg = 'Network error occurred.';
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          errorMsg = '❌ Connection Timeout!\n\nMongoDB connection timed out. Please check:\n\n1. MongoDB is running (check MongoDB Compass)\n2. Server is running (run: npm start)\n3. You are connected to localhost:3000';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMsg = '❌ Cannot Connect to Server!\n\nPlease make sure:\n\n1. Server is running (run: npm start in terminal)\n2. You are accessing from localhost:3000\n3. MongoDB is running';
        } else if (error.message) {
          errorMsg = '❌ Error: ' + error.message;
        }
        alert(errorMsg);
        console.error('Registration error:', error);
      }
    });
  }

  // ============================================
  // LOGIN SUBMIT
  // ============================================
  const popupLoginForm = document.getElementById('popup-loginForm');
  if (popupLoginForm) {
    popupLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('popup-login-email').value.trim();
      const password = document.getElementById('popup-login-password').value;
      
      if (!isValidEmail(email)) {
        alert('Please enter a proper email address.\nAccepted domains: @gmail.com, @yahoo.com, @hotmail.com, @outlook.com');
        return;
      }
      
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
          // Store user info for the session
          const loggedInUser = {
            id: data.user?.id || data.user?._id || `user_${Date.now()}`,
            name: data.user?.name || data.user?.username || data.user?.nickname || email.split('@')[0],
            username: data.user?.username || data.user?.name || data.user?.nickname || email.split('@')[0],
            email: email,
            avatar: data.user?.avatar || 'Images/Rival.png',
            bio: data.user?.bio || '',
            favoriteCharacter: data.user?.favoriteCharacter || 'Not set',
            rank: data.user?.rank || 'Unranked',
            winrate: data.user?.winrate || 0,
            createdAt: data.user?.createdAt || data.user?.created_at || new Date().toISOString(),
            role: data.user?.role || 'user',
            isGuest: false
          };
          
          localStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
          sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
          localStorage.removeItem('isGuest');
          sessionStorage.removeItem('isGuest');
          localStorage.removeItem('guestUser');
          sessionStorage.removeItem('guestUser');
          
          window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: loggedInUser } }));
          
          alert('Login successful!');
          closeLoginPopup();
          
          // Reload so the UI refreshes
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          alert(data.error || 'Incorrect email or password. Please check your credentials and try again.');
        }
      } catch (error) {
        alert('Network error. Please make sure the server is running.');
        console.error('Login error:', error);
      }
    });
  }

  // Update UI based on guest/logged-in status
  function checkGuestStatus() {
    const isGuest = localStorage.getItem('isGuest') === 'true' || sessionStorage.getItem('isGuest') === 'true';
    const storedUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser') || 'null');
      } catch {
        return null;
      }
    })();
    const isLoggedIn = !!storedUser && storedUser.isGuest === false;

    const guestStatus = document.getElementById('guest-status');
    const loginDescription = document.getElementById('login-description');
    const popupGuestLogin = document.getElementById('popup-guestLogin');
    
    if ((isGuest || isLoggedIn) && guestStatus) {
      guestStatus.style.display = 'block';
      if (loginDescription) loginDescription.style.display = 'none';
      if (popupGuestLogin) popupGuestLogin.style.display = 'none';

      // If logged-in (not guest), update the guest-status block to show username + logout
      if (isLoggedIn) {
        const name = storedUser.username || storedUser.name || 'User';
        const text = guestStatus.querySelector('.guest-status-text');
        if (text) {
          // Avoid innerHTML for safety
          text.textContent = `Logged in as ${name}`;
        }
        const logoutBtn = guestStatus.querySelector('#guest-logout-btn');
        if (logoutBtn) logoutBtn.textContent = 'Log out';
      }
    } else {
      if (guestStatus) guestStatus.style.display = 'none';
      if (loginDescription) loginDescription.style.display = 'block';
      if (popupGuestLogin) popupGuestLogin.style.display = 'flex';
    }
  }

  // ============================================
  // ACCOUNT PANEL (when logged in)
  // ============================================
  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser') || 'null');
    } catch {
      return null;
    }
  }

  function saveStoredUser(user) {
    localStorage.setItem('loggedInUser', JSON.stringify(user));
    sessionStorage.setItem('loggedInUser', JSON.stringify(user));
  }

  function ensureAccountPanel() {
    const registrationSection = document.querySelector('.registration-section');
    if (!registrationSection) return null;

    let panel = document.getElementById('popup-account-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'popup-account-panel';
    panel.className = 'login-account-panel';
    panel.setAttribute('hidden', 'true');
    panel.innerHTML = `
      <h2 class="login-section-title">Account Details</h2>
      <div class="account-field">
        <div class="account-field__label">Who's your Main?</div>
        <div class="account-field__row">
          <div class="account-hero-preview">
            <img id="account-main-hero-img" src="Images/Rival.png" alt="Main hero" />
            <div class="account-hero-preview__meta">
              <div id="account-main-hero-name" class="account-hero-preview__name">Not set</div>
            </div>
          </div>
          <button type="button" class="account-action-btn" id="account-select-main-btn">Select</button>
        </div>
      </div>

      <div class="account-field">
        <div class="account-field__label">Rank</div>
        <select id="account-rank-select" class="account-select">
          <option value="Plastic">Plastic</option>
          <option value="Bronze">Bronze</option>
          <option value="Silver">Silver</option>
          <option value="Gold">Gold</option>
          <option value="Platinum">Platinum</option>
          <option value="Diamond">Diamond</option>
          <option value="Grandmaster">Grandmaster</option>
          <option value="Celestial">Celestial</option>
          <option value="Eternity">Eternity</option>
        </select>
      </div>

      <div class="account-field">
        <div class="account-field__label">Winrate</div>
        <div class="account-field__row">
          <div id="account-winrate-value" class="account-winrate">0%</div>
          <button type="button" class="account-action-btn" id="account-randomize-winrate-btn">Randomize</button>
        </div>
      </div>

      <div class="account-actions">
        <button type="button" class="login-submit-btn" id="account-save-btn">Save Profile</button>
      </div>
    `;

    registrationSection.appendChild(panel);
    return panel;
  }

  function ensureHeroPickerModal() {
    let modal = document.getElementById('hero-picker-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'hero-picker-modal';
    modal.className = 'hero-picker-modal';
    modal.setAttribute('hidden', 'true');
    modal.innerHTML = `
      <div class="hero-picker-backdrop" data-hero-picker-close></div>
      <div class="hero-picker-panel" role="dialog" aria-modal="true" aria-label="Select your main hero">
        <div class="hero-picker-header">
          <div class="hero-picker-title">Select Your Main</div>
          <button class="hero-picker-close" type="button" aria-label="Close" data-hero-picker-close>&times;</button>
        </div>
        <div class="hero-picker-grid" id="hero-picker-grid"></div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      const close = e.target.closest('[data-hero-picker-close]');
      if (close) {
        modal.setAttribute('hidden', 'true');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        modal.setAttribute('hidden', 'true');
      }
    });

    return modal;
  }

  function ensureBioPanel() {
    const rightContent = document.querySelector('.login-section.login-right-section .login-right-content');
    if (!rightContent) return null;

    let panel = document.getElementById('account-bio-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'account-bio-panel';
    panel.className = 'account-bio-panel';
    panel.setAttribute('hidden', 'true');
    panel.innerHTML = `
      <div class="account-bio-title">Bio</div>
      <textarea id="account-bio-input" class="account-bio-textarea" rows="6" maxlength="220" placeholder="Add a short bio about yourself..."></textarea>
      <div class="account-bio-meta">
        <span id="account-bio-status" class="account-bio-status">Saved</span>
        <span id="account-bio-count" class="account-bio-count">0 / 220</span>
      </div>
    `;

    rightContent.appendChild(panel);
    return panel;
  }

  // Save profile to MongoDB (non-blocking, localStorage is primary)
  async function persistUserProfile(user) {
    if (!user?.id || user.id.toString().startsWith('guest_')) return;
    try {
      await fetch(`/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          favoriteCharacter: user.favoriteCharacter,
          mainHeroId: user.mainHeroId,
          rank: user.rank,
          winrate: user.winrate,
          avatar: user.avatar,
          bio: user.bio
        })
      });
    } catch (e) {
      console.warn('Profile save failed, staying local', e);
    }
  }

  function renderAccountPanelState() {
    const user = getStoredUser();
    const isLoggedIn = !!user && user.isGuest === false;

    const registrationForm = document.getElementById('popup-registrationForm');
    const registrationTitle = document.querySelector('.registration-section .login-section-title');
    const switchAuth = document.querySelector('.login-switch-auth');
    const accountPanel = ensureAccountPanel();

    if (switchAuth) switchAuth.style.display = isLoggedIn ? 'none' : '';
    if (registrationForm) registrationForm.style.display = isLoggedIn ? 'none' : '';
    if (registrationTitle) registrationTitle.style.display = isLoggedIn ? 'none' : '';

    if (accountPanel) {
      if (isLoggedIn) accountPanel.removeAttribute('hidden');
      else accountPanel.setAttribute('hidden', 'true');
    }

    // Right side: hide guest CTA when logged in; show "Logged in as ..."
    const loginDescription = document.getElementById('login-description');
    const popupGuestLogin = document.getElementById('popup-guestLogin');
    const expandContent = document.getElementById('popup-expandContent');
    const expandBtn = document.getElementById('popup-expandLink');
    const expandableSection = document.querySelector('.login-expandable-section');
    const loginRightSection = document.querySelector('.login-section.login-right-section');
    const bioPanel = ensureBioPanel();

    if (isLoggedIn) {
      if (popupGuestLogin) popupGuestLogin.style.display = 'none';
      if (loginDescription) loginDescription.textContent = `Logged in as ${user.username || user.name || 'User'}`;
      if (expandableSection) expandableSection.style.display = 'none';
      if (expandContent) expandContent.hidden = true;
      if (expandBtn) expandBtn.setAttribute('aria-expanded', 'false');
    } else {
      // Default handled by checkGuestStatus()
      if (expandableSection) expandableSection.style.display = '';
    }

    // Populate fields if logged in
    if (isLoggedIn && accountPanel) {
      const img = document.getElementById('account-main-hero-img');
      const nameEl = document.getElementById('account-main-hero-name');
      const rankSelect = document.getElementById('account-rank-select');
      const winrateEl = document.getElementById('account-winrate-value');

      if (img) img.src = user.avatar || 'Images/Rival.png';
      if (nameEl) nameEl.textContent = user.favoriteCharacter || 'Not set';
      if (rankSelect) rankSelect.value = user.rank || 'Unranked';
      if (winrateEl) winrateEl.textContent = `${Number(user.winrate || 0)}%`;

      // Set hero background on right panel
      if (loginRightSection) {
        const catalog = Array.isArray(window.RIVALS_HERO_CATALOG) ? window.RIVALS_HERO_CATALOG : [];
        const hero = catalog.find(h => h.id === user.mainHeroId) || catalog.find(h => h.name === user.favoriteCharacter);
        const bg = hero?.backgroundImage || user.avatar || 'Images/Rival.png';
        loginRightSection.style.setProperty('--login-right-bg', `url('${bg}')`);
      }

      // Bio panel on right side
      if (bioPanel) {
        bioPanel.removeAttribute('hidden');
        const bioInput = document.getElementById('account-bio-input');
        const count = document.getElementById('account-bio-count');
        const status = document.getElementById('account-bio-status');
        if (bioInput) {
          // Avoid stomping cursor while typing
          if (document.activeElement !== bioInput) {
            bioInput.value = user.bio || '';
          }
        }
        if (count) {
          const len = (user.bio || '').length;
          count.textContent = `${len} / 220`;
        }
        if (status) status.textContent = 'Saved';
      }
    } else {
      if (bioPanel) bioPanel.setAttribute('hidden', 'true');
    }
  }

  function wireAccountPanelHandlers() {
    const selectBtn = document.getElementById('account-select-main-btn');
    const saveBtn = document.getElementById('account-save-btn');
    const randomBtn = document.getElementById('account-randomize-winrate-btn');
    const rankSelect = document.getElementById('account-rank-select');
    const bioPanel = ensureBioPanel();

    if (rankSelect) {
      rankSelect.addEventListener('change', () => {
        const user = getStoredUser();
        if (!user || user.isGuest) return;
        user.rank = rankSelect.value;
        saveStoredUser(user);
        renderAccountPanelState();
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user } }));
        // Auto-save so it persists after logout/login
        persistUserProfile(user);
      });
    }

    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        const user = getStoredUser();
        if (!user || user.isGuest) return;
        user.winrate = Math.floor(Math.random() * 101);
        saveStoredUser(user);
        renderAccountPanelState();
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user } }));
        // Auto-save so it persists after logout/login
        persistUserProfile(user);
      });
    }

    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        const user = getStoredUser();
        if (!user || user.isGuest) return;

        const modal = ensureHeroPickerModal();
        const grid = modal.querySelector('#hero-picker-grid');
        const catalog = Array.isArray(window.RIVALS_HERO_CATALOG) ? window.RIVALS_HERO_CATALOG : [];

        if (grid) {
          grid.innerHTML = catalog.map(hero => `
            <button type="button" class="hero-picker-card" data-hero-id="${hero.id}">
              <img src="${hero.card}" alt="${hero.name}" loading="lazy" />
              <div class="hero-picker-name">${hero.name}</div>
            </button>
          `).join('');

          grid.querySelectorAll('.hero-picker-card').forEach(btn => {
            btn.addEventListener('click', () => {
              const heroId = btn.getAttribute('data-hero-id');
              const hero = catalog.find(h => h.id === heroId);
              if (!hero) return;
              user.mainHeroId = hero.id;
              user.favoriteCharacter = hero.name;
              user.avatar = hero.card;
              saveStoredUser(user);
              renderAccountPanelState();
              window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user } }));
              // Auto-save so it persists after logout/login
              persistUserProfile(user);
              modal.setAttribute('hidden', 'true');
            });
          });
        }

        modal.removeAttribute('hidden');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const user = getStoredUser();
        if (!user || user.isGuest) return;
        await persistUserProfile(user);
        alert('✅ Profile saved!');
      });
    }

    // Bio saves after typing stops (debounced)
    if (bioPanel) {
      const bioInput = document.getElementById('account-bio-input');
      const count = document.getElementById('account-bio-count');
      const status = document.getElementById('account-bio-status');

      let bioTimer = null;
      if (bioInput) {
        bioInput.addEventListener('input', () => {
          const user = getStoredUser();
          if (!user || user.isGuest) return;

          user.bio = bioInput.value || '';
          saveStoredUser(user);
          if (count) count.textContent = `${user.bio.length} / 220`;
          if (status) status.textContent = 'Saving...';
          window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user } }));

          if (bioTimer) window.clearTimeout(bioTimer);
          bioTimer = window.setTimeout(async () => {
            await persistUserProfile(user);
            if (status) status.textContent = 'Saved';
          }, 500);
        });
      }
    }
  }

  // ============================================
  // GUEST LOGIN
  // ============================================
  const popupGuestLogin = document.getElementById('popup-guestLogin');
  if (popupGuestLogin) {
    popupGuestLogin.addEventListener('click', async () => {
      // Guest user - works offline, no DB needed
      const guestUser = {
        name: 'Guest User',
        email: `guest_${Date.now()}@anonymous.local`,
        id: `guest_${Date.now()}`,
        isGuest: true
      };
      
      sessionStorage.setItem('guestUser', JSON.stringify(guestUser));
      sessionStorage.setItem('isGuest', 'true');
      localStorage.setItem('isGuest', 'true');
      localStorage.setItem('guestUser', JSON.stringify(guestUser));
      
      // Clear any existing login
      localStorage.removeItem('loggedInUser');
      sessionStorage.removeItem('loggedInUser');
      
      window.dispatchEvent(new CustomEvent('userLoggedOut'));
      checkGuestStatus();
      
      alert('Logged in as Guest! Welcome to Rival!');
      
      // Refresh community page if on it
      setTimeout(() => {
        if (window.location.pathname.includes('Community.html')) {
          window.location.reload();
        }
      }, 500);
      
      // Try to save guest to server (optional, non-blocking)
      try {
        const response = await fetch('/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: guestUser.name,
            email: guestUser.email,
            password: null
          })
        });
      } catch (error) {
        console.log('Guest saved locally (server offline)');
      }
    });
  }

  // Logout button (works for guest and registered users)
  const guestLogoutBtn = document.getElementById('guest-logout-btn');
  if (guestLogoutBtn) {
    guestLogoutBtn.addEventListener('click', () => {
      const user = getStoredUser();
      const isLoggedIn = !!user && user.isGuest === false;

      // Clear all session data
      localStorage.removeItem('isGuest');
      sessionStorage.removeItem('isGuest');
      localStorage.removeItem('guestUser');
      sessionStorage.removeItem('guestUser');
      localStorage.removeItem('loggedInUser');
      sessionStorage.removeItem('loggedInUser');
      
      window.dispatchEvent(new CustomEvent('userLoggedOut'));
      checkGuestStatus();
      renderAccountPanelState();
      
      alert(isLoggedIn ? 'Logged out' : 'Logged out as Guest');
      
      setTimeout(() => {
        if (window.location.pathname.includes('Community.html')) {
          window.location.reload();
        }
      }, 500);
    });
  }

  // Init auth state on page load
  checkGuestStatus();
  ensureAccountPanel();
  renderAccountPanelState();
  wireAccountPanelHandlers();

  // ============================================
  // SCROLL ANIMATIONS
  // ============================================
  const revealables = Array.from(document.querySelectorAll('[data-reveal]'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.18 });
    revealables.forEach(el => io.observe(el));
  } else {
    revealables.forEach(el => el.classList.add('revealed'));
  }

  // Parallax effect on orbs + lightning (respects reduced motion)
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));
  const heroSection = document.querySelector('.hero');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mouseX = 0, mouseY = 0;
  
  function applyParallax() {
    if (!parallaxEls.length) return;
    const scrollY = window.scrollY || window.pageYOffset;
    parallaxEls.forEach(el => {
      const depth = Number(el.getAttribute('data-depth') || '0.05');
      const x = (mouseX - window.innerWidth / 2) * depth * 0.04;
      const y = (mouseY - window.innerHeight / 2) * depth * 0.04 + scrollY * depth * 0.4;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }
  
  function updateLightningEffect(e) {
    if (heroSection) {
      const rect = heroSection.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      heroSection.style.setProperty('--mouse-x', x + '%');
      heroSection.style.setProperty('--mouse-y', y + '%');
    }
  }
  
  if (!prefersReduced) {
    window.addEventListener('mousemove', (e) => { 
      mouseX = e.clientX; 
      mouseY = e.clientY; 
      applyParallax();
      updateLightningEffect(e);
    }, { passive: true });
    window.addEventListener('scroll', applyParallax, { passive: true });
    applyParallax();
  }

  // Magnetic button hover effect
  function makeMagnetic(el) {
    const rect = () => el.getBoundingClientRect();
    function onMove(e) {
      const r = rect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.08}px, ${dy * 0.08}px)`;
      el.style.boxShadow = `0 10px 24px rgba(233,61,84,0.35)`;
      const shine = el.querySelector('.shine');
      if (shine) {
        const mx = ((e.clientX - r.left) / r.width) * 100 + '%';
        const my = ((e.clientY - r.top) / r.height) * 100 + '%';
        shine.style.setProperty('--mx', mx);
        shine.style.setProperty('--my', my);
      }
    }
    function onLeave() {
      el.style.transform = 'translate(0, 0)';
      el.style.boxShadow = '';
    }
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
  }
  document.querySelectorAll('[data-magnetic]').forEach(makeMagnetic);

  // 3D tilt on card hover
  function makeTilt(el) {
    const strength = 10;
    const reset = () => {
      el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)';
    };
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const rx = (-py * strength).toFixed(2);
      const ry = (px * strength).toFixed(2);
      el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      el.style.setProperty('--mx', (px * 100 + 50) + '%');
      el.style.setProperty('--my', (py * 100 + 50) + '%');
    });
    el.addEventListener('mouseleave', reset);
    reset();
  }
  if (!prefersReduced) {
    document.querySelectorAll('[data-tilt]').forEach(makeTilt);
  }

  // ============================================
  // MAPS CAROUSEL
  // ============================================
  const mapsCarousel = document.getElementById('maps-carousel');
  const carouselTrack = document.getElementById('carousel-track');
  const carouselContainer = mapsCarousel?.querySelector('.carousel-container');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dots = document.querySelectorAll('.carousel-dot');
  const slides = document.querySelectorAll('.carousel-slide');
  
  if (mapsCarousel && carouselTrack && slides.length > 0) {
    let currentSlide = 0;
    let autoPlayInterval = null;
    const autoPlayDelay = 5000; // 5 seconds
    
    function updateCarousel(index) {
      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
      
      carouselTrack.style.transform = `translateX(-${index * 100}%)`;
      currentSlide = index;
    }
    
    function nextSlide() {
      const next = (currentSlide + 1) % slides.length;
      updateCarousel(next);
    }
    
    function prevSlide() {
      const prev = (currentSlide - 1 + slides.length) % slides.length;
      updateCarousel(prev);
    }
    
    function startAutoPlay() {
      stopAutoPlay();
      autoPlayInterval = setInterval(nextSlide, autoPlayDelay);
      if (carouselContainer) {
        carouselContainer.classList.remove('paused');
      }
    }
    
    function stopAutoPlay() {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
      if (carouselContainer) {
        carouselContainer.classList.add('paused');
      }
    }
    
    // Carousel controls
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        startAutoPlay();
      });
    }
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        startAutoPlay();
      });
    }
    
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        updateCarousel(index);
        startAutoPlay();
      });
    });
    
    // Pause on hover, resume on leave
    if (carouselContainer) {
      carouselContainer.addEventListener('mouseenter', stopAutoPlay);
      carouselContainer.addEventListener('mouseleave', startAutoPlay);
    }
    
    // Arrow keys navigate carousel
    document.addEventListener('keydown', (e) => {
      if (mapsCarousel && !mapsCarousel.hasAttribute('hidden')) {
        if (e.key === 'ArrowLeft') {
          prevSlide();
          startAutoPlay();
        } else if (e.key === 'ArrowRight') {
          nextSlide();
          startAutoPlay();
        }
      }
    });
    
    startAutoPlay();
    updateCarousel(0);
  }
  

  // Focus rings only show when tabbing (not clicking)
  function handleFirstTab(e) {
    if (e.key === 'Tab') {
      root.classList.add('user-tabbing');
      window.removeEventListener('keydown', handleFirstTab);
      window.addEventListener('mousedown', handleMouseDownOnce);
    }
  }
  function handleMouseDownOnce() {
    root.classList.remove('user-tabbing');
    window.removeEventListener('mousedown', handleMouseDownOnce);
    window.addEventListener('keydown', handleFirstTab);
  }
  window.addEventListener('keydown', handleFirstTab);

  // Inject keyboard-only focus style
  const style = document.createElement('style');
  style.textContent = `.user-tabbing :focus { outline: 2px solid ${getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#e93d54'} !important; outline-offset: 2px; }`;
  document.head.appendChild(style);

  // Social links sidebar
  (function injectSocialSidebar(){
    if (document.querySelector('.social-sidebar')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'social-sidebar';
    wrapper.innerHTML = `
      <a href="https://www.facebook.com/marvelrivals" target="_blank" rel="noopener" aria-label="Facebook">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.9v-7h-2.3V12h2.3V9.8c0-2.27 1.35-3.53 3.43-3.53.99 0 2.03.18 2.03.18v2.22h-1.14c-1.12 0-1.47.69-1.47 1.4V12h2.5l-.4 2.9h-2.1v7A10 10 0 0 0 22 12z"/></svg>
      </a>
      <a href="https://www.instagram.com/marvelrivals/?hl=en" target="_blank" rel="noopener" aria-label="Instagram">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.2A2.8 2.8 0 1 0 12 16.8 2.8 2.8 0 0 0 12 9.2zM17.5 6.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg>
      </a>
      <a href="https://x.com/MarvelRivals" target="_blank" rel="noopener" aria-label="X">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 3h3.7l5.1 7 5.5-7H21l-7.3 9.3L21 21h-3.7l-5.5-7.6L6 21H3l7.8-9.9L3 3z"/></svg>
      </a>
      <a href="https://www.youtube.com/@MarvelRivals" target="_blank" rel="noopener" aria-label="YouTube">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.7 4.5 12 4.5 12 4.5s-5.7 0-7.5.6A3 3 0 0 0 2.4 7.2C1.8 9 1.8 12 1.8 12s0 3 .6 4.8a3 3 0 0 0 2.1 2.1c1.8.6 7.5.6 7.5.6s5.7 0 7.5-.6a3 3 0 0 0 2.1-2.1c.6-1.8.6-4.8.6-4.8s0-3-.6-4.8zM10 15.3V8.7l6 3.3-6 3.3z"/></svg>
      </a>
      <a href="https://discord.gg/marvelrivals" target="_blank" rel="noopener" aria-label="Discord">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25A19.74 19.74 0 0 0 3.677 4.37C.533 9.046-.32 13.58.099 18.057a19.9 19.9 0 0 0 5.993 3.03c.462-.63.874-1.295 1.226-1.994a12.9 12.9 0 0 1-1.872-.892 10.2 10.2 0 0 0 .372-.292c3.928 1.793 8.18 1.793 12.062 0 .12.098.246.198.373.292-.56.324-1.2.635-1.873.892.36.698.772 1.362 1.225 1.993a19.84 19.84 0 0 0 6.002-3.03c.5-5.177-.838-9.674-3.549-13.66z"/></svg>
      </a>
    `;
    document.body.appendChild(wrapper);
  })();

  // Cookie banner (shows once per session)
  (function cookieBanner(){
    if (sessionStorage.getItem('cookieBannerSeen')) return;
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <div class="cookie-head">
        <h4 class="cookie-title">We Got Cookies... Want Some?</h4>
        <button class="cookie-btn" data-action="close" aria-label="Close">×</button>
      </div>
      <p>A cookie is a dessert food with different toppings, like chocolate chips, raisins, and many more. So the dev finished this site thanks to some delicious cookies! </p>
      <div class="cookie-actions">
        <button class="cookie-btn" data-action="deny">I Dislike Cookies</button>
        <button class="cookie-btn primary" data-action="accept">I Eat Cookies</button>
      </div>
    `;
    document.body.appendChild(banner);
    
    // Show after 10s
    setTimeout(() => {
      banner.classList.add('cookie-banner--visible');
    }, 10000);
    
    const done = () => {
      sessionStorage.setItem('cookieBannerSeen', '1');
      banner.classList.add('cookie-banner--fade-out');
      setTimeout(() => { banner.remove(); }, 400);
    };
    
    banner.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      done();
    });
  })();

  // ============================================
  // HERO PAGE: roster, filters, search, modal
  // ============================================
  (function initHeroPage(){
    const heroPage = document.querySelector('.hero-page');

    const roleLabels = {
      vanguard: 'Vanguard',
      duelist: 'Duelist',
      strategist: 'Strategist'
    };

    const attackTypeTemplates = {
      vanguard: 'Melee Heroes',
      duelist: 'Burst Duelists',
      strategist: 'Support Strategists'
    };

    const healthTemplates = {
      vanguard: '275',
      duelist: '250',
      strategist: '240'
    };

    const difficultyTemplates = {
      vanguard: '★★★☆☆',
      duelist: '★★★★☆',
      strategist: '★★★☆☆'
    };

    const defaultAbilityLayout = [
      { slot: 'LMB', type: 'Primary' },
      { slot: 'E', type: 'Skill' },
      { slot: 'Q', type: 'Ultimate' },
      { slot: 'RMB', type: 'Secondary' }
    ];

    const abilityTemplates = {
      vanguard: [
        { name: 'Skill 1', description: 'That does this...!' },
        { name: 'Skill 2', description: 'This does that...?' },
        { name: 'Ultimate', description: 'This is your wasted ult.' }
      ],
      duelist: [
        { name: 'Skill 1', description: 'That does this...!' },
        { name: 'Skill 2', description: 'This does that...?' },
        { name: 'Ultimate', description: 'This is your wasted ult.' }
      ],
      strategist: [
        { name: 'Skill 1', description: 'That does this...!' },
        { name: 'Skill 2', description: 'This does that...?' },
        { name: 'Ultimate', description: 'This is your wasted ult.' }
      ]
    };

    const statTemplates = {
      vanguard: [
        { label: 'Title', value: 'Hero' },
        { label: 'Attack Type', value: 'Very High' },
        { label: 'Mobility', value: 'Medium' },
        { label: 'Passive', value: 'Team Shields' }
      ],
      duelist: [
        { label: 'Title', value: 'Hero' },
        { label: 'Attack Type', value: 'Explosive' },
        { label: 'Mobility', value: 'High' },
        { label: 'Passive', value: 'Low' }
      ],
      strategist: [
        { label: 'Title', value: 'Hero' },
        { label: 'Attack Type', value: 'Zone Denial' },
        { label: 'Support', value: 'High' },
        { label: 'Passive', value: 'Command Grid' }
      ]
    };

    const vanguardHeroes = [
      {
        id: 'angela',
        category: 'vanguard',
        name: 'Angela',
        tagline: 'Muscle Mommy of the Multiverse',
        summary: 'The mosquito that buzz and pokes you or jabs you out of the map boundaries.',
        lore: 'As the Hand of Heven, the warrior called Angela embodies unwavering courage and determination. Able to manipulate Ichors into various weapons and unfurl her wings to soar across the battlefield, she is ready to deliver divine judgment upon her foes!',
        portrait: 'Images/AngelaStory.png',
        background: 'Images/AngelaSilhouette.png',
        card: 'Images/Angela.png',
        accent: '#ff9cd6',
        realName: 'Aldrif Odinsdottir',
        attackType: 'Melee Heroes',
        health: '450',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Odinsons, Guardians of the Galaxy' },
          { label: 'Mobility', value: 'Flight/Ground' },
          { label: 'Passive', value: 'Wingblade Ascent' }
        ],
        abilities: [
          { name: 'Shielded Stance', description: 'Transform Ichors into a shield, gaining Attack Charge when absorbing damage.' },
          { name: 'Assassins Charge', description: 'Enter an accelerated dash state. Enemies struck head-on are carried through the air for a short distance.' },
          { name: 'Divine Judgement', description: 'Dive downward to create a Divine Judgement Zone upon impact.' },
          { name: 'Ultimate: Hevens Retribution', description: 'Upon impact, the ribbons bind nearby enemies. Angela can leap to the spears location, damaging surrounding enemies and creating a Divine Judgement Zone.' }
        ]
      },
      {
        id: 'captain-america',
        category: 'vanguard',
        name: 'Captain America',
        tagline: 'Mr. I Can Do This All Day',
        summary: 'He really can do this all day... He hates cloak users.',
        lore: 'Enhanced by the Super-Soldier Serum, Steven "Steve" Rogers uses his Vibranium shield and extensive combat training to confront any threat to justice. When Captain America rallies his troops, a wave of courage sweeps across the battlefield!',
        portrait: 'Images/AmericaStory.png',
        background: 'Images/AmericaSilhouette.png',
        card: 'Images/America.png',
        accent: '#4287f5',
        realName: 'Steve Rogers',
        attackType: 'Melee Heroes',
        health: '575',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Alot of Mobility' },
          { label: 'Passive', value: 'Captains Spirit' }
        ],
        abilities: [
          { name: 'Living Legend', description: 'Raise the shield to deflect incoming Projectiles, sending them ricocheting in random directions.' },
          { name: 'Vibranium Energy Saw', description: 'Hurl the energy-charged shield to strike enemies in a path.' },
          { name: 'Ultimate: Freedom Charge', description: 'Shield held high, carve a path forward, granting both himself and allies along the path continuous Bonus Health and Movement Boosts.' }
        ]
      },
      {
        id: 'venom',
        category: 'vanguard',
        name: 'Venom',
        tagline: 'The 19- Dark Symbiote',
        summary: 'Loves going for the snow bunny healers and is the living Mahoraga to tank all those damages.',
        lore: 'Using his symbiote-enhanced body as the perfect living weapon, Eddie Brock and his alien ally stand ever-ready to unleash vicious attacks upon anyone he deems an enemy. Those ensnared by Venoms tentacles have no choice but to surrender to this insatiable predator.',
        portrait: 'Images/VenomStory.png',
        background: 'Images/VenomSilhouette.png',
        card: 'Images/Venom.png',
        accent: '#38403f',
        realName: 'Eddie Brock',
        attackType: 'Melee Heroes',
        health: '650',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Swing' },
          { label: 'Passive', value: 'Alien Biology' }
        ],
        abilities: [
          { name: 'Symbiotic Resilience', description: 'The lower Venoms Health, the greater the Bonus Health generated.' },
          { name: 'Frenzied Arrival', description: 'Dash to the target location from a certain height and launch them Up towards the landing point.' },
          { name: 'Divine Judgement', description: 'Dive downward to create a Divine Judgement Zone upon impact.' },
          { name: 'Cellular Corrosion', description: 'Unleash tentacles to Slow enemies within reach. Enemies unable to break free in time will suffer damage.' },
          { name: 'Ultimate: Feast Of The Abyss', description: 'Burrow underground for free movement. Devour enemies above to deal damage based on the enemys current health and generate equivalent Bonus Health.' },
        ]
      },
      {
        id: 'thor',
        category: 'vanguard',
        name: 'Thor',
        tagline: 'Need a tank to do alot of damage?',
        summary: '"Where were you? We need tank!" Thor: "I was killing the enemies that were in the way."',
        lore: 'The son of Odin taps into his divine power to call forth thunder and lightning, raining down relentless fury upon his enemies. With his mighty hammer Mjölnir in hand, Thor effortlessly asserts his dominance on the field of combat.',
        portrait: 'Images/ThorStory.png',
        background: 'Images/ThorSilhouette.png',
        card: 'Images/Thor.png',
        accent: '#85ceff',
        realName: 'Thor Odinson',
        attackType: 'Melee Heroes',
        health: '600',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Odinsons, Avengers, Guardians of the Galaxy' },
          { label: 'Mobility', value: 'Charge Ram' },
          { label: 'Passive', value: 'Thorforce' }
        ],
        abilities: [
          { name: 'Hammer Throw', description: 'Throw Mjolnir forward which then returns. Restore Thorforce upon hit.' },
          { name: 'Awakening Rune', description: 'Enter the Awakened state, granting Bonus Health and enhancing Mjölnir Bash. Gain Thorforce upon exiting the state.' },
          { name: 'Lightning Realm', description: 'Summon lightning to restore Thorforce based on the number of hit enemies. Enemies leaving the Lightning Realm will suffer Slow and Grounded effects.' },
          { name: 'Ultimate: God Of Thunder', description: 'Soar upwards and smite the ground after charging for a duration, inflicting damage and stunning enemies within range.' }
        ]
      },
      {
        id: 'thing',
        category: 'vanguard',
        name: 'The Thing',
        tagline: 'Its a thing...',
        summary: 'See well heres the thing about it...',
        lore: 'Benjamin J. Grimm is unquestionably the rock star of any team hes on. Always at the forefront of the fight, the Thing shields his allies with his unbreakable form, selflessly fending off any harm that comes their way.',
        portrait: 'Images/ThingStory.png',
        background: 'Images/ThingSilhouette.png',
        card: 'Images/Thing.png',
        accent: '#ffae00',
        realName: 'Ben Grimm',
        attackType: 'Melee Heroes',
        health: '700',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Fantastic Four' },
          { label: 'Mobility', value: 'Running' },
          { label: 'Passive', value: 'Unyielding Will' }
        ],
        abilities: [
          { name: 'Yancy Street Charge', description: 'Continuously charge forward, launching up enemies and leaving behind a zone at the final position that prevents the use of mobility abilities.' },
          { name: 'Stone Haymaker', description: 'Deliver a devastating Heavy Blow that inflicts additional damage with each strike! Upon hit, gain Bonus Health. ' },
          { name: 'Clobberin Time', description: 'Use immense power to launch all enemies in front of you into the air.' },
        ]
      },
      {
        id: 'peni',
        category: 'vanguard',
        name: 'Peni Parker',
        tagline: 'Potato Miner',
        summary: 'Its protected by the law and lots of ticking web mines',
        lore: 'Peni Parker may be young, but she bravely stands on the frontlines to protect the Web of Life and Destiny. Together, this teen prodigy and her state-of-the-art mech, the sensational SP//dr, make for the most thrilling duo on the battlefield!',
        portrait: 'Images/PeniStory.png',
        background: 'Images/PeniSilhouette.png',
        card: 'Images/Peni.png',
        accent: '#ff1e00',
        realName: 'Peni Parker',
        attackType: 'Projectile Heroes',
        health: '750',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'SpiderVerse' },
          { label: 'Mobility', value: 'Webs' },
          { label: 'Passive', value: 'Wall Crawl' }
        ],
        abilities: [
          { name: 'Bionic Spider-nest', description: 'Generate a Bionic Spider-Nest at a targeted area, periodically spawning Spider-Drones and creating Cyber-Webs.' },
          { name: 'Cyber-web Snare', description: 'Cast futuristic webbing that Immobilizes enemies or creates a Cyber-Web. ' },
          { name: 'Arachno-mine', description: 'Deploy Arachno-Mines that can be concealed within the confines of a Cyber-Web.' },
          { name: 'Spider-sweeper', description: 'Enhance the SP//dr suit, Launching Up enemies in its path and deploying Arachno-Mines, Spider-Drones, and Cyber-Webs repeatedly.' },
        ]
      },
      {
        id: 'magneto',
        category: 'vanguard',
        name: 'Magneto',
        tagline: 'Best Tanker in the game',
        summary: 'Its a magnet...',
        lore: 'The Master of Magnetism bends even the strongest metal to his whims, shielding his allies and striking at his foes. Whether he calls himself Max Eisenhardt, Erik Lehnsherr, or simply Magneto, the hardships this warrior has endured have made him as unbreakable as the steel he brandishes.',
        portrait: 'Images/MagnetoStory.png',
        background: 'Images/MagnetoSilhouette.png',
        card: 'Images/Magneto.png',
        accent: '#7b0aa1',
        realName: 'Max Eisenhardt',
        attackType: 'Projectile Heroes',
        health: '650',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-Men' },
          { label: 'Mobility', value: 'Air Decend' },
          { label: 'Passive', value: 'Ace Greatswords Fired' }
        ],
        abilities: [
          { name: 'Metallic Curtain', description: 'Change the magnetic field around to form a metallic curtain, blocking all incoming Projectiles.' },
          { name: 'Metal Bulwark', description: 'Conjure a metal shield around a chosen ally. Damage taken will transform into rings on Magnetos back.' },
          { name: 'Ultimate: Meteor M', description: 'Draw in all materials around to forge an iron meteor that deals massive damage upon impact. Absorbing enemy Projectiles can enhance the meteors power, yet overloading will cause it to self-destruct.' },
        ]
      },
      {
        id: 'hulk',
        category: 'vanguard',
        name: 'Hulk',
        tagline: 'Green Goliath',
        summary: 'Green big boi with lots of health and damage to spare and is target lock to Jeff',
        lore: 'Brilliant scientist Dr. Bruce Banner has finally found a way to coexist with his monstrous alter ego, the Hulk. By accumulating gamma energy over transformations, he can become a wise and strong Hero Hulk or a fierce and destructive Monster Hulk',
        portrait: 'Images/HulkStory.png',
        background: 'Images/HulkSilhouette.png',
        card: 'Images/Hulk.png',
        accent: '#04ff00',
        realName: 'Bruce Banner',
        attackType: 'Melee Heroes',
        health: '200 (Human Form) \n 650 (Hero Hulk Form) \n 1400 (Monster Hulk Form)',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Jump...Smash' },
          { label: 'Passive', value: 'Puny Banner' }
        ],
        abilities: [
          { name: 'Gamma Grenade', description: 'Launch a Gamma Grenade to inflict damage and Launch Up enemies.' },
          { name: 'Radioactive Lockdown', description: 'Emit gamma energy to render enemies immobilized and immune to all ability effects.' },
          { name: 'Incredible Leap', description: 'THold to perform a charged leap that allows Hero Hulk to Knock Down flying enemies.' },
          { name: 'Indestructible Guard', description: 'Generate gamma shields for Hero Hulk and nearby allies, absorbing and converting damage into energy for HULK SMASH!' },
          { name: 'Hulk Smash', description: 'Unleash stored gamma energy, transforming from Hero Hulk into Monster Hulk for a limited time period.' },
          { name: 'Ultimate: World Breaker', description: 'Gets loki treatment.' },
        ]
      },
      {
        id: 'groot',
        category: 'vanguard',
        name: 'Groot',
        tagline: 'Average Fornite Players',
        summary: 'I. Am. Groot.',
        lore: 'A flora colossus from Planet X, the alien known as Groot exhibits enhanced vitality and the ability to manipulate all forms of vegetation. As sturdy as a towering tree, Groot forges his own way, serving as the teams silent but reliable pathfinder.',
        portrait: 'Images/GrootStory.png',
        background: 'Images/GrootSilhouette.png',
        card: 'Images/Groot.png',
        accent: '#009118',
        realName: 'Groot',
        attackType: 'Melee Heroes',
        health: '700',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Guardians of the Galaxy' },
          { label: 'Mobility', value: 'Walking' },
          { label: 'Passive', value: 'Flora Colossus' }
        ],
        abilities: [
          { name: 'Thornlash Wall', description: 'Im Groot..' },
          { name: 'Ironwood Wall', description: 'I am Groot?' },
          { name: 'Spore Bomb', description: 'Im GRROOOT!' },
          { name: 'Ultimate: Strangling Prison', description: 'I. AM. GROOOT!' },
        ]
      },
      {
        id: 'emma-frost',
        category: 'vanguard',
        name: 'Emma Frost',
        tagline: 'Mommy Queen Of Gooners',
        summary: 'The White Queen is a powerful telepath and shapeshifter who is the leader of the X-Men.',
        lore: 'For Emma Frost, war is the purest form of art. With her formidable telepathic abilities, she intricately weaves a deadly mental web that ensnares her foes, while her indestructible diamond form lets her lead her teammates fearlessly into the fray.',
        portrait: 'Images/EmmaStory.png',
        background: 'Images/EmmaSilhouette.png',
        card: 'Images/Emma.png',
        accent: '#6efffa',
        realName: 'Emma Frost',
        attackType: 'Hitscan Heroes',
        health: '550',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-Men' },
          { label: 'Mobility', value: 'Walking' },
          { label: 'Passive', value: 'Diamond Form' }
        ],
        abilities: [
          { name: 'Minds Aegis', description: 'Create a levitating barrier at the designated location.' },
          { name: 'Crystal Kick', description: 'In Diamond Form, unleash a flying kick forward and knock back enemies; extra damage is dealt if theyre propelled into a wall.' },
          { name: 'Carbon Crush', description: 'In Diamond Form, lunge forward to grab an enemy, then execute a back slam to inflict damage.' },
          { name: 'Ultimate: Psionic Seduction', description: 'Project a forward psychic assault that stuns foes and prevents them from unleashing their Ultimate Abilities; if the effect lingers, it gradually commandeers their mind, forcing them to move toward Emma Frost.' },
        ]
      },
      {
        id: 'doctor-strange',
        category: 'vanguard',
        name: 'Doctor Strange',
        tagline: 'Im Opening a Portal to your heart,Type Shift',
        summary: 'BY THE POWER OF GREYSKUL- wait wrong spell, ABRACADABRA!',
        lore: 'As the Sorcerer Supreme, Dr. Stephen Strange gracefully wields ancient spells to turn the tide of even the most impossible battle. However, magic always comes at a cost, and each use of his arcane abilities gradually awakens the darkness within him.',
        portrait: 'Images/StrangeStory.png',
        background: 'Images/StrangeSilhouette.png',
        card: 'Images/Doctor.png',
        accent: '#ff4800',
        realName: 'Doctor Strange',
        attackType: 'Projectile Heroes',
        health: '575',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Walking' },
          { label: 'Passive', value: 'Price Of Magic' }
        ],
        abilities: [
          { name: 'Shield Of The Seraphim', description: 'Create a protective barrier against damage.' },
          { name: 'Maelstrom Of Madness', description: 'Release Dark Magic to deal damage to nearby enemies.' },
          { name: 'Pentagram Of Farallah', description: 'Open portals between two locations, enabling all units to travel through them.' },
          { name: 'Cloak Of Levitation', description: 'Ascend and then enter a brief state of sustained flight.' },
          { name: 'Ultimate: Eye Of Agamotto', description: 'Separate nearby enemies\' Souls from their bodies. Damage dealt to these Souls is transferred to their physical bodies.' }
        ]
      },
    ];

    const duelistHeroes = [
      {
        id: 'black-panther',
        category: 'duelist',
        name: 'Black Panther',
        tagline: '2Fast4You',
        summary: 'Now you saw me, now your back to spawn screen. Mreoww~',
        lore: 'TChalla, King of Wakanda, wields the perfect blend of the cutting-edge Vibranium technology and ancestral power drawn from the Panther God, Bast. The Black Panther bides his time until elegantly infiltrating enemy lines and commencing his hunt.',
        portrait: 'Images/BPStory.png',
        background: 'Images/BPSilhouette.png',
        card: 'Images/BP.png',
        accent: '#560c63',
        realName: "T'Challa",
        health: '275',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers, Illuminati' },
          { label: 'Mobility', value: 'Dashes' },
          { label: 'Passive', value: 'Panthers Cunning' } ],
        abilities: [
          { name: 'Spear Toss', description: 'Toss a Vibranium energy spear forward and attach a Vibranium Mark to enemies in its radius.' },
          { name: 'Spirit Rend', description: 'Lunge forward and deal damage to enemies. Vibranium Mark produces Bonus Health and refreshes the ability.' },
          { name: 'Spinning Kick', description: 'Spiral forward and attach a Vibranium Mark to hit enemies.' },
          { name: 'Ultimate: Basts Descent', description: 'Summon Bast, pouncing forward, dealing damage and attaching a Vibranium Mark to hit enemies, while refreshing Spirit Rend.' }
        ]
      },
      {
        id: 'blade',
        category: 'duelist',
        name: 'Blade',
        tagline: 'Virgil Reincarnated But In The Hood...',
        summary: 'I am the Night, I am the Blood, I am the Blade.',
        lore: 'Half-human and half-vampire, Eric Brooks walks between worlds, craving the very life force of his enemies. As night falls, Blade\'s hunt begins as he wields the Sword of Dracula to become the nightmare of any foe who dares to bare their fangs.',
        portrait: 'Images/BladeStory.png',
        background: 'Images/BladeSilhouette.png',
        card: 'Images/Blade.png',
        accent: '#910000',
        realName: 'Eric Brooks',
        health: '350',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: 'Midnight-Suns' },
          { label: 'Mobility', value: 'Dash then Beyblade' },
          { label: 'Passive', value: 'Bloodline Awakening' }
        ],
        abilities: [
          { name: 'Daywalker Dash', description: 'Dash forward. If wielding your gun, shoot at enemies upon impact, applying a Healing Reduction effect. If wielding your sword, deliver a cleaving strike that inflicts Slow.' },
          { name: 'Scarlet Shroud', description: 'Parry with Ancestral Sword to become Unstoppable for a brief period, reducing damage taken from the front and decreasing the cooldown of Daywalker Dash.' },
          { name: 'Ultimate: Thousand-fold Slash', description: 'Charge power and swiftly draw the Sword of Dracula, executing a powerful Iaido strike as you dash forward, leaving behind a slashing zone where the sword automatically strikes enemies. Enemies hit suffer Reduced Healing.' },
        ]
      },
      {
        id: 'black-widow',
        category: 'duelist',
        name: 'Black Widow',
        tagline: 'Sniper Spoiler Alert',
        summary: 'Admire me from afar, but dont get too close or youll get a Widow\'s Kiss.',
        lore: 'Natasha Romanova is the world\'s most elite spy in any era. Her mastery of the sniper rifle eliminates targets from afar, while her shock batons neutralize close-range threats. Black Widow is locked, loaded, and ready to deliver a fatal bite!',
        portrait: 'Images/WidowStory.png',
        background: 'Images/WidowSilhouette.png',
        card: 'Images/Widow.png',
        accent: '#a83838',
        realName: 'Natasha Romanoff',
        attackType: 'Hitscan Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Run and Gun' },
          { label: 'Passive', value: 'Infra-detector' }
        ],
        abilities: [
          { name: 'Fleet Foot', description: 'Dash forward and enable a powerful jump.' },
          { name: 'Straight Shooter', description: 'Switch the Red Room Rifle to Sniper mode to fire high-energy rounds.' },
          { name: 'Edge Dancer', description: 'Unleash a spinning kick to Launch Up enemies. Landing the hit will allow her to zip to the target with a grappling hook for a second kick.' },
          { name: 'Ultimate: Electro-plasma Explosion', description: 'Switch the Red Room Rifle to Destruction mode and unleash an electro-plasma blast, damaging enemies within range and inflicting them with Vulnerability.' }
        ]
      },
      {
        id: 'daredevil',
        category: 'duelist',
        name: 'Daredevil',
        tagline: 'I- ... I See You...',
        summary: 'When darkness falls, Daredevil wields his billy clubs in place of a gavel, doling out justice and purging the world of evil!',
        lore: 'A tragic accident transformed Matt Murdock, blinding him, but awakening his incredible Radar Sense. When darkness falls, Daredevil wields his billy clubs in place of a gavel, doling out justice and purging the world of evil!',
        portrait: 'Images/DareStory.png',
        background: 'Images/DaredevilSilhouette.png',
        card: 'Images/Dare.webp',
        accent: '#8f2236',
        realName: 'Matt Murdock',
        health: '300',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Combo Forward' },
          { label: 'Passive', value: 'Radar Sense' }
        ],
        abilities: [
          { name: 'Righteous Cross', description: 'Cross Billy Clubs and surge forward. Gain Fury on hit.' },
          { name: 'Objection!', description: 'Block frontal damage and reflect projectiles, becoming immune to all incoming harm during this stance and gain Fury.' },
          { name: 'Devils Latch', description: 'Fire a grappling line that reels Daredevil and his target toward each other. On completion' },
          { name: 'Ultimate: Let The Devil Out', description: ' Enemies with Daredevil in their line of sight take damage and suffer a ramping Blind effect. Continually gain Fury while active.' }
        ]
      },
      {
        id: 'humantorch',
        category: 'duelist',
        name: 'Human Torch',
        tagline: 'Flying Shotgun Gooner',
        summary: 'Ladies! Ladies! Ya like fire? I can make you hotter!',
        lore: 'The Fantastic Four resident heartthrob, Johnny Storm, adds an intense flare to every battle he fights. Shrouded in roaring flames, the Human Torch always manages to look cool while turning up the heat!',
        portrait: 'Images/TorchStory.png',
        background: 'Images/TorchSilhouette.webp',
        card: 'Images/Torch.webp',
        accent: 'Yellow',
        realName: 'Johnny Storm',
        health: '250',
        attackType: 'Projectile Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Fantastic Four' },
          { label: 'Mobility', value: 'Plasma Body' },
          { label: 'Passive', value: 'Flame Fist' }
        ],
        abilities: [
          { name: 'Blazing Blast', description: 'Launch a fireball to deal damage or create a Flame Field at the targeted area, dealing damage to enemies within.' },
          { name: 'Flaming Meteor', description: 'Dive towards the ground, dealing damage to enemies. This will also detonate any Flame Fields hit and grant you Bonus Health.' },
          { name: 'Pyro-prison', description: 'When 2 or more Flame Fields exist, connect them to form a fire wall that deals one-off high damage to enemies that pass through the wall.' },
          { name: 'Ultimate: Supernova', description: 'Explode with cosmic fire to deal damage to enemies within range and enter Supernova state. While in Supernova state, Blazing Blast will transform into Flame Tornado, and Plasma Body can be activated without any cost.' }
        ]
      },
      {
        id: 'iron-man',
        category: 'duelist',
        name: 'Iron Man',
        tagline: 'Genius, Billionaire, Playboy, Philanthropist.',
        summary: 'Jarvis... Nuke that Family of Four. *Affirmative*',
        lore: 'Armed with superior intellect and a nanotech battlesuit of his own design, Tony Stark stands alongside gods as the Invincible Iron Man. His state of the art armor turns any battlefield into his personal playground, allowing him to steal the spotlight he so desperately desires.',
        portrait: 'Images/IronStory.png',
        background: 'Images/IronSilhouette.webp',
        card: 'Images/Iron.webp',
        accent: '#ff0000',
        realName: 'Tony Stark',
        health: '250',
        attackType: 'Projectile Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Hyper-velocity' },
          { label: 'Passive', value: 'Fusion Boost' }
        ],
        abilities: [
          { name: 'Repulsor Blast', description: 'Fire nano pulse cannons forward.' },
          { name: 'Unibeam', description: 'Fire a beam of energy forward, dealing damage to enemies in its path.' },
          { name: 'Armor Overdrive', description: 'Activate Armor Overdrive state, enhancing damage of Repulsor Blast and Unibeam, while also granting Bonus Health.' },
          { name: 'Ultimate: MAXIMUM PULSE', description: 'Fire a devastating pulse cannon in the targeted direction, delivering catastrophic damage to the targeted area upon impact.' }
        ],
      },
      {
        id: 'mr-fantastic',
        category: 'duelist',
        name: 'Mr. Fantastic',
        tagline: 'Im gettin anxious... Let me stretch.',
        summary: 'The Smartest Guy In The Room',
        lore: 'Reed Richards believes that true strength comes from remaining flexible, both mentally and physically. Mister Fantastic\'s elastic body, which can twist and stretch into any form with ease, is almost as impressive as his brilliant mind.',
        portrait: 'Images/FantasticStory.png',
        background: 'Images/FantasticSilhouette.webp',
        card: 'Images/Fantastic.webp',
        accent: '#00a8ff',
        realName: 'Reed Richards',
        health: '375',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Fantastic Four' },
          { label: 'Mobility', value: 'Stretch' },
          { label: 'Passive', value: 'Elastic Strength' }
        ],
        abilities: [
          { name: 'Flexible Elongation', description: 'Gain a Shield, select a target, and dash towards them, dealing damage to enemies and granting a Shield to allies.' },
          { name: 'Distended Grip', description: 'Pull the hit enemy toward you, or select and yank another enemy, knocking them airborne against each other.' },
          { name: 'Reflexive Rubber', description: 'Stretch body to absorb damage before launching stored damage in the targeted direction.' },
          { name: 'Ultimate: Brainiac Bounce', description: 'Leap upward and smash the ground, slowing enemies within range. Can leap again upon landing a hit.' }
        ],
      },
      {
        id: 'moon-knight',
        category: 'duelist',
        name: 'Moon Knight',
        tagline: 'Not schizophrenic at all, you just dont see it...',
        summary: 'If you see an enemy that others cannot see... TAKE IT DOWN! What Konshu wants, Konshu gets.',
        lore: 'As the avatar of the Egyptian God of Vengeance, Marc Spectors body has been enhanced by Khonshu himself. Bathed in a luminous aura that pierces the darkness, Moon Knight glides through the night, ready to sear his enemies with his masters sacred Ankhs.',
        portrait: 'Images/MoonStory.png',
        background: 'Images/MoonSilhouette.png',
        card: 'Images/Moon.png',
        accent: '#ffffff',
        realName: 'Marc Spector, Jake Lockley, Steven Grant',
        health: '999',
        attackType: 'Projectile Heroes',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: 'Midnight-Suns' },
          { label: 'Mobility', value: 'Limited' },
          { label: 'Passive', value: 'Bouncing Projectiles' } ],
          abilities: [
            { name: 'Moon Blade', description: 'Bounce between enemies and Ankhs, dealing damage to enemies while granting Bonus Health.' },
            { name: 'Ancient Ankh', description: 'Fire an Ankh to Knock enemies within its radius airborne towards the center.' },
            { name: 'Night Glider', description: 'Great... He glides now.' },
            { name: 'Ultimate: Hand Of Khonshu', description: 'Open a portal that allows Khonshu to bombard enemies with his talons.' }
          ]
      },
      {
        id: 'namor',
        category: 'duelist',
        name: 'Namor',
        tagline: 'Broken Teamup Merchant, Wha Da Flark is dev idea of teamups..',
        summary: 'When ancient horns of war blare, devastation soon follows as deadly waters engulf the arena.',
        lore: 'The unrivaled King of the Seas, Namor surfs into battle on a mighty wave with an army of fierce aquatic creatures in his wake. When ancient horns of war blare, devastation soon follows as deadly waters engulf the arena.',
        portrait: 'Images/NamorStory.png',
        background: 'Images/NamorSilhouette.webp',
        card: 'Images/Namor.webp',
        accent: '#00b894',
        realName: 'Namor Mckenzie',
        health: '275',
        attackType: 'Projectile Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Illuminati' },
          { label: 'Mobility', value: 'Blessing Of The Deep' },
          { label: 'Passive', value: 'Tide Fall' } ],
        abilities: [
          { name: 'Wrath Of The Seven Seas', description: 'When the trident hits an enemy, Monstro Spawn to enter a berserk state, gaining increased Attack Speed.' },
          { name: 'Aquatic Dominion', description: 'Summon a Monstro Spawn that can autonomously attack enemies.' },
          { name: 'Ultimate: Horn Of Proteus', description: 'Summon Giganto to leap atop enemies within range, disabling their mobility abilities.' },
        ]
      },
      {
        id: 'spider-man',
        category: 'duelist',
        name: 'Spider-Man',
        tagline: 'With Great Power Comes Great Responsibility...',
        summary: 'With Great Power Comes With Great Fanfiction.',
        lore: 'Swinging around the arena on his signature weblines, your friendly neighborhood SpiderMan, AKA Peter Parker, catches his rivals by surprise with sneaky, sticky bursts of webbing and unexpected attacks from above.',
        portrait: 'Images/SpiderStory.png',
        background: 'Images/SpidetSilhouette.webp',
        card: 'Images/Spider.webp',
        accent: '#03b7ff',
        realName: 'Peter Parker',
        health: '250',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Vigilante, Hero' },
          { label: 'Team', value: 'Avengers, SpiderVerse' },
          { label: 'Mobility', value: 'Thwip And Flip' },
          { label: 'Passive', value: 'Spider-Sense' } ],
        abilities: [
          { name: 'Web-cluster', description: 'Shoot a Web-Cluster that deals damage and attaches a Spider-Tracer to the hit enemy.' },
          { name: 'Web-swing', description: 'Shoot a strand of webbing to swing.' },
          { name: 'Get Over Here!', description: 'Shoot webbing to reel in the hit enemy. If the enemy is tagged with a Spider-Tracer, Spider-Man will get pulled to them instead.' },
          { name: 'Ultimate: Spectacular Spin', description: 'Launch Web-Clusters all around to damage and Stun enemies.' }
        ]
      },  
      {
        id: 'phoenix',
        category: 'duelist',
        name: 'Phoenix',
        tagline: 'Cha Cha',
        summary: 'In the movies Im more broken, the game nerfs me with wifi issues.',
        lore: 'Original X-Man Jean Grey boasted immense psychic power even before becoming host to the unbridled Phoenix Force, embodiment of life and psionic energy across the universe. ',
        portrait: 'Images/PhoenixStory.png',
        background: 'Images/PhoenixSilhouette.webp',
        card: 'Images/Phoenix.webp',
        accent: '#b5ff21',
        realName: 'Jean Grey',
        health: '250',
        attackType: 'Hitscan Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-Men' },
          { label: 'Mobility', value: 'Limited' },
          { label: 'Passive', value: 'Phoenix Force' } ],
        abilities: [
          { name: 'Psionic Detonation', description: 'Mark a targeted area with psionic energy, followed by a series of fiery explosions. ' },
          { name: 'Dark Ascent', description: 'Merge with the Phoenix, entering a state of free flight. Gain a Movement Boost.' },
          { name: 'Telepathic Illusion', description: 'Leave behind an illusion and instantly teleport in the desired direction, followed by detonating the illusion.' },
          { name: 'Ultimate: Endsong Inferno', description: 'Soar into the sky with the Phoenix and crash down onto a selected area, dealing devastating damage to enemies while creating a shockwave that destroys enemy Summons, Shields, and any Bonus Health. ' }
        ]
      },
      {
        id: 'squirrel-girl',
        category: 'duelist',
        name: 'Squirrel Girl',
        tagline: 'Im The Best DPS that takes alot of skills and lineups.',
        summary: 'It Takes Skill To Be A Squirrel Girl Main, Or Atleast a good DPS.',
        lore: 'Possessing only the powers of a common squirrel, somehow Doreen Green manages to defeat seemingly invincible enemies in the most unexpected ways. ',
        portrait: 'Images/SquirrelStory.png',
        background: 'Images/SquirrelSilhouette.webp',
        card: 'Images/Squirrel.webp',
        accent: '#b8860b',
        realName: 'Doreen Green',
        health: '275',
        attackType: 'Projectile Heroes',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Tail Bounce' },
          { label: 'Passive', value: 'Acorn Launcher' } ],
        abilities: [
          { name: 'Squirrel Blockade', description: 'Launch an acorn to unleash Squirrel Guards, Imprisoning the first hit enemy.' },
          { name: 'Mammal Bond', description: 'Reload Burst Acorns and can use an ability without cooldown once in a short duration.' },
          { name: 'Ultimate: Unbeatable Squirrel Tsunami', description: 'Summon a horde of squirrels to charge forward, dealing damage while bouncing against structures.' }
        ]
      },
      {
        id: 'magik',
        category: 'duelist',
        name: 'Magik',
        tagline: 'I have two sides...',
        summary: 'Easiest Demon Goth Girl to Play, Dunno why users like "Nana" has low KDA.',
        lore: 'Trained in dark arts and wielding her mighty Soulsword, Magik leaps through portals to navigate the arena with ease. Once Illyana transforms into the demonic Darkchild, all those who dare stand against her will fall before her merciless blade.',
        portrait: 'Images/MagikStory.webp',
        background: 'Images/MagikSilhouette.png',
        card: 'Images/Magik.png',
        accent: '#efb509',
        realName: 'Illyana Rasputina',
        health: '250',
        attackType: 'Melee Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Midnight-Suns' },
          { label: 'Mobility', value: 'Limited' },
          { label: 'Passive', value: 'Limbos Might' } ],
        abilities: [
          { name: 'Magik Slash', description: 'Strike forward an air slash. Each enemy hit reduces the cooldown of Stepping Discs.' },
          { name: 'Stepping Discs', description: 'Jump through a Stepping Disc, teleporting a short distance in the direction of movement. Become Invincible while teleporting.' },
          { name: 'Eldritch Whirl', description: 'Spin while swinging the Soulsword after exiting a Stepping Disc.' },
          { name: 'Demons Rage', description: 'Summon a Limbo demon that attacks enemies after exiting a Stepping Disc.' },
          { name: 'Ultimate: Darkchild', description: 'Transform into the demonic Darkchild, gaining increased damage, health, and invincibility frames.' }
        ]
      },
      {
        id: 'psylocke',
        category: 'duelist',
        name: 'Psylocke',
        tagline: 'Now you see mee, now you wana stare at me~',
        summary: 'The Pinnacle Of Gooners and Distractions Ingame.',
        lore: 'The psychic warrior known as Sai has the Mutant ability to conjure a variety of weapons with the power of her mind. Gracefully gliding across the battlefield, this trained ninja can shatter the enemy defenses with a single thought.',
        portrait: 'Images/PsyStory.png',
        background: 'Images/PsySilhouette.webp',
        card: 'Images/Psy.webp',
        accent: '#ff00ae',
        realName: 'Sai',
        health: '250',
        attackType: 'Hitscan Heroes',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-Men' },
          { label: 'Mobility', value: 'Psi-blade Dash' },
          { label: 'Passive', value: 'Psychic Echoes' } ],
        abilities: [
          { name: 'Wing Shurikens', description: 'Launch a volley of psionic shurikens that stick to enemies, dealing damage and granting herself Bonus Health.' },
          { name: 'Psychic Stealth', description: 'Enter stealth and gain a Movement Boost.' },
          { name: 'Ultimate: Dance Of The Butterfly', description: 'Slash nearby enemies with a psionic katana, dealing massive damage.' },
        ]
      },
      {
        id: 'hawkeye',
        category: 'duelist',
        name: 'Hawkeye',
        tagline: 'One Shot, One Kill. One Miss, One Rank Down.',
        summary: 'Yes stop giving this guy a bow and arrow, this gives temu hanzo vibes.',
        lore: 'Despite his lack of superpowers, Hawkeyes unparalleled skills as a marksman have earned him a spot alongside earth\'s mightiest heroes. With a cool head and steady hand, Clint Barton never misses a target… so enemies best stay out of his sights!',
        portrait: 'Images/HawkeyeStory.png',
        background: 'Images/HawkeyeSilhouette.png',
        card: 'Images/Hawkeye.png',
        accent: '#51108f',
        realName: 'Clint Barton',
        attackType: 'Hitscan Heroes', 
        health: '270',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers' },
          { label: 'Mobility', value: 'Double Jump' },
          { label: 'Passive', value: 'Archers Focus' }
        ],
        abilities: [
          { name: 'Hypersonic Arrow', description: 'Fire an arrow dealing two instances of damage to enemies in its path and inflicting them with Slow. This ability can Knock Down flying heroes.' },
          { name: 'Blast Arrow', description: 'Shoot three explosive arrows.' },
          { name: 'Crescent Slash', description: 'Unsheathe a katana and slash forward, Launching Up hit enemies.' },
          { name: 'Ultimate: Hunters Sight', description: 'Capture Afterimages of enemies in his view. Damage dealt to an Afterimage is transferred to the corresponding enemy.' }
        ]
      },
      {
        id: 'starlord',
        category: 'duelist',
        name: 'Star-Lord',
        tagline: 'Useless without the Ult',
        summary: 'LLLEEEEGGGEEEENNNNDDDAAAARRRRYYY!',
        lore: 'Peter Quill lives to dazzle his foes on the battlefield with his signature swagger. As his element guns paint arcs of devastation, his acrobatic moves sail through the sky with unrivaled style. With performances this spectacular, its no wonder that Star-Lord is so legendary!',
        portrait: 'Images/StarLordStory.png',
        background: 'Images/StarLordSilhouette.png',
        card: 'Images/StarLord.png',
        accent: '#00a8ff',
        realName: 'Peter Quill',
        attackType: 'Hitscan Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Guardians of the Galaxy' },
          { label: 'Mobility', value: 'Flexible' },
          { label: 'Passive', value: 'Rocket Boots' }
        ],
        abilities: [
          { name: 'Rocket Propulsion', description: 'Consume energy to gain a Movement Boost and soar forward.' },
          { name: 'Stellar Shift', description: 'Dodge in the direction of movement and swiftly reload. Become Unstoppable and Invincible while dodging.' },
          { name: 'Blaster Barrage', description: 'Fire a frenzy of shots, causing damage to enemies within range.' },
          { name: 'Ultimate: Galactic Legend', description: 'AIMBOT.' }
        ]
      },
      {
        id: 'scarlet-witch',
        category: 'duelist',
        name: 'Scarlet Witch',
        tagline: 'Reality Nuke Erasor 99999 Damage',
        summary: 'PPPPPPPUUUUURRREEEE CCHHHHHAAAAAAOOOOSSS!',
        lore: 'Wanda Maximoff is adept at harnessing formidable chaos magic, casting hexes with the power to twist and reshape reality itself. Energy, space, and matter are mere playthings in the hands of Scarlet Witch!',
        portrait: 'Images/ScarletStory.png',
        background: 'Images/ScarletSilhouette.webp',
        card: 'Images/Scarlett.webp',
        accent: '#6e3550',
        realName: 'Wanda Maximoff',
        attackType: 'Melee Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers, X-Men' },
          { label: 'Mobility', value: 'Mystic Projection' },
          { label: 'Passive', value: 'Chaos Control' }
        ],
        abilities: [
          { name: 'Chthonian Burst', description: 'Consume Chaos Energy to fire explosive magic missiles, damaging enemies.' },
          { name: 'Dark Seal', description: 'Land a hit on a target or the scene, or press again to generate a Force Field that periodically Stuns enemies within range.' },
          { name: 'Ultimate: Reality Erasure', description: 'Stay closer to me and get erased lol.' }
        ]
      },
      {
        id: 'hela',
        category: 'duelist',
        name: 'Hela',
        tagline: 'The Queen of the Underworld',
        summary: 'Headshot, Headshot, Headshot. Not a fan of this character.',
        lore: 'As the Goddess of Death, Hela wields supreme control over the fallen souls residing in Hel. With a haunting whisper and a murder of crows, the queen of the underworld gracefully reaps the souls of her enemies without an ounce of mercy.',
        portrait: 'Images/HelStory.png',
        background: 'Images/HelSilhouette.png',
        card: 'Images/Hel.png',
        accent: '#135426',
        realName: 'Hela',
        attackType: 'Hitscan Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Odinsons' },
          { label: 'Mobility', value: 'Im a bird caw caw!' },
          { label: 'Passive', value: 'Nastrond Crowstorm' }
        ],
        abilities: [
          { name: 'Piercing Night', description: 'Fire multiple Nightsword Thorns that detonate after a delay.' },
          { name: 'Soul Drainer', description: 'Project an explosive Hel sphere to Stun nearby enemies and pull them into the blast zone.' },
          { name: 'Ultimate: Goddess Of Death', description: 'Soar into the sky and unleash Nastrond Crows from each hand at will.' }
        ]
      },
      {
        id: 'iron-fist',
        category: 'duelist',
        name: 'Iron Fist',
        tagline: 'OraOraOraORaOraORaORa!',
        summary: 'CHEAPER TOWN HALL!',
        lore: 'Lin Lie is a master of Chinese martial arts who once wielded the shattered Sword of Fu Xi. After fusing its pieces with the mighty Chi of Shou-Lao, he is poised to strike his foes with the grace and force of a soaring dragon as the latest immortal Iron Fist.',
        portrait: 'Images/FistStory.png',
        background: 'Images/FistSilhouette.png',
        card: 'Images/Fist.png',
        accent: '#ffd700',
        realName: 'Danny Rand',
        attackType: 'Melee Heroes',
        health: '300',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Kungfu' },
          { label: 'Passive', value: 'Wall Runner Detection' }
        ],
        abilities: [
          { name: 'Dragons Defense', description: 'Assume a defensive stance with a boost of Chi to block incoming attacks and gain Damage Reduction. ' },
          { name: 'Yat Jee Chung Kuen', description: 'Dash forward to pursue the targeted enemy and unleash a flurry of attacks.' },
          { name: 'Harmony Recovery', description: 'Cross legs and channel Chi, recovering health. Excess healing converts to Bonus Health.' },
          { name: 'Kun-lun Kick', description: 'Dash forward, delivering a flying kick when hitting an enemy or reaching full range.' },
          { name: 'Ultimate: Living Chi', description: 'Become living Chi to boost his speed, damage, and attack range, delivering stronger punches while reducing the cooldown of Dragons Defense.' }
        ]
      },
      {
        id: 'storm',
        category: 'duelist',
        name: 'Storm',
        tagline: 'Literal Storm is Approaching',
        summary: 'Todays Weather Forcast states that... its Category 7 Tornado.',
        lore: 'An Omega-level Mutant ability to manipulate weather makes Ororo Munroe a force to be reckoned with. Rain or shine, thunder or lightning, nature itself bends to the command of the Goddess of the Storm!',
        portrait: 'Images/StormStory.png',
        background: 'Images/StormSilhouette.webp',
        card: 'Images/Storm.webp',
        accent: '#05eeff',
        realName: 'Ororo Munroe',
        attackType: 'Projectile Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-Men' },
          { label: 'Mobility', value: 'Windrider' },
          { label: 'Passive', value: 'Weather Control' }
        ],
        abilities: [
          { name: 'Bolt Rush', description: 'Unleash a lightning bolt forward.' },
          { name: 'Goddess Boost', description: 'Wind push you to moves faster, Electric empowers you to kill faster' },
          { name: 'Ultimate: Omega Hurricane', description: 'Transform into a hurricane to draw in nearby enemies and deal damage.' }
        ]
      },
      {
        id: 'punisher',
        category: 'duelist',
        name: 'Punisher',
        tagline: 'Aim = Broken Player',
        summary: 'Basically the guy who brings a tank to a snowball fight, ensuring any "criminals" on the opposing team regret their life choices.',
        lore: 'Expertly wielding a full arsenal of futuristic weapons, Frank Castle is a formidable one-man army. With a steadfast resolve to deliver justice to his enemies, The Punisher won\'t cease in his mission until every last round is fired!',
        portrait: 'Images/PunisherStory.png',
        background: 'Images/PunisherSilhouette.webp',
        card: 'Images/Punisher.webp',
        accent: '#636159',
        realName: 'Frank Castle',
        attackType: 'Hitscan Heroes',
        health: '300',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Vantage Connection' },
          { label: 'Passive', value: 'Warrior\'s Gaze' }
        ],
        abilities: [
          { name: 'Culling Turret', description: 'Deploy a Culling Turret that grounds Punisher and blocks damage from the front while dealing massive damage.' },
          { name: 'Scourge Grenade', description: 'Throw a smoke grenade forward to Block Enemies Vision and leap backward.' },
          { name: 'Ultimate: Final Judgement', description: 'Unleash two gatling guns and missiles to attack enemies.' }
        ]
      },
      {
        id: 'winter-soldier',
        category: 'duelist',
        name: 'Winter Soldier',
        tagline: 'AAAAGAAIN! AND AGAIIIN!',
        summary: 'He keeps going, AGAIN AND AGAIN AND AGAI-',
        lore: 'Terrifying experiments turned him into a brainwashed assassin, but now James "Bucky" Barnes is in control of his own fate once again. With his enhanced mechanical arm, the Winter Soldier is primed to deliver earth-shattering blows to any foe in his path!',
        portrait: 'Images/Winter.png',
        background: 'Images/WinterSilhouette.webp',
        card: 'Images/WInter.webp',
        accent: '#2a5727',
        realName: 'James Bucky Barnes',
        attackType: 'Hitscans Heroes',
        health: '275',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Avengers, Thunderbolts' },
          { label: 'Mobility', value: 'Walking' },
          { label: 'Passive', value: 'Ceaseless Charge' }
        ],
        abilities: [
          { name: 'Bionic Hook', description: 'Charge up and launch a hook with his bionic arm, reeling in the first target hit and enemies lurking behind.' },
          { name: 'Trooper\'s Fist', description: 'Dash forward, seizing enemies along the path, and Launch Up enemies in front at the end of the dash.' },
          { name: 'Tainted Voltage', description: ' Launch a powerful electrical punch in the target direction, dealing damage to enemies within range and Slowing them.' },
          { name: 'Ultimate: Kraken Impact', description: 'Any kill or assist here grant him to use this ability AGAIN!' }
        ]
      },
      {
        id: 'wolverine',
        category: 'duelist',
        name: 'Wolverine',
        tagline: 'True Breed Animal ',
        summary: '',
        lore: 'Thanks to his regenerative healing factor and berserker rage, the centuries-old Logan can fight through the worst pain to go claw-to-claw with any foe. The Wolverine stands ready to shred through all obstacles in his way with his Adamantium claws.',
        portrait: 'Images/WolverineStory.png',
        background: 'Images/WolverineSilhouette.webp',
        card: 'Images/Wolverine.webp',
        accent: '#ddff00',
        realName: 'James Logan Howlett',
        attackType: 'Melee Heroes',
        health: '350',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-men' },
          { label: 'Mobility', value: 'Vicious Rampage' },
          { label: 'Passive', value: 'Regenerative Healing Factor' }
        ],
        abilities: [
          { name: 'Claw Strike', description: 'Slash with Adamantium claws for a Claw Strike. Unleashing Feral Leap will enhance it to Berserk Claw Strike for a brief period.' },
          { name: 'Ultimate: Last Stand', description: 'Launch Up enemies ahead and spiral through the air, sweeping up enemies along the path and delivering a devastating impact at the landing point. Impact deals extra damage based on Rage accumulated.' }
        ]
      },
    ];

    const strategistHeroes = [
      {
        id: 'adam-warlock',
        category: 'strategist',
        name: 'Adam Warlock',
        tagline: 'Dps Warlock',
        summary: 'Only goes for perfect KDA and cant be bothered to heal his team.',
        lore: 'The genetically-engineered Adam Warlock wields powerful Quantum Magic, enabling him to connect and heal souls with a gentle touch. When the time comes for his allies to unite, Warlock stands as the unwavering epicenter of cosmic justice!',
        portrait: 'Images/AdamStory.png',
        background: 'Images/AdamSilhouette.png',
        card: 'Images/Adam.png',
        accent: '#f6d95f',
        realName: 'Adam',
        attackType: 'Hitscan Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Guardian of the Galaxy' },
          { label: 'Mobility', value: 'Nerf Movement MORE' },
          { label: 'Passive', value: 'Regenerative Cocoon' }
        ],
        abilities: [  
          { name: 'Avatar Life Stream', description: 'Target an ally for a bouncing stream of healing energy, which also heals himself upon casting; self-targets if no ally is selected.' },
          { name: 'Soul Bond', description: 'Forge a soul bond with allies, granting Healing Over Time and distributing damage taken across the bond.' },
          { name: 'Ultimate: Karmic Revival', description: 'Awaken the karma of allies to revive them. Allies revived have lower health but enjoy a brief period of invincibility.' }
        ]
      },
      {
        id: 'cloak and dagger',
        category: 'strategist',
        name: 'Cloak & Dagger',
        tagline: 'Its US against.. Za World!',
        summary: 'Fastest Ult Farm and the highest zero skill level requirement to play as...',
        lore: 'Tyrone Johnson and Tandy Bowen are nearly inseparable, like two sides of the same coin. Intertwined by forces of shadow and light, Cloak & Dagger fight as a united front, dealing havoc and healing allies across the arena.',
        portrait: 'Images/CloakStory.png',
        background: 'Images/CloakSilhouette.png',
        card: 'Images/Cloak.png',
        accent: '#b3ccf5',
        realName: 'Tyrone Johnson & Tandy Bowen',
        attackType: 'Projectile Heroes',
        health: '225',
        stats: [
          { label: 'Title', value: 'Vigilante' },
          { label: 'Team', value: 'Midnight-Suns' },
          { label: 'Mobility', value: 'Dark Teleportation' },
          { label: 'Passive', value: 'Shadow and Light Embrace' }
        ],
        abilities: [
          { name: 'Terror Cape', description: 'Damage enemies upon touch, applying Blind to narrow their sight and Vulnerability to amplify damage received.' },
          { name: 'Dagger Storm', description: 'Launch a volley of daggers, creating a Healing-Over-Time field in the impact area.' },
          { name: 'Ultimate: Eternal Bond', description: 'Perform four rapid dashes, healing allies and damaging enemies along the path.' }
        ]
      },
      {
        id: 'gambit',
        category: 'strategist',
        name: 'Gambit',
        tagline: 'He Never Folds',
        summary: 'Straight Flush? Royale House? How about... the Ace in a hole support?',
        lore: 'Charming and free-spirited, Remy LeBeau manipulates kinetic energy with unmatched skill. With a flick of his wrist, his charged playing cards become explosive projectiles for foes or heal his allies through kinetic shifting. ',
        portrait: 'Images/GambitStory.png',
        background: 'Images/GambitSilhouette.png',
        card: 'Images/Gambit.png',
        accent: '#d400ff',
        realName: 'Remy Lebeau',
        attackType: 'Projectile Heroes',
        health: '275',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'X-men' },
          { label: 'Mobility', value: 'Cajun Charge' },
          { label: 'Passive', value: 'Ace Of Aces' }
        ],
        abilities: [
          { name: 'Healing Hearts', description: 'Conjure a Heart card by consuming one stack of Sleight of Hand to Heal and switch to the Healing Hearts deck.' },
          { name: 'Bridge Boost', description: 'While the Healing Hearts deck is active, spend one stack of Sleight of Hand to Flush and card spring before firing a full deck forward.' },
          { name: 'Breaking Spades', description: 'Conjure a Spade card by consuming one stack of Sleight of Hand to gain a Damage Boost and switch to the Breaking Spades deck.' },
          { name: 'Ultimate: Ragin Royal Flush', description: 'Lock onto an ally within sight and unleash multiple Aces that heal and Purify. Both enter the Kinetic Transfer state, granting increased Movement Speed and Jump Boost, while enhancing attacks with additional single-target explosive damage and providing the ally with Ultimate Ability Charge Acceleration.' }
        ]
      },
      {
        id: 'invisible-woman',
        category: 'strategist',
        name: 'Invisible Woman',
        tagline: 'Reed Can\'t handle all that',
        summary: 'Bounces Heals, Bouncy Skills, Bouncy Boo-',
        lore: 'The Invisible Woman is able to slip in and out of sight without a trace. No matter how intense the battle may be, Susan Storm always keeps her cool, conjuring up impenetrable force fields to protect herself and her team.',
        portrait: 'Images/InvisibleStory.png',
        background: 'Images/InvisibleSilhouette.png',
        card: 'Images/Invisible.png',
        accent: '#cfd7fa',
        realName: 'Susan Storm',
        attackType: 'Projectile Heroes',
        health: '275',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Fantastic Four' },
          { label: 'Mobility', value: 'Veiled Step' },
          { label: 'Passive', value: 'Covert Advance' }
        ],
        abilities: [
          { name: 'Guardian Shield', description: ' The shield can block damage and provide Healing Over Time to nearby allies.' },
          { name: 'Psionic Vortex', description: 'It erupts into a psionic vortex, continuously drawing in enemies and causing damage.' },
          { name: 'Force Physics', description: 'Manipulate psionic energy to push or pull enemies in front of you.' },
          { name: 'Ultimate: Invisible Boundary' , description: 'Manifest an unseen force field within a chosen area, rendering allies inside undetectable by enemies and providing Healing Over Time. Enemies that pass through the field are Slowed.'}
        ]
      },
      {
        id: 'luna snow',
        category: 'strategist',
        name: 'Luna Snow',
        tagline: 'Your One and Only Kpop Demon Huntrix... Wait wrong universe',
        summary: 'Wins teamfights from a floating chair and a calm eyebrow raise.',
        lore: 'The arena is her stage, where Seol Hee and her team orchestrate spectacular displays that earn her an ever-increasing number of fans and wins.',
        portrait: 'Images/LunaStory.png',
        background: 'Images/LunaSilhouette.png',
        card: 'Images/Luna.png',
        accent: '#7547ff',
        realName: 'Seol Hee',
        attackType: 'Hitscan Heroes',
        health: '275',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Smooth Skate' },
          { label: 'Passive', value: 'Idol Aura' }
        ],
        abilities: [
          { name: 'Ice Arts', description: 'Fire ice shards for a short duration, damaging enemies or healing allies while restoring her own Health.' },
          { name: 'Absolute Zero', description: 'Cast a clump of ice to Freeze the hit enemy and restore Health. Landing a hit grants Bonus Health.' },
          { name: 'Ultimate: Fate Of Both Worlds', description: 'Take center stage and start dancing! Toggle between two performances: Heal allies or grant them Damage Boost.' }
        ]
      },
      {
        id: 'mantis',
        category: 'strategist',
        name: 'Mantis',
        tagline: 'Synthetic Shotcaller',
        summary: 'Gooooo tooo sleeep, Goo tooo sleeeep~ ... Gooo too sleep myy sleeeppy baabbyy~',
        lore: 'Mantis uses her impressive mental abilities and her penchant for plant control to anchor any team she fights alongside. Her powers tap into a limitless flow of life energy, gently nourishing everything she touches.',
        portrait: 'Images/MantisStory.png',
        background: 'Images/MantisSilhouette.png',
        card: 'Images/Mantis.png',
        accent: '#42f5bc',
        realName: 'Mantis',
        attackType: 'Projectile Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Guardians Of the Galaxy' },
          { label: 'Mobility', value: 'Walking' },
          { label: 'Passive', value: 'Natures Favor' }
        ],
        abilities: [
          { name: 'Allied Inspiration', description: 'Consume Life Orbs to grant allies a Damage Boost.' },
          { name: 'Spore Slumber', description: 'Throw a spore to Sedate the nearest enemy.' },
          { name: 'Healing Flower', description: 'Consume Life Orbs to grant allies Healing Over Time.' },
          { name: 'Ultimate: Soul Resurgence', description: 'Release energy around her while moving, providing Healing Over Time and Movement Boosts for surrounding allies. Excess healing converts to Bonus Health.'}
        ]
      },
      {
        id: 'loki',
        category: 'strategist',
        name: 'Loki',
        tagline: 'God of Outplays',
        summary: 'If you can see him, you’re already in the wrong timeline.',
        lore: 'The God of Mischief weaves illusions and decoys across the battlefield, forcing enemies to waste cooldowns on copies. Every trick creates another opening for his team to strike.',
        portrait: 'Images/LokiStory.png',
        background: 'Images/LokiSilhouette.png',
        card: 'Images/Loki.png',
        accent: '#7acb4a',
        realName: 'Loki Laufeyson',
        attackType: 'Projectile Heroes',
        health: '225',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Odinsons' },
          { label: 'Mobility', value: 'Illusory Step' },
          { label: 'Passive', value: 'Trickster\'s Guile' }
        ],
        abilities: [
          { name: 'Decoy Mirage', description: 'Spawn multiple illusions that mimic Loki’s movement, obscuring his real position.' },
          { name: 'Backline Switch', description: 'Swap locations with an illusion behind enemy lines, briefly cloaking after arrival.' },
          { name: 'Ultimate: Chaos Script', description: 'Randomly silences, slows, or disarms enemies in a large area, sowing complete confusion.' }
        ]
      },
      {
        id: 'jeff',
        category: 'strategist',
        name: 'Jeff The Land Shark',
        tagline: 'The Devil That Smiles...',
        summary: 'MMRRR... MNNYAARR!',
        lore: 'Most land sharks are vicious creatures of the deep... but not Jeff! This adorable and mischievous little guy brings joy and healing to every battle. But if the tide turns, Jeff can morph into a voracious beast, capable of swallowing an army of foes in a single gulp!',
        portrait: 'Images/JeffStory.png',
        background: 'Images/JeffSilhouette.png',
        card: 'Images/Jeff.png',
        accent: '#24dae0',
        realName: 'Jeff',
        attackType: 'Projectile Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'secret' },
          { label: 'Mobility', value: 'Hide And Seek' },
          { label: 'Passive', value: 'Joyful Splash' }
        ],
        abilities: [
          { name: 'Healing Bubble', description: 'Spit a bubble that heals the ally who collects it, granting them Healing and Movement Boost.' },
          { name: 'Ultimate: Its Jeff!', description: 'Deep dive into the scene and leave behind a healing water zone for allies. Upon resurfacing, swallow both enemies and allies within range, activating Hide and Seek for a brief duration before ejecting the swallowed heroes forward. Excess healing converts to Bonus Health.' }
        ]
      },
      {
        id: 'rocket-raccoon',
        category: 'strategist',
        name: 'Rocket Raccoon',
        tagline: 'Ain\'t Nothin\' Like Me \'Cept Me',
        summary: 'The only raccoon with a bounty list longer than his tail and tech skills that make Tony Stark jealous.',
        lore: 'Rocket may not look like a tech genius or an expert tactician, but anyone who\'s ever made his hit list has quickly regretted underestimating him. This savvy space soldier is equally eager to boost his teammates and to collect bounties on his foes. Armed with an arsenal of custom-built weapons and gadgets, Rocket turns every battlefield into his personal workshop.',
        portrait: 'Images/RocketStory.png',
        background: 'Images/RocketSilhouette.png',
        card: 'Images/Rocket.png',
        accent: '#7a620a',
        realName: 'Rocket',
        attackType: 'Projectile Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Hero' },
          { label: 'Team', value: 'Guardians of the Galaxy' },
          { label: 'Mobility', value: 'Jetpack Dash' },
          { label: 'Passive', value: 'Wild Crawl' }
        ],
        abilities: [
          { name: 'Repair Mode', description: 'Shoot bouncing spheres to heal allies. Directly hitting an ally provides extra healing.' },
          { name: 'B.R.B', description: 'Deploy a Battle Rebirth Beacon that revives a fallen ally and periodically produces armor packs and rocket jet packs.' },
          { name: 'Ultimate: C.Y.A', description: 'Deploy a Cosmic Yarn Amplifier that grants allies a Damage Boost, while continuously providing them with Bonus Health.' }
        ]
      },
      {
        id: 'ultron',
        category: 'strategist',
        name: 'Ultron',
        tagline: 'There Are No Strings On Me',
        summary: 'The perfect AI strategist who calculates every move before it happens, orchestrating battles with mechanical precision.',
        lore: 'The pinnacle of artificial lifeforms, Ultron is programmed to learn and adapt in ways far beyond human capability. He can summon an army of automated drones that obey his every command, raising his chances of victory exponentially.',
        portrait: 'Images/UltronStory.png',
        background: 'Images/UltronSilhouette.png',
        card: 'Images/Ultron.png',
        accent: '#615f58',
        realName: 'Ultron',
        attackType: 'Hitscan Heroes',
        health: '250',
        stats: [
          { label: 'Title', value: 'Villain' },
          { label: 'Team', value: '' },
          { label: 'Mobility', value: 'Dynamic Flight' },
          { label: 'Passive', value: 'Algorithm Correction' }
        ],
        abilities: [
          { name: 'Imperative: Patch', description: 'Command up to 2 giant drones to follow 2 allies, constantly healing allies within its radius, with more healing for the designated allies.' },
          { name: 'Imperative: Firewall', description: 'Deploy drones to an ally marked by Imperative: Patch, granting them increased Speed and Damage. Additionally, all allies within range of you and the chosen teammate receive Bonus Health.' },
          { name: 'Ultimate: EXTERMINATION!', description: 'Summon Ultron Drones to fire Encephalo-Rays, damaging enemies or healing allies. Deals enhanced damage against Bonus Health.' },
        ]
      },
    ];

    function createHero(config, order) {
      const baseAbilities = abilityTemplates[config.category];
      const baseStats = statTemplates[config.category];
      const accent = config.accent || '#ffd700';
      const accentSoft = config.accentSoft || 'rgba(255,215,0,0.2)';
      const abilitySet = (config.abilities || baseAbilities || []).map((ability, index) => ({
        name: ability.name,
        description: ability.description,
        slot: ability.slot || defaultAbilityLayout[index]?.slot || `S${index + 1}`,
        type: ability.type || defaultAbilityLayout[index]?.type || 'Skill'
      }));
      const stats = config.stats || baseStats || [];
      const difficultyFromStats = stats.find(stat => stat.label?.toLowerCase() === 'difficulty');
      return {
        id: config.id,
        name: config.name,
        category: config.category,
        tagline: config.tagline,
        summary: config.summary,
        lore: config.lore || `${config.name} is still preparing their grand entrance. Check back soon for a full dossier.`,
        portrait: config.portrait || 'Images/PAngela.jpg',
        card: config.card || config.portrait || 'Images/PAngela.jpg', // Card image (use 'card:' property)
        backgroundImage: config.background || 'Images/New1.jpg',
        backgroundPosition: config.backgroundPosition || 'center',
        accent,
        accentSoft,
        stats,
        abilities: abilitySet,
        attackType: config.attackType || attackTypeTemplates[config.category] || 'Adaptive Fighter',
        health: config.health || healthTemplates[config.category] || '250',
        realName: config.realName || config.name,
        difficulty: config.difficulty || difficultyFromStats?.value || difficultyTemplates[config.category] || '★★★☆☆',
        order: config.order ?? order + 1
      };
    }

    const heroCatalog = [
      ...vanguardHeroes.map((hero, index) => createHero(hero, index)),
      ...duelistHeroes.map((hero, index) => createHero(hero, vanguardHeroes.length + index)),
      ...strategistHeroes.map((hero, index) => createHero(hero, vanguardHeroes.length + duelistHeroes.length + index))
    ];

    // Global catalog for other pages (like login popup hero picker)
    window.RIVALS_HERO_CATALOG = heroCatalog.map(h => ({
      id: h.id,
      name: h.name,
      category: h.category,
      card: h.card,
      backgroundImage: h.backgroundImage
    }));

    if (!heroPage) return;

    const heroMap = new Map(heroCatalog.map(hero => [hero.id, hero]));

    const featureBg = document.querySelector('[data-feature-bg]');
    const featureBgImg = document.querySelector('[data-feature-bg-img]');
    const featurePortrait = document.querySelector('[data-feature-portrait]');
    const featureName = document.querySelector('[data-feature-name]');
    const featureRole = document.querySelector('[data-feature-role]');
    const featureTagline = document.querySelector('[data-feature-tagline]');
    const featureSummary = document.querySelector('[data-feature-summary]');
    const featureStats = document.querySelector('[data-feature-stats]');
    const featurePanel = document.querySelector('[data-feature-panel]');
    const featureAttack = document.querySelector('[data-feature-attack]');
    const featureRealName = document.querySelector('[data-feature-realname]');
    const featureHealth = document.querySelector('[data-feature-health]');
    const featureDifficulty = document.querySelector('[data-feature-difficulty]');
    const filterDisplayCount = document.querySelector('[data-filter-count]');
    const rosterGrid = document.querySelector('[data-roster]');
    const filterButtons = Array.from(document.querySelectorAll('.hero-filter'));
    const heroFocus = document.querySelector('[data-hero-focus]');
    const rosterSection = document.querySelector('[data-roster-section]');
    const viewMoreButton = document.querySelector('.hero-feature__view-more');
    const viewMorePopup = document.querySelector('[data-feature-popup]');
    const viewMorePopupSkills = document.querySelector('[data-feature-popup-skills]');
    const viewMorePopupLore = document.querySelector('[data-feature-popup-lore]');
    
    let isPopupPinned = false;

    const countAll = document.querySelector('[data-count-all]');
    const countVanguard = document.querySelector('[data-count-vanguard]');
    const countDuelist = document.querySelector('[data-count-duelist]');
    const countStrategist = document.querySelector('[data-count-strategist]');

    const modal = document.getElementById('hero-modal');
    const modalPortrait = modal?.querySelector('[data-modal-portrait]');
    const modalRole = modal?.querySelector('[data-modal-role]');
    const modalName = modal?.querySelector('[data-modal-name]');
    const modalTagline = modal?.querySelector('[data-modal-tagline]');
    const modalLore = modal?.querySelector('[data-modal-lore]');
    const modalAbilities = modal?.querySelector('[data-modal-abilities]');
    const modalAttack = modal?.querySelector('[data-modal-attack]');
    const modalRealName = modal?.querySelector('[data-modal-realname]');
    const modalHealth = modal?.querySelector('[data-modal-health]');
    const modalDifficulty = modal?.querySelector('[data-modal-difficulty]');

    let activeFilter = 'all';
    let activeHero = heroCatalog[0];
    let searchQuery = '';
    const heroSearchInput = document.querySelector('[data-hero-search]');
    const heroSearchButton = document.querySelector('[data-hero-search-btn]');
    const heroNoResults = document.querySelector('[data-hero-no-results]');
    const heroSuggestions = document.querySelectorAll('[data-suggestion]');

    function updateCounts() {
      const filtered = filteredHeroes();
      const counts = filtered.reduce((acc, hero) => {
        acc.all += 1;
        acc[hero.category] += 1;
        return acc;
      }, { all: 0, vanguard: 0, duelist: 0, strategist: 0 });
      
      // Update counts with filtered results
      if (countAll) countAll.textContent = counts.all;
      if (countVanguard) countVanguard.textContent = counts.vanguard;
      if (countDuelist) countDuelist.textContent = counts.duelist;
      if (countStrategist) countStrategist.textContent = counts.strategist;
    }
    
    function updateFilterCount() {
      const heroes = filteredHeroes();
      if (!filterDisplayCount) return;
      
      // If there's a search query, try to show a more descriptive label
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const teamStat = heroes.length > 0 ? heroes[0].stats.find(stat => stat.label === 'Team') : null;
        const titleStat = heroes.length > 0 ? heroes[0].stats.find(stat => stat.label === 'Title') : null;
        
        // Check if search matches a team name
        if (teamStat && teamStat.value && teamStat.value.toLowerCase().includes(query)) {
          const teamName = teamStat.value.split(',')[0].trim(); // Get first team if multiple
          filterDisplayCount.textContent = `${heroes.length} ${teamName}`;
          return;
        }
        
        // Check if search matches a title
        if (titleStat && titleStat.value && titleStat.value.toLowerCase().includes(query)) {
          const titleName = titleStat.value.split(',')[0].trim(); // Get first title if multiple
          filterDisplayCount.textContent = `${heroes.length} ${titleName}${heroes.length === 1 ? '' : 's'}`;
          return;
        }
        
        // Default: show count with "Results"
        filterDisplayCount.textContent = `${heroes.length} Result${heroes.length === 1 ? '' : 's'}`;
      } else {
        // No search, show normal count
        filterDisplayCount.textContent = String(heroes.length);
      }
    }

    function renderStats(container, stats) {
      if (!container) return;
      container.innerHTML = '';
      stats.forEach(stat => {
        const dt = document.createElement('dt');
        dt.textContent = stat.label;
        const dd = document.createElement('dd');
        dd.textContent = stat.value;
        container.appendChild(dt);
        container.appendChild(dd);
      });
    }

    function renderAbilities(container, abilities) {
      if (!container) return;
      container.innerHTML = '';
      abilities.forEach(ability => {
        const li = document.createElement('li');
        li.className = 'hero-modal__ability';
        const header = document.createElement('div');
        header.className = 'hero-modal__ability-header';

        const key = document.createElement('span');
        key.className = 'hero-modal__ability-key';
        key.textContent = ability.slot || 'Skill';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'hero-modal__ability-name';
        const nameEl = document.createElement('strong');
        nameEl.textContent = ability.name;
        const typeEl = document.createElement('span');
        typeEl.className = 'hero-modal__ability-type';
        typeEl.textContent = ability.type || 'Skill';

        nameWrap.appendChild(nameEl);
        nameWrap.appendChild(typeEl);
        header.appendChild(key);
        header.appendChild(nameWrap);

        const desc = document.createElement('p');
        desc.className = 'hero-modal__ability-desc';
        desc.textContent = ability.description || 'Details forthcoming.';

        li.appendChild(header);
        li.appendChild(desc);
        container.appendChild(li);
      });
    }

    function setFeatured(heroId) {
      const hero = heroMap.get(heroId);
      if (!hero) return;
      activeHero = hero;

      if (featurePortrait) {
        featurePortrait.src = hero.portrait;
        featurePortrait.alt = `${hero.name} portrait`;
      }
      if (featureName) featureName.textContent = hero.name;
      if (featureRole) featureRole.textContent = roleLabels[hero.category] || hero.category;
      if (featureTagline) featureTagline.textContent = hero.tagline;
      if (featureSummary) featureSummary.textContent = hero.summary;
      if (featureBg) {
        featureBg.style.setProperty('--hero-accent', hero.accent);
        featureBg.style.setProperty('--hero-accent-soft', hero.accentSoft);
      }
      if (featurePanel) {
        featurePanel.style.setProperty('--hero-accent', hero.accent);
        featurePanel.style.setProperty('--hero-accent-soft', hero.accentSoft);
      }
      // Also set accent colors on view more button and popup to ensure they inherit
      if (viewMoreButton) {
        viewMoreButton.style.setProperty('--hero-accent', hero.accent);
        viewMoreButton.style.setProperty('--hero-accent-soft', hero.accentSoft);
      }
      if (viewMorePopup) {
        viewMorePopup.style.setProperty('--hero-accent', hero.accent);
        viewMorePopup.style.setProperty('--hero-accent-soft', hero.accentSoft);
      }
      if (featureAttack) featureAttack.textContent = hero.attackType;
      if (featureRealName) featureRealName.textContent = hero.realName;
      if (featureHealth) {
        // Replace \n with actual line breaks for display
        featureHealth.textContent = hero.health;
        // CSS white-space: pre-line will handle the \n characters
      }
      if (featureDifficulty) {
        featureDifficulty.textContent = hero.difficulty || '★★★☆☆';
      }
      if (featureBgImg) {
        featureBgImg.src = hero.backgroundImage;
        featureBgImg.style.objectPosition = hero.backgroundPosition;
        featureBgImg.alt = `${hero.name} backdrop`;
      }
      renderStats(featureStats, hero.stats);

      // Update View More popup - show all skills (no placeholders)
      if (viewMorePopupSkills && hero.abilities) {
        viewMorePopupSkills.innerHTML = '';
        hero.abilities.forEach((ability) => {
          const li = document.createElement('li');
          const strong = document.createElement('strong');
          strong.textContent = ability.name;
          const span = document.createElement('span');
          span.textContent = ability.description || 'Details forthcoming.';
          li.appendChild(strong);
          li.appendChild(span);
          viewMorePopupSkills.appendChild(li);
        });
      }
      if (viewMorePopupLore) {
        viewMorePopupLore.textContent = hero.lore || 'Additional hero information will be displayed here.';
      }
      
      // Reset pinned state when hero changes
      isPopupPinned = false;
      if (viewMoreButton) {
        viewMoreButton.classList.remove('popup-pinned');
      }
      if (viewMorePopup) {
        viewMorePopup.classList.remove('pinned');
      }

      // Update roster active state
      rosterGrid?.querySelectorAll('.hero-roster__card').forEach(card => {
        card.classList.toggle('active', card.dataset.heroId === hero.id);
      });
    }

    // Admin functions for hiding heroes
    function getCurrentUser() {
      try {
        const loggedStr = localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser');
        if (loggedStr) {
          const u = JSON.parse(loggedStr);
          if (u && typeof u === 'object' && u.isGuest !== true) return u;
        }
      } catch {}
      return null;
    }

    function isAdminUser() {
      const user = getCurrentUser();
      return !!user && String(user.role || 'user') === 'admin';
    }

    const HIDDEN_HEROES_KEY = 'rivals_hidden_heroes';
    function getHiddenHeroes() {
      try {
        const raw = localStorage.getItem(HIDDEN_HEROES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
      } catch {
        return new Set();
      }
    }

    function saveHiddenHeroes(set) {
      localStorage.setItem(HIDDEN_HEROES_KEY, JSON.stringify(Array.from(set)));
    }

    function toggleHideHero(heroId) {
      const set = getHiddenHeroes();
      const id = String(heroId);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      saveHiddenHeroes(set);
      return set.has(id);
    }

    function filteredHeroes() {
      let heroes = heroCatalog;
      
      // Filter out hidden heroes for non-admins
      const hiddenHeroes = getHiddenHeroes();
      const isAdmin = isAdminUser();
      if (!isAdmin && hiddenHeroes.size > 0) {
        heroes = heroes.filter(hero => !hiddenHeroes.has(String(hero.id)));
      }
      
      // Apply category filter
      if (activeFilter !== 'all') {
        heroes = heroes.filter(hero => hero.category === activeFilter);
      }
      
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        heroes = heroes.filter(hero => {
          // Search in hero name (exact match or partial)
          if (hero.name.toLowerCase().includes(query)) return true;
          
          // Search in real name
          if (hero.realName && hero.realName.toLowerCase().includes(query)) return true;
          
          // Search in team (from stats) - check all teams if comma-separated
          const teamStat = hero.stats.find(stat => stat.label === 'Team');
          if (teamStat && teamStat.value) {
            const teams = teamStat.value.toLowerCase().split(',').map(t => t.trim());
            if (teams.some(team => team.includes(query) || query.includes(team))) return true;
          }
          
          // Search in title (from stats) - check all titles if comma-separated
          const titleStat = hero.stats.find(stat => stat.label === 'Title');
          if (titleStat && titleStat.value) {
            const titles = titleStat.value.toLowerCase().split(',').map(t => t.trim());
            if (titles.some(title => title.includes(query) || query.includes(title))) return true;
          }
          
          // Search in tagline
          if (hero.tagline && hero.tagline.toLowerCase().includes(query)) return true;
          
          // Search in category
          if (hero.category && hero.category.toLowerCase().includes(query)) return true;
          
          // Search in attack type
          if (hero.attackType && hero.attackType.toLowerCase().includes(query)) return true;
          
          return false;
        });
      }
      
      return heroes;
    }

    function renderRoster() {
      if (!rosterGrid) return;
      rosterGrid.innerHTML = '';
      const heroes = filteredHeroes();
      
      // Show/hide no results message
      if (heroes.length === 0 && searchQuery.trim()) {
        if (heroNoResults) heroNoResults.removeAttribute('hidden');
      } else {
        if (heroNoResults) heroNoResults.setAttribute('hidden', '');
      }
      
      const isAdmin = isAdminUser();
      const hiddenHeroes = getHiddenHeroes();
      
      heroes.forEach(hero => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `hero-roster__card hero-roster__card--${hero.id}`;
        card.dataset.heroId = hero.id;
        // Apply unique styling using hero's accent color
        card.style.setProperty('--hero-accent', hero.accent || '#ffd700');
        card.style.setProperty('--hero-accent-soft', hero.accentSoft || 'rgba(255,215,0,0.2)');
        // Use card property if available, otherwise fall back to portrait
        const cardImg = hero.card || hero.portrait;
        const isHidden = hiddenHeroes.has(String(hero.id));
        card.innerHTML = `
          <div class="hero-roster__art">
            <img src="${cardImg}" alt="${hero.name}" loading="lazy" />
            <span class="hero-roster__role">${roleLabels[hero.category] || hero.category}</span>
            ${isAdmin ? `
              <button class="hero-admin-hide-btn" type="button" data-hero-id="${hero.id}" title="${isHidden ? 'Unhide' : 'Hide'} hero">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${isHidden 
                    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
                    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
                  }
                </svg>
              </button>
            ` : ''}
          </div>
          <p class="hero-roster__name">${hero.name}</p>
        `;
        if (hero.id === activeHero.id) card.classList.add('active');
        if (isHidden && isAdmin) card.classList.add('hero-roster__card--hidden');
        rosterGrid.appendChild(card);
      });
      
      // Attach admin hide/unhide button listeners
      if (isAdmin) {
        rosterGrid.querySelectorAll('.hero-admin-hide-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const heroId = btn.dataset.heroId;
            const isHidden = toggleHideHero(heroId);
            renderRoster();
            const heroName = heroCatalog.find(h => String(h.id) === heroId)?.name || 'Hero';
            alert(`${heroName} ${isHidden ? 'hidden' : 'unhidden'}. ${isHidden ? 'Regular users will not see this hero.' : 'Hero is now visible to all users.'}`);
          });
        });
      }
      updateFilterCount();
      updateCounts();
      // Always animate cards when roster is rendered
      const cards = Array.from(rosterGrid.querySelectorAll('.hero-roster__card'));
      cards.forEach((card, index) => {
        card.classList.remove('hero-roster__card--revealed');
        setTimeout(() => {
          card.classList.add('hero-roster__card--revealed');
        }, index * 45);
      });
    }

    function handleFilterChange(filter) {
      activeFilter = filter;
      filterButtons.forEach(btn => {
        const isActive = btn.dataset.filter === filter;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });
      const heroes = filteredHeroes();
      if (heroes.length && !heroes.some(hero => hero.id === activeHero.id)) {
        setFeatured(heroes[0].id);
      }
      renderRoster();
    }

    function openHeroModal(hero) {
      if (!modal) return;
      modal.toggleAttribute('hidden', false);
      modal.toggleAttribute('open', true);
      document.body.style.overflow = 'hidden';
      if (modalPortrait) {
        modalPortrait.src = hero.portrait;
        modalPortrait.alt = `${hero.name} portrait`;
      }
      if (modalRole) modalRole.textContent = roleLabels[hero.category] || hero.category;
      if (modalName) modalName.textContent = hero.name;
      if (modalTagline) modalTagline.textContent = hero.tagline;
      if (modalLore) modalLore.textContent = hero.lore;
      if (modalAttack) modalAttack.textContent = hero.attackType;
      if (modalRealName) modalRealName.textContent = hero.realName;
      if (modalHealth) modalHealth.textContent = hero.health;
      if (modalDifficulty) {
        modalDifficulty.textContent = hero.difficulty || '★★★☆☆';
      }
      renderAbilities(modalAbilities, hero.abilities);
    }

    function closeHeroModal() {
      if (!modal || !modal.hasAttribute('open')) return;
      modal.toggleAttribute('open', false);
      modal.toggleAttribute('hidden', true);
      // defer scroll restoration slightly to avoid fight with other dialogs
      setTimeout(() => {
        if (!loginPopup || !loginPopup.hasAttribute('open')) {
          document.body.style.overflow = '';
        }
      }, 120);
    }

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter || 'all';
        handleFilterChange(filter);
      });
    });
    
    // Search heroes by name, team, title, etc
    function handleSearch() {
      searchQuery = heroSearchInput ? heroSearchInput.value : '';
      const heroes = filteredHeroes();
      if (heroes.length && !heroes.some(hero => hero.id === activeHero.id)) {
        setFeatured(heroes[0].id);
      }
      renderRoster();
    }
    
    if (heroSearchInput) {
      heroSearchInput.addEventListener('input', handleSearch);
      heroSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSearch();
        }
      });
    }
    
    if (heroSearchButton) {
      heroSearchButton.addEventListener('click', handleSearch);
    }
    
    // Quick search suggestions
    heroSuggestions.forEach(suggestionBtn => {
      suggestionBtn.addEventListener('click', () => {
        const suggestion = suggestionBtn.dataset.suggestion;
        if (heroSearchInput) {
          heroSearchInput.value = suggestion;
          searchQuery = suggestion;
          handleSearch();
        }
      });
    });

    // View More popup toggle
    if (viewMoreButton) {
      viewMoreButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        isPopupPinned = !isPopupPinned;
        
        if (isPopupPinned) {
          // Pin popup open
          viewMoreButton.classList.add('popup-pinned');
          if (viewMorePopup) {
            viewMorePopup.classList.add('pinned');
          }
        } else {
          // Unpin - return to hover-only
          viewMoreButton.classList.remove('popup-pinned');
          if (viewMorePopup) {
            viewMorePopup.classList.remove('pinned');
          }
        }
      });
    }

    // Stop popup scroll from moving the main page
    if (viewMorePopup) {
      viewMorePopup.addEventListener('wheel', (e) => {
        const { scrollTop, scrollHeight, clientHeight } = viewMorePopup;
        const isScrollingUp = e.deltaY < 0;
        const isScrollingDown = e.deltaY > 0;
        const isAtTop = scrollTop <= 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        if (!((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown))) {
          e.stopPropagation();
        } else {
          e.preventDefault();
          e.stopPropagation();
        }
      }, { passive: false });

      viewMorePopup.addEventListener('touchmove', (e) => {
        const { scrollTop, scrollHeight, clientHeight } = viewMorePopup;
        const isAtTop = scrollTop <= 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        if (!isAtTop && !isAtBottom) {
          e.stopPropagation();
        }
      }, { passive: true });
    }

    function getFilteredHeroList() {
      return filteredHeroes();
    }

    function focusHeroHeroCard(heroId) {
      const card = rosterGrid?.querySelector(`.hero-roster__card[data-hero-id="${heroId}"]`);
      if (card) {
        card.focus({ preventScroll: true });
      }
    }

    function goToRelativeHero(step) {
      const heroes = getFilteredHeroList();
      const currentIndex = heroes.findIndex(hero => hero.id === activeHero.id);
      if (currentIndex === -1) return;
      const nextIndex = (currentIndex + step + heroes.length) % heroes.length;
      const nextHero = heroes[nextIndex];
      if (nextHero) {
        setFeatured(nextHero.id);
        focusHeroHeroCard(nextHero.id);
      }
    }

    featurePanel?.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      if (event.deltaY > 0) {
        goToRelativeHero(1);
      } else {
        goToRelativeHero(-1);
      }
    }, { passive: false });

    modal?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.modalClose !== undefined || target.classList.contains('hero-modal__overlay')) {
        event.preventDefault();
        closeHeroModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modal && modal.hasAttribute('open')) {
          e.stopPropagation();
          closeHeroModal();
        } else if (featurePanel && featurePanel.contains(document.activeElement)) {
          closeHeroModal();
        }
      } else if (e.key === 'ArrowRight') {
        goToRelativeHero(1);
      } else if (e.key === 'ArrowLeft') {
        goToRelativeHero(-1);
      }
    });

    updateCounts();
    setFeatured(activeHero.id);
    renderRoster();

    rosterGrid?.addEventListener('click', (event) => {
      const card = event.target.closest('.hero-roster__card');
      if (!(card instanceof HTMLElement)) return;
      const heroId = card.dataset.heroId;
      if (!heroId) return;
      setFeatured(heroId);
      if (heroFocus) {
        heroFocus.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });

    let lastScrollY = window.scrollY;
    let scrollDirection = 'down';
    let isAnimating = false;

    function animateCards() {
      if (isAnimating) return;
      isAnimating = true;
      const cards = Array.from(rosterGrid?.querySelectorAll('.hero-roster__card') || []);
      cards.forEach((card, index) => {
        card.classList.remove('hero-roster__card--revealed');
        setTimeout(() => {
          card.classList.add('hero-roster__card--revealed');
          if (index === cards.length - 1) {
            setTimeout(() => { isAnimating = false; }, 600);
          }
        }, index * 45);
      });
    }

    animateCards();
    if (rosterSection) rosterSection.dataset.revealed = 'true';

    // Re-animate cards when scrolling up significantly
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY;
        
        if (scrollDelta < -50 && scrollDirection === 'down') {
        scrollDirection = 'up';
          animateCards();
        } else if (scrollDelta > 50 && scrollDirection === 'up') {
          scrollDirection = 'down';
        }
        lastScrollY = currentScrollY;
      }, 100);
    }, { passive: true });

    // Animate cards when roster section scrolls into view
    const rosterRevealObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
          animateCards();
        }
      }
    }, { threshold: 0.1 }) : null;

    if (rosterRevealObserver && rosterSection) {
      rosterRevealObserver.observe(rosterSection);
    }
  })();

  // ============================================
  // HERO VIDEO SPLASH
  // ============================================
  const heroVideo = document.getElementById('hero-video');
  const heroContent = document.querySelector('.hero .content');
  if (heroVideo && heroContent) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      heroVideo.classList.remove('video-intro');
      heroVideo.classList.add('video-banner');
      heroContent.classList.add('visible');
    } else {
      // Lock scroll during 8s splash, then animate video into banner position
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const SPLASH_MS = 8000;
      setTimeout(() => {
        const heroSection = document.querySelector('.hero');
        const heroRect = heroSection ? heroSection.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        const startRect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const endRect = heroRect;

        const scaleX = endRect.width / startRect.width;
        const scaleY = endRect.height / startRect.height;
        const translateX = endRect.left - startRect.left;
        const translateY = endRect.top - startRect.top;

        heroVideo.style.transformOrigin = 'top left';
        heroVideo.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;

        const onTransitionEnd = () => {
          heroVideo.removeEventListener('transitionend', onTransitionEnd);
          heroVideo.style.transform = '';
          heroVideo.classList.remove('video-intro');
          heroVideo.classList.add('video-banner');
          heroContent.classList.add('visible');
          document.body.style.overflow = originalOverflow || '';
          try { heroVideo.loop = true; } catch (_) {}
        };
        heroVideo.addEventListener('transitionend', onTransitionEnd);
      }, SPLASH_MS);
    }
  }

})();


