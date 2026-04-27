/*
 * parser.h - Parser and AST Definitions
 * 
 * Defines the Abstract Syntax Tree (AST) node hierarchy and the
 * recursive descent Parser that converts a token stream into an AST.
 * 
 * AST Node Hierarchy:
 * 
 *   ASTNode (base)
 *     ├── Expression (base for all expressions)
 *     │   ├── BinaryExpr       (left op right)
 *     │   ├── IdentifierExpr   (variable reference)
 *     │   ├── IntLiteralExpr   (integer constant)
 *     │   ├── FloatLiteralExpr (float constant)
 *     │   └── CharLiteralExpr  (char constant)
 *     │
 *     └── Statement (base for all statements)
 *         ├── VarDeclStmt      (type name ;)
 *         ├── AssignStmt       (name = expr ;)
 *         ├── IfStmt           (if (expr) block [else block])
 *         ├── WhileStmt        (while (expr) block)
 *         └── BlockStmt        ({ stmt* })
 *
 *   Program                    (list of statements)
 */

#ifndef PARSER_H
#define PARSER_H

#include "lexer.h"
#include <memory>
#include <vector>
#include <string>

// ═══════════════════════════════════════════════════════════════════════
//  AST Node Definitions
// ═══════════════════════════════════════════════════════════════════════

// ─── Base Node ───────────────────────────────────────────────────────
struct ASTNode {
    int line;   // Line number in source (for error reporting)
    ASTNode(int ln = 0) : line(ln) {}
    virtual ~ASTNode() = default;
};

// ─── Expression Nodes ────────────────────────────────────────────────
// Base class for all expressions
struct Expression : ASTNode {
    using ASTNode::ASTNode;
};

// Binary expression: left op right  (e.g., a + b, x * 3)
struct BinaryExpr : Expression {
    std::string op;                         // Operator: "+", "-", "*", "/", etc.
    std::unique_ptr<Expression> left;       // Left operand
    std::unique_ptr<Expression> right;      // Right operand

    BinaryExpr(int ln, const std::string& oper,
               std::unique_ptr<Expression> l, 
               std::unique_ptr<Expression> r)
        : Expression(ln), op(oper), 
          left(std::move(l)), right(std::move(r)) {}
};

// Variable reference: just a name (e.g., x, myVar)
struct IdentifierExpr : Expression {
    std::string name;

    IdentifierExpr(int ln, const std::string& n) 
        : Expression(ln), name(n) {}
};

// Integer literal (e.g., 42, 0, 100)
struct IntLiteralExpr : Expression {
    int value;

    IntLiteralExpr(int ln, int v) : Expression(ln), value(v) {}
};

// Float literal (e.g., 3.14, 0.5)
struct FloatLiteralExpr : Expression {
    float value;

    FloatLiteralExpr(int ln, float v) : Expression(ln), value(v) {}
};

// Char literal (e.g., 'a', 'Z')
struct CharLiteralExpr : Expression {
    char value;

    CharLiteralExpr(int ln, char v) : Expression(ln), value(v) {}
};

// ─── Statement Nodes ─────────────────────────────────────────────────
// Base class for all statements
struct Statement : ASTNode {
    using ASTNode::ASTNode;
};

// Variable declaration (e.g., int x; or float y = 3.14;)
struct VarDeclStmt : Statement {
    std::string typeName;                       // "int", "float", "char"
    std::string varName;                        // Variable name
    std::unique_ptr<Expression> initializer;    // Optional initializer

    VarDeclStmt(int ln, const std::string& t, const std::string& n,
                std::unique_ptr<Expression> init = nullptr)
        : Statement(ln), typeName(t), varName(n), 
          initializer(std::move(init)) {}
};

// Assignment statement (e.g., x = 10;)
struct AssignStmt : Statement {
    std::string varName;                    // Variable being assigned
    std::unique_ptr<Expression> value;      // Right-hand side expression

    AssignStmt(int ln, const std::string& n, std::unique_ptr<Expression> v)
        : Statement(ln), varName(n), value(std::move(v)) {}
};

// If statement with optional else block
struct IfStmt : Statement {
    std::unique_ptr<Expression> condition;      // Condition expression
    std::unique_ptr<Statement> thenBranch;      // "then" block
    std::unique_ptr<Statement> elseBranch;      // Optional "else" block

