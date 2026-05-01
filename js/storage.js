/**
 * DayScore Storage Layer
 * Handles all interaction with localStorage.
 */

const STORAGE_KEY = 'dayscore_data';

// Default data structure
const defaultData = {
    tasks: {}, // Keyed by date: "YYYY-MM-DD": [...]
    tags: ["Work", "Health", "Learning", "Personal"],
    settings: {
        dayBoundaryHour: 5 // 5 AM is the cutoff for "today"
    }
};

const Storage = {
    // --- Initialization ---
    init() {
        if (!localStorage.getItem(STORAGE_KEY)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
        }
    },

    getData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData;
        } catch (e) {
            console.error("Error parsing DayScore data", e);
            return defaultData;
        }
    },

    /**
     * Save data to localStorage only. Used by FirebaseSync
     * to avoid infinite loops during cloud pull.
     */
    saveDataLocal(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    /**
     * Save data to localStorage AND push to Firebase.
     * This is the primary save method used by the app.
     */
    saveData(data) {
        this.saveDataLocal(data);

        // Push to cloud in the background (non-blocking)
        if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isConfigured) {
            FirebaseSync.pushToCloud();
        }
    },

    // --- Utility ---
    /**
     * Get the current "logical" date string (YYYY-MM-DD)
     * respecting the day boundary hour.
     */
    getTodayDate() {
        const data = this.getData();
        const boundaryHour = data.settings.dayBoundaryHour;
        
        const now = new Date();
        // If current time is before the boundary hour, it counts as "yesterday"
        if (now.getHours() < boundaryHour) {
            now.setDate(now.getDate() - 1);
        }
        
        // Format as YYYY-MM-DD
        return now.toISOString().split('T')[0];
    },

    /**
     * Get tomorrow's "logical" date string (YYYY-MM-DD)
     */
    getTomorrowDate() {
        const now = new Date();
        const data = this.getData();
        const boundaryHour = data.settings.dayBoundaryHour;
        
        if (now.getHours() < boundaryHour) {
             // If it's 2 AM on May 2nd, "today" is May 1st, so "tomorrow" is May 2nd
             // No change to `now`
        } else {
             // Normal case: "tomorrow" is +1 day
             now.setDate(now.getDate() + 1);
        }
        return now.toISOString().split('T')[0];
    },

    // --- Tasks CRUD ---
    getTasksByDate(dateStr) {
        const data = this.getData();
        return data.tasks[dateStr] || [];
    },

    saveTask(task) {
        const data = this.getData();
        const dateStr = task.date;
        
        if (!data.tasks[dateStr]) {
            data.tasks[dateStr] = [];
        }

        const existingIndex = data.tasks[dateStr].findIndex(t => t.id === task.id);
        
        task.updatedAt = new Date().toISOString();

        if (existingIndex >= 0) {
            data.tasks[dateStr][existingIndex] = task;
        } else {
            task.createdAt = new Date().toISOString();
            if (!task.id) {
                task.id = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(36).substr(2, 9);
            }
            data.tasks[dateStr].push(task);
        }
        
        // Add new tags automatically
        if (task.category && !data.tags.includes(task.category)) {
            data.tags.push(task.category);
        }

        this.saveData(data);
    },

    deleteTask(dateStr, taskId) {
        const data = this.getData();
        if (data.tasks[dateStr]) {
            data.tasks[dateStr] = data.tasks[dateStr].filter(t => t.id !== taskId);
            this.saveData(data);
        }
    },

    /**
     * Phase 3: Auto-close unmarked tasks from past days
     * Returns true if any tasks were updated, so the UI can show a notification.
     */
    autoCloseUnmarkedTasks() {
        const data = this.getData();
        const todayStr = this.getTodayDate();
        let changed = false;

        // Iterate through all stored dates
        Object.keys(data.tasks).forEach(dateStr => {
            // Only process past dates
            if (dateStr < todayStr) {
                data.tasks[dateStr].forEach(task => {
                    if (task.status === 'unmarked' || !task.status) {
                        task.status = 'not_done';
                        task.updatedAt = new Date().toISOString();
                        changed = true;
                    }
                });
            }
        });

        if (changed) {
            this.saveData(data);
        }
        return changed;
    },

    // --- Tags ---
    getTags() {
        return this.getData().tags;
    },

    /**
     * Phase 5: Get all stored date keys sorted chronologically.
     */
    getAllDates() {
        const data = this.getData();
        return Object.keys(data.tasks).sort();
    }
};

// Initialize on script load
Storage.init();
