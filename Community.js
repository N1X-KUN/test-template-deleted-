// Community Page Functionality
(function() {
  'use strict';

  const STORAGE_KEY = 'rivals_community_posts';
  const USER_STORAGE_KEY = 'rivals_current_user';
  const LOGGED_IN_USER_KEY = 'loggedInUser';
  const GUEST_KEY = 'isGuest';
  const FOLLOWING_KEY_PREFIX = 'rivals_following_';
  const BLOCKED_KEY_PREFIX = 'rivals_blocked_posts_';

  const QUICK_NAV_LINKS = {
    hotList: 'https://www.marvelrivals.com/heroes_data/',
    teamUp: 'https://www.marvelrivals.com/heroes/teamup.html',
    media: 'https://www.marvelrivals.com/media/'
  };

  // Figures out who is currently using the page (real account or temporary guest)
  function getCurrentUser() {
    // Prefer main-site auth state so Community stays in sync after login/logout on any page
    const loggedStr = localStorage.getItem(LOGGED_IN_USER_KEY) || sessionStorage.getItem(LOGGED_IN_USER_KEY);
    if (loggedStr) {
      try {
        const u = JSON.parse(loggedStr);
        if (u && typeof u === 'object') {
          u.isGuest = false;
          return u;
        }
      } catch {}
    }

    // If guest flag exists, treat as guest
    const isGuestFlag = localStorage.getItem(GUEST_KEY) === 'true' || sessionStorage.getItem(GUEST_KEY) === 'true';

    // Fallback to legacy community user key
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && typeof user === 'object') {
          if (user.isGuest === undefined) {
            user.isGuest = isGuestFlag || (user.id && user.id.startsWith('guest_'));
          }
          return user;
        }
      } catch {}
    }

    // Default guest user
    return {
      id: 'guest_' + Date.now(),
      username: 'Guest',
      avatar: 'Images/Rival.png',
      isGuest: true
    };
  }
  
  function isGuest() {
    return currentUser.isGuest === true;
  }

  function saveCurrentUser(user) {
    // Keep both keys in sync to avoid "Guest" showing up after a real login.
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (user && user.isGuest === false) {
      localStorage.setItem(LOGGED_IN_USER_KEY, JSON.stringify(user));
      sessionStorage.setItem(LOGGED_IN_USER_KEY, JSON.stringify(user));
      localStorage.removeItem(GUEST_KEY);
      sessionStorage.removeItem(GUEST_KEY);
    }
  }

  // Get all posts
  function getPosts() {
    const postsStr = localStorage.getItem(STORAGE_KEY);
    return postsStr ? JSON.parse(postsStr) : [];
  }

  function getFollowingKey() {
    const id = (currentUser && currentUser.id) ? String(currentUser.id) : 'guest';
    return `${FOLLOWING_KEY_PREFIX}${id}`;
  }

  function getFollowingSet() {
    try {
      const raw = localStorage.getItem(getFollowingKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function saveFollowingSet(set) {
    localStorage.setItem(getFollowingKey(), JSON.stringify(Array.from(set)));
  }

  function toggleFollowUser(targetUserId) {
    const set = getFollowingSet();
    if (set.has(targetUserId)) set.delete(targetUserId);
    else set.add(targetUserId);
    saveFollowingSet(set);
    return set;
  }

  function savePosts(posts) {
    try {
      const postsJson = JSON.stringify(posts);
      localStorage.setItem(STORAGE_KEY, postsJson);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('Storage quota exceeded!', error);
        const errorMsg = 'Storage limit reached! Please delete some old posts or clear your browser data. Videos are too large for local storage.';
        alert(errorMsg);
        throw new Error(errorMsg);
      }
      throw error;
    }
  }

  function isAdminUser() {
    return !!currentUser && currentUser.isGuest !== true && String(currentUser.role || 'user') === 'admin';
  }

  function getBlockedKey() {
    const id = (currentUser && currentUser.id) ? String(currentUser.id) : 'guest';
    return `${BLOCKED_KEY_PREFIX}${id}`;
  }

  function getBlockedSet() {
    try {
      const raw = localStorage.getItem(getBlockedKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function saveBlockedSet(set) {
    localStorage.setItem(getBlockedKey(), JSON.stringify(Array.from(set)));
  }

  function isPostBlocked(postId) {
    return getBlockedSet().has(String(postId));
  }

  function toggleBlockPost(postId) {
    const set = getBlockedSet();
    const id = String(postId);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    saveBlockedSet(set);
    return set.has(id);
  }

  function deletePost(postId) {
    const posts = getPosts();
    const next = posts.filter(p => String(p.id) !== String(postId));
    savePosts(next);
  }

  function togglePinPost(postId) {
    if (!isAdminUser()) return null;
    const posts = getPosts();
    const idx = posts.findIndex(p => String(p.id) === String(postId));
    if (idx === -1) return null;
    const pinnedNow = !posts[idx].pinned;
    posts[idx] = {
      ...posts[idx],
      pinned: pinnedNow,
      pinnedAt: pinnedNow ? new Date().toISOString() : null
    };
    savePosts(posts);
    return posts[idx];
  }

  function getShareUrlForPost(postId) {
    try {
      return `${window.location.origin}${window.location.pathname}#${encodeURIComponent(String(postId))}`;
    } catch {
      return `#${encodeURIComponent(String(postId))}`;
    }
  }

  let toastEl = null;
  let toastTimer = null;
  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'community-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 1600);
  }

  async function sharePost(postId) {
    const url = getShareUrlForPost(postId);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Shared: link copied');
    } catch {
      // Fallback if clipboard is blocked
      window.prompt('Copy this link:', url);
    }
  }

  function closeAllPostMenus() {
    document.querySelectorAll('.post-menu').forEach(menu => menu.setAttribute('hidden', ''));
  }

  function addPost(postData) {
    const posts = getPosts();
    const newPost = {
      id: postData.id || 'post_' + Date.now(),
      ...postData,
      createdAt: postData.createdAt || new Date().toISOString(),
      likes: postData.likes !== undefined ? postData.likes : 0,
      comments: postData.comments || [],
      likedBy: postData.likedBy || []
    };
    posts.unshift(newPost); // Add to beginning
    try {
      savePosts(posts);
    } catch (error) {
      // Remove the post we just added since save failed
      posts.shift();
      throw error;
    }
    return newPost;
  }
  
  window.clearOldPosts = function(keepCount = 10) {
    if (!confirm(`This will delete all posts except the ${keepCount} most recent ones. Continue?`)) {
      return;
    }
    try {
      const posts = getPosts();
      if (posts.length <= keepCount) {
        alert(`You only have ${posts.length} posts. Nothing to clear.`);
        return;
      }
      
      // Keep the most recent posts (sorted by createdAt)
      const sortedPosts = [...posts].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      
      const postsToKeep = sortedPosts.slice(0, keepCount);
      const deletedCount = posts.length - postsToKeep.length;
      
      savePosts(postsToKeep);
      loadPosts();
      alert(`✅ Cleared ${deletedCount} old post(s). Kept ${postsToKeep.length} most recent.`);
    } catch (error) {
      alert('Error clearing posts: ' + error.message);
    }
  };

  // Update post
  function updatePost(postId, updates) {
    const posts = getPosts();
    const index = posts.findIndex(p => p.id === postId);
    if (index !== -1) {
      posts[index] = { ...posts[index], ...updates };
      savePosts(posts);
      return posts[index];
    }
    return null;
  }

  function addComment(postId, commentData) {
    if (isGuest()) {
      alert('Please sign up to comment on posts!');
      return null;
    }
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      const newComment = {
        id: 'comment_' + Date.now(),
        ...commentData,
        createdAt: new Date().toISOString()
      };
      post.comments = post.comments || [];
      post.comments.push(newComment);
      savePosts(posts);
      return newComment;
    }
    return null;
  }

  // Delete comment (admin only)
  function deleteComment(postId, commentId) {
    if (!isAdminUser()) return null;
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (post && post.comments) {
      post.comments = post.comments.filter(c => String(c.id) !== String(commentId));
      savePosts(posts);
      return true;
    }
    return null;
  }

  // Toggle like on post
  function toggleLike(postId, userId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.likedBy = post.likedBy || [];
      const index = post.likedBy.indexOf(userId);
      if (index > -1) {
        post.likedBy.splice(index, 1);
        post.likes = Math.max(0, post.likes - 1);
      } else {
        post.likedBy.push(userId);
        post.likes = (post.likes || 0) + 1;
      }
      savePosts(posts);
      return post;
    }
    return null;
  }

  const createPostInput = document.getElementById('create-post-input');
  const submitPostBtn = document.getElementById('submit-post-btn');
  const mediaUploadInput = document.getElementById('media-upload-input');
  const mediaPreview = document.getElementById('media-preview');
  const postsFeed = document.getElementById('posts-feed');
  const communityTabs = document.querySelectorAll('.community-tab');
  const createPostBtns = document.querySelectorAll('.create-post-btn');
  const postModal = document.getElementById('post-modal');
  const postModalBody = document.getElementById('post-modal-body');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  
  const profileGuestState = document.getElementById('profile-guest-state');
  const profileLoggedState = document.getElementById('profile-logged-state');
  const profileSignupTrigger = document.getElementById('profile-signup-trigger');
  const profileUsernameText = document.getElementById('profile-username-text');
  const profileBioText = document.getElementById('profile-bio-text');
  const profileAvatarImg = document.getElementById('profile-avatar-img');
  const profileFavoriteChar = document.getElementById('profile-favorite-char');
  const profileRank = document.getElementById('profile-rank');
  const profileWinrate = document.getElementById('profile-winrate');
  const profileCreatedDate = document.getElementById('profile-created-date');

  let selectedMedia = [];
  let activeTab = 'discussions';
  let currentUser = getCurrentUser();

  // Format account creation date
  function formatAccountDate(createdAt) {
    if (!createdAt) return 'Not set';
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = now - created;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // Format as date
    return created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: created.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }
  
  // Update profile display
  function updateProfileDisplay() {
    if (isGuest()) {
      // Show guest state
      if (profileGuestState) profileGuestState.style.display = 'block';
      if (profileLoggedState) profileLoggedState.style.display = 'none';
    } else {
      // Show logged in state
      if (profileGuestState) profileGuestState.style.display = 'none';
      if (profileLoggedState) profileLoggedState.style.display = 'block';
      
      // Update profile info
      if (profileUsernameText) profileUsernameText.textContent = currentUser.username || 'User';
      if (profileBioText) profileBioText.textContent = currentUser.bio || 'No bio set';
      if (profileAvatarImg && currentUser.avatar) profileAvatarImg.src = currentUser.avatar;
      if (profileFavoriteChar) profileFavoriteChar.textContent = currentUser.favoriteCharacter || 'Not set';
      if (profileRank) profileRank.textContent = currentUser.rank || 'Unranked';
      if (profileWinrate) profileWinrate.textContent = currentUser.winrate ? `${currentUser.winrate}%` : '0%';
      if (profileCreatedDate) profileCreatedDate.textContent = formatAccountDate(currentUser.createdAt);
    }
    
    // Update create post section based on guest status
    updateCreatePostSection();
  }
  
  // Update create post section (disable for guests)
  function updateCreatePostSection() {
    if (isGuest()) {
      // Disable posting for guests
      if (createPostInput) {
        createPostInput.disabled = true;
        createPostInput.placeholder = 'Sign up to create a post and share content!';
      }
      if (submitPostBtn) submitPostBtn.disabled = true;
      createPostBtns.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      });
    } else {
      // Enable posting for logged in users
      if (createPostInput) {
        createPostInput.disabled = false;
        createPostInput.placeholder = 'Share your thoughts, strategies, or highlights...';
      }
      createPostBtns.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      });
    }
  }

  function init() {
    // Set current user avatar
    if (currentUserAvatar && currentUser.avatar) {
      currentUserAvatar.src = currentUser.avatar;
    }
    
    // Update profile display
    updateProfileDisplay();

    // Load initial posts
    loadPosts();

    // Set up event listeners
    setupEventListeners();

    // Show admin widget if admin
    console.log('Current user:', currentUser); // Debug: log current user
    console.log('Is admin?', isAdminUser()); // Debug: log admin status
    if (isAdminUser()) {
      const adminWidget = document.getElementById('admin-accounts-widget');
      if (adminWidget) {
        adminWidget.style.display = 'block';
        console.log('Admin widget shown'); // Debug
      } else {
        console.error('Admin widget element not found'); // Debug
      }
      setupAdminAccountsModal();
    } else {
      console.log('User is not admin, hiding admin widget'); // Debug
      const adminWidget = document.getElementById('admin-accounts-widget');
      if (adminWidget) adminWidget.style.display = 'none';
    }

    // Initialize with sample posts if empty
    const existingPosts = getPosts();
    if (existingPosts.length === 0) {
      initializeSamplePosts();
    } else {
      // Check if seeded posts exist, if not add them
      const hasSeededPosts = existingPosts.some(p => 
        p.userId === 'seed_admin'
      );
      if (!hasSeededPosts) {
        console.log('Seeded posts missing, adding them...');
        initializeSamplePosts();
      }
    }

    // Quick navigation links
    const hot = document.getElementById('nav-hot-list');
    const team = document.getElementById('nav-team-up');
    const media = document.getElementById('nav-media');
    if (hot) hot.href = QUICK_NAV_LINKS.hotList;
    if (team) team.href = QUICK_NAV_LINKS.teamUp;
    if (media) media.href = QUICK_NAV_LINKS.media;
  }

  // Built-in (seed) posts that ship with the site.
  // You can edit/add posts here to make them appear "already there" before users post anything.
  const SEEDED_POSTS = [
      {
        userId: 'seed_admin',
        username: 'Galacta',
        avatar: 'Images/GalactaEmote1.png',
        game: 'Marvel Rivals',
        title: 'Welcome to Rivals Community Page',
        text: 'Drop your highlights, team comps, and memes here. Use ❤️ to boost posts into Popular.',
        media: ['Images/Community1.jpg'],
        hashtags: ['#Rivals', '#Community'],
        likes: 67,
        comments: [
          { id: 'seed_comment_1', userId: 'seed_admin', username: 'Cinematic Jeff', avatar: 'Images/Login.jpg', text: 'Mrrwarrrr!', createdAt: new Date(Date.now() - 3600000).toISOString() }
        ],
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        userId: 'seed_admin',
        username: 'Jeff',
        avatar: 'Images/Login.jpg',
        game: 'Marvel Rivals',
        text: 'Mrrrwaaarrrr~ [Translated: Absolute Cinema.]',
        media: [],
        hashtags: ['#JeffMain'],
        likes: 999,
        comments: [],
        createdAt: new Date(Date.now() - 72000000).toISOString()
      },
      {
        userId: 'seed_admin',
        username: 'Galacta',
        avatar: 'Images/GalactaEmote3.png',
        game: 'Marvel Rivals',
        text: 'STOP THAT VEHICLE 🚗🚗🚗',
        media: ['Images/Community3.jpg'],
        hashtags: ['#PUSH DA PAYLOAD'],
        likes: 69,
        comments: [],
        createdAt: new Date(Date.now() - 85400000).toISOString()
      },
      {
        userId: 'seed_admin',
        username: 'Galacta',
        avatar: 'Images/GalactaEmote2.png',
        game: 'Marvel Rival',
        text: 'HEEELLLP 😭😭',
        media: ['Images/Community2.jpg'],
        hashtags: [],
        likes: 21,
        comments: [],
        createdAt: new Date(Date.now() - 96700000).toISOString()
      },
      {
        userId: 'seed_admin',
        username: 'Galacta',
        avatar: 'Images/GalactaEmote4.png',
        game: 'Marvel Rival',
        text: 'I know how Earth Loves Me As Much As I Love It.',
        media: ['Images/Community4.jpg'],
        hashtags: ['#Earth-Chan'],
        likes: 9000,
        comments: [],
        createdAt: new Date(Date.now() - 67000000).toISOString()
      }
    ];

  // Initialize seed posts (only runs once when there are no posts yet)
  function initializeSamplePosts() {
    const existingPosts = getPosts();
    const existingIds = new Set(existingPosts.map(p => p.id || p.userId + '_' + p.createdAt));
    
    SEEDED_POSTS.forEach(post => {
      // Create a unique ID for seeded posts if they don't have one
      const postId = post.id || `seed_${post.userId}_${post.createdAt}`;
      // Only add if it doesn't already exist
      if (!existingIds.has(postId)) {
        const seededPost = { 
          ...post, 
          id: postId,
          // Preserve seeded post data (likes, comments, etc.)
          likes: post.likes || 0,
          comments: post.comments || [],
          likedBy: post.likedBy || []
        };
        addPost(seededPost);
      }
    });
    loadPosts();
  }
  
  // Expose function globally for manual reload
  window.reloadSeededPosts = function() {
    const allPosts = getPosts();
    const userPosts = allPosts.filter(p => p.userId !== 'seed_admin');
    const seededPosts = allPosts.filter(p => p.userId === 'seed_admin');
    
    // Warn user about user posts
    let confirmMessage = `This will replace all seeded posts with the current SEEDED_POSTS array.\n\n`;
    if (userPosts.length > 0) {
      confirmMessage += `⚠️ WARNING: You have ${userPosts.length} user post(s) that will be PRESERVED.\n\n`;
    }
    confirmMessage += `Current state:\n- User posts: ${userPosts.length}\n- Seeded posts: ${seededPosts.length}\n- Total: ${allPosts.length}\n\nContinue?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    console.log('Force reloading seeded posts...');
    console.log(`📊 Total posts before: ${allPosts.length}`);
    console.log(`👤 User posts: ${userPosts.length}`);
    console.log(`🌱 Seeded posts: ${seededPosts.length}`);
    
    // Keep ONLY user posts (remove all seeded posts)
    const filteredPosts = allPosts.filter(p => 
      p.userId !== 'seed_admin'
    );
    
    console.log(`💾 Saving ${filteredPosts.length} user posts...`);
    savePosts(filteredPosts);
    
    // Add seeded posts back (this will add ALL posts from SEEDED_POSTS array)
    initializeSamplePosts();
    
    // Verify final count
    const finalPosts = getPosts();
    const finalUserPosts = finalPosts.filter(p => p.userId !== 'seed_admin');
    const finalSeededPosts = finalPosts.filter(p => p.userId === 'seed_admin');
    
    console.log(`✅ Seeded posts reloaded!`);
    console.log(`📊 Total posts after: ${finalPosts.length}`);
    console.log(`👤 User posts: ${finalUserPosts.length}`);
    console.log(`🌱 Seeded posts: ${finalSeededPosts.length}`);
    
    alert(`Seeded posts reloaded!\n\nUser posts: ${finalUserPosts.length} (preserved)\nSeeded posts: ${finalSeededPosts.length}\nTotal: ${finalPosts.length}`);
    
    // Reload the display
    loadPosts();
  };
  
  // Backup function to save all posts to a JSON string
  window.backupPosts = function() {
    const allPosts = getPosts();
    const backup = {
      timestamp: new Date().toISOString(),
      total: allPosts.length,
      posts: allPosts
    };
    const backupStr = JSON.stringify(backup, null, 2);
    console.log('📦 POST BACKUP:');
    console.log(backupStr);
    
    // Also copy to clipboard if possible
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(backupStr).then(() => {
        alert(`✅ Backup copied to clipboard!\n\nTotal posts: ${allPosts.length}\n\nYou can paste this into a text file to save it.`);
      }).catch(() => {
        alert(`✅ Backup generated!\n\nTotal posts: ${allPosts.length}\n\nCheck the console (F12) to copy the backup JSON.`);
      });
    } else {
      alert(`✅ Backup generated!\n\nTotal posts: ${allPosts.length}\n\nCheck the console (F12) to copy the backup JSON.`);
    }
    
    return backupStr;
  };
  
  // Restore function to restore posts from backup
  window.restorePosts = function(backupJson) {
    if (!backupJson) {
      const backupStr = prompt('Paste your backup JSON here:');
      if (!backupStr) return;
      try {
        backupJson = JSON.parse(backupStr);
      } catch (e) {
        alert('Invalid backup JSON. Please check your backup and try again.');
        return;
      }
    }
    
    if (!backupJson.posts || !Array.isArray(backupJson.posts)) {
      alert('Invalid backup format. Expected an object with a "posts" array.');
      return;
    }
    
    if (!confirm(`This will replace ALL current posts with the backup.\n\nBackup contains ${backupJson.posts.length} post(s) from ${backupJson.timestamp || 'unknown time'}.\n\nContinue?`)) {
      return;
    }
    
    savePosts(backupJson.posts);
    loadPosts();
    alert(`✅ Posts restored! ${backupJson.posts.length} post(s) loaded.`);
  };
  
  // Diagnostic function to check posts
  window.checkPosts = function() {
    const allPosts = getPosts();
    const userPosts = allPosts.filter(p => p.userId !== 'seed_admin');
    const seededPosts = allPosts.filter(p => p.userId === 'seed_admin');
    
    console.log('📊 POST DIAGNOSTICS:');
    console.log(`Total posts: ${allPosts.length}`);
    console.log(`User posts: ${userPosts.length}`);
    console.log(`Seeded posts: ${seededPosts.length}`);
    console.log('\n👤 USER POSTS:');
    userPosts.forEach((post, i) => {
      console.log(`${i + 1}. ${post.username || 'Unknown'} (userId: ${post.userId}) - "${post.text?.substring(0, 50) || post.title?.substring(0, 50) || 'No text'}"... (Post ID: ${post.id})`);
    });
    console.log('\n🌱 SEEDED POSTS:');
    seededPosts.forEach((post, i) => {
      console.log(`${i + 1}. ${post.username || 'Unknown'} - "${post.text?.substring(0, 50) || post.title?.substring(0, 50) || 'No text'}"... (ID: ${post.id})`);
    });
    
    // Also check all user IDs in posts vs MongoDB users
    console.log('\n🔍 USER ID ANALYSIS:');
    const uniqueUserIds = [...new Set(userPosts.map(p => p.userId))];
    console.log('Unique userIds in posts:', uniqueUserIds);
    
    return {
      total: allPosts.length,
      user: userPosts.length,
      seeded: seededPosts.length,
      userPosts: userPosts,
      seededPosts: seededPosts,
      uniqueUserIds: uniqueUserIds
    };
  };
  
  // Function to check user ID matching
  window.checkUserMatching = async function() {
    try {
      const response = await fetch('/users');
      if (!response.ok) {
        console.error('Failed to fetch users');
        return;
      }
      const users = await response.json();
      const allPosts = getPosts();
      const userPosts = allPosts.filter(p => p.userId !== 'seed_admin');
      
      console.log('\n🔍 USER ID MATCHING ANALYSIS:');
      console.log(`MongoDB Users: ${users.length}`);
      console.log(`User Posts: ${userPosts.length}`);
      
      users.forEach(user => {
        const mongoId = String(user._id || user.id);
        const matchingPosts = userPosts.filter(p => {
          const postUserId = String(p.userId || '');
          return postUserId === mongoId || postUserId.includes(mongoId) || mongoId.includes(postUserId);
        });
        const matchingComments = getCommentCountForUser(mongoId);
        console.log(`\n👤 ${user.name || user.email}:`);
        console.log(`   MongoDB ID: ${mongoId}`);
        console.log(`   Posts found: ${matchingPosts.length}`);
        console.log(`   Comments found: ${matchingComments}`);
        if (matchingPosts.length > 0) {
          console.log(`   Post userIds:`, matchingPosts.map(p => p.userId));
        }
      });
      
      // Check for orphaned posts (posts with userIds that don't match any MongoDB user)
      const mongoIds = users.map(u => String(u._id || u.id));
      const orphanedPosts = userPosts.filter(p => {
        const postUserId = String(p.userId || '');
        return !mongoIds.some(mid => postUserId === mid || postUserId.includes(mid) || mid.includes(postUserId));
      });
      
      if (orphanedPosts.length > 0) {
        console.log(`\n⚠️ ORPHANED POSTS (${orphanedPosts.length}):`);
        orphanedPosts.forEach((post, i) => {
          console.log(`${i + 1}. ${post.username || 'Unknown'} (userId: ${post.userId}) - "${post.text?.substring(0, 50) || 'No text'}"...`);
        });
      }
      
    } catch (error) {
      console.error('Error checking user matching:', error);
    }
  };

  // Setup event listeners
  function setupEventListeners() {
    // Post input
    if (createPostInput) {
      createPostInput.addEventListener('input', () => {
        if (submitPostBtn) {
          const hasText = createPostInput.value.trim().length > 0;
          const hasMedia = selectedMedia.length > 0;
          submitPostBtn.disabled = !hasText && !hasMedia;
        }
      });
    }

    // Submit post
    if (submitPostBtn) {
      submitPostBtn.addEventListener('click', handlePostSubmit);
    }

    // Media upload buttons
    createPostBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (isGuest()) {
          alert('Please sign up to upload media!');
          if (profileSignupTrigger) profileSignupTrigger.click();
          return;
        }
        const type = btn.dataset.type;
        if (mediaUploadInput) {
          mediaUploadInput.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'image/*';
          mediaUploadInput.click();
        }
      });
    });
    
    // Profile signup trigger
    if (profileSignupTrigger) {
      profileSignupTrigger.addEventListener('click', () => {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) loginBtn.click();
      });
    }

    // Media upload input
    if (mediaUploadInput) {
      mediaUploadInput.addEventListener('change', handleMediaUpload);
    }

    // Tab switching
    communityTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        communityTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        loadPosts();
      });
    });

    // Modal close
    const modalCloses = document.querySelectorAll('[data-modal-close]');
    modalCloses.forEach(btn => {
      btn.addEventListener('click', () => {
        if (postModal) {
          postModal.setAttribute('hidden', '');
        }
      });
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && postModal && !postModal.hasAttribute('hidden')) {
        postModal.setAttribute('hidden', '');
      }
      if (e.key === 'Escape') {
        closeAllPostMenus();
      }
    });

    // Close post menus when clicking outside
    document.addEventListener('click', (e) => {
      const inside = e.target && e.target.closest && e.target.closest('.post-menu-wrap');
      if (!inside) closeAllPostMenus();
    });
    
    // Ensure modal is hidden on page load
    if (postModal) {
      postModal.setAttribute('hidden', '');
    }
  }

  function handleMediaUpload(e) {
    const file = e.target.files[0]; // Only get the first file
    if (!file) return;
    
    // Check if user already has an attachment
    if (selectedMedia.length > 0) {
      alert('Please have only one attachment');
      e.target.value = ''; // Reset input
      return;
    }
    
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      // Check file size (warn if video is too large)
      const fileSizeMB = file.size / (1024 * 1024);
      const isVideo = file.type.startsWith('video/');
      
      if (isVideo && fileSizeMB > 5) {
        if (!confirm(`Warning: This video is ${fileSizeMB.toFixed(1)}MB. Large videos may exceed storage limits and fail to save.\n\nContinue anyway?`)) {
          e.target.value = '';
          return;
        }
      }
      
      if (fileSizeMB > 10) {
        alert('File is too large! Please use a file smaller than 10MB. Videos stored in browser storage have size limits.');
        e.target.value = '';
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const dataUrlSizeMB = dataUrl.length / (1024 * 1024);
        
        console.log('File loaded:', { 
          type: file.type, 
          fileSizeMB: fileSizeMB.toFixed(2),
          dataUrlSizeMB: dataUrlSizeMB.toFixed(2)
        });
        
        // Warn if data URL is very large
        if (dataUrlSizeMB > 8) {
          alert(`Warning: This file will use ${dataUrlSizeMB.toFixed(1)}MB of storage. You may hit storage limits if you have many posts.`);
        }
        
        selectedMedia = [{
          type: file.type.startsWith('image/') ? 'image' : 'video',
          url: dataUrl,
          file: file
        }];
        updateMediaPreview();
        // Update submit button state
        if (submitPostBtn) {
          const hasText = createPostInput ? createPostInput.value.trim().length > 0 : false;
          const hasMedia = selectedMedia.length > 0;
          submitPostBtn.disabled = !hasText && !hasMedia;
        }
      };
      reader.onerror = () => {
        alert('Error reading file. Please try again.');
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select an image or video file');
    }
    e.target.value = ''; // Reset input
  }

  function updateMediaPreview() {
    if (!mediaPreview) return;
    
    if (selectedMedia.length === 0) {
      mediaPreview.setAttribute('hidden', '');
      mediaPreview.innerHTML = ''; // Clear any existing content
      return;
    }

    // Only show one media item (the first one)
    const media = selectedMedia[0];
    mediaPreview.removeAttribute('hidden');
    mediaPreview.innerHTML = `
      <div class="media-preview-item">
        ${media.type === 'image' 
          ? `<img src="${media.url}" alt="Preview" />`
          : `<video src="${media.url}" controls></video>`
        }
        <button class="remove-media" type="button" title="Remove attachment">&times;</button>
      </div>
    `;

    // Remove media button
    const removeBtn = mediaPreview.querySelector('.remove-media');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        selectedMedia = [];
        updateMediaPreview(); // This will hide the preview
            // Update submit button state
            if (submitPostBtn) {
              const hasText = createPostInput ? createPostInput.value.trim().length > 0 : false;
              const hasMedia = selectedMedia.length > 0;
              submitPostBtn.disabled = !hasText && !hasMedia;
            }
      });
    }
  }

  function handlePostSubmit() {
    if (isGuest()) {
      alert('Please sign up to create posts!');
      // Trigger signup modal
      if (profileSignupTrigger) profileSignupTrigger.click();
      return;
    }
    
    const text = createPostInput ? createPostInput.value.trim() : '';
    
    if (!text && selectedMedia.length === 0) {
      return;
    }

    // Check if we're editing an existing post
    const editingPostId = createPostInput ? createPostInput.dataset.editingPostId : null;
    if (editingPostId) {
      // Update existing post (only save first media item)
      const updated = updatePost(editingPostId, {
        text: text,
        media: selectedMedia.length > 0 ? [selectedMedia[0].url] : [],
        hashtags: extractHashtags(text)
      });
      if (updated) {
        // Reset form
        if (createPostInput) {
          createPostInput.value = '';
          delete createPostInput.dataset.editingPostId;
        }
        selectedMedia = [];
        updateMediaPreview();
        if (submitPostBtn) {
          submitPostBtn.disabled = true;
          submitPostBtn.textContent = 'Post';
        }
        loadPosts();
        showToast('Post updated!');
      }
      return;
    }

    // Create new post (only save first media item)
    const mediaArray = selectedMedia.length > 0 ? [selectedMedia[0].url] : [];
    console.log('Creating post:', { 
      hasText: text.length > 0, 
      hasMedia: mediaArray.length > 0,
      mediaType: selectedMedia.length > 0 ? selectedMedia[0].type : 'none',
      mediaUrlLength: mediaArray.length > 0 ? mediaArray[0].length : 0
    });
    
    try {
      const newPost = addPost({
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        game: 'Marvel Rivals',
        text: text,
        media: mediaArray,
        hashtags: extractHashtags(text),
        likedBy: []
      });

      console.log('Post created successfully:', { 
        id: newPost.id, 
        hasMedia: newPost.media && newPost.media.length > 0,
        mediaCount: newPost.media ? newPost.media.length : 0
      });

      // Reset form
      if (createPostInput) createPostInput.value = '';
      selectedMedia = [];
      updateMediaPreview();
      if (submitPostBtn) submitPostBtn.disabled = true;

      // Reload posts
      loadPosts();
      showToast('Post created!');
    } catch (error) {
      console.error('Error creating post:', error);
      if (error.message && error.message.includes('Storage limit')) {
        alert('❌ Storage limit reached!\n\nYour browser\'s storage is full. Please:\n1. Delete some old posts\n2. Clear browser data\n3. Use smaller video files\n\nVideos are stored in browser storage which has a 5-10MB limit.');
      } else {
        alert('Error creating post: ' + error.message);
      }
    }
  }

  function openEditPostModal(postId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    // Check ownership or admin status
    const isOwnPost = String(post.userId) === String(currentUser.id);
    if (!isOwnPost && !isAdminUser()) {
      alert('You can only edit your own posts.');
      return;
    }

    // Pre-fill the create post form with existing post data
    if (createPostInput) {
      createPostInput.value = post.text || '';
      createPostInput.dataset.editingPostId = postId;
      createPostInput.focus();
    }

    // Load existing media (only first item, since we only allow one attachment)
    const firstMedia = post.media && post.media.length > 0 ? post.media[0] : null;
    if (firstMedia) {
      const isVideo = firstMedia.startsWith('data:video/') || 
                      firstMedia.includes('video') || 
                      firstMedia.endsWith('.mp4') || 
                      firstMedia.endsWith('.webm') ||
                      firstMedia.endsWith('.mov') ||
                      firstMedia.endsWith('.avi');
      selectedMedia = [{
        type: isVideo ? 'video' : 'image',
        url: firstMedia
      }];
    } else {
      selectedMedia = [];
    }
    updateMediaPreview();

    // Update submit button text
    if (submitPostBtn) {
      submitPostBtn.textContent = 'Update Post';
      submitPostBtn.disabled = false;
    }

    // Scroll to create post section
    const createPostCard = document.querySelector('.create-post-card');
    if (createPostCard) {
      createPostCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      createPostCard.style.border = '2px solid #ffd700';
      setTimeout(() => {
        createPostCard.style.border = '';
      }, 2000);
    }
  }

  // Force reload seeded posts (clears existing and re-adds from SEEDED_POSTS)
  function reloadSeededPosts() {
    if (!window.confirm('This will clear all current posts and reload the seeded posts from code. Continue?')) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    initializeSamplePosts();
    showToast('Seeded posts reloaded!');
  }

  // Expose reload function to window for console access
  window.reloadSeededPosts = reloadSeededPosts;

  // Admin Accounts Modal
  function setupAdminAccountsModal() {
    const modal = document.getElementById('admin-accounts-modal');
    const openBtn = document.getElementById('admin-view-accounts-btn');
    const closeBtns = document.querySelectorAll('[data-modal-close]');
    
    if (!modal || !openBtn) return;

    function openModal() {
      modal.removeAttribute('hidden');
      modal.style.display = 'flex';
      loadAdminAccounts();
    }

    function closeModal() {
      modal.setAttribute('hidden', 'true');
      modal.style.display = 'none';
    }
    
    // Ensure modal starts hidden
    modal.setAttribute('hidden', 'true');
    modal.style.display = 'none';

    openBtn.addEventListener('click', openModal);
    closeBtns.forEach(btn => btn.addEventListener('click', closeModal));

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        closeModal();
      }
    });
  }

  function getCommentCountForUser(userId) {
    try {
      const postsStr = localStorage.getItem(STORAGE_KEY);
      if (!postsStr) return 0;
      const posts = JSON.parse(postsStr);
      if (!Array.isArray(posts)) return 0;
      
      if (!userId) return 0;
      
      const targetUserId = String(userId || '').trim();
      if (!targetUserId) return 0;
      
      let count = 0;
      posts.forEach(post => {
        if (post.comments && Array.isArray(post.comments)) {
          count += post.comments.filter(c => {
            const commentUserId = String(c.userId || c.user_id || '').trim();
            if (!commentUserId) return false;
            
            // Exact match
            if (commentUserId === targetUserId) return true;
            
            // Check if one contains the other
            if (commentUserId.includes(targetUserId) || targetUserId.includes(commentUserId)) return true;
            
            // Normalized match
            const normalizedComment = commentUserId.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedTarget = targetUserId.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedComment && normalizedTarget && normalizedComment === normalizedTarget) return true;
            
            return false;
          }).length;
        }
      });
      return count;
    } catch (error) {
      console.error('Error in getCommentCountForUser:', error);
      return 0;
    }
  }

  function getPostCountForUser(userId) {
    try {
      const postsStr = localStorage.getItem(STORAGE_KEY);
      if (!postsStr) return 0;
      const posts = JSON.parse(postsStr);
      if (!Array.isArray(posts)) return 0;
      
      // Skip seeded posts
      const userPosts = posts.filter(p => p.userId !== 'seed_admin');
      
      if (!userId) return 0;
      
      const targetUserId = String(userId || '').trim();
      if (!targetUserId) return 0;
      
      // Try multiple matching strategies
      const matches = userPosts.filter(p => {
        const postUserId = String(p.userId || p.user_id || '').trim();
        if (!postUserId) return false;
        
        // Exact match
        if (postUserId === targetUserId) return true;
        
        // Check if one contains the other (for partial matches)
        if (postUserId.includes(targetUserId) || targetUserId.includes(postUserId)) return true;
        
        // Check if they're the same when normalized (remove special chars, lowercase)
        const normalizedPost = postUserId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedTarget = targetUserId.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedPost && normalizedTarget && normalizedPost === normalizedTarget) return true;
        
        return false;
      });
      
      return matches.length;
    } catch (error) {
      console.error('Error in getPostCountForUser:', error);
      return 0;
    }
  }

  async function loadAdminAccounts() {
    const tbody = document.getElementById('admin-accounts-table-body');
    if (!tbody) {
      console.error('Admin accounts table body not found');
      return;
    }

    // Show loading state
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: rgba(255,255,255,0.6);">Loading accounts...</td></tr>';

    try {
      const response = await fetch('/users');
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to load users:', response.status, errorText);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">
          Error loading accounts (${response.status}). 
          <br>Make sure MongoDB is connected and the server is running.
          <br><small>Check browser console (F12) for details.</small>
        </td></tr>`;
        return;
      }

      const users = await response.json();
      
      if (!Array.isArray(users)) {
        console.error('Invalid response format:', users);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">Invalid response from server</td></tr>';
        return;
      }

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: rgba(255,255,255,0.6);">No accounts found. Register a user first.</td></tr>';
        return;
      }

      tbody.innerHTML = '';

      // Sort by creation date (newest first)
      users.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      console.log(`Loaded ${users.length} user(s) from database`);
      console.log('Users data:', users); // Debug: log all users

      users.forEach(user => {
        console.log('Processing user:', user.name, user.email, 'Role:', user.role); // Debug log
        // Try both _id and id for MongoDB compatibility
        const userId = user._id || user.id;
        const postCount = getPostCountForUser(userId);
        const commentCount = getCommentCountForUser(userId);
        
        // Debug logging
        console.log(`  User ID: ${userId}`);
        console.log(`  Post count: ${postCount}`);
        console.log(`  Comment count: ${commentCount}`);
        const createdDate = user.createdAt 
          ? new Date(user.createdAt).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })
          : 'N/A';
        const isBanned = !!user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
        const isAdmin = user.role === 'admin';

        const row = document.createElement('tr');
        const userIdForActions = userId;
        row.innerHTML = `
          <td>${escapeHtml(user.name || 'N/A')}</td>
          <td>${createdDate}</td>
          <td>${postCount}</td>
          <td>${commentCount}</td>
          <td>
            ${isAdmin ? '<span style="color: #ffd700;">Admin</span>' : isBanned
              ? `<button class="admin-ban-btn" onclick="unbanUserFromModal('${userIdForActions}')">Unban</button>`
              : `<button class="admin-ban-btn danger" onclick="banUserFromModal('${userIdForActions}', '${escapeHtml(String(user.name || 'User').replace(/'/g, "\\'"))}')">Ban</button>`
            }
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      alert('Error loading accounts: ' + error.message);
    }
  }

  window.banUserFromModal = async function(userId, userName) {
    const minutes = window.prompt(`Ban ${userName} for how many minutes? (5-1440, max 24 hours)`);
    if (!minutes) return;
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins < 5 || mins > 1440) {
      alert('Please enter a number between 5 and 1440 minutes.');
      return;
    }

    try {
      const user = getCurrentUser();
      const response = await fetch(`/users/${userId}/ban`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': user?.email || '',
          'x-admin-role': user?.role || ''
        },
        body: JSON.stringify({ minutes: mins })
      });

      const data = await response.json();
      if (response.ok) {
        showToast(`${userName} banned for ${mins} minutes`);
        loadAdminAccounts();
      } else {
        alert('Error: ' + (data.error || 'Failed to ban user'));
      }
    } catch (error) {
      alert('Error banning user: ' + error.message);
    }
  };

  window.unbanUserFromModal = async function(userId) {
    if (!window.confirm('Unban this user?')) return;
    try {
      const user = getCurrentUser();
      const response = await fetch(`/users/${userId}/unban`, {
        method: 'PATCH',
        headers: {
          'x-admin-email': user?.email || '',
          'x-admin-role': user?.role || ''
        }
      });

      const data = await response.json();
      if (response.ok) {
        showToast('User unbanned');
        loadAdminAccounts();
      } else {
        alert('Error: ' + (data.error || 'Failed to unban user'));
      }
    } catch (error) {
      alert('Error unbanning user: ' + error.message);
    }
  };

  function extractHashtags(text) {
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex);
    return matches ? [...new Set(matches)] : [];
  }

  function loadPosts() {
    if (!postsFeed) return;

    let posts = getPosts();

    // Filter by active tab
    if (activeTab === 'following') {
      const following = getFollowingSet();
      posts = posts.filter(p => following.has(String(p.userId)));
    } else if (activeTab === 'popular') {
      posts = posts
        .filter(p => (p.likes || 0) > 0)
        .sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else {
      // discussions = everything (default ordering = newest first)
    }

    // Always prioritize pinned posts at the top across all tabs (Discussions/Popular/Following)
    const secondarySort = activeTab === 'popular'
      ? (a, b) => (b.likes || 0) - (a.likes || 0)
      : (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    posts.sort((a, b) => {
      const ap = a && a.pinned === true ? 1 : 0;
      const bp = b && b.pinned === true ? 1 : 0;
      if (ap !== bp) return bp - ap;

      if (ap === 1 && bp === 1) {
        const at = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
        const bt = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
        if (at !== bt) return bt - at;
      }

      return secondarySort(a, b);
    });

    if (posts.length === 0) {
      const msg = activeTab === 'popular'
        ? 'No popular posts yet. Posts appear here once they have at least 1 like.'
        : activeTab === 'following'
          ? (isGuest() 
              ? 'Please Log In To Follow Favorite Users'
              : 'You are not following anyone yet. Follow users to see their posts here.')
          : 'No posts yet.';
      postsFeed.innerHTML = `<div class="community-empty-state">${escapeHtml(msg)}</div>`;
    } else {
      postsFeed.innerHTML = posts.map(post => renderPost(post)).join('');
    }

    // Attach event listeners to new posts
    attachPostListeners();
  }

  function renderPost(post) {
    const timeAgo = getTimeAgo(new Date(post.createdAt));
    const isLiked = post.likedBy && post.likedBy.includes(currentUser.id);
    const following = getFollowingSet();
    const isOwnPost = String(post.userId) === String(currentUser.id);
    const isFollowingUser = following.has(String(post.userId));
    const blocked = isPostBlocked(post.id);
    const pinned = post.pinned === true;
    const mediaHtml = renderPostMedia(post.media || []);
    const codesHtml = post.codes ? renderCodes(post.codes) : '';
    const hashtagsHtml = post.hashtags ? renderHashtags(post.hashtags) : '';
    const commentsHtml = renderComments(post.comments || [], post.id);

    const blockLabel = blocked ? 'Unblock' : 'Block';
    const pinLabel = pinned ? 'Unpin' : 'Pin';

    return `
      <article class="community-post ${blocked ? 'is-blocked' : ''}" data-post-id="${post.id}">
        <div class="post-header">
          <div class="post-user">
            <div class="user-avatar">
              <img src="${post.avatar || 'Images/Rival.png'}" alt="${post.username}" />
            </div>
            <div class="user-info">
              <div class="username">${escapeHtml(post.username)}</div>
              <div class="post-meta">
                <span class="post-time">${timeAgo}</span>
                ${post.game ? `<span class="post-game">• ${escapeHtml(post.game)}</span>` : ''}
                ${pinned ? `<span class="post-pin-badge" title="Pinned">📌 Pinned</span>` : ''}
              </div>
            </div>
          </div>
          <div class="post-actions-header">
            ${isOwnPost ? '' : isGuest() 
              ? `<button class="follow-btn" disabled title="Please log in to follow users" style="opacity: 0.5; cursor: not-allowed;">Follow</button>`
              : `<button class="follow-btn ${isFollowingUser ? 'is-following' : ''}" data-user-id="${escapeHtml(String(post.userId))}">${isFollowingUser ? 'Following' : 'Follow'}</button>`
            }
            ${blocked ? `
              <span class="post-blocked-indicator" title="Blocked">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"></path>
                  <path d="M16.12 16.12A8.94 8.94 0 0 1 12 18c-7 0-11-6-11-6a18.2 18.2 0 0 1 5.11-5.11"></path>
                  <path d="M14.12 9.88A2 2 0 0 0 9.88 14.12"></path>
                  <path d="M1 1l22 22"></path>
                </svg>
              </span>
            ` : ''}
            <div class="post-menu-wrap">
              <button class="post-menu-btn" aria-label="More options" type="button" data-post-id="${escapeHtml(String(post.id))}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="19" cy="12" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle>
                </svg>
              </button>
              <div class="post-menu" data-post-id="${escapeHtml(String(post.id))}" hidden>
                ${(isOwnPost || isAdminUser()) ? `
                  <button class="post-menu-item" type="button" data-action="edit" data-post-id="${escapeHtml(String(post.id))}">Edit</button>
                  <div class="post-menu-sep" role="separator"></div>
                ` : ''}
                ${isAdminUser() ? `
                  <button class="post-menu-item" type="button" data-action="pin" data-post-id="${escapeHtml(String(post.id))}">${pinLabel}</button>
                  <button class="post-menu-item danger" type="button" data-action="delete" data-post-id="${escapeHtml(String(post.id))}">Delete</button>
                  <div class="post-menu-sep" role="separator"></div>
                ` : ''}
                <button class="post-menu-item" type="button" data-action="block" data-post-id="${escapeHtml(String(post.id))}">${blockLabel}</button>
                <button class="post-menu-item" type="button" data-action="share" data-post-id="${escapeHtml(String(post.id))}">Share</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="post-content">
          ${post.title ? `<h3 class="post-title">${escapeHtml(post.title)}</h3>` : ''}
          ${post.text ? `<p class="post-text">${formatText(post.text)}</p>` : ''}
          ${codesHtml}
          ${mediaHtml}
          ${hashtagsHtml}
        </div>
        
        <div class="post-footer">
          <div class="post-interactions">
            <button class="interaction-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" ${blocked ? 'disabled aria-disabled="true"' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span>${post.likes || 0}</span>
            </button>
            <button class="interaction-btn comment-btn" data-post-id="${post.id}" ${blocked ? 'disabled aria-disabled="true"' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>${(post.comments || []).length}</span>
            </button>
            <button class="interaction-btn share-btn" data-post-id="${post.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="post-comments" data-post-id="${post.id}" style="display: none;">
          <div class="comments-header">
            <h4 class="comments-title">Comments</h4>
          </div>
          <div class="comment-form">
            <input type="text" class="comment-input" placeholder="${blocked ? 'This post is blocked' : 'Write a comment...'}" data-post-id="${post.id}" ${blocked ? 'disabled aria-disabled="true"' : ''} />
            <button class="comment-submit" data-post-id="${post.id}" ${blocked ? 'disabled aria-disabled="true"' : ''}>Post</button>
          </div>
          <div class="comments-list">
            ${commentsHtml}
          </div>
        </div>
      </article>
    `;
  }

  function renderPostMedia(media) {
    if (!media || media.length === 0) return '';

    // Only render the first media item (single attachment)
    const mediaUrl = media[0];
    if (!mediaUrl) return '';
    
    // Check if it's a video by looking at the data URL prefix or file extension
    const isVideo = mediaUrl.startsWith('data:video/') || 
                    mediaUrl.includes('video') || 
                    mediaUrl.endsWith('.mp4') || 
                    mediaUrl.endsWith('.webm') ||
                    mediaUrl.endsWith('.mov') ||
                    mediaUrl.endsWith('.avi');
    
    console.log('Rendering media:', { url: mediaUrl.substring(0, 50) + '...', isVideo });
    
    return `
      <div class="post-media">
        ${isVideo 
          ? `<video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video>`
          : `<img src="${escapeHtml(mediaUrl)}" alt="Post media" />`
        }
      </div>
    `;
  }

  // Render codes
  function renderCodes(codes) {
    if (!codes || codes.length === 0) return '';
    return `
      <div class="post-codes">
        ${codes.map(code => `<span class="code-item">${escapeHtml(code)}</span>`).join('')}
      </div>
    `;
  }

  // Render hashtags
  function renderHashtags(hashtags) {
    if (!hashtags || hashtags.length === 0) return '';
    return `
      <div class="post-hashtags">
        ${hashtags.map(tag => `<a href="#" class="hashtag">${escapeHtml(tag)}</a>`).join('')}
      </div>
    `;
  }

  function renderComments(comments, postId) {
    if (!comments || comments.length === 0) return '';
    return comments.map(comment => {
      // Ensure comment has an id for seeded comments
      const commentId = comment.id || `comment_${comment.userId}_${comment.createdAt}`;
      const timeAgo = getTimeAgo(new Date(comment.createdAt));
      return `
        <div class="comment-item" data-comment-id="${commentId}">
          <div class="comment-avatar">
            <img src="${comment.avatar || 'Images/Rival.png'}" alt="${comment.username}" />
          </div>
          <div class="comment-content">
            <div class="comment-header-row">
              <div class="comment-author">${escapeHtml(comment.username)}</div>
              ${isAdminUser() ? `
                <button class="comment-delete-btn" type="button" data-post-id="${postId}" data-comment-id="${commentId}" title="Delete comment">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              ` : ''}
            </div>
            <div class="comment-text">${formatText(comment.text)}</div>
            <div class="comment-meta">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function attachPostListeners() {
    // Follow buttons
    document.querySelectorAll('.follow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Disable follow for guests
        if (isGuest() || btn.disabled) {
          alert('Please log in to follow users');
          const loginBtn = document.getElementById('login-btn');
          if (loginBtn) loginBtn.click();
          return;
        }
        const targetUserId = btn.getAttribute('data-user-id');
        if (!targetUserId) return;
        const set = toggleFollowUser(String(targetUserId));
        const nowFollowing = set.has(String(targetUserId));
        btn.classList.toggle('is-following', nowFollowing);
        btn.textContent = nowFollowing ? 'Following' : 'Follow';
        // If currently in following tab, re-render to reflect filtering immediately
        if (activeTab === 'following') loadPosts();
      });
    });

    // Like buttons
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        const postId = btn.dataset.postId;
        if (isPostBlocked(postId)) return;
        const post = toggleLike(postId, currentUser.id);
        if (post) {
          const isLiked = post.likedBy.includes(currentUser.id);
          btn.classList.toggle('liked', isLiked);
          const countSpan = btn.querySelector('span');
          if (countSpan) {
            countSpan.textContent = post.likes || 0;
          }
        }
      });
    });

    // Comment buttons
    document.querySelectorAll('.comment-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        const postId = btn.dataset.postId;
        if (isPostBlocked(postId)) return;
        const commentsSection = document.querySelector(`.post-comments[data-post-id="${postId}"]`);
        if (commentsSection) {
          const isHidden = commentsSection.style.display === 'none';
          commentsSection.style.display = isHidden ? 'block' : 'none';
        }
      });
    });

    // Comment submit buttons
    document.querySelectorAll('.comment-submit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        if (isGuest()) {
          alert('Please sign up to comment on posts!');
          if (profileSignupTrigger) profileSignupTrigger.click();
          return;
        }
        const postId = btn.dataset.postId;
        if (isPostBlocked(postId)) return;
        const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
        if (input && input.value.trim()) {
          const newComment = addComment(postId, {
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            text: input.value.trim()
          });
          if (newComment) {
            input.value = '';
            loadPosts(); // Reload to show new comment
          }
        }
      });
    });
    
    // Disable comment inputs for guests
    if (isGuest()) {
      document.querySelectorAll('.comment-input').forEach(input => {
        input.disabled = true;
        input.placeholder = 'Sign up to comment!';
      });
    }

    // Comment input enter key
    document.querySelectorAll('.comment-input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const postId = input.dataset.postId;
          const btn = document.querySelector(`.comment-submit[data-post-id="${postId}"]`);
          if (btn) btn.click();
        }
      });
    });

    // Admin delete comment buttons
    if (isAdminUser()) {
      document.querySelectorAll('.comment-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const postId = btn.dataset.postId;
          const commentId = btn.dataset.commentId;
          if (!postId || !commentId) return;
          if (window.confirm('Delete this comment?')) {
            if (deleteComment(postId, commentId)) {
              loadPosts();
              showToast('Comment deleted');
            }
          }
        });
      });
    }

    // Share buttons
    document.querySelectorAll('.share-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const postId = btn.getAttribute('data-post-id');
        if (!postId) return;
        sharePost(postId);
      });
    });

    // Post menu button toggle
    document.querySelectorAll('.post-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const postId = btn.getAttribute('data-post-id');
        if (!postId) return;
        const menu = document.querySelector(`.post-menu[data-post-id="${postId}"]`);
        if (!menu) return;
        const isOpen = !menu.hasAttribute('hidden');
        closeAllPostMenus();
        if (!isOpen) menu.removeAttribute('hidden');
      });
    });

    // Post menu item actions
    document.querySelectorAll('.post-menu-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const postId = btn.getAttribute('data-post-id');
        if (!action || !postId) return;

        if (action === 'block') {
          toggleBlockPost(postId);
          closeAllPostMenus();
          loadPosts();
          return;
        }

        if (action === 'share') {
          closeAllPostMenus();
          await sharePost(postId);
          return;
        }

        if (action === 'pin') {
          if (!isAdminUser()) return;
          togglePinPost(postId);
          closeAllPostMenus();
          loadPosts();
          return;
        }

        if (action === 'delete') {
          if (!isAdminUser()) return;
          const ok = window.confirm('Delete this post? This cannot be undone.');
          if (!ok) return;
          deletePost(postId);
          closeAllPostMenus();
          loadPosts();
          return;
        }

        if (action === 'edit') {
          closeAllPostMenus();
          openEditPostModal(postId);
          return;
        }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatText(text) {
    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Convert hashtags to links
    const hashtagRegex = /#(\w+)/g;
    let formatted = escapeHtml(text);
    formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    formatted = formatted.replace(hashtagRegex, '<a href="#" class="hashtag">#$1</a>');
    return formatted;
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }


  function syncUserFromStorage() {
    // Check for guest user
    const guestUserStr = localStorage.getItem('guestUser') || sessionStorage.getItem('guestUser');
    const isGuestStorage = localStorage.getItem('isGuest') === 'true' || sessionStorage.getItem('isGuest') === 'true';
    
    if (isGuestStorage && guestUserStr) {
      const guestUser = JSON.parse(guestUserStr);
      currentUser = {
        id: guestUser.id,
        username: 'Guest',
        avatar: 'Images/Rival.png',
        isGuest: true
      };
      saveCurrentUser(currentUser);
    } else {
      // Check for logged in user (from backend)
      const loggedInUserStr = localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser');
      if (loggedInUserStr) {
        const loggedInUser = JSON.parse(loggedInUserStr);
        currentUser = {
          id: loggedInUser.id || loggedInUser._id,
          username: loggedInUser.name || loggedInUser.username || loggedInUser.nickname,
          avatar: loggedInUser.avatar || 'Images/Rival.png',
          bio: loggedInUser.bio || '',
          favoriteCharacter: loggedInUser.favoriteCharacter || 'Not set',
          rank: loggedInUser.rank || 'Unranked',
          winrate: loggedInUser.winrate || 0,
          createdAt: loggedInUser.createdAt || loggedInUser.created_at || new Date().toISOString(),
          role: loggedInUser.role || 'user',
          isGuest: false
        };
        saveCurrentUser(currentUser);
      } else {
        // Default to guest
        currentUser = {
          id: 'guest_' + Date.now(),
          username: 'Guest',
          avatar: 'Images/Rival.png',
          isGuest: true
        };
        saveCurrentUser(currentUser);
      }
    }
    
    updateProfileDisplay();
    updateCreatePostSection();
  }
  
  // Listen for storage changes (login/logout events)
  window.addEventListener('storage', syncUserFromStorage);
  
  // Also check periodically for changes (for same-tab updates)
  setInterval(syncUserFromStorage, 1000);
  
  // Listen for custom login events
  window.addEventListener('userLoggedIn', (e) => {
    if (e.detail && e.detail.user) {
      currentUser = {
        id: e.detail.user.id || e.detail.user._id,
        username: e.detail.user.name || e.detail.user.username || e.detail.user.nickname,
        avatar: e.detail.user.avatar || 'Images/Rival.png',
        bio: e.detail.user.bio || '',
        favoriteCharacter: e.detail.user.favoriteCharacter || 'Not set',
        rank: e.detail.user.rank || 'Unranked',
        winrate: e.detail.user.winrate || 0,
        createdAt: e.detail.user.createdAt || e.detail.user.created_at || new Date().toISOString(),
        role: e.detail.user.role || 'user',
        isGuest: false
      };
      saveCurrentUser(currentUser);
      updateProfileDisplay();
      updateCreatePostSection();
    }
  });
  
  window.addEventListener('userLoggedOut', () => {
    currentUser = {
      id: 'guest_' + Date.now(),
      username: 'Guest',
      avatar: 'Images/Rival.png',
      isGuest: true
    };
    saveCurrentUser(currentUser);
    updateProfileDisplay();
    updateCreatePostSection();
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      syncUserFromStorage();
      init();
    });
  } else {
    syncUserFromStorage();
    init();
  }
})();