    IfStmt(int ln, std::unique_ptr<Expression> cond,
           std::unique_ptr<Statement> thenB,
           std::unique_ptr<Statement> elseB = nullptr)
        : Statement(ln), condition(std::move(cond)),
          thenBranch(std::move(thenB)), elseBranch(std::move(elseB)) {}
};

// While loop
struct WhileStmt : Statement {
    std::unique_ptr<Expression> condition;      // Loop condition
    std::unique_ptr<Statement> body;            // Loop body

    WhileStmt(int ln, std::unique_ptr<Expression> cond,
              std::unique_ptr<Statement> b)
        : Statement(ln), condition(std::move(cond)), body(std::move(b)) {}
};

// Block of statements: { stmt1; stmt2; ... }
struct BlockStmt : Statement {
    std::vector<std::unique_ptr<Statement>> statements;

    BlockStmt(int ln) : Statement(ln) {}
};

// ─── Program (root of the AST) ──────────────────────────────────────
struct Program {
    std::vector<std::unique_ptr<Statement>> statements;
};

// ═══════════════════════════════════════════════════════════════════════
//  Parser
// ═══════════════════════════════════════════════════════════════════════

/*
 * Parser - Recursive descent parser for the C subset.
 * 
 * Takes a vector of tokens from the lexer and builds an AST.
 * Uses recursive descent with the following grammar (simplified):
 * 
 *   program     → statement*
 *   statement   → varDecl | assignment | ifStmt | whileStmt | block
 *   varDecl     → type IDENTIFIER ['=' expr] ';'
 *   assignment  → IDENTIFIER '=' expr ';'
 *   ifStmt      → 'if' '(' expr ')' block ['else' block]
 *   whileStmt   → 'while' '(' expr ')' block
 *   block       → '{' statement* '}'
 *   expr        → comparison
 *   comparison  → addition (('==' | '!=' | '<' | '>' | '<=' | '>=') addition)*
 *   addition    → multiplication (('+' | '-') multiplication)*
 *   multiplication → primary (('*' | '/') primary)*
 *   primary     → INT_LITERAL | FLOAT_LITERAL | CHAR_LITERAL 
 *                | IDENTIFIER | '(' expr ')'
 * 
 * Usage:
 *   Parser parser(tokens);
 *   auto program = parser.parse();
 */
class Parser {
private:
    std::vector<Token> tokens;  // Token stream from lexer
    int current;                // Current token index

    // ── Token navigation ─────────────────────────────────────────
    // Get the current token
    const Token& peek() const;

    // Get the previous token (last consumed)
    const Token& previous() const;

    // Check if we've reached the end of tokens
    bool isAtEnd() const;

    // Advance to the next token and return the consumed token
    const Token& advance();

    // Check if current token matches the given type
    bool check(TokenType type) const;

    // If current token matches, consume it and return true
    bool match(TokenType type);

    // Expect a specific token type; print error if not found
    bool expect(TokenType type, const std::string& errorMsg);

    // ── Parsing rules (one per grammar rule) ─────────────────────
    std::unique_ptr<Statement> parseStatement();
    std::unique_ptr<VarDeclStmt> parseVarDecl(const std::string& typeName, int ln);
    std::unique_ptr<AssignStmt> parseAssignment(const std::string& name, int ln);
    std::unique_ptr<IfStmt> parseIfStatement();
    std::unique_ptr<WhileStmt> parseWhileStatement();
    std::unique_ptr<BlockStmt> parseBlock();

    // ── Expression parsing (precedence climbing) ─────────────────
    std::unique_ptr<Expression> parseExpression();
    std::unique_ptr<Expression> parseComparison();
    std::unique_ptr<Expression> parseAddition();
    std::unique_ptr<Expression> parseMultiplication();
    std::unique_ptr<Expression> parsePrimary();

    // Check if a token type is a type keyword (int, float, char)
    bool isTypeKeyword(TokenType type) const;

public:
    explicit Parser(const std::vector<Token>& tokenList);

    // Parse the entire token stream and return a Program AST
    std::unique_ptr<Program> parse();
};

#endif // PARSER_H
