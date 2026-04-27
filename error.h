/*
 * error.h - Error Reporting Module
 * 
 * Provides a centralized error reporting system for the semantic analyzer.
 * Errors are collected with line numbers and severity levels, then
 * printed in a clear, user-friendly format at the end of analysis.
 */

#ifndef ERROR_H
#define ERROR_H

#include <string>
#include <vector>
#include <iostream>

// Severity levels for reported errors
enum class ErrorSeverity {
    WARNING,    // Non-fatal issues (e.g., implicit type promotion)
    ERROR       // Fatal semantic errors
};

// Represents a single error/warning with context
struct ErrorEntry {
    std::string message;        // Human-readable error description
    int line;                   // Line number where error occurred
    ErrorSeverity severity;     // WARNING or ERROR

    ErrorEntry(const std::string& msg, int ln, ErrorSeverity sev)
        : message(msg), line(ln), severity(sev) {}
};

/*
 * ErrorReporter - Collects and displays semantic errors.
 * 
 * Usage:
 *   ErrorReporter reporter;
 *   reporter.report("Undeclared variable 'x'", 5, ErrorSeverity::ERROR);
 *   reporter.printErrors();
 */
class ErrorReporter {
private:
    std::vector<ErrorEntry> errors;     // All collected errors
    int errorCount = 0;                 // Number of ERROR-level entries
    int warningCount = 0;               // Number of WARNING-level entries

public:
    // Report a new error or warning at the given line number
    void report(const std::string& message, int line, 
                ErrorSeverity severity = ErrorSeverity::ERROR);

    // Print all collected errors to stdout
    void printErrors() const;

    // Check if any ERROR-level entries exist
    bool hasErrors() const;

    // Get total number of errors
    int getErrorCount() const;

    // Get total number of warnings
    int getWarningCount() const;

    // Clear all collected errors
    void clear();
};

#endif // ERROR_H
