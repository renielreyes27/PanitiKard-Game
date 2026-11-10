/**
 * ==============================================================================
 * PanitiKard V2 — Dashboard Controller (Phase 6.3 - 6.6)
 * ==============================================================================
 *
 * Coordinates dashboard navigation, view switching, responsive layout state,
 * dynamic topic & question management (CRUD, preview, publish, archive),
 * rubric display and preview (Phase 6.6), and user session lifecycle.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------
  let _currentView = 'overview';
  let _currentProfile = null;
  let _profileCleared = false;
  const VALID_VIEWS = new Set(['overview', 'topics', 'questions', 'rubrics', 'account']);

  // Topic Management State
  let _topics = [];
  let _topicFilter = 'all'; // 'all' | 'published' | 'draft' | 'archived'
  let _topicSearch = '';

  // Question Management State (Phase 6.5)
  let _questions = [];
  let _questionTopicFilter = 'all';
  let _questionCategoryFilter = 'all';
  let _questionSearch = '';
  let _activeEditingQuestion = null;

  // Rubric Management State (Phase 6.6)
  let _rubrics = [];
  let _rubricTopicFilter = 'all';
  let _rubricStatusFilter = 'all';
  let _rubricSearch = '';

  let _pendingConfirmCallback = null;
  let _toastTimer = null;

  // Question Types & Categories Filipino Dictionary
  const CARD_CATEGORY_LABELS = {
    question: 'Tanong (Question)',
    statement: 'Pahayag (Statement)',
    correction: 'Pagwawasto (Correction)',
    bonus: 'Bonus Card',
    reverse: 'Reverse Card',
    help: 'Tulong (Help Card)',
    challenge: 'Hamon (Challenge)',
    quiz: 'Pagsusulit (Quiz)'
  };

  const QUESTION_TYPE_LABELS = {
    multiple_choice: 'Maramihang Pagpipilian',
    identification: 'Pagtukoy',
    true_false: 'Tama o Mali',
    fill_in_blank: 'Punan ang Patlang',
    situational: 'Sitwasyonal',
    open_ended: 'Malayang Sagot'
  };

  function getAuth() {
    return root.PANITIKARD_DASHBOARD_AUTH;
  }

  function getApi() {
    return root.PANITIKARD_DASHBOARD_API;
  }

  // ---------------------------------------------------------------------------
  // Toast Notification Helper
  // ---------------------------------------------------------------------------
  function showToast(message, type = 'success') {
    if (typeof document === 'undefined') return;
    const toast = document.getElementById('toast-alert');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;

    if (_toastTimer) clearTimeout(_toastTimer);

    msgEl.textContent = message;
    toast.className = `toast-alert ${type}`;
    toast.style.display = 'flex';

    _toastTimer = setTimeout(() => {
      toast.style.display = 'none';
      _toastTimer = null;
    }, 3800);
  }

  // ---------------------------------------------------------------------------
  // Navigation & View Switching
  // ---------------------------------------------------------------------------
  function switchView(viewName) {
    const target = VALID_VIEWS.has(viewName) ? viewName : 'overview';
    _currentView = target;

    if (typeof document === 'undefined') return target;

    // Update nav buttons
    const navButtons = document.querySelectorAll('[data-nav-target]');
    navButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-nav-target') === target;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    // Update view panels
    const viewSections = document.querySelectorAll('.view-section');
    viewSections.forEach(section => {
      const isSectionTarget = section.id === `view-${target}`;
      section.classList.toggle('active', isSectionTarget);
    });

    // Close mobile drawer if open
    closeMobileSidebar();

    // Update URL hash cleanly
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.hash !== `#${target}`) {
        window.history.replaceState(null, '', `#${target}`);
      }
    }

    // Lazy load data for selected tab
    if (target === 'topics' && _topics.length === 0) {
      loadTopics();
    } else if (target === 'questions') {
      loadQuestionTopicsDropdown();
      if (_questions.length === 0) {
        loadQuestions();
      }
    } else if (target === 'rubrics') {
      loadRubricTopicsDropdown();
      if (_rubrics.length === 0) {
        loadRubrics();
      }
    }

    return target;
  }

  // ---------------------------------------------------------------------------
  // Mobile Sidebar Drawer Management
  // ---------------------------------------------------------------------------
  function openMobileSidebar() {
    if (typeof document === 'undefined') return;
    const sidebar = document.getElementById('dashboard-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
  }

  function closeMobileSidebar() {
    if (typeof document === 'undefined') return;
    const sidebar = document.getElementById('dashboard-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  function toggleMobileSidebar() {
    if (typeof document === 'undefined') return;
    const sidebar = document.getElementById('dashboard-sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  }

  // ---------------------------------------------------------------------------
  // Role-Based Visibility & Admin-Only Feature Guards
  // ---------------------------------------------------------------------------
  function getVerifiedRole(profile) {
    if (profile === null) return null;
    if (profile && typeof profile === 'object') {
      return profile.role || null;
    }
    if (_profileCleared) return null;
    const resolved = _currentProfile || (typeof getAuth()?.getProfile === 'function' ? getAuth().getProfile() : null);
    return resolved?.role || null;
  }

  function isAdminUser(profile) {
    if (profile === null) return false;
    return getVerifiedRole(profile) === 'admin';
  }

  function applyRoleBasedVisibility(profile) {
    if (profile === null) {
      _currentProfile = null;
      _profileCleared = true;
    } else if (profile !== undefined) {
      _currentProfile = profile;
      _profileCleared = false;
    }
    const isAdmin = profile === null ? false : isAdminUser(profile);

    if (typeof document === 'undefined') return isAdmin;

    const adminElements = [
      document.getElementById('stat-card-api-security'),
      document.getElementById('btn-open-api-modal'),
      document.getElementById('panel-system-status')
    ];

    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
        if (el.id !== 'modal-api-settings' && !adminElements.includes(el)) {
          adminElements.push(el);
        }
      });
    }

    adminElements.forEach(el => {
      if (!el) return;
      if (isAdmin) {
        el.classList.remove('hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    const apiModal = document.getElementById('modal-api-settings');
    if (apiModal && !isAdmin) {
      apiModal.classList.remove('active');
      apiModal.classList.add('hidden');
      apiModal.setAttribute('aria-hidden', 'true');
    }

    return isAdmin;
  }

  async function loadSystemStatus(profile) {
    if (!isAdminUser(profile)) {
      applyRoleBasedVisibility(profile);
      return null;
    }

    const api = getApi();
    if (!api || typeof api.getSystemStatus !== 'function') return null;

    try {
      const status = await api.getSystemStatus();
      if (typeof document !== 'undefined' && status) {
        const apiServerBadge = document.getElementById('status-badge-api-server');
        const dbBadge = document.getElementById('status-badge-database');
        const rlsBadge = document.getElementById('status-badge-rls');
        const evalBadge = document.getElementById('status-badge-evaluator');
        const summaryBadge = document.getElementById('system-status-summary-badge');

        if (apiServerBadge && status.apiServer) {
          apiServerBadge.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(status.apiServer.label || 'Online')}`;
        }
        if (dbBadge && status.database) {
          dbBadge.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(status.database.label || 'Disconnected')}`;
        }
        if (rlsBadge && status.rlsSecurity) {
          rlsBadge.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(status.rlsSecurity.label || 'Not verified')}`;
        }
        if (evalBadge && status.evaluator) {
          evalBadge.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(status.evaluator.label || 'Operational')}`;
        }
        if (summaryBadge && status.database) {
          summaryBadge.textContent = status.database.status === 'connected' ? 'Operational' : 'Degraded';
        }
      }
      return status;
    } catch (err) {
      console.warn('[Dashboard] Error loading admin system status:', err.message);
      return null;
    }
  }

  async function openApiSettingsModal() {
    if (!isAdminUser()) {
      showToast('Para sa Administrator lamang ang API settings at katayuan ng sistema.', 'error');
      return false;
    }

    if (typeof document === 'undefined') return true;
    const modal = document.getElementById('modal-api-settings');
    if (!modal) return false;

    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    modal.classList.add('active');

    const api = getApi();
    if (api && typeof api.getApiSettings === 'function') {
      try {
        const settings = await api.getApiSettings();
        if (settings) {
          const basePathEl = document.getElementById('api-modal-base-path');
          const rbacEl = document.getElementById('api-modal-rbac-status');
          if (basePathEl && settings.basePath) basePathEl.textContent = settings.basePath;
          if (rbacEl && settings.rbacProtection) {
            rbacEl.textContent = `${settings.rbacProtection} (${settings.authMechanism || 'Verified JWT Bearer + Supabase RLS'})`;
          }
        }
      } catch (err) {
        console.warn('[Dashboard] Error loading API settings:', err.message);
      }
    }

    return true;
  }

  function closeApiSettingsModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-api-settings');
    if (modal) {
      modal.classList.remove('active');
      if (!isAdminUser()) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UI Rendering Helpers
  // ---------------------------------------------------------------------------
  function renderUserProfile(profile) {
    if (typeof document === 'undefined' || !profile) return;

    _currentProfile = profile;
    applyRoleBasedVisibility(profile);

    const roleName = profile.role === 'admin' ? 'Administrator' : 'Guro';
    const roleClass = profile.role === 'admin' ? 'admin' : 'teacher';
    const displayName = profile.displayName || profile.email || 'Kasamang Guro';

    // Header pill
    const staffNameEl = document.getElementById('staff-name');
    const staffRoleEl = document.getElementById('staff-role');
    const staffPillEl = document.getElementById('staff-identity-pill');
    if (staffNameEl) staffNameEl.textContent = displayName;
    if (staffRoleEl) {
      staffRoleEl.textContent = roleName;
      staffRoleEl.className = `role-tag ${roleClass}`;
    }
    if (staffPillEl) staffPillEl.classList.remove('hidden');

    // Welcome banner
    const welcomeHeadingEl = document.getElementById('welcome-heading');
    const bannerRoleBadgeEl = document.getElementById('banner-role-badge');
    if (welcomeHeadingEl) welcomeHeadingEl.textContent = `Maligayang pagdating, ${displayName}!`;
    if (bannerRoleBadgeEl) {
      bannerRoleBadgeEl.textContent = roleName.toUpperCase();
      bannerRoleBadgeEl.className = `role-tag ${roleClass}`;
    }

    // Account tab details
    const accEmailEl = document.getElementById('account-email');
    const accRoleEl = document.getElementById('account-role');
    const accIdEl = document.getElementById('account-id');
    const accNameEl = document.getElementById('account-display-name');
    if (accEmailEl) accEmailEl.textContent = profile.email || 'Walang nakatalang email';
    if (accRoleEl) {
      accRoleEl.textContent = `${roleName} (${profile.role})`;
      accRoleEl.className = `role-tag ${roleClass}`;
    }
    if (accIdEl) accIdEl.textContent = profile.id;
    if (accNameEl) accNameEl.textContent = displayName;
  }

  async function loadOverviewStats() {
    if (typeof document === 'undefined') return;
    const api = getApi();
    if (!api || typeof api.getOverviewStats !== 'function') return;

    try {
      const stats = await api.getOverviewStats();
      const topicCountEl = document.getElementById('stat-topics-count');
      const topicDescEl = document.getElementById('stat-topics-desc');
      const questionCountEl = document.getElementById('stat-questions-count');
      const rubricCountEl = document.getElementById('stat-rubrics-count');

      if (topicCountEl && stats.topics) {
        topicCountEl.textContent = stats.topics.total;
        if (topicDescEl && stats.topics.isLive) {
          topicDescEl.textContent = `${stats.topics.published} inilathala · ${stats.topics.draft} borador · ${stats.topics.archived} naka-archive`;
        }
      }
      if (questionCountEl && stats.questions) {
        questionCountEl.textContent = stats.questions.total;
      }
      if (rubricCountEl && stats.rubrics) {
        rubricCountEl.textContent = stats.rubrics.total;
      }
    } catch (err) {
      console.warn('[Dashboard] Error loading stats:', err.message);
    }
  }

  function showAuthScreen(errorMessage = '') {
    _currentProfile = null;
    applyRoleBasedVisibility(null);

    if (typeof document === 'undefined') return;
    const loadingView = document.getElementById('loading-view');
    const appWrapper = document.getElementById('dashboard-app');
    const authWrapper = document.getElementById('auth-wrapper');
    const staffPill = document.getElementById('staff-identity-pill');
    const logoutBtn = document.getElementById('logout-btn');
    const authAlert = document.getElementById('auth-alert');

    if (loadingView) loadingView.classList.add('hidden');
    if (appWrapper) appWrapper.classList.add('hidden');
    if (staffPill) staffPill.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (authWrapper) authWrapper.classList.remove('hidden');

    const path = (typeof window !== 'undefined' && window.location) ? (window.location.pathname || '').toLowerCase() : '';
    const isAdminRoute = path === '/admin' || path.startsWith('/admin/');
    const authTitle = document.querySelector('#auth-wrapper .auth-card-header h2');
    const authDesc = document.querySelector('#auth-wrapper .auth-card-header p');
    if (authTitle) {
      authTitle.textContent = isAdminRoute ? 'Pag-sign In ng Administrator' : 'Pag-sign In ng Guro';
    }
    if (authDesc) {
      authDesc.textContent = isAdminRoute
        ? 'Ilagay ang iyong administrator credentials upang ma-access ang pamamahala at mga setting ng PanitiKard.'
        : 'Ilagay ang iyong credentials upang ma-access ang pamamahala ng nilalaman at mga tanong ng PanitiKard.';
    }

    if (authAlert) {
      if (errorMessage) {
        authAlert.textContent = errorMessage;
        authAlert.className = 'auth-alert error';
        authAlert.style.display = 'block';
      } else {
        authAlert.style.display = 'none';
        authAlert.textContent = '';
      }
    }
  }

  function showDashboardApp(profile) {
    if (typeof document === 'undefined') return;
    const loadingView = document.getElementById('loading-view');
    const authWrapper = document.getElementById('auth-wrapper');
    const appWrapper = document.getElementById('dashboard-app');
    const logoutBtn = document.getElementById('logout-btn');

    if (loadingView) loadingView.classList.add('hidden');
    if (authWrapper) authWrapper.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (appWrapper) appWrapper.classList.remove('hidden');

    renderUserProfile(profile);

    // Initial hash routing or default to overview
    const hash = (typeof window !== 'undefined' && window.location.hash)
      ? window.location.hash.replace(/^#/, '')
      : 'overview';
    switchView(hash);

    loadOverviewStats();
    if (isAdminUser(profile)) {
      loadSystemStatus(profile);
    }
  }

  function formatDate(isoDateString) {
    if (!isoDateString) return '--';
    try {
      const d = new Date(isoDateString);
      if (isNaN(d.getTime())) return isoDateString;
      return d.toLocaleDateString('fil-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoDateString;
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------------------
  // Topic Management Logic (Phase 6.4)
  // ---------------------------------------------------------------------------

  function setTopicFilter(filter) {
    _topicFilter = filter;
    if (typeof document === 'undefined') return;

    document.querySelectorAll('[data-topic-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-topic-filter') === filter);
    });

    renderTopics();
  }

  function setTopicSearch(query) {
    _topicSearch = (query || '').trim().toLowerCase();
    renderTopics();
  }

  function updateFilterCounts() {
    if (typeof document === 'undefined') return;

    const total = _topics.length;
    const published = _topics.filter(t => t.status === 'published' && !t.archived_at).length;
    const draft = _topics.filter(t => t.status === 'draft' && !t.archived_at).length;
    const archived = _topics.filter(t => t.status === 'archived' || Boolean(t.archived_at)).length;

    const countAllEl = document.getElementById('filter-count-all');
    const countPubEl = document.getElementById('filter-count-published');
    const countDraftEl = document.getElementById('filter-count-draft');
    const countArchEl = document.getElementById('filter-count-archived');

    if (countAllEl) countAllEl.textContent = total;
    if (countPubEl) countPubEl.textContent = published;
    if (countDraftEl) countDraftEl.textContent = draft;
    if (countArchEl) countArchEl.textContent = archived;
  }

  function filterTopics(list, filter, search) {
    return list.filter(topic => {
      if (filter === 'published') {
        if (topic.status !== 'published' || topic.archived_at) return false;
      } else if (filter === 'draft') {
        if (topic.status !== 'draft' || topic.archived_at) return false;
      } else if (filter === 'archived') {
        if (topic.status !== 'archived' && !topic.archived_at) return false;
      }

      if (search) {
        const titleMatch = (topic.title || '').toLowerCase().includes(search);
        const codeMatch = (topic.code || '').toLowerCase().includes(search);
        const compMatch = (topic.competency || '').toLowerCase().includes(search);
        if (!titleMatch && !codeMatch && !compMatch) return false;
      }

      return true;
    });
  }

  function renderTopics() {
    if (typeof document === 'undefined') return;

    const loadingEl = document.getElementById('topics-loading');
    const tableEl = document.getElementById('topics-table');
    const tbodyEl = document.getElementById('topics-tbody');
    const emptyEl = document.getElementById('topics-empty');
    const emptyDescEl = document.getElementById('topics-empty-desc');

    if (loadingEl) loadingEl.classList.add('hidden');

    const filtered = filterTopics(_topics, _topicFilter, _topicSearch);

    if (filtered.length === 0) {
      if (tableEl) tableEl.classList.add('hidden');
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        if (emptyDescEl) {
          if (_topicSearch) {
            emptyDescEl.textContent = `Walang paksang tumutugma sa paghahanap na "${_topicSearch}".`;
          } else if (_topicFilter !== 'all') {
            emptyDescEl.textContent = `Walang paksang may katayuang "${_topicFilter}".`;
          } else {
            emptyDescEl.textContent = 'Wala pang nakatalang paksa sa database.';
          }
        }
      }
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.remove('hidden');

    if (tbodyEl) {
      tbodyEl.innerHTML = '';

      filtered.forEach(topic => {
        const tr = document.createElement('tr');

        const isArchived = topic.status === 'archived' || Boolean(topic.archived_at);
        let statusClass = 'draft';
        let statusLabel = 'Borador';

        if (isArchived) {
          statusClass = 'archived';
          statusLabel = 'Naka-archive';
        } else if (topic.status === 'published') {
          statusClass = 'published';
          statusLabel = 'Inilathala';
        }

        const tdTitle = document.createElement('td');
        tdTitle.className = 'topic-title-cell';
        tdTitle.innerHTML = `
          <strong>${escapeHtml(topic.title)}</strong>
          <span class="topic-code-badge">${escapeHtml(topic.code)}</span>
          ${topic.description ? `<div class="topic-desc-subtext">${escapeHtml(topic.description)}</div>` : ''}
        `;

        const tdComp = document.createElement('td');
        tdComp.innerHTML = `<div class="topic-competency-text">${escapeHtml(topic.competency || '--')}</div>`;

        const tdStatus = document.createElement('td');
        tdStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusLabel}</span>`;

        const tdDate = document.createElement('td');
        tdDate.style.fontSize = '0.825rem';
        tdDate.style.color = 'var(--dash-text-muted)';
        tdDate.textContent = formatDate(topic.updated_at || topic.created_at);

        const tdActions = document.createElement('td');
        tdActions.className = 'action-buttons-cell';
        tdActions.style.justifyContent = 'flex-end';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn-action edit';
        btnEdit.title = 'I-edit ang detalye ng paksa';
        btnEdit.innerHTML = '&#9998; I-edit';
        btnEdit.addEventListener('click', () => openEditTopicModal(topic.code));
        tdActions.appendChild(btnEdit);

        if (!isArchived) {
          if (topic.status === 'draft') {
            const btnPublish = document.createElement('button');
            btnPublish.type = 'button';
            btnPublish.className = 'btn-action publish';
            btnPublish.title = 'Ilathala upang maging aktibo sa laro';
            btnPublish.innerHTML = '&#10003; Ilathala';
            btnPublish.addEventListener('click', () => promptPublishTopic(topic));
            tdActions.appendChild(btnPublish);
          } else if (topic.status === 'published') {
            const btnUnpublish = document.createElement('button');
            btnUnpublish.type = 'button';
            btnUnpublish.className = 'btn-action unpublish';
            btnUnpublish.title = 'Gawing borador upang itago sa laro';
            btnUnpublish.innerHTML = '&#8634; I-unpublish';
            btnUnpublish.addEventListener('click', () => promptUnpublishTopic(topic));
            tdActions.appendChild(btnUnpublish);
          }

          const btnArchive = document.createElement('button');
          btnArchive.type = 'button';
          btnArchive.className = 'btn-action archive';
          btnArchive.title = 'I-archive ang paksang ito';
          btnArchive.innerHTML = '&#128465; I-archive';
          btnArchive.addEventListener('click', () => promptArchiveTopic(topic));
          tdActions.appendChild(btnArchive);
        } else {
          const btnRestore = document.createElement('button');
          btnRestore.type = 'button';
          btnRestore.className = 'btn-action unpublish';
          btnRestore.title = 'Ibalik bilang borador';
          btnRestore.innerHTML = '&#8634; Ibalik sa Borador';
          btnRestore.addEventListener('click', () => promptUnpublishTopic(topic, true));
          tdActions.appendChild(btnRestore);
        }

        tr.appendChild(tdTitle);
        tr.appendChild(tdComp);
        tr.appendChild(tdStatus);
        tr.appendChild(tdDate);
        tr.appendChild(tdActions);

        tbodyEl.appendChild(tr);
      });
    }
  }

  async function loadTopics() {
    if (typeof document === 'undefined') return;
    const api = getApi();
    if (!api || typeof api.getTopics !== 'function') return;

    const loadingEl = document.getElementById('topics-loading');
    const tableEl = document.getElementById('topics-table');
    const emptyEl = document.getElementById('topics-empty');
    const alertEl = document.getElementById('topics-alert');

    if (alertEl) alertEl.style.display = 'none';
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (tableEl) tableEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    try {
      const data = await api.getTopics();
      _topics = Array.isArray(data) ? data : [];
      updateFilterCounts();
      renderTopics();
      loadQuestionTopicsDropdown();
      loadOverviewStats();
    } catch (err) {
      console.error('[Dashboard] Error loading topics:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (alertEl) {
        alertEl.textContent = `Hindi maikarga ang mga paksa: ${err.message}`;
        alertEl.className = 'auth-alert error';
        alertEl.style.display = 'block';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Question Management Logic (Phase 6.5)
  // ---------------------------------------------------------------------------

  function loadQuestionTopicsDropdown() {
    if (typeof document === 'undefined') return;

    const filterSelect = document.getElementById('question-topic-filter');
    const createSelect = document.getElementById('create-q-topic');

    if (filterSelect) {
      const curVal = filterSelect.value || 'all';
      filterSelect.innerHTML = '<option value="all">Lahat ng Paksa (All Topics)</option>';
      _topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.code;
        opt.textContent = `${t.title} (${t.code})`;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = curVal;
    }

    if (createSelect) {
      const curVal = createSelect.value || '';
      createSelect.innerHTML = '<option value="">-- Piliin ang Paksa --</option>';
      _topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.code;
        opt.textContent = `${t.title} (${t.code})`;
        createSelect.appendChild(opt);
      });
      createSelect.value = curVal;
    }
  }

  function setQuestionTopicFilter(topicCode) {
    _questionTopicFilter = topicCode || 'all';
    loadQuestions();
  }

  function setQuestionCategoryFilter(category) {
    _questionCategoryFilter = category || 'all';
    renderQuestions();
  }

  function setQuestionSearch(query) {
    _questionSearch = (query || '').trim().toLowerCase();
    renderQuestions();
  }

  function filterQuestions(list, topicFilter, categoryFilter, search) {
    return list.filter(q => {
      // 1. Topic Filter
      if (topicFilter && topicFilter !== 'all') {
        if (q.topicCode !== topicFilter) return false;
      }

      // 2. Category Filter
      if (categoryFilter && categoryFilter !== 'all') {
        if (categoryFilter === 'quiz') {
          if (q.cardCategory) return false;
        } else {
          if (q.cardCategory !== categoryFilter) return false;
        }
      }

      // 3. Search Query
      if (search) {
        const promptMatch = (q.prompt || '').toLowerCase().includes(search);
        const codeMatch = (q.code || '').toLowerCase().includes(search);
        const titleMatch = (q.title || '').toLowerCase().includes(search);
        const tagMatch = (q.tag || '').toLowerCase().includes(search);
        if (!promptMatch && !codeMatch && !titleMatch && !tagMatch) return false;
      }

      return true;
    });
  }

  async function loadQuestions() {
    if (typeof document === 'undefined') return;
    const api = getApi();
    if (!api || typeof api.getQuestions !== 'function') return;

    const loadingEl = document.getElementById('questions-loading');
    const tableEl = document.getElementById('questions-table');
    const emptyEl = document.getElementById('questions-empty');
    const alertEl = document.getElementById('questions-alert');

    if (alertEl) alertEl.style.display = 'none';
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (tableEl) tableEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    try {
      if (_topics.length === 0) {
        const data = await api.getTopics();
        _topics = Array.isArray(data) ? data : [];
        loadQuestionTopicsDropdown();
      }

      let questions = [];
      if (_questionTopicFilter && _questionTopicFilter !== 'all') {
        const res = await api.getQuestions(_questionTopicFilter);
        questions = res?.questions || [];
      } else {
        questions = await api.getAllQuestions(_topics);
      }

      _questions = Array.isArray(questions) ? questions : [];
      renderQuestions();
      loadOverviewStats();
    } catch (err) {
      console.error('[Dashboard] Error loading questions:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (alertEl) {
        alertEl.textContent = `Hindi maikarga ang mga tanong: ${err.message}`;
        alertEl.className = 'auth-alert error';
        alertEl.style.display = 'block';
      }
    }
  }

  function renderQuestions() {
    if (typeof document === 'undefined') return;

    const loadingEl = document.getElementById('questions-loading');
    const tableEl = document.getElementById('questions-table');
    const tbodyEl = document.getElementById('questions-tbody');
    const emptyEl = document.getElementById('questions-empty');
    const emptyDescEl = document.getElementById('questions-empty-desc');

    if (loadingEl) loadingEl.classList.add('hidden');

    const filtered = filterQuestions(_questions, _questionTopicFilter, _questionCategoryFilter, _questionSearch);

    if (filtered.length === 0) {
      if (tableEl) tableEl.classList.add('hidden');
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        if (emptyDescEl) {
          if (_questionSearch) {
            emptyDescEl.textContent = `Walang tanong na tumutugma sa "${_questionSearch}".`;
          } else {
            emptyDescEl.textContent = 'Wala pang nakatalang tanong sa napiling filter.';
          }
        }
      }
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.remove('hidden');

    if (tbodyEl) {
      tbodyEl.innerHTML = '';

      filtered.forEach(q => {
        const tr = document.createElement('tr');

        const catKey = q.cardCategory || 'quiz';
        const catLabel = CARD_CATEGORY_LABELS[catKey] || catKey;
        const typeLabel = QUESTION_TYPE_LABELS[q.questionType] || q.questionType;

        // Col 1: Prompt & Code
        const tdPrompt = document.createElement('td');
        tdPrompt.innerHTML = `
          <strong>${escapeHtml(q.title || q.code)}</strong>
          <div style="font-size: 0.85rem; color: var(--dash-text); margin: 0.25rem 0; line-height: 1.4;">${escapeHtml(q.prompt)}</div>
          <span class="topic-code-badge">${escapeHtml(q.code)}</span>
        `;

        // Col 2: Category & Type badges
        const tdCat = document.createElement('td');
        tdCat.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start;">
            <span class="badge-category ${catKey}">${catLabel}</span>
            <span class="badge-type">${typeLabel}</span>
          </div>
        `;

        // Col 3: Topic
        const tdTopic = document.createElement('td');
        tdTopic.innerHTML = `
          <strong style="font-size: 0.85rem;">${escapeHtml(q.topicTitle || q.topicCode || '--')}</strong>
          <div style="font-family: monospace; font-size: 0.75rem; color: var(--dash-text-muted);">${escapeHtml(q.topicCode || '')}</div>
        `;

        // Col 4: Points / Time limit
        const tdPoints = document.createElement('td');
        tdPoints.innerHTML = `
          <span style="font-weight: 700;">${q.points ?? 1} pt</span>
          ${q.timeLimit ? `<div style="font-size: 0.75rem; color: var(--dash-text-muted);">${q.timeLimit}s timer</div>` : ''}
        `;

        // Col 5: Version
        const tdVersion = document.createElement('td');
        tdVersion.style.fontFamily = 'monospace';
        tdVersion.style.fontSize = '0.85rem';
        const activeVer = q.currentVersion || q.versionNumber || q.current_version || 1;
        if (q.hasDraftRevision && q.draftVersionNumber) {
          tdVersion.innerHTML = `<div>v${activeVer}</div><div style="font-size: 0.72rem; color: #1d4ed8; font-weight: 600;">(v${q.draftVersionNumber} borador)</div>`;
        } else {
          tdVersion.textContent = `v${activeVer}`;
        }

        // Col 6: Status
        const tdStatus = document.createElement('td');
        const isArchived = q.status === 'archived' || Boolean(q.archived_at);
        if (isArchived) {
          tdStatus.innerHTML = `<span class="status-badge archived">Archived</span>`;
        } else if (q.hasDraftRevision) {
          tdStatus.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;">
              <span class="status-badge published">Inilathala</span>
              <span class="status-badge has-draft">+ Borador v${q.draftVersionNumber}</span>
            </div>
          `;
        } else if (q.status === 'published') {
          tdStatus.innerHTML = `<span class="status-badge published">Inilathala</span>`;
        } else {
          tdStatus.innerHTML = `<span class="status-badge draft">Borador</span>`;
        }

        // Col 7: Actions
        const tdActions = document.createElement('td');
        tdActions.className = 'action-buttons-cell';
        tdActions.style.justifyContent = 'flex-end';

        // 1. Preview button
        const btnPreview = document.createElement('button');
        btnPreview.type = 'button';
        btnPreview.className = 'btn-action';
        btnPreview.title = 'Silipin ang hitsura sa laro';
        btnPreview.innerHTML = '&#128065; Silipin';
        btnPreview.addEventListener('click', () => openPreviewQuestionModal(q.code));
        tdActions.appendChild(btnPreview);

        // 2. Publish / Unpublish button
        if (!isArchived) {
          if (q.status === 'draft' || q.hasDraftRevision) {
            const publishVersion = q.hasDraftRevision ? q.draftVersionNumber : (q.currentVersion || q.versionNumber || 1);
            const btnPublish = document.createElement('button');
            btnPublish.type = 'button';
            btnPublish.className = 'btn-action publish';
            btnPublish.title = `I-publish ang bersyon ${publishVersion}`;
            btnPublish.innerHTML = '&#10003; I-publish';
            btnPublish.addEventListener('click', () => promptPublishQuestion(q.code, publishVersion));
            tdActions.appendChild(btnPublish);
          } else if (q.status === 'published') {
            const btnUnpublish = document.createElement('button');
            btnUnpublish.type = 'button';
            btnUnpublish.className = 'btn-action unpublish';
            btnUnpublish.title = 'Gawing borador upang itago sa mga mag-aaral';
            btnUnpublish.innerHTML = '&#8634; I-unpublish';
            btnUnpublish.addEventListener('click', () => promptUnpublishQuestion(q.code));
            tdActions.appendChild(btnUnpublish);
          }
        }

        // 3. Edit button
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn-action edit';
        btnEdit.title = 'I-edit (lilikha ng bagong borador)';
        btnEdit.innerHTML = '&#9998; I-edit';
        btnEdit.addEventListener('click', () => openEditQuestionModal(q.code));
        tdActions.appendChild(btnEdit);

        // 4. Archive button
        if (!isArchived) {
          const btnArchive = document.createElement('button');
          btnArchive.type = 'button';
          btnArchive.className = 'btn-action archive';
          btnArchive.title = 'I-archive ang tanong na ito';
          btnArchive.innerHTML = '&#128465;';
          btnArchive.addEventListener('click', () => promptArchiveQuestion(q));
          tdActions.appendChild(btnArchive);
        }

        tr.appendChild(tdPrompt);
        tr.appendChild(tdCat);
        tr.appendChild(tdTopic);
        tr.appendChild(tdPoints);
        tr.appendChild(tdVersion);
        tr.appendChild(tdStatus);
        tr.appendChild(tdActions);

        tbodyEl.appendChild(tr);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Card Category Rules & Dynamic Behaviors
  // ---------------------------------------------------------------------------
  const CATEGORY_RULES = {
    question: {
      label: 'Tanong (Question Card)',
      allowedTypes: ['multiple_choice'],
      defaultType: 'multiple_choice',
      defaultPoints: 1,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang teksto ng katanungan...',
      bannerText: 'Tanong Card: Maramihang Pagpipilian (Multiple Choice) lamang. Pamantayang 1 punto sa tamang sagot.',
      themeClass: 'cat-question'
    },
    statement: {
      label: 'Pahayag (Statement Card)',
      allowedTypes: ['identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'identification',
      defaultPoints: 1,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang pahayag o sitwasyon...',
      bannerText: 'Pahayag Card: Isinusulat na sagot (Written / Identification). Sinusuri gamit ang inaasahang sagot at mga katumbas.',
      themeClass: 'cat-statement'
    },
    correction: {
      label: 'Pagwawasto (Correction Card)',
      allowedTypes: ['identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'identification',
      defaultPoints: 1,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Iwasto ang pahayag: ...',
      bannerText: 'Pagwawasto Card: Isinusulat na pagwawasto. Dapat may malinaw na batayang sagot at semantikong rubric.',
      themeClass: 'cat-correction'
    },
    bonus: {
      label: 'Bonus Card',
      allowedTypes: ['multiple_choice', 'identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'multiple_choice',
      defaultPoints: 2,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang bonus na tanong...',
      bannerText: 'Bonus Card: Nagbibigay ng 2 puntos bilang gantimpala. Maaaring Maramihang Pagpipilian o Isinusulat na sagot.',
      themeClass: 'cat-bonus',
      pointsNote: 'Karaniwang 2 puntos ang iginagawad para sa Bonus Card.'
    },
    reverse: {
      label: 'Baligtaran (Reverse Card)',
      allowedTypes: ['multiple_choice', 'identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'identification',
      defaultPoints: 0,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang tanong o kasanayang susuriin sa Baligtaran...',
      bannerText: 'Baligtaran Card: 0 puntos sa karaniwang deck (review card). Sa Reverse Round, awtomatikong 1 punto ang igagawad ng server.',
      themeClass: 'cat-reverse',
      pointsNote: '0 puntos sa regular na laro (review card). May 1-point override ang server sa Reverse Round.'
    },
    help: {
      label: 'Gabay (Help / Tulong Card)',
      allowedTypes: ['multiple_choice', 'identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'multiple_choice',
      defaultPoints: 1,
      isTimed: false,
      requireHint: true,
      promptPlaceholder: 'Ilagay ang gabay na katanungan...',
      bannerText: 'Gabay Card: Kinakailangan ang pahiwatig (hint) upang matulungan ang mag-aaral.',
      themeClass: 'cat-help'
    },
    challenge: {
      label: 'Hamon (Timed Challenge Card)',
      allowedTypes: ['multiple_choice', 'identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'multiple_choice',
      defaultPoints: 1,
      isTimed: true,
      defaultTimer: 30,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang hamong katanungan...',
      bannerText: 'Hamon Card: May palugit na oras (timer, default 30s). Kailangang masagot bago maubos ang countdown.',
      themeClass: 'cat-challenge'
    },
    quiz: {
      label: 'Pagsusulit / Quiz (Walang Card Type)',
      allowedTypes: ['multiple_choice', 'identification', 'open_ended', 'true_false', 'fill_in_blank', 'situational'],
      defaultType: 'multiple_choice',
      defaultPoints: 1,
      isTimed: false,
      requireHint: false,
      promptPlaceholder: 'Ilagay ang teksto ng katanungan...',
      bannerText: 'Pagsusulit (Quiz): Karaniwang tanong na walang collectible card frame. Standard 1 punto.',
      themeClass: 'cat-quiz'
    }
  };

  // ---------------------------------------------------------------------------
  // Rubrics & Accepted Answers Helpers
  // ---------------------------------------------------------------------------
  function parseAcceptedAnswers(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(v => (v || '').trim()).filter(Boolean);
    }
    if (typeof value !== 'string') return [];
    return value
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function formatAcceptedAnswers(answers) {
    if (!Array.isArray(answers) || answers.length === 0) return '';
    return answers.join(', ');
  }

  function renderRubricGroupsEditor(containerEl, groups = []) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const safeGroups = Array.isArray(groups) ? groups : [];
    if (safeGroups.length) {
      safeGroups.forEach(group => {
        addRubricGroupRow(containerEl, group);
      });
    }
  }

  function addRubricGroupRow(containerEl, terms = []) {
    if (!containerEl) return;
    const row = document.createElement('div');
    row.className = 'rubric-group-row';

    const currentCount = containerEl.querySelectorAll('.rubric-group-row').length + 1;
    const termsString = Array.isArray(terms) ? terms.join(', ') : (typeof terms === 'string' ? terms : '');

    row.innerHTML = `
      <span class="rubric-group-badge">Pangkat ${currentCount}</span>
      <input type="text" class="form-control rubric-group-input" placeholder="Mga kasingkahulugan, ihiwalay sa kuwit (hal. tagpuan, pook)" value="${escapeHtml(termsString)}" maxlength="1000">
      <button type="button" class="btn-remove-rubric" title="Alisin ang pangkat ng konsepto">&times;</button>
    `;

    row.querySelector('.btn-remove-rubric').addEventListener('click', () => {
      row.remove();
      renumberRubricGroups(containerEl);
    });

    containerEl.appendChild(row);
  }

  function renumberRubricGroups(containerEl) {
    if (!containerEl) return;
    const rows = containerEl.querySelectorAll('.rubric-group-row');
    rows.forEach((row, i) => {
      const badge = row.querySelector('.rubric-group-badge');
      if (badge) badge.textContent = `Pangkat ${i + 1}`;
    });
  }

  function getRubricGroupsFromEditor(containerEl) {
    if (!containerEl) return [];
    const rows = containerEl.querySelectorAll('.rubric-group-row');
    const groups = [];

    rows.forEach(row => {
      const input = row.querySelector('.rubric-group-input');
      const val = (input?.value || '').trim();
      if (val) {
        const terms = val.split(/[,;\n]/).map(t => t.trim()).filter(Boolean);
        if (terms.length) {
          groups.push(terms);
        }
      }
    });

    return groups;
  }

  function applyCategoryDefaults(prefix, categoryCode, options = {}) {
    const catKey = categoryCode || 'quiz';
    const rule = CATEGORY_RULES[catKey] || CATEGORY_RULES.quiz;

    const bannerEl = document.getElementById(`${prefix}-q-category-banner`);
    const promptInput = document.getElementById(`${prefix}-q-prompt`);
    const pointsInput = document.getElementById(`${prefix}-q-points`);
    const pointsNoteEl = document.getElementById(`${prefix}-q-points-note`);
    const timeLimitInput = document.getElementById(`${prefix}-q-timelimit`);
    const hintLabel = document.getElementById(`${prefix}-q-hint-label`);
    const typeSelect = document.getElementById(`${prefix}-q-type`);

    // 1. Guidance Banner
    if (bannerEl) {
      bannerEl.className = `category-guidance-banner ${rule.themeClass}`;
      bannerEl.textContent = rule.bannerText;
      bannerEl.classList.remove('hidden');
    }

    // 2. Prompt Placeholder
    if (promptInput) {
      if (catKey === 'correction') {
        promptInput.placeholder = 'Iwasto ang pahayag: ...';
      } else {
        promptInput.placeholder = rule.promptPlaceholder;
      }
    }

    // 3. Question Type options filtering & auto-switch
    if (typeSelect) {
      const currentType = typeSelect.value;
      Array.from(typeSelect.options).forEach(opt => {
        const isAllowed = rule.allowedTypes.includes(opt.value);
        opt.disabled = !isAllowed;
        if (!isAllowed) {
          opt.style.display = 'none';
        } else {
          opt.style.display = '';
        }
      });

      if (!rule.allowedTypes.includes(currentType)) {
        typeSelect.value = rule.defaultType;
      }
      updateQuestionTypeFormViews(prefix);
    }

    // 4. Points default and note
    if (pointsInput && !options.preserveValues) {
      pointsInput.value = rule.defaultPoints;
    }
    if (pointsNoteEl) {
      pointsNoteEl.textContent = rule.pointsNote || '';
      pointsNoteEl.style.display = rule.pointsNote ? 'block' : 'none';
    }

    // 5. Timer defaults & hints
    if (timeLimitInput) {
      if (rule.isTimed) {
        timeLimitInput.required = true;
        if (!options.preserveValues) {
          timeLimitInput.value = rule.defaultTimer || 30;
        }
        timeLimitInput.placeholder = '30';
      } else {
        timeLimitInput.required = false;
        if (!options.preserveValues) {
          timeLimitInput.value = '';
        }
        timeLimitInput.placeholder = 'Walang timer';
      }
    }

    // 6. Hint requirement indicator
    if (hintLabel) {
      hintLabel.textContent = rule.requireHint
        ? 'Pahiwatig (Hint / Tulong) *'
        : 'Pahiwatig (Hint / Tulong)';
    }
  }

  function validateQuestionForm(prefix, isEdit = false) {
    const topicSelect = document.getElementById(`${prefix}-q-topic`);
    const codeInput = document.getElementById(`${prefix}-q-code`);
    const catSelect = document.getElementById(`${prefix}-q-category`);
    const typeSelect = document.getElementById(`${prefix}-q-type`);
    const promptInput = document.getElementById(`${prefix}-q-prompt`);
    const titleInput = document.getElementById(`${prefix}-q-title`);
    const tagInput = document.getElementById(`${prefix}-q-tag`);
    const pointsInput = document.getElementById(`${prefix}-q-points`);
    const timeLimitInput = document.getElementById(`${prefix}-q-timelimit`);
    const expInput = document.getElementById(`${prefix}-q-explanation`);
    const hintInput = document.getElementById(`${prefix}-q-hint`);
    const expectedInput = document.getElementById(`${prefix}-q-expected-answer`);
    const acceptedInput = document.getElementById(`${prefix}-q-accepted-answers`);
    const choicesContainer = document.getElementById(`${prefix}-q-choices-list`);
    const rubricContainer = document.getElementById(`${prefix}-q-rubric-groups-list`);

    const topicErr = document.getElementById(`${prefix}-q-topic-error`);
    const codeErr = document.getElementById(`${prefix}-q-code-error`);
    const promptErr = document.getElementById(`${prefix}-q-prompt-error`);
    const choiceErr = document.getElementById(`${prefix}-q-choice-error`);
    const expectedErr = document.getElementById(`${prefix}-q-expected-error`);
    const timeLimitErr = document.getElementById(`${prefix}-q-timelimit-error`);
    const hintErr = document.getElementById(`${prefix}-q-hint-error`);

    if (topicErr) topicErr.classList.remove('active');
    if (codeErr) codeErr.classList.remove('active');
    if (promptErr) promptErr.classList.remove('active');
    if (choiceErr) choiceErr.classList.remove('active');
    if (expectedErr) expectedErr.classList.remove('active');
    if (timeLimitErr) timeLimitErr.classList.remove('active');
    if (hintErr) hintErr.classList.remove('active');

    const topicCode = (topicSelect?.value || '').trim();
    const code = isEdit
      ? ((codeInput?.value || _activeEditingQuestion?.code || '').trim())
      : ((codeInput?.value || '').trim());
    const cardCategory = (catSelect?.value || '') || null;
    const catKey = cardCategory || 'quiz';
    const rule = CATEGORY_RULES[catKey] || CATEGORY_RULES.quiz;
    const questionType = (typeSelect?.value || rule.defaultType || 'multiple_choice').trim();
    const prompt = (promptInput?.value || '').trim();
    const title = (titleInput?.value || '').trim();
    const tag = (tagInput?.value || '').trim() || null;
    const pointsRaw = pointsInput?.value !== undefined && pointsInput?.value !== ''
      ? parseInt(pointsInput.value, 10)
      : rule.defaultPoints;
    const points = Number.isInteger(pointsRaw) && pointsRaw >= 0 && pointsRaw <= 100
      ? pointsRaw
      : rule.defaultPoints;
    const explanation = (expInput?.value || '').trim();
    const hint = (hintInput?.value || '').trim() || null;

    let hasError = false;

    // Validate Topic (only required for create)
    if (!isEdit && !topicCode) {
      if (topicErr) topicErr.classList.add('active');
      hasError = true;
    }

    // Validate Code
    if (!code || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(code)) {
      if (codeErr) codeErr.classList.add('active');
      hasError = true;
    }

    // Validate Prompt
    if (!prompt) {
      if (promptErr) promptErr.classList.add('active');
      hasError = true;
    }

    // Validate Category-specific Hint requirement
    if (rule.requireHint && !hint) {
      if (hintErr) hintErr.classList.add('active');
      hasError = true;
    }

    // Validate Category-specific Timer requirement
    let timeLimitSeconds = null;
    if (rule.isTimed) {
      const parsedTimer = timeLimitInput?.value ? parseInt(timeLimitInput.value, 10) : null;
      if (!parsedTimer || parsedTimer < 1 || parsedTimer > 3600) {
        if (timeLimitErr) timeLimitErr.classList.add('active');
        hasError = true;
      } else {
        timeLimitSeconds = parsedTimer;
      }
    } else {
      timeLimitSeconds = null; // Untimed categories must submit null
    }

    let choices = [];
    let answerKey = null;
    let expectedAnswer = null;
    let acceptedAnswers = [];
    let rubricGroups = [];

    if (questionType === 'multiple_choice') {
      const extracted = getChoicesFromEditor(choicesContainer);
      choices = extracted.choices;
      answerKey = extracted.answerKey;
      if (choices.length < 2 || !answerKey) {
        if (choiceErr) choiceErr.classList.add('active');
        hasError = true;
      }
    } else {
      expectedAnswer = (expectedInput?.value || '').trim();
      if (!expectedAnswer) {
        if (expectedErr) expectedErr.classList.add('active');
        hasError = true;
      }
      acceptedAnswers = parseAcceptedAnswers(acceptedInput?.value);
      rubricGroups = getRubricGroupsFromEditor(rubricContainer);
      if (expectedAnswer) {
        answerKey = expectedAnswer.length <= 250 ? expectedAnswer : expectedAnswer.slice(0, 250);
      }
    }

    if (hasError) {
      return { isValid: false, payload: null, topicCode };
    }

    const payload = {
      code,
      questionType,
      cardCategory,
      title,
      tag,
      prompt,
      points,
      timeLimitSeconds,
      explanation,
      hint,
      choices,
      answerKey,
      expectedAnswer,
      acceptedAnswers,
      rubricGroups
    };

    return { isValid: true, payload, topicCode };
  }

  // ---------------------------------------------------------------------------
  // Choices Editor Helpers (For Multiple Choice Questions)
  // ---------------------------------------------------------------------------
  function addChoiceRow(containerEl, defaultKey = '', defaultText = '', isCorrect = false) {
    if (!containerEl) return;

    const row = document.createElement('div');
    row.className = 'choice-item-row';

    const radioName = `${containerEl.id}-correct`;
    const rowCount = containerEl.querySelectorAll('.choice-item-row').length;
    const letterKey = defaultKey || String.fromCharCode(65 + rowCount); // A, B, C, D...

    row.innerHTML = `
      <input type="radio" name="${radioName}" value="${letterKey}" class="choice-correct-radio" title="Markahan bilang Tamang Sagot" ${isCorrect ? 'checked' : ''}>
      <span class="choice-key-label">${letterKey}.</span>
      <input type="text" class="form-control choice-text-input" style="flex: 1;" placeholder="Pagpipilian..." value="${escapeHtml(defaultText)}" maxlength="1000">
      <button type="button" class="btn-remove-choice" title="Alisin ang pagpipilian">&times;</button>
    `;

    row.querySelector('.btn-remove-choice').addEventListener('click', () => {
      row.remove();
      renumberChoices(containerEl);
    });

    containerEl.appendChild(row);
  }

  function renumberChoices(containerEl) {
    const rows = containerEl.querySelectorAll('.choice-item-row');
    rows.forEach((row, i) => {
      const letter = String.fromCharCode(65 + i);
      const label = row.querySelector('.choice-key-label');
      const radio = row.querySelector('.choice-correct-radio');
      if (label) label.textContent = `${letter}.`;
      if (radio) radio.value = letter;
    });
  }

  function initDefaultChoices(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    addChoiceRow(containerEl, 'A', '', true);
    addChoiceRow(containerEl, 'B', '', false);
    addChoiceRow(containerEl, 'C', '', false);
    addChoiceRow(containerEl, 'D', '', false);
  }

  function getChoicesFromEditor(containerEl) {
    if (!containerEl) return { choices: [], answerKey: null };
    const rows = containerEl.querySelectorAll('.choice-item-row');
    const choices = [];
    let answerKey = null;

    rows.forEach((row, index) => {
      const radio = row.querySelector('.choice-correct-radio');
      const textInput = row.querySelector('.choice-text-input');
      const key = String.fromCharCode(65 + index);
      const text = (textInput?.value || '').trim();

      if (text) {
        choices.push({ key, text, sortOrder: index });
        if (radio?.checked) {
          answerKey = key;
        }
      }
    });

    return { choices, answerKey };
  }

  // ---------------------------------------------------------------------------
  // Question Modals: Create, Edit, Preview
  // ---------------------------------------------------------------------------

  function openCreateQuestionModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-create-question');
    const form = document.getElementById('form-create-question');
    const alert = document.getElementById('create-question-alert');
    const choicesContainer = document.getElementById('create-q-choices-list');
    const rubricContainer = document.getElementById('create-q-rubric-groups-list');
    const acceptedInput = document.getElementById('create-q-accepted-answers');
    const tagInput = document.getElementById('create-q-tag');

    if (form) form.reset();
    if (alert) alert.style.display = 'none';

    // Clear error texts
    document.querySelectorAll('#modal-create-question .input-error-text').forEach(el => el.classList.remove('active'));

    // Populate choices by default
    initDefaultChoices(choicesContainer);

    // Clear rubric & accepted answers & tag
    if (rubricContainer) rubricContainer.innerHTML = '';
    if (acceptedInput) acceptedInput.value = '';
    if (tagInput) tagInput.value = '';

    // Apply category defaults for initial state
    const catSelect = document.getElementById('create-q-category');
    const initialCategory = (_questionCategoryFilter && _questionCategoryFilter !== 'all' && _questionCategoryFilter !== 'quiz')
      ? _questionCategoryFilter
      : (catSelect?.value || '');
    if (catSelect) catSelect.value = initialCategory;
    applyCategoryDefaults('create', initialCategory);

    // Pre-select topic if filtered by one
    const topicSelect = document.getElementById('create-q-topic');
    if (topicSelect && _questionTopicFilter !== 'all') {
      topicSelect.value = _questionTopicFilter;
    }

    if (modal) modal.classList.add('active');
  }

  function closeCreateQuestionModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-create-question');
    if (modal) modal.classList.remove('active');
  }

  async function openEditQuestionModal(questionCode) {
    if (typeof document === 'undefined') return;
    const api = getApi();
    if (!api) return;

    try {
      const detail = await api.getQuestionDetail(questionCode);
      if (!detail) {
        showToast(`Hindi nahanap ang tanong na '${questionCode}'.`, 'error');
        return;
      }

      _activeEditingQuestion = detail;

      const modal = document.getElementById('modal-edit-question');
      const alert = document.getElementById('edit-question-alert');
      const codeInput = document.getElementById('edit-q-code');
      const codeBadge = document.getElementById('edit-q-code-badge');
      const typeBadge = document.getElementById('edit-q-type-badge');
      const catBadge = document.getElementById('edit-q-category-badge');
      const catSelect = document.getElementById('edit-q-category');
      const typeSelect = document.getElementById('edit-q-type');
      const nextVersionText = document.getElementById('edit-q-next-version-text');

      const promptInput = document.getElementById('edit-q-prompt');
      const titleInput = document.getElementById('edit-q-title');
      const tagInput = document.getElementById('edit-q-tag');
      const pointsInput = document.getElementById('edit-q-points');
      const timeLimitInput = document.getElementById('edit-q-timelimit');
      const expInput = document.getElementById('edit-q-explanation');
      const hintInput = document.getElementById('edit-q-hint');
      const expectedInput = document.getElementById('edit-q-expected-answer');
      const acceptedInput = document.getElementById('edit-q-accepted-answers');
      const choicesContainer = document.getElementById('edit-q-choices-list');
      const rubricContainer = document.getElementById('edit-q-rubric-groups-list');

      if (alert) alert.style.display = 'none';
      document.querySelectorAll('#modal-edit-question .input-error-text').forEach(el => el.classList.remove('active'));

      if (codeInput) codeInput.value = detail.code;
      if (codeBadge) codeBadge.textContent = detail.code;
      if (typeBadge) typeBadge.textContent = QUESTION_TYPE_LABELS[detail.questionType] || detail.questionType;

      const catKey = detail.cardCategory || 'quiz';
      if (catBadge) {
        catBadge.textContent = CARD_CATEGORY_LABELS[catKey] || catKey;
        catBadge.className = `badge-category ${catKey}`;
      }

      if (catSelect) {
        catSelect.value = detail.cardCategory || '';
      }

      // Apply category rules preserving existing values
      applyCategoryDefaults('edit', detail.cardCategory, { preserveValues: true });

      if (typeSelect) {
        typeSelect.value = detail.questionType || 'multiple_choice';
      }
      updateQuestionTypeFormViews('edit');

      if (nextVersionText) {
        const nextNum = (detail.latestVersionNumber || detail.currentVersion || 1) + 1;
        nextVersionText.textContent = `Bersyon ${nextNum}`;
      }

      const version = detail.version || {};
      if (promptInput) promptInput.value = version.prompt || '';
      if (titleInput) titleInput.value = version.title || '';
      if (tagInput) tagInput.value = version.tag || '';
      if (pointsInput) pointsInput.value = version.points ?? (CATEGORY_RULES[catKey]?.defaultPoints ?? 1);
      if (timeLimitInput) timeLimitInput.value = version.timeLimitSeconds || '';
      if (expInput) expInput.value = version.explanation || '';
      if (hintInput) hintInput.value = version.hint || '';

      const isMultipleChoice = detail.questionType === 'multiple_choice';

      if (isMultipleChoice) {
        if (choicesContainer) {
          choicesContainer.innerHTML = '';
          const existingChoices = Array.isArray(version.choices) ? version.choices : [];
          const answerKey = detail.rubric?.answerKey || null;
          if (existingChoices.length) {
            existingChoices.forEach(c => {
              addChoiceRow(choicesContainer, c.key, c.text, c.key === answerKey);
            });
          } else {
            initDefaultChoices(choicesContainer);
          }
        }
      } else {
        if (expectedInput) {
          expectedInput.value = detail.rubric?.expectedAnswer || detail.rubric?.answerKey || '';
        }
        if (acceptedInput) {
          acceptedInput.value = formatAcceptedAnswers(detail.rubric?.acceptedAnswers || []);
        }
        if (rubricContainer) {
          renderRubricGroupsEditor(rubricContainer, detail.rubric?.rubricGroups || []);
        }
      }

      if (modal) modal.classList.add('active');
    } catch (err) {
      showToast(`Hindi maikarga ang detalye ng tanong: ${err.message}`, 'error');
    }
  }

  function closeEditQuestionModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-edit-question');
    if (modal) modal.classList.remove('active');
    _activeEditingQuestion = null;
  }

  async function openPreviewQuestionModal(questionCode, options = {}) {
    if (typeof document === 'undefined') return;
    const api = getApi();
    if (!api) return;

    try {
      const detail = await api.getQuestionDetail(questionCode, options);
      if (!detail) return;

      const modal = document.getElementById('modal-preview-question');
      const renderEl = document.getElementById('preview-card-render');
      const switcher = document.getElementById('preview-version-switcher');
      const btnPublished = document.getElementById('btn-preview-published');
      const btnDraft = document.getElementById('btn-preview-draft');
      const badgeStatus = document.getElementById('preview-badge-status');
      const versionLabel = document.getElementById('preview-version-label');
      const btnPublishAction = document.getElementById('btn-preview-publish-action');
      if (!modal || !renderEl) return;

      const version = detail.version || {};
      const catKey = detail.cardCategory || 'quiz';
      const catLabel = CARD_CATEGORY_LABELS[catKey] || 'PanitiKard';
      const points = version.points ?? 1;
      const choices = Array.isArray(version.choices) ? version.choices : [];
      const answerKey = detail.rubric?.answerKey || null;

      // Handle version switcher
      if (detail.hasDraftRevision) {
        if (switcher) switcher.classList.remove('hidden');
        const isDraftView = Boolean(detail.isDraftPreview);

        if (btnPublished) {
          btnPublished.classList.toggle('active', !isDraftView);
          btnPublished.onclick = () => openPreviewQuestionModal(questionCode, { version: detail.currentVersion });
        }
        if (btnDraft) {
          btnDraft.classList.toggle('active', isDraftView);
          btnDraft.onclick = () => openPreviewQuestionModal(questionCode, { previewDraft: true });
        }
        if (badgeStatus) {
          badgeStatus.className = `status-badge ${isDraftView ? 'draft' : 'published'}`;
          badgeStatus.textContent = isDraftView ? 'Borador' : 'Inilathala';
        }
        if (versionLabel) {
          versionLabel.textContent = isDraftView
            ? `Bersyon ${detail.selectedVersionNumber || detail.draftVersionNumber} (Borador)`
            : `Bersyon ${detail.currentVersion} (Aktibo sa Laro)`;
        }
        if (btnPublishAction) {
          if (isDraftView) {
            btnPublishAction.classList.remove('hidden');
            btnPublishAction.onclick = () => {
              closePreviewQuestionModal();
              promptPublishQuestion(questionCode, detail.draftVersionNumber);
            };
          } else {
            btnPublishAction.classList.add('hidden');
          }
        }
      } else {
        if (switcher) switcher.classList.add('hidden');
        if (btnPublishAction) {
          if (detail.status === 'draft') {
            btnPublishAction.classList.remove('hidden');
            btnPublishAction.onclick = () => {
              closePreviewQuestionModal();
              promptPublishQuestion(questionCode, detail.currentVersion || 1);
            };
          } else {
            btnPublishAction.classList.add('hidden');
          }
        }
      }

      let choicesHtml = '';
      if (choices.length) {
        choicesHtml = `
          <ul class="preview-choices-list">
            ${choices.map(c => `
              <li class="preview-choice-item ${c.key === answerKey ? 'correct' : ''}">
                <strong style="width: 20px;">${c.key}.</strong>
                <span>${escapeHtml(c.text)}</span>
                ${c.key === answerKey ? '<span style="margin-left: auto; font-size: 0.75rem;">(Tamang Sagot)</span>' : ''}
              </li>
            `).join('')}
          </ul>
        `;
      }

      const verDisplay = detail.selectedVersionNumber || version.versionNumber || detail.currentVersion || 1;
      const verNotice = detail.isDraftPreview ? ' (Borador)' : '';

      renderEl.innerHTML = `
        <div class="preview-card-header">
          <span class="preview-card-title">${escapeHtml(version.title || catLabel)}</span>
          <span class="preview-card-points">${points} ${points === 1 ? 'Punto' : 'Puntos'}</span>
        </div>
        <div class="preview-card-body">
          <div class="preview-card-prompt">${escapeHtml(version.prompt || '')}</div>
          ${choicesHtml}
          ${version.hint ? `<div style="margin-top: 0.75rem; font-size: 0.8rem; color: #0284c7; background: #f0f9ff; padding: 0.5rem 0.75rem; border-radius: 6px;"><strong>💡 Pahiwatig:</strong> ${escapeHtml(version.hint)}</div>` : ''}
          ${version.explanation ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569; background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 6px;"><strong>📖 Paliwanag:</strong> ${escapeHtml(version.explanation)}</div>` : ''}
        </div>
        <div class="preview-card-footer">
          <span>Code: <code>${escapeHtml(detail.code)}</code></span>
          <span>Bersyon: v${verDisplay}${verNotice}</span>
          <span>Paksa: ${escapeHtml(detail.topicTitle || detail.topicCode)}</span>
        </div>
      `;

      modal.classList.add('active');
    } catch (err) {
      showToast(`Hindi ma-preview ang tanong: ${err.message}`, 'error');
    }
  }

  function closePreviewQuestionModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-preview-question');
    if (modal) modal.classList.remove('active');
  }

  function promptPublishQuestion(questionCode, versionNumber) {
    const question = _questions.find(q => q && q.code === questionCode);
    const parentTopic = question && question.topicCode
      ? _topics.find(t => t && t.code === question.topicCode)
      : null;
    if (parentTopic && (parentTopic.status !== 'published' || Boolean(parentTopic.archived_at))) {
      showToast(
        `Kailangan munang i-publish ang paksang "${parentTopic.title || parentTopic.code}" bago ma-publish ang tanong na "${questionCode}".`,
        'error'
      );
      return false;
    }

    const verLabel = versionNumber ? ` (Bersyon ${versionNumber})` : '';
    openConfirmModal({
      title: 'I-publish ang Tanong',
      message: `Sigurado ka bang nais mong i-publish ang tanong na "${questionCode}"${verLabel}? Magiging aktibo agad ito para sa mga mag-aaral.`,
      confirmText: 'I-publish',
      confirmClass: 'btn-primary',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.publishQuestion(questionCode, versionNumber ? { versionNumber } : {});
          showToast(`Matagumpay na nailathala ang tanong na "${questionCode}".`, 'success');
          loadQuestions();
        } catch (err) {
          showToast(`Nabigong i-publish ang tanong: ${err.message}`, 'error');
        }
      }
    });
    return true;
  }

  function promptUnpublishQuestion(questionCode) {
    openConfirmModal({
      title: 'I-unpublish ang Tanong',
      message: `Sigurado ka bang nais mong gawing borador ang tanong na "${questionCode}"? Itatago ito mula sa mga mag-aaral.`,
      confirmText: 'I-unpublish',
      confirmClass: 'btn-action unpublish',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.unpublishQuestion(questionCode);
          showToast(`Matagumpay na ginawang borador ang tanong na "${questionCode}".`, 'success');
          loadQuestions();
        } catch (err) {
          showToast(`Nabigong i-unpublish ang tanong: ${err.message}`, 'error');
        }
      }
    });
  }

  function updateQuestionTypeFormViews(prefix = 'create') {
    const typeSelect = document.getElementById(`${prefix}-q-type`);
    const choicesSection = document.getElementById(`${prefix}-q-choices-section`);
    const expectedSection = document.getElementById(`${prefix}-q-expected-section`);

    if (!typeSelect || !choicesSection || !expectedSection) return;

    const isMultipleChoice = typeSelect.value === 'multiple_choice';
    choicesSection.classList.toggle('hidden', !isMultipleChoice);
    expectedSection.classList.toggle('hidden', isMultipleChoice);
  }

  function promptArchiveQuestion(question) {
    openConfirmModal({
      title: 'I-archive ang Tanong',
      message: `Sigurado ka bang nais mong i-archive ang tanong na "${question.code}"? Hindi na ito isasama sa mga bagong sesyon ng laro.`,
      confirmText: 'I-archive',
      confirmClass: 'btn-logout',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.archiveQuestion(question.code);
          showToast(`Nai-archive na ang tanong na "${question.code}".`, 'success');
          loadQuestions();
        } catch (err) {
          showToast(`Nabigong i-archive: ${err.message}`, 'error');
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Topic Modals & Action Flows (Phase 6.4)
  // ---------------------------------------------------------------------------

  function openCreateTopicModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-create-topic');
    const form = document.getElementById('form-create-topic');
    const alert = document.getElementById('create-topic-alert');
    const codeErr = document.getElementById('create-code-error');
    const titleErr = document.getElementById('create-title-error');

    if (form) form.reset();
    if (alert) alert.style.display = 'none';
    if (codeErr) codeErr.classList.remove('active');
    if (titleErr) titleErr.classList.remove('active');
    if (modal) modal.classList.add('active');

    const codeInput = document.getElementById('create-topic-code');
    if (codeInput) setTimeout(() => codeInput.focus(), 100);
  }

  function closeCreateTopicModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-create-topic');
    if (modal) modal.classList.remove('active');
  }

  function openEditTopicModal(code) {
    if (typeof document === 'undefined') return;
    const topic = _topics.find(t => t.code === code);
    if (!topic) {
      showToast(`Hindi nahanap ang paksang '${code}'.`, 'error');
      return;
    }

    const modal = document.getElementById('modal-edit-topic');
    const alert = document.getElementById('edit-topic-alert');
    const codeInput = document.getElementById('edit-topic-code');
    const codeBadge = document.getElementById('edit-topic-code-badge');
    const titleInput = document.getElementById('edit-topic-title');
    const compInput = document.getElementById('edit-topic-competency');
    const descInput = document.getElementById('edit-topic-description');
    const titleErr = document.getElementById('edit-title-error');

    if (alert) alert.style.display = 'none';
    if (titleErr) titleErr.classList.remove('active');

    if (codeInput) codeInput.value = topic.code;
    if (codeBadge) codeBadge.textContent = topic.code;
    if (titleInput) titleInput.value = topic.title || '';
    if (compInput) compInput.value = topic.competency || '';
    if (descInput) descInput.value = topic.description || '';

    if (modal) modal.classList.add('active');
    if (titleInput) setTimeout(() => titleInput.focus(), 100);
  }

  function closeEditTopicModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-edit-topic');
    if (modal) modal.classList.remove('active');
  }

  function openConfirmModal({ title, message, confirmText = 'Ituloy', confirmClass = 'btn-primary', onConfirm }) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-confirm-action');
    const titleEl = document.getElementById('confirm-action-title');
    const msgEl = document.getElementById('confirm-action-message');
    const btnEl = document.getElementById('btn-execute-confirm');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnEl) {
      btnEl.textContent = confirmText;
      btnEl.className = confirmClass;
    }

    _pendingConfirmCallback = onConfirm;
    if (modal) modal.classList.add('active');
  }

  function closeConfirmModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-confirm-action');
    if (modal) modal.classList.remove('active');
    _pendingConfirmCallback = null;
  }

  function promptPublishTopic(topic) {
    openConfirmModal({
      title: 'Ilathala ang Paksa',
      message: `Sigurado ka bang nais mong ilathala ang paksang "${topic.title}" (${topic.code})? Kapag inilathala, magiging aktibo at makikita na ito ng mga mag-aaral sa laro.`,
      confirmText: 'Ilathala Ngayon',
      confirmClass: 'btn-primary',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.publishTopic(topic.code);
          showToast(`Nailathala na ang paksang "${topic.title}".`, 'success');
          loadTopics();
        } catch (err) {
          showToast(`Nabigong ilathala: ${err.message}`, 'error');
        }
      }
    });
  }

  function promptUnpublishTopic(topic, isRestoring = false) {
    openConfirmModal({
      title: isRestoring ? 'Ibalik ang Paksa bilang Borador' : 'I-unpublish ang Paksa',
      message: isRestoring
        ? `Nais mo bang ibalik ang paksang "${topic.title}" (${topic.code}) mula sa archive patungong borador?`
        : `Sigurado ka bang nais mong gawing borador ang paksang "${topic.title}" (${topic.code})? Hindi na ito makikita ng mga mag-aaral sa laro hangga't hindi muling inilalathala.`,
      confirmText: isRestoring ? 'Ibalik sa Borador' : 'Gawing Borador',
      confirmClass: 'btn-outline',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.unpublishTopic(topic.code);
          showToast(isRestoring ? `Naibalik na sa borador ang "${topic.title}".` : `Ginawa nang borador ang "${topic.title}".`, 'success');
          loadTopics();
        } catch (err) {
          showToast(`Nabigong i-update: ${err.message}`, 'error');
        }
      }
    });
  }

  function promptArchiveTopic(topic) {
    openConfirmModal({
      title: 'I-archive ang Paksa',
      message: `Sigurado ka bang nais mong i-archive ang paksang "${topic.title}" (${topic.code})? Maitatago ito mula sa aktibong listahan at hindi magagamit sa laro.`,
      confirmText: 'I-archive',
      confirmClass: 'btn-logout',
      onConfirm: async () => {
        const api = getApi();
        try {
          await api.archiveTopic(topic.code);
          showToast(`Nai-archive na ang paksang "${topic.title}".`, 'success');
          loadTopics();
        } catch (err) {
          showToast(`Nabigong i-archive: ${err.message}`, 'error');
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Initialization
  // ---------------------------------------------------------------------------
  async function init() {
    const auth = getAuth();
    if (!auth) {
      showAuthScreen('Hindi matagpuan ang dashboard authentication module.');
      return false;
    }

    try {
      const profile = await auth.init();
      const path = (typeof window !== 'undefined' && window.location) ? (window.location.pathname || '').toLowerCase() : '';
      const isAdminRoute = path === '/admin' || path.startsWith('/admin/');

      if (profile) {
        if (isAdminRoute && profile.role !== 'admin') {
          await auth.signOut(true);
          showAuthScreen('Kailangan ng Administrator (Admin) account upang ma-access ang /admin portal. Para sa guro, mangyaring mag-log in sa /teacher.');
          return false;
        }
        if (['teacher', 'admin'].includes(profile.role)) {
          showDashboardApp(profile);
          return true;
        }
      }
      showAuthScreen();
      return false;
    } catch (err) {
      console.error('[Dashboard] Initialization error:', err);
      showAuthScreen('Nagkaroon ng problema sa pag-verify ng sesyon. Pakisubukang muli.');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Rubric Management (Phase 6.6)
  // ---------------------------------------------------------------------------

  /**
   * Populates the topic filter dropdown inside the Rubrics view.
   * Reuses _topics if already loaded; falls back to loading them.
   */
  async function loadRubricTopicsDropdown() {
    if (typeof document === 'undefined') return;
    const sel = document.getElementById('rubric-topic-filter');
    if (!sel) return;
    const api = getApi();
    if (!api) return;

    // Reuse already-fetched topics when available
    let topics = _topics;
    if (!topics.length) {
      try { topics = await api.getTopics(); } catch { topics = []; }
    }

    const currentVal = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    topics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.code;
      opt.textContent = t.title || t.code;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }

  /**
   * Fetches rubric summaries from the backend and renders them.
   */
  async function loadRubrics() {
    if (typeof document === 'undefined') return;
    const loadingEl = document.getElementById('rubrics-loading');
    const tbody = document.getElementById('rubrics-tbody');
    const tableEl = document.getElementById('rubrics-table');
    const emptyEl = document.getElementById('rubrics-empty');
    const api = getApi();

    if (!api) return;

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.style.display = 'none';
    if (tbody) tbody.innerHTML = '';

    try {
      const topicCode = _rubricTopicFilter !== 'all' ? _rubricTopicFilter : undefined;
      const data = await api.getRubrics(topicCode ? { topicCode } : {});
      _rubrics = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[Dashboard] Failed to load rubrics:', err);
      _rubrics = [];
      showToast('Hindi ma-load ang mga rubric. Subukang i-refresh.', 'error');
    } finally {
      if (loadingEl) loadingEl.classList.add('hidden');
    }

    renderRubrics();
  }

  /**
   * Applies client-side filters to _rubrics and renders the table.
   */
  function renderRubrics() {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById('rubrics-tbody');
    const tableEl = document.getElementById('rubrics-table');
    const emptyEl = document.getElementById('rubrics-empty');
    if (!tbody) return;

    const filtered = filterRubrics(_rubrics, _rubricTopicFilter, _rubricStatusFilter, _rubricSearch);
    tbody.innerHTML = '';

    if (!filtered.length) {
      if (tableEl) tableEl.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (tableEl) tableEl.style.display = '';
    if (emptyEl) emptyEl.classList.add('hidden');

    filtered.forEach(rubric => {
      const tr = document.createElement('tr');
      const categoryLabel = rubric.cardCategory
        ? (CARD_CATEGORY_LABELS[rubric.cardCategory] || rubric.cardCategory)
        : 'Pagsusulit (Quiz)';
      const typeLabel = QUESTION_TYPE_LABELS[rubric.questionType] || rubric.questionType;
      const groupCount = rubric.rubric?.rubricGroups?.length ?? 0;
      const hasRubric = rubric.hasRubric;
      const isArchived = rubric.questionArchived;

      const promptPreview = rubric.prompt
        ? (rubric.prompt.length > 70 ? rubric.prompt.slice(0, 70) + '…' : rubric.prompt)
        : '--';

      tr.innerHTML = `
        <td>
          <div>
            <span class="topic-code-badge">${escapeHtml(rubric.questionCode || '--')}</span>
            ${isArchived ? '<span class="badge-rubric-missing" style="margin-left:0.3rem;">Naka-archive</span>' : ''}
          </div>
          <div style="font-size:0.8rem; color:var(--dash-text-muted); margin-top:0.25rem; line-height:1.3;">${escapeHtml(promptPreview)}</div>
        </td>
        <td>
          <div style="font-size:0.85rem;">${escapeHtml(rubric.topicTitle || rubric.topicCode || '--')}</div>
          ${rubric.topicCode ? `<div style="font-size:0.72rem; color:var(--dash-text-muted);">${escapeHtml(rubric.topicCode)}</div>` : ''}
        </td>
        <td>
          <div class="badge-type">${escapeHtml(typeLabel)}</div>
          <div style="font-size:0.75rem; color:var(--dash-text-muted); margin-top:0.2rem;">${escapeHtml(categoryLabel)}</div>
        </td>
        <td style="text-align:center;">
          <span style="font-size:0.85rem; font-weight:600;">v${rubric.versionNumber}</span>
        </td>
        <td>
          ${hasRubric
            ? '<span class="badge-rubric-ok">May Rubric</span>'
            : '<span class="badge-rubric-missing">Walang Rubric</span>'}
        </td>
        <td style="text-align:center;">
          <span class="badge-group-count">${groupCount}</span>
        </td>
        <td>
          <div class="topic-actions">
            <button type="button" class="btn-action btn-view" data-rubric-code="${escapeHtml(rubric.questionCode || '')}">
              Tingnan
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-view')?.addEventListener('click', () => {
        openRubricPreviewModal(rubric);
      });

      tbody.appendChild(tr);
    });
  }

  function setRubricTopicFilter(topicCode) {
    _rubricTopicFilter = topicCode || 'all';
    loadRubrics();
  }

  function setRubricStatusFilter(status) {
    _rubricStatusFilter = status || 'all';
    renderRubrics();
  }

  function setRubricSearch(query) {
    _rubricSearch = (query || '').trim().toLowerCase();
    renderRubrics();
  }

  /**
   * Client-side filter for rubric list.
   */
  function filterRubrics(list, topicFilter, statusFilter, search) {
    return list.filter(r => {
      // Topic filter (server-side filters by topic; client filter handles 'all')
      if (topicFilter && topicFilter !== 'all' && r.topicCode !== topicFilter) return false;

      // Status filter
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'with_rubric' && !r.hasRubric) return false;
        if (statusFilter === 'missing_rubric' && r.hasRubric) return false;
        if (statusFilter === 'active' && r.questionArchived) return false;
        if (statusFilter === 'archived' && !r.questionArchived) return false;
      }

      // Search
      if (search) {
        const s = search.toLowerCase();
        const matchCode = (r.questionCode || '').toLowerCase().includes(s);
        const matchPrompt = (r.prompt || '').toLowerCase().includes(s);
        const matchTopic = (r.topicTitle || r.topicCode || '').toLowerCase().includes(s);
        if (!matchCode && !matchPrompt && !matchTopic) return false;
      }

      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Rubric Preview Modal
  // ---------------------------------------------------------------------------
  function openRubricPreviewModal(rubric) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-preview-rubric');
    if (!modal) return;

    // Header badges
    const codeEl = document.getElementById('preview-rubric-code-badge');
    const typeBadgeEl = document.getElementById('preview-rubric-type-badge');
    const versionLabelEl = document.getElementById('preview-rubric-version-label');
    const promptEl = document.getElementById('preview-rubric-prompt');
    const metaEl = document.getElementById('preview-rubric-meta');

    if (codeEl) codeEl.textContent = rubric.questionCode || '--';
    if (typeBadgeEl) {
      typeBadgeEl.textContent = QUESTION_TYPE_LABELS[rubric.questionType] || rubric.questionType || '--';
    }
    if (versionLabelEl) versionLabelEl.textContent = `Version ${rubric.versionNumber}`;
    if (promptEl) promptEl.textContent = rubric.prompt || '--';
    if (metaEl) {
      metaEl.textContent = rubric.rubric?.createdAt
        ? `Nilikhang: ${formatDate(rubric.rubric.createdAt)}`
        : '';
    }

    // "Go to Question" button
    const goBtn = document.getElementById('btn-rubric-go-to-question');
    if (goBtn) {
      goBtn.onclick = () => {
        closeRubricPreviewModal();
        switchView('questions');
      };
    }

    // Rubric body
    const missingEl = document.getElementById('preview-rubric-missing');
    const expectedSection = document.getElementById('preview-rubric-expected-section');
    const acceptedSection = document.getElementById('preview-rubric-accepted-section');
    const groupsSection = document.getElementById('preview-rubric-groups-section');

    if (!rubric.hasRubric || !rubric.rubric) {
      if (missingEl) missingEl.classList.remove('hidden');
      if (expectedSection) expectedSection.classList.add('hidden');
      if (acceptedSection) acceptedSection.classList.add('hidden');
      if (groupsSection) groupsSection.classList.add('hidden');
    } else {
      if (missingEl) missingEl.classList.add('hidden');

      // Expected answer
      const expectedEl = document.getElementById('preview-rubric-expected');
      const hasExpected = rubric.rubric.expectedAnswer || rubric.rubric.answerKey;
      if (expectedSection) expectedSection.classList.toggle('hidden', !hasExpected);
      if (expectedEl) {
        expectedEl.textContent = rubric.rubric.expectedAnswer || rubric.rubric.answerKey || '--';
      }

      // Accepted alternatives
      const acceptedList = document.getElementById('preview-rubric-accepted-list');
      const accepted = rubric.rubric.acceptedAnswers || [];
      if (acceptedSection) acceptedSection.classList.toggle('hidden', !accepted.length);
      if (acceptedList) {
        acceptedList.innerHTML = accepted.map(a =>
          `<span class="rubric-preview-accepted-tag">${escapeHtml(a)}</span>`
        ).join('');
      }

      // Rubric groups
      const groupsList = document.getElementById('preview-rubric-groups-list');
      const groups = rubric.rubric.rubricGroups || [];
      if (groupsSection) groupsSection.classList.toggle('hidden', !groups.length);
      if (groupsList) {
        groupsList.innerHTML = groups.map((group, idx) => {
          const terms = Array.isArray(group) ? group : [String(group)];
          const termsHtml = terms.map((t, ti) => {
            const isLast = ti === terms.length - 1;
            return `<span class="rubric-group-term">${escapeHtml(t)}</span>${!isLast ? '<span class="rubric-group-separator">o</span>' : ''}`;
          }).join('');
          return `<div class="rubric-group-row">
            <div class="rubric-group-number">${idx + 1}</div>
            <div class="rubric-group-terms">${termsHtml}</div>
          </div>`;
        }).join('');
      }
    }

    modal.classList.add('active');
  }

  function closeRubricPreviewModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-preview-rubric');
    if (modal) modal.classList.remove('active');
  }

  // ---------------------------------------------------------------------------
  // DOM Event Bindings
  // ---------------------------------------------------------------------------
  function bindEvents() {
    if (typeof document === 'undefined') return;

    // Navigation buttons
    document.querySelectorAll('[data-nav-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-nav-target');
        switchView(target);
      });
    });

    // Mobile sidebar toggle & backdrop
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleMobileSidebar);
    if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);

    // Escape key to close mobile drawer or modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMobileSidebar();
        closeCreateTopicModal();
        closeEditTopicModal();
        closeCreateQuestionModal();
        closeEditQuestionModal();
        closePreviewQuestionModal();
        closeRubricPreviewModal();
        closeApiSettingsModal();
        closeConfirmModal();
      }
    });

    // Close Modal buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const modalType = btn.getAttribute('data-close-modal');
        if (modalType === 'create') closeCreateTopicModal();
        else if (modalType === 'edit') closeEditTopicModal();
        else if (modalType === 'create-q') closeCreateQuestionModal();
        else if (modalType === 'edit-q') closeEditQuestionModal();
        else if (modalType === 'preview-q') closePreviewQuestionModal();
        else if (modalType === 'preview-rubric') closeRubricPreviewModal();
        else if (modalType === 'api-settings') closeApiSettingsModal();
        else if (modalType === 'confirm') closeConfirmModal();
      });
    });

    const btnOpenApiModal = document.getElementById('btn-open-api-modal');
    if (btnOpenApiModal) {
      btnOpenApiModal.addEventListener('click', (e) => {
        e.preventDefault();
        openApiSettingsModal();
      });
    }

    // -------------------------------------------------------------------------
    // Topic Toolbar & Form Events
    // -------------------------------------------------------------------------
    const btnOpenCreate = document.getElementById('btn-open-create-topic');
    if (btnOpenCreate) btnOpenCreate.addEventListener('click', openCreateTopicModal);

    const btnRefreshTopics = document.getElementById('btn-refresh-topics');
    if (btnRefreshTopics) btnRefreshTopics.addEventListener('click', loadTopics);

    document.querySelectorAll('[data-topic-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        setTopicFilter(btn.getAttribute('data-topic-filter'));
      });
    });

    const topicSearchInput = document.getElementById('topic-search-input');
    if (topicSearchInput) {
      topicSearchInput.addEventListener('input', (e) => {
        setTopicSearch(e.target.value);
      });
    }

    const createCodeInput = document.getElementById('create-topic-code');
    if (createCodeInput) {
      createCodeInput.addEventListener('input', () => {
        const cleaned = createCodeInput.value
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-');
        if (cleaned !== createCodeInput.value) {
          createCodeInput.value = cleaned;
        }
      });
    }

    const createTopicForm = document.getElementById('form-create-topic');
    if (createTopicForm) {
      createTopicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const codeInput = document.getElementById('create-topic-code');
        const titleInput = document.getElementById('create-topic-title');
        const compInput = document.getElementById('create-topic-competency');
        const descInput = document.getElementById('create-topic-description');
        const alertEl = document.getElementById('create-topic-alert');
        const codeErr = document.getElementById('create-code-error');
        const titleErr = document.getElementById('create-title-error');
        const submitBtn = document.getElementById('btn-submit-create-topic');

        if (alertEl) alertEl.style.display = 'none';
        if (codeErr) codeErr.classList.remove('active');
        if (titleErr) titleErr.classList.remove('active');

        const code = (codeInput?.value || '').trim();
        const title = (titleInput?.value || '').trim();
        const competency = (compInput?.value || '').trim();
        const description = (descInput?.value || '').trim();

        let hasError = false;
        if (!code || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(code)) {
          if (codeErr) codeErr.classList.add('active');
          hasError = true;
        }
        if (!title) {
          if (titleErr) titleErr.classList.add('active');
          hasError = true;
        }
        if (hasError) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Lumilikha...';
        }

        const api = getApi();
        try {
          const created = await api.createTopic({ code, title, competency, description });
          closeCreateTopicModal();
          showToast(`Matagumpay na nalikha ang paksang "${created.title || title}".`, 'success');
          loadTopics();
        } catch (err) {
          if (alertEl) {
            alertEl.textContent = err.message || 'Hindi malikha ang paksa.';
            alertEl.className = 'auth-alert error';
            alertEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Lumikha bilang Borador';
          }
        }
      });
    }

    const editTopicForm = document.getElementById('form-edit-topic');
    if (editTopicForm) {
      editTopicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const codeInput = document.getElementById('edit-topic-code');
        const titleInput = document.getElementById('edit-topic-title');
        const compInput = document.getElementById('edit-topic-competency');
        const descInput = document.getElementById('edit-topic-description');
        const alertEl = document.getElementById('edit-topic-alert');
        const titleErr = document.getElementById('edit-title-error');
        const submitBtn = document.getElementById('btn-submit-edit-topic');

        if (alertEl) alertEl.style.display = 'none';
        if (titleErr) titleErr.classList.remove('active');

        const code = (codeInput?.value || '').trim();
        const title = (titleInput?.value || '').trim();
        const competency = (compInput?.value || '').trim();
        const description = (descInput?.value || '').trim();

        if (!title) {
          if (titleErr) titleErr.classList.add('active');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Nagse-save...';
        }

        const api = getApi();
        try {
          const updated = await api.updateTopic(code, { title, competency, description });
          closeEditTopicModal();
          showToast(`Matagumpay na na-update ang paksang "${updated.title || title}".`, 'success');
          loadTopics();
        } catch (err) {
          if (alertEl) {
            alertEl.textContent = err.message || 'Hindi ma-update ang paksa.';
            alertEl.className = 'auth-alert error';
            alertEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'I-save ang mga Pagbabago';
          }
        }
      });
    }

    // -------------------------------------------------------------------------
    // Question Toolbar & Form Events (Phase 6.5)
    // -------------------------------------------------------------------------
    const btnOpenCreateQ = document.getElementById('btn-open-create-question');
    if (btnOpenCreateQ) btnOpenCreateQ.addEventListener('click', openCreateQuestionModal);

    const btnRefreshQ = document.getElementById('btn-refresh-questions');
    if (btnRefreshQ) btnRefreshQ.addEventListener('click', loadQuestions);

    const questionTopicFilter = document.getElementById('question-topic-filter');
    if (questionTopicFilter) {
      questionTopicFilter.addEventListener('change', (e) => {
        setQuestionTopicFilter(e.target.value);
      });
    }

    const questionCatFilter = document.getElementById('question-category-filter');
    if (questionCatFilter) {
      questionCatFilter.addEventListener('change', (e) => {
        setQuestionCategoryFilter(e.target.value);
      });
    }

    const questionSearchInput = document.getElementById('question-search-input');
    if (questionSearchInput) {
      questionSearchInput.addEventListener('input', (e) => {
        setQuestionSearch(e.target.value);
      });
    }

    // Question Type toggle in Create Modal
    const createQTypeSelect = document.getElementById('create-q-type');
    if (createQTypeSelect) {
      createQTypeSelect.addEventListener('change', () => {
        updateQuestionTypeFormViews('create');
      });
    }

    // Add choice row buttons
    const btnAddChoiceCreate = document.getElementById('btn-add-choice-create');
    if (btnAddChoiceCreate) {
      btnAddChoiceCreate.addEventListener('click', () => {
        const container = document.getElementById('create-q-choices-list');
        addChoiceRow(container);
      });
    }

    const btnAddChoiceEdit = document.getElementById('btn-add-choice-edit');
    if (btnAddChoiceEdit) {
      btnAddChoiceEdit.addEventListener('click', () => {
        const container = document.getElementById('edit-q-choices-list');
        addChoiceRow(container);
      });
    }

    // Auto-slugify code field in Create Question Modal
    const createQCodeInput = document.getElementById('create-q-code');
    if (createQCodeInput) {
      createQCodeInput.addEventListener('input', () => {
        const cleaned = createQCodeInput.value
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-');
        if (cleaned !== createQCodeInput.value) {
          createQCodeInput.value = cleaned;
        }
      });
    }

    // Category & Type changes in Create Modal
    const createCatSelect = document.getElementById('create-q-category');
    if (createCatSelect) {
      createCatSelect.addEventListener('change', (e) => {
        applyCategoryDefaults('create', e.target.value);
      });
    }
    const createTypeSelect = document.getElementById('create-q-type');
    if (createTypeSelect) {
      createTypeSelect.addEventListener('change', () => {
        updateQuestionTypeFormViews('create');
      });
    }

    // Category & Type changes in Edit Modal
    const editCatSelect = document.getElementById('edit-q-category');
    if (editCatSelect) {
      editCatSelect.addEventListener('change', (e) => {
        applyCategoryDefaults('edit', e.target.value);
      });
    }
    const editTypeSelect = document.getElementById('edit-q-type');
    if (editTypeSelect) {
      editTypeSelect.addEventListener('change', () => {
        updateQuestionTypeFormViews('edit');
      });
    }

    // Dynamic Rubric Groups Add Button Handlers
    const btnAddRubricCreate = document.getElementById('btn-add-rubric-create');
    if (btnAddRubricCreate) {
      btnAddRubricCreate.addEventListener('click', () => {
        const container = document.getElementById('create-q-rubric-groups-list');
        addRubricGroupRow(container);
      });
    }
    const btnAddRubricEdit = document.getElementById('btn-add-rubric-edit');
    if (btnAddRubricEdit) {
      btnAddRubricEdit.addEventListener('click', () => {
        const container = document.getElementById('edit-q-rubric-groups-list');
        addRubricGroupRow(container);
      });
    }

    // Submit Create Question Form
    const createQuestionForm = document.getElementById('form-create-question');
    if (createQuestionForm) {
      createQuestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('create-question-alert');
        const submitBtn = document.getElementById('btn-submit-create-question');

        if (alertEl) alertEl.style.display = 'none';

        const { isValid, payload, topicCode } = validateQuestionForm('create', false);
        if (!isValid || !payload) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Lumilikha ng Tanong...';
        }

        const api = getApi();
        try {
          const created = await api.createQuestion(topicCode, payload);
          closeCreateQuestionModal();
          showToast(`Matagumpay na nalikha ang tanong '${created.code || payload.code}'.`, 'success');
          loadQuestions();
        } catch (err) {
          if (alertEl) {
            alertEl.textContent = err.message || 'Hindi malikha ang tanong.';
            alertEl.className = 'auth-alert error';
            alertEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Lumikha bilang Borador';
          }
        }
      });
    }

    // Submit Edit Question Form (Creates next immutable version)
    const editQuestionForm = document.getElementById('form-edit-question');
    if (editQuestionForm) {
      editQuestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('edit-question-alert');
        const submitBtn = document.getElementById('btn-submit-edit-question');

        if (alertEl) alertEl.style.display = 'none';

        const { isValid, payload } = validateQuestionForm('edit', true);
        if (!isValid || !payload) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Nagse-save ng Bersyon...';
        }

        const api = getApi();
        try {
          const revised = await api.reviseQuestion(payload.code, payload);
          closeEditQuestionModal();
          showToast(`Nai-save bilang Bagong Borador (v${revised.version}) ang tanong na '${payload.code}'.`, 'success');
          loadQuestions();
        } catch (err) {
          if (alertEl) {
            alertEl.textContent = err.message || 'Hindi ma-update ang tanong.';
            alertEl.className = 'auth-alert error';
            alertEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'I-save bilang Bagong Borador';
          }
        }
      });
    }

    // -------------------------------------------------------------------------
    // Rubric Toolbar Events (Phase 6.6)
    // -------------------------------------------------------------------------
    const btnRefreshRubrics = document.getElementById('btn-refresh-rubrics');
    if (btnRefreshRubrics) btnRefreshRubrics.addEventListener('click', loadRubrics);

    const rubricTopicFilter = document.getElementById('rubric-topic-filter');
    if (rubricTopicFilter) {
      rubricTopicFilter.addEventListener('change', (e) => {
        setRubricTopicFilter(e.target.value);
      });
    }

    const rubricStatusFilter = document.getElementById('rubric-status-filter');
    if (rubricStatusFilter) {
      rubricStatusFilter.addEventListener('change', (e) => {
        setRubricStatusFilter(e.target.value);
      });
    }

    const rubricSearchInput = document.getElementById('rubric-search');
    if (rubricSearchInput) {
      rubricSearchInput.addEventListener('input', (e) => {
        setRubricSearch(e.target.value);
      });
    }

    // Confirmation Modal Confirm Execution
    const btnExecuteConfirm = document.getElementById('btn-execute-confirm');
    if (btnExecuteConfirm) {
      btnExecuteConfirm.addEventListener('click', async () => {
        if (typeof _pendingConfirmCallback === 'function') {
          const cb = _pendingConfirmCallback;
          closeConfirmModal();
          await cb();
        } else {
          closeConfirmModal();
        }
      });
    }

    // Sign-in Form
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auth = getAuth();
        if (!auth) return;

        const email = emailInput?.value || '';
        const password = passwordInput?.value || '';

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sumusuri ng kredensyal...';
        }

        try {
          const profile = await auth.signIn(email, password);
          const path = (typeof window !== 'undefined' && window.location) ? (window.location.pathname || '').toLowerCase() : '';
          const isAdminRoute = path === '/admin' || path.startsWith('/admin/');
          if (isAdminRoute && profile.role !== 'admin') {
            await auth.signOut(true);
            showAuthScreen('Kailangan ng Administrator (Admin) account upang ma-access ang /admin portal. Para sa guro, mangyaring mag-log in sa /teacher.');
            return;
          }
          showDashboardApp(profile);
          loginForm.reset();
        } catch (err) {
          showAuthScreen(err.message || 'Hindi makapag-sign in. Pakisubukang muli.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Mag-sign In sa Dashboard';
          }
        }
      });
    }

    // Logout Buttons
    const logoutBtn = document.getElementById('logout-btn');
    const accountLogoutBtn = document.getElementById('account-logout-btn');

    async function handleLogout() {
      const auth = getAuth();
      if (auth) {
        try { await auth.signOut(); }
        catch (err) { console.warn('[Dashboard] Logout error:', err.message); }
      }
      _topics = [];
      _questions = [];
      _rubrics = [];
      showAuthScreen();
      switchView('overview');
    }

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (accountLogoutBtn) accountLogoutBtn.addEventListener('click', handleLogout);
  }

  // ---------------------------------------------------------------------------
  // Export & Auto-bootstrap
  // ---------------------------------------------------------------------------
  const controller = {
    init,
    bindEvents,
    switchView,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
    getCurrentView: () => _currentView,
    loadOverviewStats,
    renderUserProfile,
    showDashboardApp,
    showAuthScreen,

    // Admin-Only Visibility & Controls
    getVerifiedRole,
    isAdminUser,
    applyRoleBasedVisibility,
    loadSystemStatus,
    openApiSettingsModal,
    closeApiSettingsModal,
    getCurrentProfile: () => _currentProfile,
    setCurrentProfile: (profile) => {
      applyRoleBasedVisibility(profile);
    },

    // Topic controls
    loadTopics,
    renderTopics,
    setTopicFilter,
    setTopicSearch,
    filterTopics,
    formatDate,
    openCreateTopicModal,
    closeCreateTopicModal,
    openEditTopicModal,
    closeEditTopicModal,
    openConfirmModal,
    closeConfirmModal,
    promptPublishTopic,
    promptUnpublishTopic,
    promptArchiveTopic,
    showToast,
    getTopicsList: () => [..._topics],
    setTopicsList: (list) => { _topics = [...list]; },

    // Question controls (Phase 6.5)
    loadQuestions,
    renderQuestions,
    filterQuestions,
    setQuestionTopicFilter,
    setQuestionCategoryFilter,
    setQuestionSearch,
    openCreateQuestionModal,
    closeCreateQuestionModal,
    openEditQuestionModal,
    closeEditQuestionModal,
    openPreviewQuestionModal,
    closePreviewQuestionModal,
    promptPublishQuestion,
    promptUnpublishQuestion,
    promptArchiveQuestion,
    addChoiceRow,
    getChoicesFromEditor,
    getQuestionsList: () => [..._questions],
    setQuestionsList: (list) => { _questions = [...list]; },

    // Dynamic Card Creation & Rubrics (Dynamic Question System)
    CATEGORY_RULES,
    applyCategoryDefaults,
    updateQuestionTypeFormViews,
    parseAcceptedAnswers,
    formatAcceptedAnswers,
    renderRubricGroupsEditor,
    addRubricGroupRow,
    renumberRubricGroups,
    getRubricGroupsFromEditor,
    validateQuestionForm,

    // Rubric controls (Phase 6.6)
    loadRubrics,
    renderRubrics,
    filterRubrics,
    setRubricTopicFilter,
    setRubricStatusFilter,
    setRubricSearch,
    openRubricPreviewModal,
    closeRubricPreviewModal,
    getRubricsList: () => [..._rubrics],
    setRubricsList: (list) => { _rubrics = [...list]; }
  };

  root.PANITIKARD_DASHBOARD = controller;
  if (typeof module !== 'undefined' && module.exports) module.exports = controller;

  // Auto-init in browser environment
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        bindEvents();
        init();
      });
    } else {
      bindEvents();
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
