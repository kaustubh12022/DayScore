/**
 * DayScore — Main Application
 * Routing, view rendering, event handling.
 */

const App = {
    currentView: null,

    init() {
        if (Storage.autoCloseUnmarkedTasks()) {
            this.showAutoCloseBanner();
        }
        this.setupRouter();
        this.setupGlobalEvents();
        this.handleRoute();

        // Initialize Firebase sync in the background (non-blocking)
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.init();
        }
    },

    showAutoCloseBanner() {
        const banner = document.createElement('div');
        banner.style.cssText = `
            background: rgba(239, 68, 68, 0.1);
            color: var(--status-not-done);
            border: 1px solid var(--status-not-done);
            padding: var(--spacing-sm) var(--spacing-md);
            margin: var(--spacing-md) auto 0;
            max-width: 800px;
            border-radius: var(--radius-md);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.875rem;
        `;
        banner.innerHTML = `
            <span>Yesterday's unmarked tasks were recorded as Not Done.</span>
            <button style="color:inherit; font-size:1.25rem;" onclick="this.parentElement.remove()">&times;</button>
        `;
        document.getElementById('app-container').insertBefore(banner, document.getElementById('main-nav'));
    },

    // =====================
    //  ROUTING
    // =====================
    setupRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
    },

    handleRoute() {
        const hash = window.location.hash || '#/today';

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        if (hash.startsWith('#/plan')) {
            this.showView('plan');
        } else if (hash.startsWith('#/history')) {
            this.showView('history');
        } else if (hash.startsWith('#/insights')) {
            this.showView('insights');
        } else if (hash.startsWith('#/export')) {
            this.showView('export');
        } else {
            this.showView('today');
        }
    },

    showView(name) {
        this.currentView = name;
        const el = document.getElementById(`view-${name}`);
        if (el) el.classList.add('active');

        const nav = document.getElementById(`nav-${name}`);
        if (nav) nav.classList.add('active');

        // View-specific rendering
        if (name === 'today') this.renderToday();
        if (name === 'plan') this.renderPlan();
        if (name === 'history') {
            if (!this.historyInitialized) {
                this.initHistoryView();
                this.historyInitialized = true;
            }
            this.renderHistory();
        }
        if (name === 'insights') this.renderInsights();

        this.updateHeaders();
    },

    // =====================
    //  HEADERS
    // =====================
    updateHeaders() {
        const fmt = (dateStr) => {
            const d = new Date(dateStr + 'T12:00:00');
            return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        };

        const todayEl = document.getElementById('today-date-header');
        if (todayEl) todayEl.textContent = `Today — ${fmt(Storage.getTodayDate())}`;

        const planEl = document.getElementById('plan-date-header');
        if (planEl) planEl.textContent = `Plan for ${fmt(Storage.getTomorrowDate())}`;
    },

    // =====================
    //  TODAY VIEW
    // =====================
    renderToday(expandedTaskId = null) {
        const date = Storage.getTodayDate();
        const tasks = Storage.getTasksByDate(date);
        const listEl = document.getElementById('today-task-list');
        const emptyEl = document.getElementById('today-empty');
        const progressEl = document.getElementById('today-progress-section');

        listEl.innerHTML = '';

        if (tasks.length === 0) {
            emptyEl.classList.remove('hidden');
            progressEl.style.display = 'none';
        } else {
            emptyEl.classList.add('hidden');
            progressEl.style.display = '';
            tasks.forEach(task => {
                const card = this.createTodayTaskCard(task);
                if (task.id === expandedTaskId) {
                    card.classList.add('expanded');
                }
                listEl.appendChild(card);
            });
        }

        this.updateProgressRing(tasks);
    },

    createTodayTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        card.dataset.priority = task.priority || 'Medium';
        if (task.status && task.status !== 'unmarked') {
            card.dataset.status = task.status;
        }

        // Status icon
        const statusIcons = {
            done: '✅',
            partial: '🔶',
            not_done: '❌',
            unmarked: '⬜'
        };
        const statusIcon = document.createElement('div');
        statusIcon.className = 'task-status-icon';
        statusIcon.textContent = statusIcons[task.status || 'unmarked'];

        // Body
        const body = document.createElement('div');
        body.className = 'task-card-body';

        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = task.title;

        const meta = document.createElement('div');
        meta.className = 'task-meta';
        if (task.category) {
            const tag = document.createElement('span');
            tag.className = 'task-tag';
            tag.textContent = task.category;
            meta.appendChild(tag);
        }
        if (task.estimatedMinutes) {
            const time = document.createElement('span');
            time.className = 'task-time';
            time.textContent = `${task.estimatedMinutes} min`;
            meta.appendChild(time);
        }
        if (task.planned === false) {
            const unplanned = document.createElement('span');
            unplanned.className = 'task-time';
            unplanned.textContent = '• unplanned';
            meta.appendChild(unplanned);
        }

        // --- Phase 3: Edit Panel ---
        const editPanel = document.createElement('div');
        editPanel.className = 'task-edit-panel';

        // Status Buttons
        const statusRow = document.createElement('div');
        statusRow.className = 'status-buttons';
        
        const statuses = [
            { id: 'done', icon: '✅', label: 'Done' },
            { id: 'partial', icon: '🔶', label: 'Partial' },
            { id: 'not_done', icon: '❌', label: 'Not Done' }
        ];

        statuses.forEach(s => {
            const btn = document.createElement('button');
            btn.className = `btn-status ${task.status === s.id ? 'active' : ''}`;
            btn.dataset.status = s.id;
            btn.innerHTML = `<span class="icon">${s.icon}</span><span>${s.label}</span>`;
            
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card toggle
                this.updateTaskStatus(task, task.status === s.id ? 'unmarked' : s.id);
            });
            statusRow.appendChild(btn);
        });

        // Textareas
        const fieldsRow = document.createElement('div');
        fieldsRow.className = 'edit-fields';

        const actualInput = document.createElement('textarea');
        actualInput.placeholder = 'What did you actually do?';
        actualInput.value = task.actualDescription || '';
        actualInput.addEventListener('click', e => e.stopPropagation());
        actualInput.addEventListener('blur', (e) => {
            task.actualDescription = e.target.value.trim();
            Storage.saveTask(task);
        });

        const noteInput = document.createElement('textarea');
        noteInput.placeholder = 'Add a note or reason...';
        noteInput.value = task.note || '';
        noteInput.addEventListener('click', e => e.stopPropagation());
        noteInput.addEventListener('blur', (e) => {
            task.note = e.target.value.trim();
            Storage.saveTask(task);
        });

        fieldsRow.appendChild(actualInput);
        fieldsRow.appendChild(noteInput);

        editPanel.appendChild(statusRow);
        editPanel.appendChild(fieldsRow);

        // --- Assembly ---
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.width = '100%';
        headerRow.style.alignItems = 'flex-start';
        headerRow.appendChild(statusIcon);
        headerRow.appendChild(body);

        card.appendChild(headerRow);
        card.appendChild(editPanel);

        // Toggle expand on click
        card.addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            // Close others
            document.querySelectorAll('.task-card.expanded').forEach(c => c.classList.remove('expanded'));
            if (!isExpanded) card.classList.add('expanded');
        });

        return card;
    },

    updateTaskStatus(task, newStatus) {
        task.status = newStatus;
        Storage.saveTask(task);
        // Re-render just the today view to update colors/progress, keeping this card expanded
        this.renderToday(task.id);
    },

    // =====================
    //  PROGRESS RING
    // =====================
    updateProgressRing(tasks) {
        const markedTasks = tasks.filter(t => t.status && t.status !== 'unmarked');
        let done = 0, partial = 0, notDone = 0;

        markedTasks.forEach(t => {
            if (t.status === 'done') done++;
            else if (t.status === 'partial') partial++;
            else if (t.status === 'not_done') notDone++;
        });

        // For current day: only count marked tasks in percentage
        const total = markedTasks.length;
        const pct = total > 0 ? Math.round(((done * 1.0 + partial * 0.5) / total) * 100) : 0;

        // Update ring SVG
        const circumference = 326.73;
        const offset = circumference - (pct / 100) * circumference;
        const ring = document.getElementById('today-ring-fill');
        if (ring) {
            ring.style.strokeDashoffset = offset;
            // Color the ring based on percentage
            if (pct >= 75) ring.style.stroke = 'var(--status-done)';
            else if (pct >= 40) ring.style.stroke = 'var(--status-partial)';
            else if (pct > 0) ring.style.stroke = 'var(--status-not-done)';
            else ring.style.stroke = 'var(--accent-primary)';
        }

        const text = document.getElementById('today-ring-text');
        if (text) text.textContent = tasks.length > 0 ? `${pct}%` : '—';

        // Update stat counts
        const doneEl = document.getElementById('stat-done-count');
        const partialEl = document.getElementById('stat-partial-count');
        const notDoneEl = document.getElementById('stat-notdone-count');
        if (doneEl) doneEl.textContent = done;
        if (partialEl) partialEl.textContent = partial;
        if (notDoneEl) notDoneEl.textContent = notDone;
    },

    // =====================
    //  PLAN TOMORROW VIEW
    // =====================
    renderPlan() {
        const date = Storage.getTomorrowDate();
        const tasks = Storage.getTasksByDate(date);
        const listEl = document.getElementById('plan-task-list');
        const emptyEl = document.getElementById('plan-empty');

        listEl.innerHTML = '';

        if (tasks.length === 0) {
            emptyEl.classList.remove('hidden');
        } else {
            emptyEl.classList.add('hidden');
            tasks.forEach(task => listEl.appendChild(this.createPlanTaskCard(task)));
        }

        this.populateTagSuggestions();
    },

    createPlanTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        card.dataset.priority = task.priority || 'Medium';

        const body = document.createElement('div');
        body.className = 'task-card-body';

        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = task.title;

        const meta = document.createElement('div');
        meta.className = 'task-meta';
        if (task.category) {
            const tag = document.createElement('span');
            tag.className = 'task-tag';
            tag.textContent = task.category;
            meta.appendChild(tag);
        }
        if (task.estimatedMinutes) {
            const time = document.createElement('span');
            time.className = 'task-time';
            time.textContent = `${task.estimatedMinutes} min`;
            meta.appendChild(time);
        }
        if (task.priority && task.priority !== 'Medium') {
            const prio = document.createElement('span');
            prio.className = 'task-time';
            prio.textContent = `• ${task.priority}`;
            meta.appendChild(prio);
        }

        body.appendChild(title);
        if (meta.children.length > 0) body.appendChild(meta);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'task-actions';

        const delBtn = document.createElement('button');
        delBtn.className = 'task-action-btn delete';
        delBtn.innerHTML = '🗑';
        delBtn.title = 'Delete task';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            Storage.deleteTask(task.date, task.id);
            this.renderPlan();
        });

        actions.appendChild(delBtn);

        // Assembly
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.width = '100%';
        headerRow.style.alignItems = 'center';
        
        headerRow.appendChild(body);
        headerRow.appendChild(actions);

        card.appendChild(headerRow);

        return card;
    },

    // =====================
    //  HISTORY VIEW (Phase 4)
    // =====================
    initHistoryView() {
        const picker = document.getElementById('history-date-picker');
        const prevBtn = document.getElementById('history-prev');
        const nextBtn = document.getElementById('history-next');

        // Set default to yesterday
        let d = new Date();
        d.setDate(d.getDate() - 1);
        // Format as YYYY-MM-DD
        const yesterdayStr = d.toISOString().split('T')[0];
        picker.value = yesterdayStr;

        picker.addEventListener('change', () => this.renderHistory());
        
        prevBtn.addEventListener('click', () => {
            const current = new Date(picker.value);
            current.setDate(current.getDate() - 1);
            picker.value = current.toISOString().split('T')[0];
            this.renderHistory();
        });

        nextBtn.addEventListener('click', () => {
            const current = new Date(picker.value);
            current.setDate(current.getDate() + 1);
            picker.value = current.toISOString().split('T')[0];
            this.renderHistory();
        });
    },

    renderHistory() {
        const picker = document.getElementById('history-date-picker');
        if (!picker.value) return;

        const date = picker.value;
        const tasks = Storage.getTasksByDate(date);
        
        const listEl = document.getElementById('history-task-list');
        const emptyEl = document.getElementById('history-empty');
        const summaryEl = document.getElementById('history-summary');

        listEl.innerHTML = '';

        if (tasks.length === 0) {
            emptyEl.classList.remove('hidden');
            summaryEl.classList.add('hidden');
        } else {
            emptyEl.classList.add('hidden');
            summaryEl.classList.remove('hidden');
            
            // Render tasks
            tasks.forEach(task => listEl.appendChild(this.createHistoryTaskCard(task)));
            
            // Calculate and render stats
            this.updateHistoryStats(tasks);
        }
    },

    createHistoryTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.priority = task.priority || 'Medium';
        if (task.status && task.status !== 'unmarked') {
            card.dataset.status = task.status;
        }

        // Status icon
        const statusIcons = {
            done: '✅',
            partial: '🔶',
            not_done: '❌',
            unmarked: '⬜'
        };
        const statusIcon = document.createElement('div');
        statusIcon.className = 'task-status-icon';
        statusIcon.textContent = statusIcons[task.status || 'unmarked'];

        // Body
        const body = document.createElement('div');
        body.className = 'task-card-body';

        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = task.title;

        const meta = document.createElement('div');
        meta.className = 'task-meta';
        if (task.category) {
            const tag = document.createElement('span');
            tag.className = 'task-tag';
            tag.textContent = task.category;
            meta.appendChild(tag);
        }
        if (task.estimatedMinutes) {
            const time = document.createElement('span');
            time.className = 'task-time';
            time.textContent = `${task.estimatedMinutes} min`;
            meta.appendChild(time);
        }
        if (task.planned === false) {
            const unplanned = document.createElement('span');
            unplanned.className = 'task-time';
            unplanned.textContent = '• unplanned';
            meta.appendChild(unplanned);
        }

        body.appendChild(title);
        if (meta.children.length > 0) body.appendChild(meta);

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.width = '100%';
        headerRow.style.alignItems = 'flex-start';
        headerRow.appendChild(statusIcon);
        headerRow.appendChild(body);

        card.appendChild(headerRow);

        // Add note/actual description if they exist
        if (task.actualDescription || task.note) {
            const noteContainer = document.createElement('div');
            noteContainer.className = 'historical-note';
            
            if (task.actualDescription) {
                const act = document.createElement('div');
                act.innerHTML = `<strong>Actual:</strong> ${task.actualDescription}`;
                noteContainer.appendChild(act);
            }
            if (task.note) {
                const nt = document.createElement('div');
                nt.innerHTML = `<strong>Note:</strong> ${task.note}`;
                noteContainer.appendChild(nt);
            }
            card.appendChild(noteContainer);
        }

        return card;
    },

    updateHistoryStats(tasks) {
        const markedTasks = tasks.filter(t => t.status && t.status !== 'unmarked');
        let done = 0, partial = 0, notDone = 0;

        markedTasks.forEach(t => {
            if (t.status === 'done') done++;
            else if (t.status === 'partial') partial++;
            else if (t.status === 'not_done') notDone++;
        });

        // Current day/historical logic for percentage
        const total = tasks.length;
        // In history, unmarked count against you, so total is tasks.length, not markedTasks.length
        const pct = total > 0 ? Math.round(((done * 1.0 + partial * 0.5) / total) * 100) : 0;

        const scoreEl = document.getElementById('history-score-val');
        if (scoreEl) {
            scoreEl.textContent = `${pct}%`;
            if (pct >= 75) scoreEl.style.color = 'var(--status-done)';
            else if (pct >= 40) scoreEl.style.color = 'var(--status-partial)';
            else scoreEl.style.color = 'var(--status-not-done)';
        }

        const doneEl = document.getElementById('history-done-count');
        const partialEl = document.getElementById('history-partial-count');
        const notDoneEl = document.getElementById('history-notdone-count');
        
        if (doneEl) doneEl.textContent = `${done} Done`;
        if (partialEl) partialEl.textContent = `${partial} Partial`;
        if (notDoneEl) notDoneEl.textContent = `${notDone} Skipped`;
    },

    // =====================
    //  TAG AUTOCOMPLETE
    // =====================
    populateTagSuggestions() {
        const tags = Storage.getTags();
        const lists = document.querySelectorAll('#tag-suggestions, #tag-suggestions-modal');
        lists.forEach(dl => {
            dl.innerHTML = '';
            tags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag;
                dl.appendChild(opt);
            });
        });
    },

    // =====================
    //  ADD TASK (Plan Tomorrow)
    // =====================
    addPlanTask() {
        const titleInput = document.getElementById('plan-task-title');
        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            titleInput.classList.add('shake');
            setTimeout(() => titleInput.classList.remove('shake'), 400);
            return;
        }

        const category = document.getElementById('plan-task-category').value.trim();
        const time = parseInt(document.getElementById('plan-task-time').value) || null;
        const priorityEl = document.querySelector('#plan-priority-toggle .priority-btn.active');
        const priority = priorityEl ? priorityEl.dataset.priority : 'Medium';

        const date = Storage.getTomorrowDate();
        const existingTasks = Storage.getTasksByDate(date);

        const task = {
            date,
            title,
            category: category || '',
            estimatedMinutes: time,
            priority,
            displayOrder: existingTasks.length + 1,
            status: 'unmarked',
            actualDescription: '',
            note: '',
            planned: true
        };

        Storage.saveTask(task);

        // Clear form
        titleInput.value = '';
        document.getElementById('plan-task-category').value = '';
        document.getElementById('plan-task-time').value = '';
        this.resetPriorityToggle('plan-priority-toggle');
        titleInput.focus();

        this.renderPlan();
    },

    // =====================
    //  ADD TASK (Today — Modal)
    // =====================
    addTodayTask() {
        const titleInput = document.getElementById('modal-task-title');
        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            return;
        }

        const category = document.getElementById('modal-task-category').value.trim();
        const time = parseInt(document.getElementById('modal-task-time').value) || null;
        const priorityEl = document.querySelector('#modal-priority-toggle .priority-btn.active');
        const priority = priorityEl ? priorityEl.dataset.priority : 'Medium';

        const date = Storage.getTodayDate();
        const existingTasks = Storage.getTasksByDate(date);

        const task = {
            date,
            title,
            category: category || '',
            estimatedMinutes: time,
            priority,
            displayOrder: existingTasks.length + 1,
            status: 'unmarked',
            actualDescription: '',
            note: '',
            planned: false // Unplanned — added mid-day
        };

        Storage.saveTask(task);
        this.closeModal();
        this.renderToday();
    },

    // =====================
    //  MODAL
    // =====================
    openModal() {
        this.populateTagSuggestions();
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-task-title').focus();
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        // Clear modal form
        document.getElementById('modal-task-title').value = '';
        document.getElementById('modal-task-category').value = '';
        document.getElementById('modal-task-time').value = '';
        this.resetPriorityToggle('modal-priority-toggle');
    },

    // =====================
    //  PRIORITY TOGGLE
    // =====================
    resetPriorityToggle(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.priority-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.priority === 'Medium');
        });
    },

    // =====================
    //  INSIGHTS VIEW (Phase 5)
    // =====================
    insightsPeriod: 'daily',

    renderInsights() {
        const period = this.insightsPeriod;
        const dateRanges = this.getInsightsDateRange(period);
        const allData = this.aggregateInsightsData(dateRanges);

        const emptyEl = document.getElementById('insights-empty');
        const summaryEl = document.getElementById('insights-summary');
        const chartSection = document.querySelector('.chart-section');
        const catSection = document.getElementById('category-section');

        if (allData.totalTasks === 0) {
            emptyEl.classList.remove('hidden');
            summaryEl.style.display = 'none';
            chartSection.style.display = 'none';
            catSection.style.display = 'none';
            return;
        }

        emptyEl.classList.add('hidden');
        summaryEl.style.display = '';
        chartSection.style.display = '';
        catSection.style.display = '';

        // Summary cards
        document.getElementById('ins-score').textContent = `${allData.avgScore}%`;
        document.getElementById('ins-total-tasks').textContent = allData.totalTasks;
        document.getElementById('ins-done-rate').textContent = `${allData.doneRate}%`;
        document.getElementById('ins-streak').textContent = allData.activeDays;

        // Color the score
        const scoreEl = document.getElementById('ins-score');
        if (allData.avgScore >= 75) scoreEl.style.color = 'var(--status-done)';
        else if (allData.avgScore >= 40) scoreEl.style.color = 'var(--status-partial)';
        else scoreEl.style.color = 'var(--status-not-done)';

        // Chart title
        const titles = { daily: 'Last 7 Days', weekly: 'Last 4 Weeks', monthly: 'Last 6 Months' };
        document.getElementById('chart-title').textContent = titles[period];

        // Render bar chart
        this.renderInsightsChart(allData.chartData);

        // Render category breakdown
        this.renderCategoryBreakdown(allData.categories);
    },

    getInsightsDateRange(period) {
        const today = Storage.getTodayDate();
        const ranges = [];

        if (period === 'daily') {
            // Last 7 days
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today + 'T12:00:00');
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const label = d.toLocaleDateString(undefined, { weekday: 'short' });
                ranges.push({ dates: [dateStr], label });
            }
        } else if (period === 'weekly') {
            // Last 4 weeks
            for (let w = 3; w >= 0; w--) {
                const weekDates = [];
                for (let d = 6; d >= 0; d--) {
                    const dt = new Date(today + 'T12:00:00');
                    dt.setDate(dt.getDate() - (w * 7 + d));
                    weekDates.push(dt.toISOString().split('T')[0]);
                }
                const start = new Date(weekDates[weekDates.length - 1] + 'T12:00:00');
                const label = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                ranges.push({ dates: weekDates, label: `Wk ${label}` });
            }
        } else if (period === 'monthly') {
            // Last 6 months
            for (let m = 5; m >= 0; m--) {
                const ref = new Date(today + 'T12:00:00');
                ref.setMonth(ref.getMonth() - m);
                const year = ref.getFullYear();
                const month = ref.getMonth();
                const monthDates = [];
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                for (let d = 1; d <= daysInMonth; d++) {
                    const dt = new Date(year, month, d);
                    monthDates.push(dt.toISOString().split('T')[0]);
                }
                const label = ref.toLocaleDateString(undefined, { month: 'short' });
                ranges.push({ dates: monthDates, label });
            }
        }

        return ranges;
    },

    aggregateInsightsData(ranges) {
        let totalTasks = 0, totalDone = 0, totalPartial = 0;
        let totalScore = 0, scoredBuckets = 0;
        let activeDays = 0;
        const categories = {};
        const chartData = [];

        // Flatten all dates for summary
        const allDatesSet = new Set();

        ranges.forEach(range => {
            let bucketTasks = 0, bucketDone = 0, bucketPartial = 0, bucketTotal = 0;

            range.dates.forEach(dateStr => {
                const tasks = Storage.getTasksByDate(dateStr);
                if (tasks.length > 0) {
                    allDatesSet.add(dateStr);
                    activeDays++; // approximate—deduped below
                }

                tasks.forEach(task => {
                    totalTasks++;
                    bucketTotal++;
                    bucketTasks++;

                    if (task.status === 'done') { totalDone++; bucketDone++; }
                    else if (task.status === 'partial') { totalPartial++; bucketPartial++; }

                    // Category counting
                    const cat = task.category || 'Uncategorized';
                    if (!categories[cat]) categories[cat] = { total: 0, done: 0 };
                    categories[cat].total++;
                    if (task.status === 'done') categories[cat].done++;
                });
            });

            const bucketScore = bucketTotal > 0
                ? Math.round(((bucketDone + bucketPartial * 0.5) / bucketTotal) * 100)
                : 0;

            if (bucketTotal > 0) scoredBuckets++;

            totalScore += bucketScore;

            chartData.push({
                label: range.label,
                value: bucketScore,
                tasks: bucketTotal
            });
        });

        const avgScore = scoredBuckets > 0 ? Math.round(totalScore / scoredBuckets) : 0;
        const doneRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

        return {
            totalTasks,
            avgScore,
            doneRate,
            activeDays: allDatesSet.size,
            chartData,
            categories
        };
    },

    renderInsightsChart(chartData) {
        const container = document.getElementById('insights-chart');
        container.innerHTML = '';

        const maxVal = Math.max(...chartData.map(d => d.value), 1);

        chartData.forEach(item => {
            const group = document.createElement('div');
            group.className = 'chart-bar-group';

            const wrapper = document.createElement('div');
            wrapper.className = 'chart-bar-wrapper';

            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            const heightPct = Math.max((item.value / 100) * 100, 3);
            bar.style.height = `${heightPct}%`;

            // Color level
            if (item.value >= 75) bar.dataset.level = 'high';
            else if (item.value >= 40) bar.dataset.level = 'mid';
            else if (item.value > 0) bar.dataset.level = 'low';
            else bar.dataset.level = 'none';

            // Value label
            if (item.tasks > 0) {
                const valLabel = document.createElement('div');
                valLabel.className = 'chart-bar-value';
                valLabel.textContent = `${item.value}%`;
                bar.appendChild(valLabel);
            }

            wrapper.appendChild(bar);
            group.appendChild(wrapper);

            const label = document.createElement('div');
            label.className = 'chart-bar-label';
            label.textContent = item.label;
            group.appendChild(label);

            container.appendChild(group);
        });
    },

    renderCategoryBreakdown(categories) {
        const container = document.getElementById('category-bars');
        container.innerHTML = '';

        const entries = Object.entries(categories).sort((a, b) => b[1].total - a[1].total);
        if (entries.length === 0) {
            document.getElementById('category-section').style.display = 'none';
            return;
        }

        const maxCount = Math.max(...entries.map(e => e[1].total), 1);

        entries.forEach(([name, data]) => {
            const row = document.createElement('div');
            row.className = 'cat-row';

            const nameEl = document.createElement('div');
            nameEl.className = 'cat-name';
            nameEl.textContent = name;
            nameEl.title = name;

            const track = document.createElement('div');
            track.className = 'cat-track';

            const fill = document.createElement('div');
            fill.className = 'cat-fill';
            fill.style.width = `${(data.total / maxCount) * 100}%`;

            track.appendChild(fill);

            const count = document.createElement('div');
            count.className = 'cat-count';
            count.textContent = data.total;

            row.appendChild(nameEl);
            row.appendChild(track);
            row.appendChild(count);

            container.appendChild(row);
        });
    },

    // =====================
    //  GLOBAL EVENT SETUP
    // =====================
    setupGlobalEvents() {
        // Plan: Add task button
        document.getElementById('btn-add-plan').addEventListener('click', () => this.addPlanTask());

        // Plan: Enter key to add task
        document.getElementById('plan-task-title').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addPlanTask();
        });

        // Plan: Priority toggle
        document.getElementById('plan-priority-toggle').addEventListener('click', (e) => {
            const btn = e.target.closest('.priority-btn');
            if (!btn) return;
            document.querySelectorAll('#plan-priority-toggle .priority-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        // Today: FAB to open modal
        document.getElementById('btn-add-today').addEventListener('click', () => this.openModal());

        // Modal: Save button
        document.getElementById('btn-modal-save').addEventListener('click', () => this.addTodayTask());

        // Modal: Enter key
        document.getElementById('modal-task-title').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addTodayTask();
        });

        // Modal: Close button
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());

        // Modal: Close on overlay click
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        // Modal: Priority toggle
        document.getElementById('modal-priority-toggle').addEventListener('click', (e) => {
            const btn = e.target.closest('.priority-btn');
            if (!btn) return;
            document.querySelectorAll('#modal-priority-toggle .priority-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        // Escape to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();

            // Keyboard Shortcuts (Phase 7)
            // Prevent triggering if user is typing in an input or textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            if (e.key === 'n' || e.key === '/') {
                e.preventDefault(); // Prevent '/' from opening browser find
                
                if (this.currentView === 'plan') {
                    document.getElementById('plan-task-title').focus();
                } else if (this.currentView === 'today') {
                    this.openModal();
                } else {
                    // Switch to today and open modal
                    window.location.hash = '#/today';
                    setTimeout(() => this.openModal(), 100);
                }
            }
        });

        // Insights: Tab switching
        document.querySelectorAll('.insights-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.insights-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.insightsPeriod = btn.dataset.period;
                this.renderInsights();
            });
        });
    }
};

// Start app
document.addEventListener('DOMContentLoaded', () => App.init());
