/**
 * DayScore Export Logic (Phase 6)
 * Handles CSV generation and downloading.
 */

const Exporter = {
    init() {
        const btn = document.getElementById('btn-export-csv');
        if (!btn) return;
        
        btn.addEventListener('click', () => this.handleExport());
        
        // Set default dates
        const fromDate = document.getElementById('export-date-from');
        const toDate = document.getElementById('export-date-to');
        
        if (fromDate && toDate) {
            const todayStr = Storage.getTodayDate();
            
            // Default From: 30 days ago
            const d = new Date(todayStr + 'T12:00:00');
            d.setDate(d.getDate() - 30);
            fromDate.value = d.toISOString().split('T')[0];
            
            // Default To: today
            toDate.value = todayStr;
        }
    },

    handleExport() {
        const fromDate = document.getElementById('export-date-from').value;
        const toDate = document.getElementById('export-date-to').value;
        
        if (!fromDate || !toDate) {
            alert('Please select both From and To dates.');
            return;
        }
        
        if (fromDate > toDate) {
            alert('From Date cannot be after To Date.');
            return;
        }

        const csvString = this.generateCSV(fromDate, toDate);
        if (!csvString) {
            alert('No data found for the selected date range.');
            return;
        }

        this.downloadCSV(csvString, `DayScore_Export_${fromDate}_to_${toDate}.csv`);
    },

    generateCSV(fromDate, toDate) {
        const allDates = Storage.getAllDates();
        
        // Filter dates based on range
        const validDates = allDates.filter(date => date >= fromDate && date <= toDate);
        
        if (validDates.length === 0) return null;

        // CSV Headers based on PRD requirements
        // We include both Day-level stats and Task-level details in the same row.
        const headers = [
            "Date", 
            "Day Total Tasks", 
            "Day Done Tasks", 
            "Day Partial Tasks",
            "Day Skipped Tasks",
            "Day Score Pct",
            "Task ID",
            "Task Title",
            "Status",
            "Planned",
            "Priority",
            "Time Estimated (min)",
            "Category",
            "Actual Note",
            "Task Created At",
            "Task Updated At"
        ];

        let csvRows = [];
        csvRows.push(headers.map(this.escapeCSV).join(','));

        validDates.forEach(dateStr => {
            const tasks = Storage.getTasksByDate(dateStr);
            if (tasks.length === 0) return; // Skip empty days

            // Calculate Day-level stats
            let dayTotal = tasks.length;
            let dayDone = 0;
            let dayPartial = 0;
            let daySkipped = 0;

            tasks.forEach(t => {
                if (t.status === 'done') dayDone++;
                else if (t.status === 'partial') dayPartial++;
                else if (t.status === 'not_done') daySkipped++;
            });

            const dayScorePct = dayTotal > 0 
                ? Math.round(((dayDone + dayPartial * 0.5) / dayTotal) * 100)
                : 0;

            // Generate a row for each task
            tasks.forEach(task => {
                const row = [
                    dateStr,
                    dayTotal,
                    dayDone,
                    dayPartial,
                    daySkipped,
                    dayScorePct,
                    task.id,
                    task.title,
                    task.status || 'unmarked',
                    task.planned === false ? 'FALSE' : 'TRUE',
                    task.priority || 'Medium',
                    task.estimatedMinutes || '',
                    task.category || '',
                    this.combineNotes(task),
                    task.createdAt || '',
                    task.updatedAt || ''
                ];
                csvRows.push(row.map(this.escapeCSV).join(','));
            });
        });

        return csvRows.join('\n');
    },

    combineNotes(task) {
        let combined = [];
        if (task.actualDescription) combined.push(`Actual: ${task.actualDescription}`);
        if (task.note) combined.push(`Note: ${task.note}`);
        return combined.join(' | ');
    },

    escapeCSV(field) {
        if (field === null || field === undefined) {
            return '""';
        }
        
        let str = String(field);
        
        // If field contains comma, quote, or newline, it needs quoting and escaping
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            str = str.replace(/"/g, '""'); // Escape quotes by doubling them
            return `"${str}"`;
        }
        
        return str;
    },

    downloadCSV(csvString, filename) {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// Initialize exporter when DOM is ready
document.addEventListener('DOMContentLoaded', () => Exporter.init());
