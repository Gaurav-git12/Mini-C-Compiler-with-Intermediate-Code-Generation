/*
 * semantic.cpp - Semantic Analyzer Implementation
 * 
 * Walks the AST and checks for semantic errors:
 * declaration before use, duplicates, type mismatches,
 * assignment compatibility, and scope management.
 */

#include "semantic.h"
#include <iostream>

// ═══════════════════════════════════════════════════════════════════
//  Public Interface
// ═══════════════════════════════════════════════════════════════════

void SemanticAnalyzer::analyze(Program* program) {
    for (auto& stmt : program->statements) {
        analyzeStatement(stmt.get());
    }
}

void SemanticAnalyzer::printResults() const {
    errorReporter.printErrors();
}

bool SemanticAnalyzer::hasErrors() const {
    return errorReporter.hasErrors();
}

const SymbolTable& SemanticAnalyzer::getSymbolTable() const {
    return symbolTable;
}

// ═══════════════════════════════════════════════════════════════════
//  Statement Analysis
// ═══════════════════════════════════════════════════════════════════

void SemanticAnalyzer::analyzeStatement(Statement* stmt) {
    if (!stmt) return;

    if (auto* varDecl = dynamic_cast<VarDeclStmt*>(stmt)) {
        analyzeVarDecl(varDecl);
    } else if (auto* assign = dynamic_cast<AssignStmt*>(stmt)) {
        analyzeAssignment(assign);
    } else if (auto* ifS = dynamic_cast<IfStmt*>(stmt)) {
        analyzeIfStmt(ifS);
    } else if (auto* whileS = dynamic_cast<WhileStmt*>(stmt)) {
        analyzeWhileStmt(whileS);
    } else if (auto* block = dynamic_cast<BlockStmt*>(stmt)) {
        analyzeBlock(block);
    }
}

// ─── Variable Declaration ─────────────────────────────────────────
void SemanticAnalyzer::analyzeVarDecl(VarDeclStmt* stmt) {
    DataType type = stringToDataType(stmt->typeName);

    // Check for unknown type
    if (type == DataType::UNKNOWN) {
        errorReporter.report(
            "Unknown type '" + stmt->typeName + "'",
            stmt->line, ErrorSeverity::ERROR);
        return;
    }

    // Check for duplicate declaration in current scope
    if (symbolTable.existsInCurrentScope(stmt->varName)) {
        errorReporter.report(
            "Duplicate declaration of variable '" + stmt->varName + "'",
            stmt->line, ErrorSeverity::ERROR);
        return;
    }

    // Register the variable in the symbol table
    symbolTable.declare(stmt->varName, type, stmt->line);

    // If there's an initializer, check type compatibility
    if (stmt->initializer) {
        DataType initType = analyzeExpression(stmt->initializer.get());
        if (initType != DataType::UNKNOWN) {
            isAssignmentCompatible(type, initType, stmt->line);
        }
    }
}

// ─── Assignment Statement ─────────────────────────────────────────
void SemanticAnalyzer::analyzeAssignment(AssignStmt* stmt) {
    // Check that the variable exists
    Symbol sym;
    if (!symbolTable.lookup(stmt->varName, sym)) {
        errorReporter.report(
            "Undeclared variable '" + stmt->varName + "'",
            stmt->line, ErrorSeverity::ERROR);
        return;
    }

    // Analyze the RHS expression and check type compatibility
    DataType rhsType = analyzeExpression(stmt->value.get());
    if (rhsType != DataType::UNKNOWN) {
        isAssignmentCompatible(sym.type, rhsType, stmt->line);
    }
}

// ─── If Statement ─────────────────────────────────────────────────
void SemanticAnalyzer::analyzeIfStmt(IfStmt* stmt) {
    // Analyze the condition expression
    analyzeExpression(stmt->condition.get());

    // Analyze the then-branch in a new scope
    if (stmt->thenBranch) {
        analyzeStatement(stmt->thenBranch.get());
    }

    // Analyze the else-branch in a new scope (if present)
    if (stmt->elseBranch) {
        analyzeStatement(stmt->elseBranch.get());
    }
}

// ─── While Statement ─────────────────────────────────────────────
void SemanticAnalyzer::analyzeWhileStmt(WhileStmt* stmt) {
    analyzeExpression(stmt->condition.get());

    if (stmt->body) {
        analyzeStatement(stmt->body.get());
    }
}

// ─── Block Statement (creates new scope) ─────────────────────────
void SemanticAnalyzer::analyzeBlock(BlockStmt* block) {
    symbolTable.enterScope();
    for (auto& stmt : block->statements) {
        analyzeStatement(stmt.get());
    }
    symbolTable.exitScope();
}

