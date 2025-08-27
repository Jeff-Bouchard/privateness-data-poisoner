// logging.js - File-based logging system for Privateness Data Poisoner
// Provides reproducible logging and cloning capabilities

class PoisoningLogger {
  constructor() {
    this.logEntries = [];
    this.storageKey = 'privateness_poisoning_log';
    this.maxEntries = 10000; // Prevent memory bloat
    this.loadFromStorage();
  }

  // Log a poisoning event with full reproducibility data
  logPoisoning(event) {
    const entry = {
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      origin: event.origin,
      url: event.originalUrl,
      poisonedUrl: event.poisonedUrl,
      schema: event.schema,
      masterPassword: event.masterPassword ? '[SET]' : '[NONE]', // Don't log actual password
      persona: event.persona,
      headers: event.headers ? Object.fromEntries(event.headers.entries()) : {},
      method: event.method || 'GET',
      body: event.body || null,
      requestId: event.requestId || null,
      tabId: event.tabId || null
    };

    this.logEntries.push(entry);
    
    // Trim old entries if needed
    if (this.logEntries.length > this.maxEntries) {
      this.logEntries = this.logEntries.slice(-this.maxEntries);
    }
    
    this.saveToStorage();
    return entry;
  }

  // Get logs with optional filtering
  getLogs(filter = {}) {
    let filtered = [...this.logEntries];
    
    if (filter.origin) {
      filtered = filtered.filter(entry => entry.origin === filter.origin);
    }
    
    if (filter.schema) {
      filtered = filtered.filter(entry => entry.schema === filter.schema);
    }
    
    if (filter.since) {
      filtered = filtered.filter(entry => entry.timestamp >= filter.since);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    
    return filtered;
  }

  // Export logs as JSON for cloning/backup
  exportLogs() {
    return JSON.stringify({
      version: '1.0',
      exported: new Date().toISOString(),
      entries: this.logEntries
    }, null, 2);
  }

  // Import logs from JSON
  importLogs(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data.entries && Array.isArray(data.entries)) {
        this.logEntries = data.entries;
        this.saveToStorage();
        return { success: true, count: data.entries.length };
      }
      return { success: false, error: 'Invalid format' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Clear all logs
  clearLogs() {
    this.logEntries = [];
    this.saveToStorage();
  }

  // Get statistics
  getStats() {
    const total = this.logEntries.length;
    const origins = new Set(this.logEntries.map(e => e.origin)).size;
    const schemas = {};
    
    this.logEntries.forEach(entry => {
      schemas[entry.schema] = (schemas[entry.schema] || 0) + 1;
    });
    
    const oldest = total > 0 ? this.logEntries[0].timestamp : null;
    const newest = total > 0 ? this.logEntries[total - 1].timestamp : null;
    
    return {
      totalEntries: total,
      uniqueOrigins: origins,
      schemaBreakdown: schemas,
      timeRange: oldest && newest ? {
        oldest: new Date(oldest).toISOString(),
        newest: new Date(newest).toISOString(),
        spanHours: Math.round((newest - oldest) / (1000 * 60 * 60))
      } : null
    };
  }

  // Reproduce a specific poisoning event
  reproduceEvent(entryId) {
    const entry = this.logEntries.find(e => e.requestId === entryId);
    if (!entry) return null;
    
    return {
      canReproduce: true,
      instructions: `To reproduce this event:
1. Set master password: ${entry.masterPassword}
2. Navigate to origin: ${entry.origin}
3. Trigger request to: ${entry.url}
4. Expected schema: ${entry.schema}
5. Expected persona: ${JSON.stringify(entry.persona, null, 2)}`
    };
  }

  // Private storage methods
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logEntries = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load poisoning logs:', e);
      this.logEntries = [];
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logEntries));
    } catch (e) {
      console.warn('Failed to save poisoning logs:', e);
    }
  }
}

// Global logger instance
const poisoningLogger = new PoisoningLogger();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PoisoningLogger, poisoningLogger };
} else if (typeof window !== 'undefined') {
  window.poisoningLogger = poisoningLogger;
}
