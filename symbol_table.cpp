/*
 * symbol_table.cpp - Symbol Table Implementation
 * 
 * Manages variables across nested scopes using a stack of maps.
 * Supports declaration, lookup (innermost-first), and duplicate
 * detection within the same scope.
 */

#include "symbol_table.h"
#include <iostream>

// ─────────────────────────────────────────────────────────────────────
// Convert DataType to a printable string
// ─────────────────────────────────────────────────────────────────────
std::string dataTypeToString(DataType type) {
    switch (type) {
        case DataType::INT:     return "int";
        case DataType::FLOAT:   return "float";
        case DataType::CHAR:    return "char";
        case DataType::VOID:    return "void";
        case DataType::UNKNOWN: return "unknown";
        default:                return "???";
    }
}

// ─────────────────────────────────────────────────────────────────────
// Parse a string type name into a DataType enum
// ─────────────────────────────────────────────────────────────────────
DataType stringToDataType(const std::string& typeName) {
    if (typeName == "int")   return DataType::INT;
    if (typeName == "float") return DataType::FLOAT;
    if (typeName == "char")  return DataType::CHAR;
    return DataType::UNKNOWN;
}

// ─────────────────────────────────────────────────────────────────────
// Constructor: start with a single global scope
// ─────────────────────────────────────────────────────────────────────
SymbolTable::SymbolTable() : currentLevel(0) {
    // Push the global scope
    scopes.push_back(std::map<std::string, Symbol>());
}

// ─────────────────────────────────────────────────────────────────────
// Enter a new nested scope (e.g., entering an if/while block)
// ─────────────────────────────────────────────────────────────────────
void SymbolTable::enterScope() {
    currentLevel++;
    scopes.push_back(std::map<std::string, Symbol>());
}

// ─────────────────────────────────────────────────────────────────────
// Exit the current scope (pop the innermost scope)
// ─────────────────────────────────────────────────────────────────────
void SymbolTable::exitScope() {
    if (scopes.size() > 1) {
        scopes.pop_back();
        currentLevel--;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Declare a variable in the current (innermost) scope.
// Returns false if a variable with the same name already exists here.
// ─────────────────────────────────────────────────────────────────────
bool SymbolTable::declare(const std::string& name, DataType type, int line) {
    auto& currentScope = scopes.back();

    // Check for duplicate in the current scope
    if (currentScope.find(name) != currentScope.end()) {
        return false;  // Duplicate declaration
    }

    // Insert the new symbol
    currentScope[name] = Symbol(name, type, currentLevel, line);
    return true;
}

// ─────────────────────────────────────────────────────────────────────
// Look up a variable by name, searching from innermost scope outward.
// This allows inner scopes to shadow outer declarations.
// Returns true if found (fills outSymbol), false if not in any scope.
// ─────────────────────────────────────────────────────────────────────
bool SymbolTable::lookup(const std::string& name, Symbol& outSymbol) const {
    // Search from innermost (back) to outermost (front)
    for (int i = static_cast<int>(scopes.size()) - 1; i >= 0; i--) {
        auto it = scopes[i].find(name);
        if (it != scopes[i].end()) {
            outSymbol = it->second;
            return true;
        }
    }
    return false;  // Not found in any scope
}

// ─────────────────────────────────────────────────────────────────────
// Check if a variable exists ONLY in the current (innermost) scope.
// Used to detect duplicate declarations.
// ─────────────────────────────────────────────────────────────────────
bool SymbolTable::existsInCurrentScope(const std::string& name) const {
    const auto& currentScope = scopes.back();
    return currentScope.find(name) != currentScope.end();
}

// ─────────────────────────────────────────────────────────────────────
// Get the current nesting depth
// ─────────────────────────────────────────────────────────────────────
int SymbolTable::getCurrentLevel() const {
    return currentLevel;
}

// ─────────────────────────────────────────────────────────────────────
// Debug: dump the entire symbol table contents
// ─────────────────────────────────────────────────────────────────────
void SymbolTable::dump() const {
    std::cout << "\n======================================================\n";
    std::cout <<   "              SYMBOL TABLE DUMP                       \n";
    std::cout <<   "======================================================\n";

    for (int i = 0; i < static_cast<int>(scopes.size()); i++) {
        std::cout << "\n  Scope Level " << i << ":\n";
        if (scopes[i].empty()) {
            std::cout << "    (empty)\n";
        }
        for (auto it = scopes[i].begin(); it != scopes[i].end(); ++it) {
            std::cout << "    " << dataTypeToString(it->second.type) 
                      << " " << it->second.name 
                      << " (declared at line " << it->second.declaredLine << ")\n";
        }
    }
    std::cout << "\n";
}