// ═══════════════════════════════════════════════════════════════════
//  Expression Analysis (returns the DataType of the expression)
// ═══════════════════════════════════════════════════════════════════

DataType SemanticAnalyzer::analyzeExpression(Expression* expr) {
    if (!expr) return DataType::UNKNOWN;

    if (auto* bin = dynamic_cast<BinaryExpr*>(expr)) {
        return analyzeBinaryExpr(bin);
    }
    if (auto* id = dynamic_cast<IdentifierExpr*>(expr)) {
        return analyzeIdentifier(id);
    }
    if (dynamic_cast<IntLiteralExpr*>(expr)) {
        return DataType::INT;
    }
    if (dynamic_cast<FloatLiteralExpr*>(expr)) {
        return DataType::FLOAT;
    }
    if (dynamic_cast<CharLiteralExpr*>(expr)) {
        return DataType::CHAR;
    }

    return DataType::UNKNOWN;
}

// ─── Binary Expression ───────────────────────────────────────────
DataType SemanticAnalyzer::analyzeBinaryExpr(BinaryExpr* expr) {
    DataType leftType = analyzeExpression(expr->left.get());
    DataType rightType = analyzeExpression(expr->right.get());

    return checkTypeCompatibility(leftType, rightType, 
                                   expr->line, "expression '" + expr->op + "'");
}

// ─── Identifier (variable reference) ─────────────────────────────
DataType SemanticAnalyzer::analyzeIdentifier(IdentifierExpr* expr) {
    Symbol sym;
    if (!symbolTable.lookup(expr->name, sym)) {
        errorReporter.report(
            "Undeclared variable '" + expr->name + "'",
            expr->line, ErrorSeverity::ERROR);
        return DataType::UNKNOWN;
    }
    return sym.type;
}

// ═══════════════════════════════════════════════════════════════════
//  Type Compatibility
// ═══════════════════════════════════════════════════════════════════

/*
 * Check if two types can be used together in an expression.
 * Implicit promotions (with warning):
 *   char → int, char → float, int → float
 */
DataType SemanticAnalyzer::checkTypeCompatibility(
        DataType left, DataType right, int line, const std::string& ctx) {
    
    if (left == DataType::UNKNOWN || right == DataType::UNKNOWN)
        return DataType::UNKNOWN;

    // Same types are always compatible
    if (left == right) return left;

    // int + float → float (promote int)
    if ((left == DataType::INT && right == DataType::FLOAT) ||
        (left == DataType::FLOAT && right == DataType::INT)) {
        errorReporter.report(
            "Implicit int→float promotion in " + ctx,
            line, ErrorSeverity::WARNING);
        return DataType::FLOAT;
    }

    // char + int → int (promote char)
    if ((left == DataType::CHAR && right == DataType::INT) ||
        (left == DataType::INT && right == DataType::CHAR)) {
        errorReporter.report(
            "Implicit char→int promotion in " + ctx,
            line, ErrorSeverity::WARNING);
        return DataType::INT;
    }

    // char + float → float (promote char)
    if ((left == DataType::CHAR && right == DataType::FLOAT) ||
        (left == DataType::FLOAT && right == DataType::CHAR)) {
        errorReporter.report(
            "Implicit char→float promotion in " + ctx,
            line, ErrorSeverity::WARNING);
        return DataType::FLOAT;
    }

    // Incompatible types
    errorReporter.report(
        "Type mismatch in " + ctx + ": " +
        dataTypeToString(left) + " vs " + dataTypeToString(right),
        line, ErrorSeverity::ERROR);
    return DataType::UNKNOWN;
}

/*
 * Check assignment compatibility (target = source)
 * Same promotion rules apply but reports assignment-specific messages.
 */
bool SemanticAnalyzer::isAssignmentCompatible(
        DataType target, DataType source, int line) {
    
    if (target == DataType::UNKNOWN || source == DataType::UNKNOWN)
        return true; // already errored

    if (target == source) return true;

    // Allowed promotions: char→int, char→float, int→float
    if (target == DataType::FLOAT && 
        (source == DataType::INT || source == DataType::CHAR)) {
        errorReporter.report(
            "Implicit " + dataTypeToString(source) + 
            "→float promotion in assignment",
            line, ErrorSeverity::WARNING);
        return true;
    }
    if (target == DataType::INT && source == DataType::CHAR) {
        errorReporter.report(
            "Implicit char→int promotion in assignment",
            line, ErrorSeverity::WARNING);
        return true;
    }

    // Narrowing or incompatible
    errorReporter.report(
        "Type mismatch in assignment: cannot assign " +
        dataTypeToString(source) + " to " + dataTypeToString(target),
        line, ErrorSeverity::ERROR);
    return false;
}
