/*
 * semantic.h - Semantic Analyzer
 * 
 * Walks the AST and performs:
 *   1. Declaration Checking
 *   2. Duplicate Declaration
 *   3. Type Checking
 *   4. Assignment Validation
 *   5. Scope Management
 */

#ifndef SEMANTIC_H
#define SEMANTIC_H

#include "parser.h"
#include "symbol_table.h"
#include "error.h"

class SemanticAnalyzer {
private:
    SymbolTable symbolTable;
    ErrorReporter errorReporter;

    void analyzeStatement(Statement* stmt);
    void analyzeVarDecl(VarDeclStmt* stmt);
    void analyzeAssignment(AssignStmt* stmt);
    void analyzeIfStmt(IfStmt* stmt);
    void analyzeWhileStmt(WhileStmt* stmt);
    void analyzeBlock(BlockStmt* block);

    DataType analyzeExpression(Expression* expr);
    DataType analyzeBinaryExpr(BinaryExpr* expr);
    DataType analyzeIdentifier(IdentifierExpr* expr);

    DataType checkTypeCompatibility(DataType left, DataType right, 
                                     int line, const std::string& context);
    bool isAssignmentCompatible(DataType target, DataType source, int line);

public:
    void analyze(Program* program);
    void printResults() const;
    bool hasErrors() const;
    const SymbolTable& getSymbolTable() const;
};

#endif
