/**
 * Personal Productivity Hub & GATE Prep
 * Core State Management & Component Controllers
 */

document.addEventListener('DOMContentLoaded', () => {
  // Custom dialog helper modal functions
  function showCustomDialog({ title = 'Notification', message = '', type = 'alert', defaultValue = '' }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-custom-dialog');
      const titleEl = document.getElementById('custom-dialog-title');
      const msgEl = document.getElementById('custom-dialog-message');
      const inputContainer = document.getElementById('custom-dialog-input-container');
      const inputEl = document.getElementById('custom-dialog-input');
      const btnCancel = document.getElementById('custom-dialog-btn-cancel');
      const btnOk = document.getElementById('custom-dialog-btn-ok');

      if (!modal) {
        if (type === 'confirm') resolve(confirm(message));
        else if (type === 'prompt') resolve(prompt(message, defaultValue));
        else { alert(message); resolve(); }
        return;
      }

      titleEl.textContent = title;
      msgEl.textContent = message;

      if (type === 'prompt') {
        inputContainer.style.display = 'block';
        inputEl.value = defaultValue;
        btnCancel.style.display = 'inline-block';
      } else if (type === 'confirm') {
        inputContainer.style.display = 'none';
        btnCancel.style.display = 'inline-block';
      } else {
        inputContainer.style.display = 'none';
        btnCancel.style.display = 'none';
      }

      modal.classList.add('active');
      if (type === 'prompt') {
        setTimeout(() => inputEl.focus(), 50);
      }

      function cleanup(value) {
        modal.classList.remove('active');
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        resolve(value);
      }

      function onOk() {
        if (type === 'prompt') {
          cleanup(inputEl.value);
        } else {
          cleanup(true);
        }
      }

      function onCancel() {
        cleanup(type === 'prompt' ? null : false);
      }

      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
    });
  }

  const customAlert = (message, title = 'Alert') => showCustomDialog({ title, message, type: 'alert' });
  const customConfirm = (message, title = 'Confirm') => showCustomDialog({ title, message, type: 'confirm' });
  const customPrompt = (message, defaultValue = '', title = 'Prompt') => showCustomDialog({ title, message, type: 'prompt', defaultValue });

  // ==========================================================================
  // 1. STATE & STORAGE (Firebase Sync Enhanced)
  // ==========================================================================
  
  const STORAGE_KEY = 'productivity_hub_state';
  const REDESIGN_KEY = 'hubspace_redesign_v4'; // Wipes old state model
  
  if (!localStorage.getItem(REDESIGN_KEY)) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(REDESIGN_KEY, 'true');
    console.log("Upgraded schema detected. Storage wiped to prevent conflicts.");
  }

  // Default clean state template
  const defaultState = {
    theme: 'light',
    accent: 'cerulean',
    dailyPomoGoal: 4,
    subjects: [],
    todos: [],
    notes: [],
    gateSyllabus: [],
    formulas: [],
    pomodoroStats: {
      totalSessions: 0,
      totalTimeMinutes: 0
    }
  };

  let state = loadState();
  let currentUser = null;
  let firestoreUnsubscribe = null;
  let authMode = 'login'; // 'login' or 'register'

  function loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          ...defaultState,
          ...parsed,
          pomodoroStats: { ...defaultState.pomodoroStats, ...(parsed.pomodoroStats || {}) }
        };
      }
    } catch (e) {
      console.error("Failed to parse localStorage data", e);
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  function saveState(skipFirestore = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
    if (currentUser && !skipFirestore && window.firebaseDb) {
      window.firebaseDb.collection('users').doc(currentUser.uid).set(state, { merge: true })
        .then(() => console.log("State synced to Firestore."))
        .catch(err => console.error("Firestore sync write failed:", err));
    }
  }

  function updateAllPanes() {
    applyTheme();
    updateDashboardStats();
    
    const activePane = document.querySelector('.pane.active');
    if (activePane) {
      if (activePane.id === 'pane-dashboard') {
        refreshDomeGallery();
      } else if (activePane.id === 'pane-todo') {
        renderTodoList();
      } else if (activePane.id === 'pane-notes') {
        renderWhiteboard();
      } else if (activePane.id === 'pane-documents') {
        renderDocumentsList();
      } else if (activePane.id === 'pane-gate') {
        renderGateSyllabus();
      }
    }
  }

  // Request notifications permission on load & monitor messages
  function initNotifications() {
    if (isNotificationSupported()) {
      try {
        if (window.Notification.permission === 'default') {
          window.Notification.requestPermission().catch(err => console.log('Notification permission request rejected', err));
        }
      } catch (e) {
        console.warn('Failed to request notifications permission:', e);
      }
    }
    
    // Handle foreground push messages
    if (window.firebaseMessaging) {
      window.firebaseMessaging.onMessage((payload) => {
        console.log("Foreground FCM message received:", payload);
        const title = payload.notification.title || "HubSpace Task Reminder";
        const body = payload.notification.body || "";
        showToast(`${title}: ${body}`, 'info');
      });
    }
  }

  // Auth UI initialization
  function initAuth() {
    const authModal = document.getElementById('modal-auth');
    const btnAuthMenu = document.getElementById('btn-auth-menu');
    const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const inputEmail = document.getElementById('input-auth-email');
    const inputPassword = document.getElementById('input-auth-password');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnGoogle = document.getElementById('btn-google-auth');
    const btnLogout = document.getElementById('btn-auth-logout');
    
    const loggedOutPanel = document.getElementById('auth-modal-body-logged-out');
    const loggedInPanel = document.getElementById('auth-modal-body-logged-in');
    const userEmailSpan = document.getElementById('auth-user-email');
    const authBtnIcon = document.getElementById('auth-btn-icon');

    if (btnAuthMenu) {
      btnAuthMenu.addEventListener('click', () => {
        authModal.classList.add('active');
      });
    }

    const closeAuthModal = () => {
      authModal.classList.remove('active');
    };

    if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', closeAuthModal);

    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        authMode = 'login';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        btnSubmit.textContent = 'Log In';
        document.getElementById('auth-modal-title').textContent = 'Sync Your Account';
      });

      tabRegister.addEventListener('click', () => {
        authMode = 'register';
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        btnSubmit.textContent = 'Sign Up';
        document.getElementById('auth-modal-title').textContent = 'Create Sync Account';
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        const email = inputEmail.value.trim();
        const password = inputPassword.value.trim();

        if (!email || !password) {
          await customAlert("Please fill in both Email and Password fields.", "Missing Credentials");
          return;
        }

        if (password.length < 6) {
          await customAlert("Password must be at least 6 characters long.", "Weak Password");
          return;
        }

        if (!window.firebaseAuth) {
          await customAlert("Firebase Auth service is unavailable.", "Error");
          return;
        }

        try {
          if (authMode === 'login') {
            await window.firebaseAuth.signInWithEmailAndPassword(email, password);
            showToast("Successfully logged in!", "success");
          } else {
            await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
            showToast("Account created successfully!", "success");
          }
          closeAuthModal();
        } catch (err) {
          console.error("Auth Error:", err);
          let errMsg = err.message || "An authentication error occurred.";
          if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
            errMsg = "Invalid email or password. Please try again.";
          } else if (err.code === 'auth/email-already-in-use') {
            errMsg = "This email is already registered. Please log in instead.";
          }
          await customAlert(errMsg, "Authentication Failed");
        }
      });
    }

    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        if (!window.firebaseAuth) {
          await customAlert("Firebase Auth service is unavailable.", "Error");
          return;
        }

        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          await window.firebaseAuth.signInWithPopup(provider);
          showToast("Successfully authenticated with Google!", "success");
          closeAuthModal();
        } catch (err) {
          console.error("Google Auth Error:", err);
          await customAlert(err.message || "Failed to sign in with Google.", "Authentication Failed");
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (!window.firebaseAuth) return;
        
        const confirmLogout = await customConfirm("Are you sure you want to log out? Local data will remain, but synchronization will stop.", "Log Out Confirmation");
        if (confirmLogout) {
          try {
            await window.firebaseAuth.signOut();
            showToast("Logged out successfully.", "info");
            closeAuthModal();
          } catch (err) {
            console.error("Logout Error:", err);
          }
        }
      });
    }

    window.updateAuthUI = function(isLoggedIn, email = '') {
      if (isLoggedIn) {
        if (loggedOutPanel) loggedOutPanel.style.display = 'none';
        if (loggedInPanel) loggedInPanel.style.display = 'block';
        if (userEmailSpan) userEmailSpan.textContent = email;
        if (authBtnIcon) {
          authBtnIcon.className = 'fa-solid fa-user-check';
          authBtnIcon.style.color = 'var(--accent)';
        }
      } else {
        if (loggedOutPanel) loggedOutPanel.style.display = 'block';
        if (loggedInPanel) loggedInPanel.style.display = 'none';
        if (userEmailSpan) userEmailSpan.textContent = '';
        if (authBtnIcon) {
          authBtnIcon.className = 'fa-solid fa-user-lock';
          authBtnIcon.style.color = '';
        }
      }
    };
  }

  function requestFCMToken(userId) {
    if (window.firebaseMessaging) {
      window.firebaseMessaging.getToken({ vapidKey: window.firebaseVapidKey })
        .then((currentToken) => {
          if (currentToken) {
            console.log("FCM Token obtained:", currentToken);
            window.firebaseDb.collection('users').doc(userId).set({
              fcmToken: currentToken
            }, { merge: true }).catch(err => {
              console.error("Failed to save FCM Token to Firestore:", err);
            });
          } else {
            console.log("No registration token available. Request permission to generate one.");
          }
        })
        .catch((err) => {
          console.warn("An error occurred while retrieving FCM token. ", err);
        });
    }
  }

  // Monitor Authentication state changes
  if (window.firebaseAuth) {
    window.firebaseAuth.onAuthStateChanged((user) => {
      if (user) {
        currentUser = user;
        console.log("User logged in:", user.email);
        updateAuthUI(true, user.email);
        
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        firestoreUnsubscribe = window.firebaseDb.collection('users').doc(user.uid).onSnapshot(
          (doc) => {
            if (doc.exists) {
              const remoteData = doc.data();
              // Deep merge/overwrite state
              state = {
                ...defaultState,
                ...remoteData,
                pomodoroStats: { ...defaultState.pomodoroStats, ...(remoteData.pomodoroStats || {}) }
              };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
              updateAllPanes();
            } else {
              // Write initial state to Firestore
              window.firebaseDb.collection('users').doc(currentUser.uid).set(state);
            }
          },
          (err) => {
            console.error("Firestore snapshot listener error:", err);
          }
        );

        requestFCMToken(user.uid);
      } else {
        currentUser = null;
        if (firestoreUnsubscribe) {
          firestoreUnsubscribe();
          firestoreUnsubscribe = null;
        }
        updateAuthUI(false);
        state = loadState();
        updateAllPanes();
      }
    });
  }

  // Initialize Auth listeners and Notification configurations
  initAuth();
  initNotifications();

  function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  // IndexedDB Document Storage Helper
  const HubDB = {
    dbName: 'HubSpaceDocsDB',
    storeName: 'documents',
    open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
      });
    },
    async saveDoc(doc) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(doc);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async getDocs() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async deleteDoc(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  };

  // ==========================================================================
  // 2. THEME & ACCENT MANAGEMENT
  // ==========================================================================
  
  const themeColors = {
    red: { hex: '#f94144', rgb: '249, 65, 68' },
    tangerine: { hex: '#f3722c', rgb: '243, 114, 44' },
    orange: { hex: '#f8961e', rgb: '248, 150, 30' },
    coral: { hex: '#f9844a', rgb: '249, 132, 74' },
    sun: { hex: '#f9c74f', rgb: '249, 199, 79' },
    green: { hex: '#90be6d', rgb: '144, 190, 109' },
    seagrass: { hex: '#43aa8b', rgb: '67, 170, 139' },
    cyan: { hex: '#4d908e', rgb: '77, 144, 142' },
    slate: { hex: '#577590', rgb: '87, 117, 144' },
    cerulean: { hex: '#277da1', rgb: '39, 125, 161' }
  };

  function applyTheme() {
    // Theme Mode
    document.documentElement.setAttribute('data-theme', state.theme);
    const themeBtnIcon = document.querySelector('#theme-toggle-btn i');
    if (themeBtnIcon) {
      themeBtnIcon.className = state.theme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }

    // Accent Color Locked: Light Mode -> #03045e (dark blue), Dark Mode -> #cdb4db (lavender)
    const accentHex = state.theme === 'light' ? '#03045e' : '#cdb4db';
    const accentRgb = state.theme === 'light' ? '3, 4, 94' : '205, 180, 219';
    
    document.documentElement.style.setProperty('--accent', accentHex);
    document.documentElement.style.setProperty('--accent-rgb', accentRgb);
  }

  // Theme Toggle Button
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveState();
    applyTheme();
  });

  // Accent selector buttons
  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.accent = e.target.dataset.accent;
      saveState();
      applyTheme();
      updateDashboardStats(); // update rings
    });
  });

  // Apply initial theme
  applyTheme();

  // ==========================================================================
  // 3. ROUTER / NAV BAR (Flowing Menu Blob)
  // ==========================================================================
  
  const navMenu = document.getElementById('flowing-nav');
  const navBlob = document.getElementById('nav-blob');
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.pane');

  const blobColors = {
    dashboard: { hex: '#277da1', rgb: '39, 125, 161' },
    todo: { hex: '#f94144', rgb: '249, 65, 68' },
    notes: { hex: '#f3722c', rgb: '243, 114, 44' },
    gate: { hex: '#f9c74f', rgb: '249, 199, 79' },
    documents: { hex: '#43aa8b', rgb: '67, 170, 139' },
    settings: { hex: '#577590', rgb: '87, 117, 144' }
  };

  function positionNavBlob(activeItem) {
    if (!activeItem || !navBlob) return;
    
    const activeColor = state.theme === 'light' ? '#03045e' : '#cdb4db';
    const activeColorRgb = state.theme === 'light' ? '3, 4, 94' : '205, 180, 219';
    
    document.documentElement.style.setProperty('--active-color', activeColor);
    document.documentElement.style.setProperty('--active-color-rgb', activeColorRgb);
    navBlob.style.backgroundColor = activeColor;

    if (window.innerWidth <= 768) {
      const itemOffsetLeft = activeItem.offsetLeft;
      const itemWidth = activeItem.offsetWidth;
      navBlob.style.transform = `translateX(${itemOffsetLeft}px)`;
      navBlob.style.width = `${itemWidth}px`;
      navBlob.style.height = '48px';
    } else {
      const itemOffsetTop = activeItem.offsetTop;
      navBlob.style.transform = `translateY(${itemOffsetTop}px)`;
      navBlob.style.width = '100%';
      navBlob.style.height = '48px';
    }
  }

  function switchPane(paneId) {
    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${paneId}`);
    });
    
    // Custom pane initialization triggers
    if (paneId === 'dashboard') {
      refreshDomeGallery();
    } else if (paneId === 'todo') {
      renderTodoList();
    } else if (paneId === 'notes') {
      renderWhiteboard();
    } else if (paneId === 'documents') {
      renderDocumentsList();
    } else if (paneId === 'gate') {
      renderGateSyllabus();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const button = e.currentTarget;
      navItems.forEach(n => n.classList.remove('active'));
      button.classList.add('active');
      
      positionNavBlob(button);
      switchPane(button.dataset.pane);
    });
  });

  // Align active nav blob initially on DOM load
  setTimeout(() => {
    const activeNav = document.querySelector('.nav-item.active');
    positionNavBlob(activeNav);
  }, 200);

  // Responsive: track window resize to realign nav indicator blob
  window.addEventListener('resize', () => {
    const activeNav = document.querySelector('.nav-item.active');
    positionNavBlob(activeNav);
  });

  // ==========================================================================
  // 4. POMODORO TIMER
  // ==========================================================================
  
  let pomoTimer = null;
  let pomoTimeLeft = 25 * 60; // 25 mins in seconds
  let pomoCurrentMode = 'work'; // 'work', 'short', 'long'
  let pomoIsRunning = false;
  const pomoTimerDisplay = document.getElementById('pomo-time');
  const pomoPlayBtn = document.getElementById('btn-pomo-play');
  const pomoResetBtn = document.getElementById('btn-pomo-reset');
  const pomoLabel = document.getElementById('pomo-mode-label');
  const alarmSound = document.getElementById('audio-alarm');

  const dashPomoTimerDisplay = document.getElementById('dash-pomo-time');
  const dashPomoPlayBtn = document.getElementById('btn-dash-pomo-play');
  const dashPomoResetBtn = document.getElementById('btn-dash-pomo-reset');
  const dashPomoLabel = document.getElementById('dash-pomo-mode-label');

  const pomoDurations = {
    work: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
  };

  const pomoModeTitles = {
    work: 'Work Session',
    short: 'Short Break',
    long: 'Long Break'
  };

  function updatePomoDisplay() {
    const minutes = Math.floor(pomoTimeLeft / 60);
    const seconds = pomoTimeLeft % 60;
    const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (pomoTimerDisplay) pomoTimerDisplay.textContent = timeText;
    if (dashPomoTimerDisplay) dashPomoTimerDisplay.textContent = timeText;
  }

  function isNotificationSupported() {
    try {
      return ('Notification' in window && typeof window.Notification !== 'undefined');
    } catch (e) {
      return false;
    }
  }

  function isNotificationPermissionGranted() {
    try {
      return isNotificationSupported() && window.Notification.permission === 'granted';
    } catch (e) {
      return false;
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    if (type === 'error') iconClass = 'fa-circle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass} toast-icon"></i>
      <div class="toast-content">${message}</div>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  function triggerFocusNotification(action) {
    const modeNames = { work: 'Work Session', short: 'Short Break', long: 'Long Break' };
    const modeLabel = modeNames[pomoCurrentMode] || 'Focus Session';
    const isBreak = pomoCurrentMode !== 'work';

    let title = '';
    let body = '';
    let toastType = 'info';

    if (action === 'start') {
      title = `${modeLabel} Started`;
      body = isBreak ? `Time for a well-deserved rest! Take a break.` : `Focus session started. Let's study!`;
      toastType = isBreak ? 'success' : 'info';
    } else if (action === 'stop') {
      title = `${modeLabel} Paused`;
      body = `Your session has been paused or reset.`;
      toastType = 'warning';
    }

    if (isNotificationPermissionGranted()) {
      try {
        new window.Notification(title, {
          body: body,
          icon: 'logo.png'
        });
      } catch (e) {
        console.warn('Failed to send focus notification:', e);
      }
    }

    showToast(`${title} — ${body}`, toastType);
  }

  function startPomo() {
    if (pomoIsRunning) return;
    pomoIsRunning = true;

    triggerFocusNotification('start');

    const playIcon = '<i class="fa-solid fa-pause"></i>';
    if (pomoPlayBtn) {
      pomoPlayBtn.innerHTML = playIcon;
      pomoPlayBtn.classList.add('primary');
    }
    if (dashPomoPlayBtn) {
      dashPomoPlayBtn.innerHTML = playIcon;
      dashPomoPlayBtn.classList.add('primary');
    }

    pomoTimer = setInterval(() => {
      if (pomoTimeLeft > 0) {
        pomoTimeLeft--;
        updatePomoDisplay();
      } else {
        clearInterval(pomoTimer);
        pomoIsRunning = false;
        if (alarmSound) {
          alarmSound.play().catch(err => console.log('Audio playback prevented', err));
        }
        
        // Handle session transition
        handleSessionEnd();
      }
    }, 1000);
  }

  function pausePomo() {
    const wasRunning = pomoIsRunning;
    clearInterval(pomoTimer);
    pomoIsRunning = false;

    if (wasRunning) {
      triggerFocusNotification('stop');
    }

    const playIcon = '<i class="fa-solid fa-play"></i>';
    if (pomoPlayBtn) {
      pomoPlayBtn.innerHTML = playIcon;
      pomoPlayBtn.classList.remove('primary');
    }
    if (dashPomoPlayBtn) {
      dashPomoPlayBtn.innerHTML = playIcon;
      dashPomoPlayBtn.classList.remove('primary');
    }
  }

  function resetPomo() {
    pausePomo();
    pomoTimeLeft = pomoDurations[pomoCurrentMode];
    updatePomoDisplay();
  }

  function handleSessionEnd() {
    if (pomoCurrentMode === 'work') {
      state.pomodoroStats.totalSessions++;
      state.pomodoroStats.totalTimeMinutes += Math.round(pomoDurations.work / 60);
      saveState();
      
      // Native notification
      showNotification("Focus Completed!", "Great job! Your focus study session is complete. Time for a break!");
      
      switchPomoMode('short');
    } else {
      showNotification("Break Completed!", "Ready to get back to studying? Let's focus!");
      switchPomoMode('work');
    }
    
    updateDashboardStats();
  }

  function showNotification(title, body) {
    if (isNotificationPermissionGranted()) {
      try {
        new window.Notification(title, {
          body: body,
          icon: 'logo.png'
        });
      } catch (e) {
        console.warn('Failed to send notification:', e);
      }
    }
    // Also display in-app toast
    showToast(`${title}: ${body}`, 'info');
  }

  // Recurring notifications setup for to-do items by priority

  // Setup recurring notifications for to-do items by priority
  function initTodoReminders() {
    // High priority: every 2 minutes
    setInterval(() => {
      sendTodoReminderNotification('high');
    }, 2 * 60 * 1000);

    // Medium priority: every 7 minutes
    setInterval(() => {
      sendTodoReminderNotification('medium');
    }, 7 * 60 * 1000);

    // Low priority: every 15 minutes
    setInterval(() => {
      sendTodoReminderNotification('low');
    }, 15 * 60 * 1000);
  }

  function sendTodoReminderNotification(priority) {
    if (!state || !state.todos) return;
    const pending = state.todos.filter(t => !t.completed && t.priority === priority);
    if (pending.length === 0) return;

    const labelMap = { high: 'High', medium: 'Medium', low: 'Low' };
    const priorityLabel = labelMap[priority];
    const count = pending.length;
    const names = pending.slice(0, 3).map(t => t.name).join(', ');
    const extra = count > 3 ? ` and ${count - 3} more` : '';

    const title = `${priorityLabel} Priority Tasks Reminder`;
    const body = `You have ${count} pending ${priorityLabel.toLowerCase()} priority task(s): ${names}${extra}.`;

    if (isNotificationPermissionGranted()) {
      try {
        new window.Notification(title, {
          body: body,
          icon: 'logo.png'
        });
      } catch (e) {
        console.warn('Failed to send task reminder notification:', e);
      }
    }

    const toastType = priority === 'high' ? 'error' : (priority === 'medium' ? 'warning' : 'info');
    showToast(`Reminder: ${body}`, toastType);
  }

  function switchPomoMode(mode) {
    pausePomo();
    pomoCurrentMode = mode;
    pomoTimeLeft = pomoDurations[mode];
    
    const labelText = pomoModeTitles[mode];
    if (pomoLabel) pomoLabel.textContent = labelText;
    if (dashPomoLabel) dashPomoLabel.textContent = labelText;
    
    // Update active visual tags across all selectors
    document.querySelectorAll('.pomo-modes-select span').forEach(span => {
      span.classList.toggle('active', span.dataset.mode === mode);
    });

    updatePomoDisplay();
  }

  // Listeners for sidebar timer
  if (pomoPlayBtn) {
    pomoPlayBtn.addEventListener('click', () => {
      if (pomoIsRunning) {
        pausePomo();
      } else {
        startPomo();
      }
    });
  }

  if (pomoResetBtn) {
    pomoResetBtn.addEventListener('click', resetPomo);
  }

  // Listeners for dashboard timer (mobile)
  if (dashPomoPlayBtn) {
    dashPomoPlayBtn.addEventListener('click', () => {
      if (pomoIsRunning) {
        pausePomo();
      } else {
        startPomo();
      }
    });
  }

  if (dashPomoResetBtn) {
    dashPomoResetBtn.addEventListener('click', resetPomo);
  }

  document.querySelectorAll('.pomo-modes-select span').forEach(span => {
    span.addEventListener('click', (e) => {
      switchPomoMode(e.target.dataset.mode);
    });
  });

  updatePomoDisplay(); // Init display
  initTodoReminders(); // Start task reminder checks

  // ==========================================================================
  // 5. SUBJECTS MANAGEMENT & DOME GALLERY CONTROL
  // ==========================================================================
  
  let selectedSubjectColor = 'pink';

  // Open Subject Modal
  const subjectModal = document.getElementById('modal-add-subject');
  const openSubjModalDash = document.getElementById('btn-add-subject-dash');
  const openSubjModalTodo = document.getElementById('btn-add-subject-todo');
  const openSubjModalOnboard = document.getElementById('btn-onboard-add-subject');
  const closeSubjModal = document.getElementById('btn-close-subject-modal');
  const cancelSubj = document.getElementById('btn-cancel-subject');
  const saveSubjBtn = document.getElementById('btn-save-subject');
  const inputSubjName = document.getElementById('input-subject-name');

  function showSubjectModal() {
    inputSubjName.value = '';
    selectedSubjectColor = 'pink';
    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === 'pink');
    });
    subjectModal.classList.add('active');
  }

  if (openSubjModalDash) openSubjModalDash.addEventListener('click', showSubjectModal);
  if (openSubjModalTodo) openSubjModalTodo.addEventListener('click', showSubjectModal);
  if (openSubjModalOnboard) openSubjModalOnboard.addEventListener('click', showSubjectModal);
  
  const closeModalHandler = () => subjectModal.classList.remove('active');
  if (closeSubjModal) closeSubjModal.addEventListener('click', closeModalHandler);
  if (cancelSubj) cancelSubj.addEventListener('click', closeModalHandler);

  // Subject Modal Color picker
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      e.target.classList.add('active');
      selectedSubjectColor = e.target.dataset.color;
    });
  });

  // Create/Save Subject
  saveSubjBtn.addEventListener('click', async () => {
    const name = inputSubjName.value.trim();
    if (!name) {
      await customAlert("Please enter a subject name.", "Missing Information");
      return;
    }

    const newSubj = {
      id: generateId(),
      name: name,
      color: selectedSubjectColor,
      progress: 0,
      todosPending: 0,
      notesCount: 0
    };

    state.subjects.push(newSubj);
    saveState();
    closeModalHandler();
    
    // Refresh active components
    refreshDomeGallery();
    updateDashboardStats();
    renderTodoList();
  });

  // Triggers Dome position mapping
  async function refreshDomeGallery() {
    let docsCount = 0;
    let latestDocName = '';
    try {
      const docs = await HubDB.getDocs();
      docsCount = docs.length;
      if (docsCount > 0) {
        docs.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
        latestDocName = docs[0].name;
      }
    } catch (err) {
      console.error(err);
    }

    const pendingTodos = state.todos.filter(t => !t.completed).length;
    const highTodos = state.todos.filter(t => !t.completed && t.priority === 'high').length;
    
    const notesCount = state.notes.length;
    let latestNoteTitle = '';
    if (notesCount > 0) {
      const sortedNotes = [...state.notes].sort((a,b) => new Date(b.dateCreated) - new Date(a.dateCreated));
      latestNoteTitle = sortedNotes[0].title;
    }
    
    // GATE Syllabus coverage
    let totalGatePills = 0;
    let checkedGatePills = 0;
    state.gateSyllabus.forEach(subj => {
      if (subj.active === false) return;
      totalGatePills += subj.topics.length;
      subj.topics.forEach(t => {
        if (t.completed) checkedGatePills++;
      });
    });
    const gateProgress = totalGatePills > 0 ? Math.round((checkedGatePills / totalGatePills) * 100) : 0;
    
    // Exam countdown
    const distance = targetExamDate - new Date().getTime();
    const gateDaysLeft = distance > 0 ? Math.floor(distance / (1000 * 60 * 60 * 24)) : 0;

    const dashboardData = {
      todosPending: pendingTodos,
      todosHigh: highTodos,
      notesCount: notesCount,
      latestNoteTitle: latestNoteTitle,
      gateProgress: gateProgress,
      gateDaysLeft: gateDaysLeft,
      docsCount: docsCount,
      latestDocName: latestDocName
    };

    // Call 3D Dome Gallery library initialization with overview dashboard data
    window.DomeGallery.init(dashboardData, (selectedCardId) => {
      // Directs navigation dynamically based on which overview card was clicked
      const navTargetBtn = document.getElementById(`btn-${selectedCardId}`);
      if (navTargetBtn) {
        navTargetBtn.click();
      }
    });
  }

  // ==========================================================================
  // 6. DASHBOARD & STATS OVERVIEW WIDGET
  // ==========================================================================
  
  function updateDashboardStats() {
    // Set greeting and date
    const hours = new Date().getHours();
    let greeting = "Good morning, Scholar!";
    if (hours >= 12 && hours < 17) greeting = "Good afternoon, Scholar!";
    else if (hours >= 17) greeting = "Good evening, Scholar!";
    document.getElementById('greeting').textContent = greeting;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-string').textContent = new Date().toLocaleDateString(undefined, options);

    // 1. To-Dos progress ring calculation
    const totalTodos = state.todos.length;
    const completedTodos = state.todos.filter(t => t.completed).length;
    const todoPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;
    
    updateProgressRing('ring-todo', 'ring-todo-text', todoPercentage);

    // 2. GATE Syllabus coverage progress ring
    let totalGatePills = 0;
    let checkedGatePills = 0;
    state.gateSyllabus.forEach(subj => {
      if (subj.active === false) return;
      totalGatePills += subj.topics.length;
      subj.topics.forEach(t => {
        if (t.completed) checkedGatePills++;
      });
    });
    const gatePercentage = totalGatePills > 0 ? Math.round((checkedGatePills / totalGatePills) * 100) : 0;
    
    updateProgressRing('ring-gate', 'ring-gate-text', gatePercentage);

    // 3. Notes counter
    document.getElementById('ring-notes-text').textContent = state.notes.length;

    // 4. Focus session statistics
    const hoursFocus = Math.floor(state.pomodoroStats.totalTimeMinutes / 60);
    const minutesFocus = state.pomodoroStats.totalTimeMinutes % 60;
    document.getElementById('stats-focus-time').textContent = `${hoursFocus}h ${minutesFocus}m`;
    document.getElementById('stats-focus-sessions').textContent = state.pomodoroStats.totalSessions;

    // 5. Urgent tasks panel
    const urgentTasksContainer = document.getElementById('dash-urgent-tasks');
    const urgentTasks = state.todos
      .filter(t => !t.completed && (t.priority === 'high' || t.priority === 'medium'))
      .slice(0, 3); // top 3 critical items

    if (urgentTasks.length > 0) {
      urgentTasksContainer.innerHTML = '';
      urgentTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `dash-task-item ${task.priority}`;
        card.innerHTML = `
          <div style="flex-grow:1;">
            <div>${escapeHTML(task.name)}</div>
          </div>
          <span class="task-tag priority-${task.priority}">${task.priority.toUpperCase()}</span>
        `;
        urgentTasksContainer.appendChild(card);
      });
    } else {
      urgentTasksContainer.innerHTML = '<div class="empty-placeholder">No urgent tasks. Relax or add some tasks!</div>';
    }
  }

  function updateProgressRing(ringId, textId, percent) {
    const circle = document.getElementById(ringId);
    const textEl = document.getElementById(textId);
    if (!circle) return;

    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    
    // Set circle offset representation
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
    
    textEl.textContent = `${percent}%`;
  }

  // Escape utilities for DOM writing protection
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // ==========================================================================
  // 7. TO-DO LISTS CONTROLLER
  // ==========================================================================
  
  let selectedTodoPriority = 'low';

  const tasksContainer = document.getElementById('tasks-list');
  const addTaskBtn = document.getElementById('btn-add-task');
  const inputTaskName = document.getElementById('input-task-name');

  // Urgency selector clicks
  document.querySelectorAll('.priority-options .pr-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.priority-options .pr-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedTodoPriority = e.target.dataset.priority;
    });
  });

  // Add Task
  addTaskBtn.addEventListener('click', async () => {
    const taskName = inputTaskName.value.trim();
    if (!taskName) {
      await customAlert("Please enter a task description.", "Missing Information");
      return;
    }

    const newTask = {
      id: generateId(),
      name: taskName,
      priority: selectedTodoPriority,
      completed: false,
      dateCreated: new Date().toISOString()
    };

    state.todos.push(newTask);
    saveState();
    inputTaskName.value = '';
    
    renderTodoList();
    updateDashboardStats();
  });

  function renderTodoList() {
    const filtered = [...state.todos];

    // Sort by priority (high, medium, low) and completion
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });

    tasksContainer.innerHTML = '';
    
    if (filtered.length > 0) {
      filtered.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completed ? 'completed' : ''}`;
        
        card.innerHTML = `
          <div class="task-card-left">
            <div class="clay-checkbox chk-priority-${task.priority} ${task.completed ? 'checked' : ''}" data-id="${task.id}">
              <i class="fa-solid fa-check"></i>
            </div>
            <span class="task-text">${escapeHTML(task.name)}</span>
          </div>
          <div class="task-meta">
            <span class="task-tag priority-${task.priority}">${task.priority.toUpperCase()}</span>
            <button class="clay-btn small-btn icon-btn task-edit-btn" data-id="${task.id}" style="width:28px; height:28px; border-radius:8px;">
              <i class="fa-solid fa-pen" style="font-size:0.75rem;"></i>
            </button>
            <button class="clay-btn small-btn icon-btn danger task-delete-btn" data-id="${task.id}" style="width:28px; height:28px; border-radius:8px;">
              <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i>
            </button>
          </div>
        `;
        
        // bind check checkbox click
        card.querySelector('.clay-checkbox').addEventListener('click', (e) => {
          const tId = e.currentTarget.dataset.id;
          const targetTask = state.todos.find(t => t.id === tId);
          if (targetTask) {
            targetTask.completed = !targetTask.completed;
            saveState();
            renderTodoList();
            updateDashboardStats();
          }
        });

        // bind edit task click
        card.querySelector('.task-edit-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          const tId = e.currentTarget.dataset.id;
          const targetTask = state.todos.find(t => t.id === tId);
          if (targetTask) {
            const newName = await customPrompt("Edit task description:", targetTask.name, "Edit Task");
            if (newName !== null && newName.trim() !== "") {
              targetTask.name = newName.trim();
              saveState();
              renderTodoList();
              updateDashboardStats();
            }
          }
        });

        // bind delete task click
        card.querySelector('.task-delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const tId = e.currentTarget.dataset.id;
          state.todos = state.todos.filter(t => t.id !== tId);
          saveState();
          renderTodoList();
          updateDashboardStats();
        });

        tasksContainer.appendChild(card);
      });
    } else {
      tasksContainer.innerHTML = `
        <div class="empty-placeholder">
          <i class="fa-regular fa-calendar-check" style="font-size: 2.5rem; margin-bottom: 8px; color: var(--accent);"></i>
          <p>No tasks found. Add one above!</p>
        </div>
      `;
    }
  }

  // ==========================================================================
  // 8. NOTE PAD CONTROLLER (Whiteboard Sticky Notes & Modal Popups)
  // ==========================================================================
  
  const whiteboardSurface = document.getElementById('notes-board-surface');
  const modalEditNote = document.getElementById('modal-edit-note');
  const modalNoteTitle = document.getElementById('modal-note-title');
  const modalNoteBody = document.getElementById('modal-note-body');
  const modalNoteColors = document.getElementById('modal-note-colors');
  const modalBtnPin = document.getElementById('modal-btn-pin');
  const modalBtnDelete = document.getElementById('modal-btn-delete');
  const modalBtnCancel = document.getElementById('modal-btn-cancel');
  const modalBtnSave = document.getElementById('modal-btn-save');
  const btnCloseNoteModal = document.getElementById('btn-close-note-modal');
  const searchNotesInput = document.getElementById('input-note-search');
  const btnAddNote = document.getElementById('btn-add-note');

  let currentEditingNoteId = null;
  let tempNoteColor = 'sun';
  let tempNotePinned = false;

  const noteColors = ['red', 'tangerine', 'orange', 'coral', 'sun', 'green', 'seagrass', 'cyan', 'slate', 'cerulean'];
  const noteTextModes = {
    red: 'text-white', tangerine: 'text-white', orange: 'text-white', coral: 'text-white',
    sun: 'text-dark', green: 'text-dark', seagrass: 'text-white', cyan: 'text-white',
    slate: 'text-white', cerulean: 'text-white'
  };

  function renderWhiteboard() {
    if (!whiteboardSurface) return;
    
    const searchVal = searchNotesInput ? searchNotesInput.value.toLowerCase().trim() : '';
    let filtered = state.notes;
    
    if (searchVal) {
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(searchVal) || 
        n.body.toLowerCase().includes(searchVal)
      );
    }
    
    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.dateCreated) - new Date(a.dateCreated);
    });
    
    whiteboardSurface.innerHTML = '';
    
    if (filtered.length === 0) {
      whiteboardSurface.innerHTML = `
        <div class="empty-placeholder" style="grid-column: 1 / -1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;">
          <i class="fa-regular fa-note-sticky" style="font-size: 3rem; color: var(--accent); margin-bottom: 12px;"></i>
          <h3>No Sticky Notes</h3>
          <p>Your whiteboard is empty. Click the button above to add a sticky note!</p>
        </div>
      `;
      return;
    }
    
    let stateChanged = false;
    filtered.forEach(note => {
      if (note.rot === undefined) {
        note.rot = Math.random() * 7 - 3.5;
        stateChanged = true;
      }
    });
    if (stateChanged) saveState();
    
    filtered.forEach(note => {
      const color = note.color || 'sun';
      const textModeClass = noteTextModes[color] || 'text-dark';
      
      const sticky = document.createElement('div');
      sticky.className = `sticky-note color-${color} ${textModeClass} ${note.pinned ? 'pinned' : ''}`;
      sticky.dataset.id = note.id;
      sticky.dataset.color = color;
      sticky.style.setProperty('--rot', `${note.rot}deg`);
      
      const dateStr = new Date(note.dateCreated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const bodyPreview = note.body ? note.body : 'Double-click to write...';
      
      sticky.innerHTML = `
        <i class="fa-solid fa-thumbtack sticky-pin"></i>
        <div class="sticky-note-title">
          <span>${escapeHTML(note.title)}</span>
          ${note.pinned ? '<i class="fa-solid fa-star" style="color: #ffd166;"></i>' : ''}
        </div>
        <div class="sticky-note-body">${escapeHTML(bodyPreview)}</div>
        <div class="sticky-note-footer" style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:6px;">
          <span style="font-size:0.7rem; opacity:0.8;">${dateStr}</span>
          <div style="display:flex; gap:5px;">
            <button class="clay-btn small-btn note-edit-btn">
              <i class="fa-solid fa-pen" style="font-size:0.6rem;"></i> Edit
            </button>
            <button class="clay-btn small-btn note-card-delete-btn" title="Delete note">
              <i class="fa-solid fa-trash" style="font-size:0.6rem;"></i>
            </button>
          </div>
        </div>
      `;
      
      sticky.addEventListener('click', () => {
        openNoteEditorModal(note.id);
      });

      sticky.querySelector('.note-edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openNoteEditorModal(note.id);
      });

      sticky.querySelector('.note-card-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await customConfirm(`Delete "${note.title}"?`, 'Delete Note');
        if (confirmed) {
          state.notes = state.notes.filter(n => n.id !== note.id);
          saveState();
          renderWhiteboard();
          updateDashboardStats();
        }
      });
      
      sticky.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        note.pinned = !note.pinned;
        saveState();
        renderWhiteboard();
        updateDashboardStats();
      });
      
      whiteboardSurface.appendChild(sticky);
    });
  }


  function openNoteEditorModal(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    
    currentEditingNoteId = noteId;
    modalNoteTitle.value = note.title;
    modalNoteBody.value = note.body;
    tempNoteColor = note.color || 'sun';
    tempNotePinned = note.pinned || false;
    
    modalNoteColors.innerHTML = '';
    noteColors.forEach(color => {
      const dot = document.createElement('span');
      dot.style.backgroundColor = themeColors[color].hex;
      dot.className = `color-dot ${color === tempNoteColor ? 'active' : ''}`;
      dot.dataset.color = color;
      
      dot.addEventListener('click', (e) => {
        modalNoteColors.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        e.target.classList.add('active');
        tempNoteColor = color;
      });
      modalNoteColors.appendChild(dot);
    });
    
    updateModalPinButtonUI();
    modalEditNote.classList.add('active');
  }

  function updateModalPinButtonUI() {
    const icon = modalBtnPin.querySelector('i');
    if (tempNotePinned) {
      icon.className = 'fa-solid fa-star';
      modalBtnPin.classList.add('primary');
    } else {
      icon.className = 'fa-regular fa-star';
      modalBtnPin.classList.remove('primary');
    }
  }

  if (modalBtnPin) {
    modalBtnPin.addEventListener('click', () => {
      tempNotePinned = !tempNotePinned;
      updateModalPinButtonUI();
    });
  }

  const closeNoteModal = () => {
    modalEditNote.classList.remove('active');
    currentEditingNoteId = null;
  };

  if (btnCloseNoteModal) btnCloseNoteModal.addEventListener('click', closeNoteModal);
  if (modalBtnCancel) modalBtnCancel.addEventListener('click', closeNoteModal);

  if (modalBtnSave) {
    modalBtnSave.addEventListener('click', () => {
      if (!currentEditingNoteId) return;
      const note = state.notes.find(n => n.id === currentEditingNoteId);
      if (note) {
        note.title = modalNoteTitle.value.trim() || 'Untitled Sticky';
        note.body = modalNoteBody.value;
        note.color = tempNoteColor;
        note.pinned = tempNotePinned;
        
        saveState();
        closeNoteModal();
        renderWhiteboard();
        updateDashboardStats();
      }
    });
  }

  if (modalBtnDelete) {
    modalBtnDelete.addEventListener('click', async () => {
      if (!currentEditingNoteId) return;
      const confirmDelete = await customConfirm("Are you sure you want to delete this note?", "Delete Note");
      if (confirmDelete) {
        state.notes = state.notes.filter(n => n.id !== currentEditingNoteId);
        saveState();
        closeNoteModal();
        renderWhiteboard();
        updateDashboardStats();
      }
    });
  }

  if (btnAddNote) {
    btnAddNote.addEventListener('click', () => {
      const nextColor = noteColors[state.notes.length % noteColors.length];
      const newNote = {
        id: generateId(),
        title: 'Sticky Note',
        body: '',
        color: nextColor,
        pinned: false,
        dateCreated: new Date().toISOString(),
        rot: Math.random() * 7 - 3.5
      };
      state.notes.push(newNote);
      saveState();
      renderWhiteboard();
      openNoteEditorModal(newNote.id);
      updateDashboardStats();
    });
  }

  if (searchNotesInput) {
    searchNotesInput.addEventListener('input', () => {
      renderWhiteboard();
    });
  }

  // ==========================================================================
  // DOCUMENT VAULT CONTROLLER
  // ==========================================================================
  
  const inputDocSearch = document.getElementById('input-doc-search');
  const documentsGrid = document.getElementById('documents-grid-container');
  
  const modalDocViewer = document.getElementById('modal-doc-viewer');
  const docViewerTitle = document.getElementById('doc-viewer-title');
  const docViewerContent = document.getElementById('doc-viewer-content');
  const btnCloseDocViewer = document.getElementById('btn-close-doc-viewer');
  const btnCloseDocViewerAlt = document.getElementById('btn-close-doc-viewer-alt');

  function setupUploaderListeners() {
    const docDropzone = document.getElementById('doc-dropzone');
    const inputDocFile = document.getElementById('input-doc-file');
    
    if (docDropzone && inputDocFile) {
      docDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        docDropzone.classList.add('dragover');
      });
      docDropzone.addEventListener('dragleave', () => docDropzone.classList.remove('dragover'));
      docDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        docDropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleDocUpload(files[0]);
      });
      docDropzone.addEventListener('click', () => {
        inputDocFile.click();
      });
      inputDocFile.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) handleDocUpload(files[0]);
      });
    }
  }

  async function handleDocUpload(file) {
    if (file.size > 20 * 1024 * 1024) {
      await customAlert("File is too large. Max size is 20MB.", "File Too Large");
      return;
    }
    
    try {
      const base64Data = await fileToBase64(file);
      const newDoc = {
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        dateAdded: new Date().toISOString(),
        data: base64Data
      };
      
      await HubDB.saveDoc(newDoc);
      renderDocumentsList();
      updateDashboardStats();
    } catch (err) {
      console.error("Failed to upload document", err);
      await customAlert("Failed to save the document. Try again.", "Upload Error");
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  async function renderDocumentsList() {
    if (!documentsGrid) return;
    
    const searchVal = inputDocSearch ? inputDocSearch.value.toLowerCase().trim() : '';
    let docs = [];
    try {
      docs = await HubDB.getDocs();
    } catch (err) {
      console.error(err);
    }
    
    if (searchVal) {
      docs = docs.filter(d => d.name.toLowerCase().includes(searchVal));
    }
    
    docs.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    
    // Inject the uploader card dynamically as the first item
    documentsGrid.innerHTML = `
      <div class="doc-card uploader-card" id="doc-dropzone" style="border: 2px dashed rgba(var(--accent-rgb), 0.45); display: flex; align-items: center; justify-content: center; text-align: center; cursor: pointer; padding: 24px; min-height: 180px; background: rgba(var(--accent-rgb), 0.02); transition: all 0.2s ease;">
        <div class="uploader-inner">
          <i class="fa-solid fa-cloud-arrow-up uploader-icon" style="font-size: 2.2rem; margin-bottom: 10px; color: var(--accent);"></i>
          <h4 style="font-size: 0.95rem; margin-bottom: 4px; font-weight: 700;">Add Document</h4>
          <p style="font-size: 0.75rem; color: var(--text-secondary);">Drop files or click to upload</p>
          <input type="file" id="input-doc-file" accept="image/*,application/pdf" style="display: none;">
        </div>
      </div>
    `;
    
    setupUploaderListeners();
    
    docs.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      const isImage = doc.type.startsWith('image/');
      const sizeMB = (doc.size / (1024 * 1024)).toFixed(2);
      
      let thumbContent = isImage ? `<img src="${doc.data}" alt="${escapeHTML(doc.name)}">` : `<i class="fa-solid fa-file-pdf" style="color: #e63946;"></i>`;
      
      card.innerHTML = `
        <div class="doc-thumb-container">
          ${thumbContent}
        </div>
        <div class="doc-card-info">
          <div class="doc-name" title="${escapeHTML(doc.name)}">${escapeHTML(doc.name)}</div>
          <div class="doc-meta">
            <span>${sizeMB} MB</span>
            <button class="clay-btn small-btn doc-delete-btn" data-id="${doc.id}">Delete</button>
          </div>
        </div>
      `;
      
      card.querySelector('.doc-thumb-container').addEventListener('click', () => openDocumentViewer(doc));
      
      card.querySelector('.doc-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmDelete = await customConfirm(`Delete document "${doc.name}"?`, "Delete Document");
        if (confirmDelete) {
          await HubDB.deleteDoc(doc.id);
          renderDocumentsList();
          updateDashboardStats();
        }
      });
      
      documentsGrid.appendChild(card);
    });
  }

  if (inputDocSearch) {
    inputDocSearch.addEventListener('input', () => renderDocumentsList());
  }

  function openDocumentViewer(doc) {
    if (!modalDocViewer) return;
    docViewerTitle.textContent = doc.name;
    docViewerContent.innerHTML = '';
    
    if (doc.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = doc.data;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '70vh';
      img.style.objectFit = 'contain';
      docViewerContent.appendChild(img);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = doc.data;
      iframe.style.width = '100%';
      iframe.style.height = '70vh';
      iframe.style.border = 'none';
      docViewerContent.appendChild(iframe);
    }
    modalDocViewer.classList.add('active');
  }

  const closeDocViewer = () => {
    if (modalDocViewer) modalDocViewer.classList.remove('active');
  };
  if (btnCloseDocViewer) btnCloseDocViewer.addEventListener('click', closeDocViewer);
  if (btnCloseDocViewerAlt) btnCloseDocViewerAlt.addEventListener('click', closeDocViewer);

  // ==========================================================================
  // 9. GATE CS PREP CONTROLLER & SYLLABUS DATA
  // ==========================================================================

  // Count down timer calculate (GATE Exam usually happens first/second weekend of Feb)
  // Target: February 6, 2027 (approx date)
  const targetExamDate = new Date("February 6, 2027 09:00:00").getTime();

  function updateGateCountdown() {
    const now = new Date().getTime();
    const distance = targetExamDate - now;
    const displayEl = document.getElementById('gate-countdown-timer');
    if (!displayEl) return;

    if (distance < 0) {
      displayEl.textContent = "Exam Time!";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    displayEl.textContent = `${days} Days`;
  }

  updateGateCountdown();
  // Update countdown once daily
  setInterval(updateGateCountdown, 1000 * 60 * 60);

  // official GATE CS Syllabus syllabus preset template
  const gateCSSyllabusPreset = [
    {
      subjectName: "Discrete Mathematics",
      topics: [
        "Mathematical Logic (Propositional & First Order)",
        "Set Theory, Relations, Functions & Partial Orders",
        "Groups, Monoids & Algebraic Structures",
        "Combinatorics & Generating Functions",
        "Graph Theory (Connectivity, Coloring, Matching)"
      ]
    },
    {
      subjectName: "Digital Logic",
      topics: [
        "Boolean Algebra & Logic Minimization",
        "Combinational Circuits (Decoders, Multiplexers, Adders)",
        "Sequential Circuits (Flip-Flops, Counters, Registers)",
        "Number Representations & Computer Arithmetic"
      ]
    },
    {
      subjectName: "Computer Organization",
      topics: [
        "Machine Instructions & Addressing Modes",
        "ALU, Data-path & Control Unit Design",
        "Instruction Pipelining & Pipeline Hazards",
        "Memory Hierarchy (Cache, Associative, Virtual Memory)",
        "I/O Interfaces (Interrupts, Direct Memory Access)"
      ]
    },
    {
      subjectName: "Data Structures & Programming",
      topics: [
        "Programming in C (Syntax, Pointers, Scope)",
        "Recursion & Stack Applications",
        "Arrays, Stacks, Queues, Linked Lists",
        "Trees, Binary Search Trees & Binary Heaps"
      ]
    },
    {
      subjectName: "Algorithms",
      topics: [
        "Asymptotic Complexity Bounds & Analysis",
        "Searching, Sorting & Hashing",
        "Greedy, Divide-and-Conquer & Dynamic Programming",
        "Graph Algorithms (BFS, DFS, MST, Shortest Paths)"
      ]
    },
    {
      subjectName: "Theory of Computation",
      topics: [
        "Regular Expressions & Finite Automata",
        "Context Free Grammars & Pushdown Automata",
        "Pumping Lemma & Language Closures",
        "Turing Machines & Undecidability"
      ]
    },
    {
      subjectName: "Compiler Design",
      topics: [
        "Lexical Analysis & LL/LR Parsing",
        "Syntax Directed Translation",
        "Intermediate Code Generation",
        "Local Optimizations & Data-flow analysis"
      ]
    },
    {
      subjectName: "Operating Systems",
      topics: [
        "System Calls, Processes & CPU Scheduling",
        "Concurrency, Semaphores & Deadlock Avoidance",
        "Memory Management, Paging & Segmentation",
        "File Systems & Disk Scheduling Algorithms"
      ]
    },
    {
      subjectName: "Database Systems",
      topics: [
        "ER-Modeling & Relational Algebra",
        "Structured Query Language (SQL)",
        "Normal Forms (1NF, 2NF, 3NF, BCNF)",
        "Transaction Concurrency & Serialization Indexing"
      ]
    },
    {
      subjectName: "Computer Networks",
      topics: [
        "OSI & TCP/IP Layering Concepts",
        "Data Link Layer Protocols (Framing, Flow Control)",
        "Routing Protocols & IP Addressing (IPv4/IPv6)",
        "Transport Protocols (TCP, UDP, Congestion Control)",
        "Application Protocols (DNS, SMTP, HTTP, DHCP)"
      ]
    },
    {
      subjectName: "General Aptitude",
      topics: [
        "Verbal Ability & Comprehension",
        "Quantitative Aptitude & Mathematical Reasoning",
        "Analytical & Spatial Reasoning"
      ]
    }
  ];

  const importSyllabusBtn = document.getElementById('btn-import-gate-syllabus');
  const importSyllabusBtnAlt = document.getElementById('btn-import-gate-syllabus-alt');
  const syllabusListContainer = document.getElementById('gate-syllabus-list');
  const syllabusEmptyState = document.getElementById('syllabus-empty-state');

  async function loadGATESyllabusPreset() {
    if (state.gateSyllabus.length > 0) {
      const confirmOverwrite = await customConfirm("This will overwrite your current GATE syllabus progress. Do you want to continue?", "Overwrite Syllabus");
      if (!confirmOverwrite) {
        return;
      }
    }

    state.gateSyllabus = [];

    // 1. Process syllabus presets into state
    gateCSSyllabusPreset.forEach(subjPreset => {
      const subjectEntry = {
        subjectName: subjPreset.subjectName,
        active: true,
        topics: subjPreset.topics.map(topicName => ({
          name: topicName,
          completed: false
        }))
      };
      state.gateSyllabus.push(subjectEntry);
    });

    saveState();
    renderGateSyllabus();
    updateDashboardStats();
    
    await customAlert("Official GATE CS Syllabus successfully imported! GATE tracking is fully ready.", "Syllabus Imported");
  }

  function getRandomAccentColor() {
    const keys = Object.keys(themeColors);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  if (importSyllabusBtn) importSyllabusBtn.addEventListener('click', loadGATESyllabusPreset);
  if (importSyllabusBtnAlt) importSyllabusBtnAlt.addEventListener('click', loadGATESyllabusPreset);

  function renderGateSyllabus() {
    if (state.gateSyllabus.length === 0) {
      syllabusEmptyState.style.display = 'flex';
      syllabusListContainer.style.display = 'none';
      
      // Clear progress percentage
      document.getElementById('gate-syllabus-percentage').textContent = '0%';
      document.getElementById('gate-syllabus-fill').style.width = '0%';
      return;
    }

    syllabusEmptyState.style.display = 'none';
    syllabusListContainer.style.display = 'flex';
    syllabusListContainer.innerHTML = '';

    // Track total metrics count for progress banner calculation
    let totalTopics = 0;
    let completedTopics = 0;

    state.gateSyllabus.forEach((subject, subjIndex) => {
      if (subject.active === undefined) subject.active = true;

      const subjectCard = document.createElement('div');
      
      // Calculate individual subject completion
      const subjectTotalTopics = subject.topics.length;
      let subjectCompletedTopics = 0;
      subject.topics.forEach(t => {
        if (t.completed) subjectCompletedTopics++;
      });
      const subjProgressPct = subjectTotalTopics > 0 ? Math.round((subjectCompletedTopics / subjectTotalTopics) * 100) : 0;

      if (subject.active) {
        totalTopics += subjectTotalTopics;
        completedTopics += subjectCompletedTopics;
      }

      subjectCard.className = `gate-subject-card ${subject.active ? '' : 'inactive'}`;
      subjectCard.dataset.index = subjIndex;

      subjectCard.innerHTML = `
        <div class="gate-subject-header">
          <div class="gate-subject-title" style="display:flex; align-items:center; gap:12px;">
            <div class="clay-checkbox subject-active-checkbox ${subject.active ? 'checked' : ''}" data-index="${subjIndex}">
              <i class="fa-solid fa-check"></i>
            </div>
            <i class="fa-solid fa-chevron-down gate-subject-chevron"></i>
            <span>${escapeHTML(subject.subjectName)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="gate-subject-progress">${subjProgressPct}%</span>
            <div class="gate-completion-check ${subjProgressPct === 100 ? 'completed' : ''}" title="${subjProgressPct === 100 ? 'Subject Completed!' : 'Complete all topics to finish'}">
              <i class="fa-solid ${subjProgressPct === 100 ? 'fa-circle-check' : 'fa-circle'}"></i>
            </div>
          </div>
        </div>
        <div class="gate-topics-list">
          <!-- Topic rows injected below -->
        </div>
      `;

      // Active toggle checkbox click
      subjectCard.querySelector('.subject-active-checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        const sIdx = parseInt(e.currentTarget.dataset.index);
        state.gateSyllabus[sIdx].active = !state.gateSyllabus[sIdx].active;
        saveState();
        renderGateSyllabus();
        updateDashboardStats();
      });

      // Expand / Collapse click
      subjectCard.querySelector('.gate-subject-header').addEventListener('click', (e) => {
        if (e.target.closest('.subject-active-checkbox')) return;
        const parent = e.currentTarget.closest('.gate-subject-card');
        parent.classList.toggle('expanded');
      });

      const topicsContainer = subjectCard.querySelector('.gate-topics-list');

        const subjectColors = ['chk-s-red','chk-s-orange','chk-s-sun','chk-s-green','chk-s-teal','chk-s-blue','chk-s-violet','chk-s-rose'];
        const subjectColorClass = subjectColors[subjIndex % subjectColors.length];

        subject.topics.forEach((topic, topicIndex) => {
          const row = document.createElement('div');
          row.className = 'gate-topic-row';
          row.innerHTML = `
            <div class="gate-topic-left" style="display:flex; align-items:center; gap:10px;">
              <div class="clay-checkbox gate-topic-checkbox ${subjectColorClass} ${topic.completed ? 'checked' : ''}" data-subj="${subjIndex}" data-topic="${topicIndex}">
                <i class="fa-solid fa-check"></i>
              </div>
              <span class="gate-topic-text">${escapeHTML(topic.name)}</span>
            </div>
          `;

        // Toggle Topic completion
        row.querySelector('.gate-topic-checkbox').addEventListener('click', (e) => {
          const sIdx = parseInt(e.currentTarget.dataset.subj);
          const tIdx = parseInt(e.currentTarget.dataset.topic);

          const targetTopic = state.gateSyllabus[sIdx].topics[tIdx];
          targetTopic.completed = !targetTopic.completed;
          
          saveState();
          renderGateSyllabus();
          updateDashboardStats();
        });

        topicsContainer.appendChild(row);
      });

      syllabusListContainer.appendChild(subjectCard);
    });

    // Compute and render GATE Progress Banner values
    const overallPercentage = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    document.getElementById('gate-syllabus-percentage').textContent = `${overallPercentage}%`;
    document.getElementById('gate-syllabus-fill').style.width = `${overallPercentage}%`;
  }

  // ==========================================================================
  // 11. DATA BACKUP (JSON EXPORT/IMPORT) & STORAGE CLEANER
  // ==========================================================================
  
  const btnExport = document.getElementById('btn-export-data');
  const btnImportFile = document.getElementById('btn-import-data-file');
  const btnClearAll = document.getElementById('btn-clear-all-data');
  const dailyPomoGoalInput = document.getElementById('input-daily-pomo-goal');

  // Daily pomodoro goal setting change
  if (dailyPomoGoalInput) {
    dailyPomoGoalInput.value = state.dailyPomoGoal || 4;
    dailyPomoGoalInput.addEventListener('change', (e) => {
      state.dailyPomoGoal = parseInt(e.target.value) || 4;
      saveState();
    });
  }

  // Backup Export
  btnExport.addEventListener('click', () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      
      const dateString = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute("download", `productivity_hub_backup_${dateString}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      customAlert("Failed to export data. Please try again.", "Export Error");
    }
  });

  // Backup Import
  btnImportFile.addEventListener('change', (e) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    
    if (files.length === 0) return;
    
    fileReader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        
        // Simple schema validation
        if (typeof importedData === 'object' && importedData !== null) {
          state = {
            ...defaultState,
            ...importedData
          };
          saveState();
          
          // Force apply layout themes & reload active views
          applyTheme();
          updateDashboardStats();
          refreshDomeGallery();
          
          await customAlert("Backup data successfully imported and synced!", "Import Success");
          
          // Switch to Dashboard view
          const dashBtn = document.getElementById('btn-dashboard');
          if (dashBtn) dashBtn.click();
        } else {
          await customAlert("Invalid backup file format.", "Import Error");
        }
      } catch (err) {
        await customAlert("Failed to parse the backup file. Verify that it is a valid JSON export.", "Import Error");
      }
    };
    
    fileReader.readAsText(files[0]);
  });

  // Danger zone wipe storage
  btnClearAll.addEventListener('click', async () => {
    const confirm1 = await customConfirm("WARNING: This will permanently wipe all your data including subjects, notes, task lists, and exam progress. Are you sure you want to proceed?", "Wipe Storage");
    if (confirm1) {
      const confirm2 = await customPrompt("CONFIRMATION REQUIRED: Type 'DELETE' to confirm data erasure.", "", "Wipe Storage");
      if (confirm2 === 'DELETE') {
        localStorage.removeItem(STORAGE_KEY);
        state = JSON.parse(JSON.stringify(defaultState));
        saveState();
        
        // Apply default themes
        applyTheme();
        updateDashboardStats();
        refreshDomeGallery();
        
        await customAlert("Local storage wiped clean!", "Storage Wiped");
        
        // Redirect to dashboard pane
        const dashBtn = document.getElementById('btn-dashboard');
        if (dashBtn) dashBtn.click();
      }
    }
  });

  // ==========================================================================
  // 12. LANDING SCREEN 3D PERSPECTIVE PARALLAX & WORKSPACE SWITCHER
  // ==========================================================================
  
  const landingScreen = document.getElementById('landing-screen');
  const landingScene = document.getElementById('landing-3d-scene');
  const landingCards = document.querySelectorAll('.landing-3d-card');
  const btnEnterWorkspace = document.getElementById('btn-enter-workspace');
  const btnShowLanding = document.getElementById('btn-show-landing');
  const appContainer = document.querySelector('.app-container');

  // Parallax calculations on cursor movements
  if (landingScreen && landingScene) {
    landingScreen.addEventListener('mousemove', (e) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      const mouseX = e.clientX - width / 2;
      const mouseY = e.clientY - height / 2;
      
      // Calculate tilts (base rotateX is 60deg, base rotateZ is -45deg)
      const rotateX = 60 - (mouseY / height) * 25; // +/- 12.5 deg tilt
      const rotateY = (mouseX / width) * 25;       // +/- 12.5 deg tilt
      
      landingScene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(-45deg)`;
      
      // Spread cards out dynamically as mouse moves further from center
      landingCards.forEach(card => {
        card.style.transition = 'none';
        const depthStr = card.style.getPropertyValue('--card-depth') || '0px';
        const depthVal = parseInt(depthStr) || 0;
        const spreadMultiplier = 1 + Math.max(Math.abs(mouseX / width), Math.abs(mouseY / height)) * 1.8;
        
        // Scattered rotate and translateY offset per card to feel alive and dynamic
        let rot = 0;
        let ty = 0;
        if (card.classList.contains('card-todo')) { rot = -3; ty = -10; }
        else if (card.classList.contains('card-note')) { rot = 1; ty = -5; }
        else if (card.classList.contains('card-gate')) { rot = -1; ty = 10; }
        else if (card.classList.contains('card-stats')) { rot = 3; ty = 20; }
        
        card.style.transform = `translateZ(${depthVal * spreadMultiplier}px) translateY(${ty * spreadMultiplier}px) rotate(${rot}deg)`;
      });
    });

    // Settle stack transitions on cursor leave
    landingScreen.addEventListener('mouseleave', () => {
      landingScene.style.transform = `rotateX(60deg) rotateY(0deg) rotateZ(-45deg)`;
      landingCards.forEach(card => {
        card.style.transition = 'transform 0.6s cubic-bezier(0.165, 0.84, 0.44, 1)';
        const depthStr = card.style.getPropertyValue('--card-depth') || '0px';
        card.style.transform = `translateZ(${depthStr})`;
      });
    });
  }

  // Enter Workspace Action
  if (btnEnterWorkspace) {
    btnEnterWorkspace.addEventListener('click', () => {
      // 1. Play fly-out 3D cards animation
      if (landingScene) {
        landingScene.classList.add('fly-out');
      }
      
      // 2. Play slide up landing screen
      if (landingScreen) {
        landingScreen.classList.add('fade-out');
      }

      // 3. Reveal Workspace container
      setTimeout(() => {
        if (landingScreen) landingScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        // Re-align nav bubble blob
        const activeNav = document.querySelector('.nav-item.active');
        positionNavBlob(activeNav);
        
        // Refresh gallery
        refreshDomeGallery();
      }, 700); // Wait for transition keyframes to finish
    });
  }

  // View Landing Page Home Action
  if (btnShowLanding) {
    btnShowLanding.addEventListener('click', () => {
      // 1. Hide Workspace container
      if (appContainer) appContainer.style.display = 'none';
      
      // 2. Reset and Reveal landing page
      if (landingScreen) {
        landingScreen.style.display = 'flex';
        landingScreen.classList.remove('fade-out');
      }
      if (landingScene) {
        landingScene.classList.remove('fly-out');
      }
      
      // Force reset stack transform variables
      landingCards.forEach(card => {
        const depthStr = card.style.getPropertyValue('--card-depth') || '0px';
        card.style.transform = `translateZ(${depthStr})`;
      });
    });
  }

  // ==========================================================================
  // 13. INITIALIZATION ON PAGE LOAD
  // ==========================================================================
  
  // Sidebar Collapse toggle (Desktop/Laptop)
  const sidebar = document.getElementById('app-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebarIcon = document.getElementById('sidebar-collapse-icon');
  
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      if (sidebarIcon) {
        sidebarIcon.className = isCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left';
      }
      setTimeout(() => {
        const activeNav = document.querySelector('.nav-item.active');
        positionNavBlob(activeNav);
      }, 360);
    });
  }

  // Update dashboard stats & rings initially
  updateDashboardStats();

  // Load and position initial dome gallery
  refreshDomeGallery();

  // Bind initial settings colors
  document.querySelectorAll('.accent-btn').forEach(btn => {
    if (btn.dataset.accent === state.accent) btn.classList.add('active');
  });

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully!', reg.scope))
        .catch(err => console.log('Service Worker registration failed:', err));
    });
  }

});
