/*
 * error.cpp - Error Reporting Implementation
 * 
 * Implements the ErrorReporter class for collecting and displaying
 * semantic errors with line numbers, severity, and clear formatting.
 */

#include "error.h"
#include <iomanip>

// ─────────────────────────────────────────────────────────────────────
// Report a new error or warning
// ─────────────────────────────────────────────────────────────────────
void ErrorReporter::report(const std::string& message, int line, 
                           ErrorSeverity severity) {
    errors.emplace_back(message, line, severity);
    if (severity == ErrorSeverity::ERROR) {
        errorCount++;
    } else {
        warningCount++;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Print all collected errors in a clear, formatted manner
// ─────────────────────────────────────────────────────────────────────
void ErrorReporter::printErrors() const {
    if (errors.empty()) {
        std::cout << "\n✅ Semantic analysis completed successfully. "
                  << "No errors found.\n";
        return;
    }

    std::cout << "\n╔══════════════════════════════════════════════════════╗\n";
    std::cout <<   "║           SEMANTIC ANALYSIS RESULTS                 ║\n";
    std::cout <<   "╚══════════════════════════════════════════════════════╝\n\n";

    for (const auto& entry : errors) {
        // Print severity tag with color hint
        if (entry.severity == ErrorSeverity::ERROR) {
            std::cout << "  ❌ Error";
        } else {
            std::cout << "  ⚠️  Warning";
        }

        // Print line number and message
        std::cout << " (line " << entry.line << "): " 
                  << entry.message << "\n";
    }

    // Print summary
    std::cout << "\n──────────────────────────────────────────────────────\n";
    std::cout << "  Summary: " << errorCount << " error(s), " 
              << warningCount << " warning(s)\n";
    std::cout << "──────────────────────────────────────────────────────\n";
}

// ─────────────────────────────────────────────────────────────────────
// Check if any fatal errors were reported
// ─────────────────────────────────────────────────────────────────────
bool ErrorReporter::hasErrors() const {
    return errorCount > 0;
}

// ─────────────────────────────────────────────────────────────────────
// Getters for error and warning counts
// ─────────────────────────────────────────────────────────────────────
int ErrorReporter::getErrorCount() const {
    return errorCount;
}

int ErrorReporter::getWarningCount() const {
    return warningCount;
}

// ─────────────────────────────────────────────────────────────────────
// Clear all collected errors (useful for re-analysis)
// ─────────────────────────────────────────────────────────────────────
void ErrorReporter::clear() {
    errors.clear();
    errorCount = 0;
    warningCount = 0;
}
