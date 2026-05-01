/**
 * DayScore Firebase Sync Layer (Phase 8)
 * 
 * Handles Firestore connection and bidirectional sync with localStorage.
 * Uses a dual-write, offline-first approach:
 *   1. All writes go to localStorage first (instant).
 *   2. Then pushed to Firestore in the background.
 *   3. On app load, Firestore data is pulled and merged if newer.
 *
 * SETUP INSTRUCTIONS:
 * Replace the firebaseConfig object below with YOUR project's config
 * from the Firebase Console → Project Settings → General → Your apps → Web app.
 */

// ============================================================
//  FIREBASE CONFIG — REPLACE WITH YOUR VALUES
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBG9scvqJLdWfQw7JzhnmaeM4kOkfBnsSo",
    authDomain: "dayscore-c9d57.firebaseapp.com",
    projectId: "dayscore-c9d57",
    storageBucket: "dayscore-c9d57.firebasestorage.app",
    messagingSenderId: "571817449061",
    appId: "1:571817449061:web:b40fd5d9a85deabfa4d88c",
    measurementId: "G-BMY0QJFD5K"
};

// ============================================================
//  FIREBASE SYNC MODULE
// ============================================================
const FirebaseSync = {
    db: null,
    auth: null,
    userId: null,
    isConfigured: false,
    isSyncing: false,

    /**
     * Initialize Firebase and authenticate anonymously.
     */
    async init() {
        // Check if config has been replaced
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn('[FirebaseSync] Firebase not configured. Running in local-only mode.');
            this.isConfigured = false;
            return;
        }

        try {
            // Initialize Firebase
            firebase.initializeApp(firebaseConfig);
            this.db = firebase.firestore();
            this.auth = firebase.auth();

            // Enable offline persistence
            try {
                await this.db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn('[FirebaseSync] Multiple tabs open, persistence only works in one tab.');
                } else if (err.code === 'unimplemented') {
                    console.warn('[FirebaseSync] Browser does not support offline persistence.');
                }
            }

            // Authenticate anonymously
            const userCredential = await this.auth.signInAnonymously();
            this.userId = userCredential.user.uid;
            this.isConfigured = true;

            console.log('[FirebaseSync] Initialized. User:', this.userId);

            // Pull latest data from Firestore on startup
            await this.pullFromCloud();

            // Listen for real-time changes (for cross-device sync)
            this.listenForChanges();

        } catch (error) {
            console.error('[FirebaseSync] Init failed:', error);
            this.isConfigured = false;
        }
    },

    /**
     * Push local data to Firestore.
     * Called after every localStorage save.
     */
    async pushToCloud() {
        if (!this.isConfigured || this.isSyncing) return;

        try {
            const data = Storage.getData();
            const batch = this.db.batch();

            // Push each date's tasks as a separate Firestore document
            Object.keys(data.tasks).forEach(dateStr => {
                const docRef = this.db
                    .collection('users')
                    .doc(this.userId)
                    .collection('days')
                    .doc(dateStr);

                batch.set(docRef, {
                    tasks: data.tasks[dateStr],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            // Also save tags and settings
            const metaRef = this.db
                .collection('users')
                .doc(this.userId);

            batch.set(metaRef, {
                tags: data.tags,
                settings: data.settings,
                lastSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await batch.commit();
            console.log('[FirebaseSync] Pushed to cloud successfully.');

        } catch (error) {
            console.error('[FirebaseSync] Push failed (will retry on next save):', error);
        }
    },

    /**
     * Pull data from Firestore and merge into localStorage.
     * Only overwrites local data if cloud data is newer.
     */
    async pullFromCloud() {
        if (!this.isConfigured) return;

        this.isSyncing = true;

        try {
            const localData = Storage.getData();
            let hasChanges = false;

            // Pull all day documents
            const daysSnapshot = await this.db
                .collection('users')
                .doc(this.userId)
                .collection('days')
                .get();

            daysSnapshot.forEach(doc => {
                const dateStr = doc.id;
                const cloudTasks = doc.data().tasks || [];

                // Simple merge: if cloud has tasks for a date that local doesn't,
                // or cloud has MORE tasks, use cloud version.
                const localTasks = localData.tasks[dateStr] || [];

                if (cloudTasks.length > 0) {
                    // Use the version with the latest updatedAt timestamp
                    const cloudLatest = this.getLatestTimestamp(cloudTasks);
                    const localLatest = this.getLatestTimestamp(localTasks);

                    if (!localData.tasks[dateStr] || cloudLatest > localLatest) {
                        localData.tasks[dateStr] = cloudTasks;
                        hasChanges = true;
                    }
                }
            });

            // Pull tags and settings
            const metaDoc = await this.db
                .collection('users')
                .doc(this.userId)
                .get();

            if (metaDoc.exists) {
                const metaData = metaDoc.data();
                if (metaData.tags) {
                    // Merge tags (union of both)
                    const mergedTags = [...new Set([...localData.tags, ...metaData.tags])];
                    if (mergedTags.length !== localData.tags.length) {
                        localData.tags = mergedTags;
                        hasChanges = true;
                    }
                }
            }

            if (hasChanges) {
                Storage.saveDataLocal(localData);
                console.log('[FirebaseSync] Pulled from cloud. Local data updated.');

                // Re-render the current view
                if (typeof App !== 'undefined') {
                    App.handleRoute();
                }
            } else {
                console.log('[FirebaseSync] Pull complete. No new changes.');
            }

        } catch (error) {
            console.error('[FirebaseSync] Pull failed:', error);
        } finally {
            this.isSyncing = false;
        }
    },

    /**
     * Listen for real-time updates from Firestore.
     * This fires when another device pushes changes.
     */
    listenForChanges() {
        if (!this.isConfigured) return;

        this.db
            .collection('users')
            .doc(this.userId)
            .collection('days')
            .onSnapshot((snapshot) => {
                if (this.isSyncing) return; // Don't trigger during our own writes

                let hasChanges = false;
                const localData = Storage.getData();

                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified' || change.type === 'added') {
                        const dateStr = change.doc.id;
                        const cloudTasks = change.doc.data().tasks || [];
                        const localTasks = localData.tasks[dateStr] || [];

                        const cloudLatest = this.getLatestTimestamp(cloudTasks);
                        const localLatest = this.getLatestTimestamp(localTasks);

                        if (cloudLatest > localLatest) {
                            localData.tasks[dateStr] = cloudTasks;
                            hasChanges = true;
                        }
                    }
                });

                if (hasChanges) {
                    Storage.saveDataLocal(localData);
                    if (typeof App !== 'undefined') {
                        App.handleRoute();
                    }
                    console.log('[FirebaseSync] Real-time update received.');
                }
            }, (error) => {
                console.error('[FirebaseSync] Listener error:', error);
            });
    },

    /**
     * Get the latest updatedAt timestamp from an array of tasks.
     */
    getLatestTimestamp(tasks) {
        if (!tasks || tasks.length === 0) return '';
        return tasks.reduce((latest, task) => {
            return (task.updatedAt || '') > latest ? task.updatedAt : latest;
        }, '');
    }
};
