/*
 * symbol_table.h - Symbol Table with Scope Management
 * 
 * Implements a stack-based symbol table that supports nested scopes.
 * Each scope is a map of variable names to Symbol entries.
 * When entering a new block (e.g., if/while body), a new scope is 
 * pushed. When leaving, it is popped.
 * 
 * Lookup searches from the innermost scope outward, allowing
 * inner scopes to shadow outer declarations.
 */

#ifndef SYMBOL_TABLE_H
#define SYMBOL_TABLE_H

#include <string>
#include <map>
#include <vector>

// Supported data types in our C subset
enum class DataType {
    INT,
    FLOAT,
    CHAR,
    VOID,       // Used for expressions with errors
    UNKNOWN     // Placeholder for unresolved types
};

// Convert a DataType enum to a human-readable string
std::string dataTypeToString(DataType type);

// Parse a type name string ("int", "float", "char") into DataType
DataType stringToDataType(const std::string& typeName);

// Represents a single symbol (variable) in the table
struct Symbol {
    std::string name;       // Variable name
    DataType type;          // Data type (int, float, char)
    int scopeLevel;         // Nesting depth where declared (0 = global)
    int declaredLine;       // Line number of declaration

    Symbol() : name(""), type(DataType::UNKNOWN), scopeLevel(0), declaredLine(0) {}
    Symbol(const std::string& n, DataType t, int scope, int line)
        : name(n), type(t), scopeLevel(scope), declaredLine(line) {}
};

/*
 * SymbolTable - Stack-based scope manager.
 * 
 * The table maintains a vector of maps (acting as a stack).
 * Index 0 is the global scope, and higher indices are nested scopes.
 * 
 * Usage:
 *   SymbolTable table;
 *   table.enterScope();                        // Enter new block
 *   table.declare("x", DataType::INT, 3);      // Declare variable
 *   auto sym = table.lookup("x");              // Look up variable
 *   table.exitScope();                         // Leave block
 */
class SymbolTable {
private:
    // Stack of scopes: each scope is a map from name -> Symbol
    std::vector<std::map<std::string, Symbol>> scopes;
    int currentLevel;   // Current nesting depth

public:
    SymbolTable();

    // Enter a new scope (push a new map onto the stack)
    void enterScope();

    // Exit the current scope (pop the top map)
    void exitScope();

    // Declare a variable in the CURRENT scope.
    // Returns false if the variable already exists in this scope.
    bool declare(const std::string& name, DataType type, int line);

    // Look up a variable by name, searching from innermost to outermost scope.
    // Returns true if found (and fills 'outSymbol'), false otherwise.
    bool lookup(const std::string& name, Symbol& outSymbol) const;

    // Check if a variable is declared in the CURRENT (innermost) scope only.
    // Used for duplicate declaration checking.
    bool existsInCurrentScope(const std::string& name) const;

    // Get the current scope depth
    int getCurrentLevel() const;

    // Print the entire symbol table (for debugging)
    void dump() const;
};

#endif // SYMBOL_TABLE_H
