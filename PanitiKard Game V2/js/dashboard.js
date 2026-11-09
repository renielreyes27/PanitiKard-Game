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
  // UI Rendering Helpers
  // ---------------------------------------------------------------------------
  function renderUserProfile(profile) {
    if (typeof document === 'undefined' || !profile) return;

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

    if (form) form.reset();
    if (alert) alert.style.display = 'none';

    // Clear error texts
    document.querySelectorAll('#modal-create-question .input-error-text').forEach(el => el.classList.remove('active'));

    // Populate choices by default
    initDefaultChoices(choicesContainer);

    // Toggle choices vs written container based on default type (multiple_choice)
    const typeSelect = document.getElementById('create-q-type');
    if (typeSelect) typeSelect.value = 'multiple_choice';
    updateQuestionTypeFormViews('create');

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
      const nextVersionText = document.getElementById('edit-q-next-version-text');

      const promptInput = document.getElementById('edit-q-prompt');
      const titleInput = document.getElementById('edit-q-title');
      const pointsInput = document.getElementById('edit-q-points');
      const timeLimitInput = document.getElementById('edit-q-timelimit');
      const expInput = document.getElementById('edit-q-explanation');
      const hintInput = document.getElementById('edit-q-hint');
      const expectedInput = document.getElementById('edit-q-expected-answer');
      const choicesContainer = document.getElementById('edit-q-choices-list');

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

      if (nextVersionText) {
        const nextNum = (detail.latestVersionNumber || detail.currentVersion || 1) + 1;
        nextVersionText.textContent = `Bersyon ${nextNum}`;
      }

      const version = detail.version || {};
      if (promptInput) promptInput.value = version.prompt || '';
      if (titleInput) titleInput.value = version.title || '';
      if (pointsInput) pointsInput.value = version.points ?? 1;
      if (timeLimitInput) timeLimitInput.value = version.timeLimitSeconds || '';
      if (expInput) expInput.value = version.explanation || '';
      if (hintInput) hintInput.value = version.hint || '';

      const isMultipleChoice = detail.questionType === 'multiple_choice';
      const choicesSection = document.getElementById('edit-q-choices-section');
      const expectedSection = document.getElementById('edit-q-expected-section');

      if (isMultipleChoice) {
        if (choicesSection) choicesSection.classList.remove('hidden');
        if (expectedSection) expectedSection.classList.add('hidden');
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
        if (choicesSection) choicesSection.classList.add('hidden');
        if (expectedSection) expectedSection.classList.remove('hidden');
        if (expectedInput) {
          expectedInput.value = detail.rubric?.expectedAnswer || detail.rubric?.answerKey || '';
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
        else if (modalType === 'confirm') closeConfirmModal();
      });
    });

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

    // Submit Create Question Form
    const createQuestionForm = document.getElementById('form-create-question');
    if (createQuestionForm) {
      createQuestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const topicSelect = document.getElementById('create-q-topic');
        const codeInput = document.getElementById('create-q-code');
        const typeSelect = document.getElementById('create-q-type');
        const catSelect = document.getElementById('create-q-category');
        const promptInput = document.getElementById('create-q-prompt');
        const titleInput = document.getElementById('create-q-title');
        const pointsInput = document.getElementById('create-q-points');
        const timeLimitInput = document.getElementById('create-q-timelimit');
        const expInput = document.getElementById('create-q-explanation');
        const hintInput = document.getElementById('create-q-hint');
        const expectedInput = document.getElementById('create-q-expected-answer');
        const choicesContainer = document.getElementById('create-q-choices-list');

        const alertEl = document.getElementById('create-question-alert');
        const topicErr = document.getElementById('create-q-topic-error');
        const codeErr = document.getElementById('create-q-code-error');
        const promptErr = document.getElementById('create-q-prompt-error');
        const choiceErr = document.getElementById('create-q-choice-error');
        const expectedErr = document.getElementById('create-q-expected-error');
        const submitBtn = document.getElementById('btn-submit-create-question');

        if (alertEl) alertEl.style.display = 'none';
        if (topicErr) topicErr.classList.remove('active');
        if (codeErr) codeErr.classList.remove('active');
        if (promptErr) promptErr.classList.remove('active');
        if (choiceErr) choiceErr.classList.remove('active');
        if (expectedErr) expectedErr.classList.remove('active');

        const topicCode = (topicSelect?.value || '').trim();
        const code = (codeInput?.value || '').trim();
        const questionType = (typeSelect?.value || 'multiple_choice').trim();
        const cardCategory = (catSelect?.value || '') || null;
        const prompt = (promptInput?.value || '').trim();
        const title = (titleInput?.value || '').trim();
        const points = parseInt(pointsInput?.value, 10) || 1;
        const timeLimit = timeLimitInput?.value ? parseInt(timeLimitInput.value, 10) : null;
        const explanation = (expInput?.value || '').trim();
        const hint = (hintInput?.value || '').trim() || null;

        let hasError = false;
        if (!topicCode) {
          if (topicErr) topicErr.classList.add('active');
          hasError = true;
        }
        if (!code || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(code)) {
          if (codeErr) codeErr.classList.add('active');
          hasError = true;
        }
        if (!prompt) {
          if (promptErr) promptErr.classList.add('active');
          hasError = true;
        }

        let choices = [];
        let answerKey = null;
        let expectedAnswer = null;

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
        }

        if (hasError) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Lumilikha ng Tanong...';
        }

        const questionPayload = {
          code,
          questionType,
          cardCategory,
          title,
          prompt,
          points,
          timeLimitSeconds: timeLimit,
          explanation,
          hint,
          choices,
          answerKey,
          expectedAnswer
        };

        const api = getApi();
        try {
          const created = await api.createQuestion(topicCode, questionPayload);
          closeCreateQuestionModal();
          showToast(`Matagumpay na nalikha ang tanong '${created.code || code}'.`, 'success');
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
        const codeInput = document.getElementById('edit-q-code');
        const promptInput = document.getElementById('edit-q-prompt');
        const titleInput = document.getElementById('edit-q-title');
        const pointsInput = document.getElementById('edit-q-points');
        const timeLimitInput = document.getElementById('edit-q-timelimit');
        const expInput = document.getElementById('edit-q-explanation');
        const hintInput = document.getElementById('edit-q-hint');
        const expectedInput = document.getElementById('edit-q-expected-answer');
        const choicesContainer = document.getElementById('edit-q-choices-list');

        const alertEl = document.getElementById('edit-question-alert');
        const promptErr = document.getElementById('edit-q-prompt-error');
        const choiceErr = document.getElementById('edit-q-choice-error');
        const expectedErr = document.getElementById('edit-q-expected-error');
        const submitBtn = document.getElementById('btn-submit-edit-question');

        if (alertEl) alertEl.style.display = 'none';
        if (promptErr) promptErr.classList.remove('active');
        if (choiceErr) choiceErr.classList.remove('active');
        if (expectedErr) expectedErr.classList.remove('active');

        const code = (codeInput?.value || '').trim();
        const prompt = (promptInput?.value || '').trim();
        const title = (titleInput?.value || '').trim();
        const points = parseInt(pointsInput?.value, 10) || 1;
        const timeLimit = timeLimitInput?.value ? parseInt(timeLimitInput.value, 10) : null;
        const explanation = (expInput?.value || '').trim();
        const hint = (hintInput?.value || '').trim() || null;

        if (!prompt) {
          if (promptErr) promptErr.classList.add('active');
          return;
        }

        const isMultipleChoice = _activeEditingQuestion?.questionType === 'multiple_choice';
        let choices = [];
        let answerKey = null;
        let expectedAnswer = null;

        if (isMultipleChoice) {
          const extracted = getChoicesFromEditor(choicesContainer);
          choices = extracted.choices;
          answerKey = extracted.answerKey;
          if (choices.length < 2 || !answerKey) {
            if (choiceErr) choiceErr.classList.add('active');
            return;
          }
        } else {
          expectedAnswer = (expectedInput?.value || '').trim();
          if (!expectedAnswer) {
            if (expectedErr) expectedErr.classList.add('active');
            return;
          }
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Nagse-save ng Bersyon...';
        }

        const revisionPayload = {
          code,
          questionType: _activeEditingQuestion.questionType,
          cardCategory: _activeEditingQuestion.cardCategory,
          title,
          prompt,
          points,
          timeLimitSeconds: timeLimit,
          explanation,
          hint,
          choices,
          answerKey,
          expectedAnswer
        };

        const api = getApi();
        try {
          const revised = await api.reviseQuestion(code, revisionPayload);
          closeEditQuestionModal();
          showToast(`Nai-save bilang Bagong Borador (v${revised.version}) ang tanong na '${code}'.`, 'success');
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
