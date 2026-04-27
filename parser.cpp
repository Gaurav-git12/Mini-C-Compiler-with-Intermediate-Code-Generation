/*
 * parser.cpp - Recursive Descent Parser Implementation
 * 
 * Converts a stream of tokens into an Abstract Syntax Tree (AST).
 * Uses recursive descent with operator precedence for expressions.
 * 
 * Grammar (simplified):
 *   program        → statement*
 *   statement      → varDecl | assignment | ifStmt | whileStmt | block
 *   varDecl        → type IDENTIFIER ['=' expr] ';'
 *   assignment     → IDENTIFIER '=' expr ';'
 *   ifStmt         → 'if' '(' expr ')' block ['else' block]
 *   whileStmt      → 'while' '(' expr ')' block
 *   block          → '{' statement* '}'
 *   expr           → comparison
 *   comparison     → addition (compOp addition)*
 *   addition       → multiplication (('+' | '-') multiplication)*
 *   multiplication → primary (('*' | '/') primary)*
 *   primary        → literal | IDENTIFIER | '(' expr ')'
 */

#include "parser.h"
#include <iostream>
#include <stdexcept>

// ═══════════════════════════════════════════════════════════════════════
//  Constructor
// ═══════════════════════════════════════════════════════════════════════
Parser::Parser(const std::vector<Token>& tokenList) 
    : tokens(tokenList), current(0) {}

// ═══════════════════════════════════════════════════════════════════════
//  Token Navigation Helpers
// ═══════════════════════════════════════════════════════════════════════

const Token& Parser::peek() const {
    return tokens[current];
}

const Token& Parser::previous() const {
    return tokens[current - 1];
}

bool Parser::isAtEnd() const {
    return peek().type == TokenType::END_OF_FILE;
}

const Token& Parser::advance() {
    if (!isAtEnd()) current++;
    return previous();
}

bool Parser::check(TokenType type) const {
    if (isAtEnd()) return false;
    return peek().type == type;
}

bool Parser::match(TokenType type) {
    if (check(type)) {
        advance();
        return true;
    }
    return false;
}

// Expect a token of a specific type; report error if not found
bool Parser::expect(TokenType type, const std::string& errorMsg) {
    if (check(type)) {
        advance();
        return true;
    }
    std::cerr << "  Parse Error (line " << peek().line << "): " 
              << errorMsg << " (got '" << peek().value << "')\n";
    return false;
}

// Check if a token type represents a C type keyword
bool Parser::isTypeKeyword(TokenType type) const {
    return type == TokenType::KW_INT || 
           type == TokenType::KW_FLOAT || 
           type == TokenType::KW_CHAR;
}

// ═══════════════════════════════════════════════════════════════════════
//  Top-level parse: build the entire Program
// ═══════════════════════════════════════════════════════════════════════
std::unique_ptr<Program> Parser::parse() {
    auto program = std::make_unique<Program>();

    while (!isAtEnd()) {
        auto stmt = parseStatement();
        if (stmt) {
            program->statements.push_back(std::move(stmt));
        } else {
            // Skip problematic token to avoid infinite loops
            advance();
        }
    }

    return program;
}

// ═══════════════════════════════════════════════════════════════════════
//  Statement Parsing
// ═══════════════════════════════════════════════════════════════════════

/*
 * parseStatement - Determine what kind of statement we're looking at
 * and delegate to the appropriate parse function.
 */
std::unique_ptr<Statement> Parser::parseStatement() {
    // Variable declaration: starts with a type keyword
    if (isTypeKeyword(peek().type)) {
        Token typeToken = advance();    // consume the type keyword
        int ln = typeToken.line;
        std::string typeName = typeToken.value;

        if (check(TokenType::IDENTIFIER)) {
            return parseVarDecl(typeName, ln);
        } else {
            std::cerr << "  Parse Error (line " << ln 
                      << "): Expected identifier after type '" 
                      << typeName << "'\n";
            return nullptr;
        }
    }

    // Assignment: starts with an identifier followed by '='
    if (check(TokenType::IDENTIFIER)) {
        // Look ahead to distinguish assignment from expression-statement
        Token idToken = advance();
        int ln = idToken.line;

        if (check(TokenType::ASSIGN)) {
            return parseAssignment(idToken.value, ln);
        }

        // If not an assignment, backtrack (not supported as expression-statement)
        current--;
        std::cerr << "  Parse Error (line " << ln 
                  << "): Unexpected identifier '" << idToken.value 
                  << "' (expected declaration or assignment)\n";
        advance(); // skip to avoid infinite loop
        return nullptr;
    }

    // If statement
    if (match(TokenType::KW_IF)) {
        return parseIfStatement();
    }

    // While statement
    if (match(TokenType::KW_WHILE)) {
        return parseWhileStatement();
    }

    // Block: { ... }
    if (check(TokenType::LBRACE)) {
        return parseBlock();
    }

    // Unrecognized token
    std::cerr << "  Parse Error (line " << peek().line 
              << "): Unexpected token '" << peek().value << "'\n";
    return nullptr;
}

// ─────────────────────────────────────────────────────────────────────
// Parse variable declaration: type IDENTIFIER ['=' expr] ';'
// Type keyword has already been consumed; IDENTIFIER is next.
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<VarDeclStmt> Parser::parseVarDecl(const std::string& typeName, int ln) {
    Token nameToken = advance();    // consume IDENTIFIER
    std::string varName = nameToken.value;
    std::unique_ptr<Expression> init = nullptr;

    // Check for optional initializer
    if (match(TokenType::ASSIGN)) {
        init = parseExpression();
    }

    expect(TokenType::SEMICOLON, "Expected ';' after variable declaration");

    return std::make_unique<VarDeclStmt>(ln, typeName, varName, std::move(init));
}

// ─────────────────────────────────────────────────────────────────────
// Parse assignment: IDENTIFIER '=' expr ';'
// IDENTIFIER has been consumed; '=' is next.
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<AssignStmt> Parser::parseAssignment(const std::string& name, int ln) {
    advance(); // consume '='

    auto value = parseExpression();
    expect(TokenType::SEMICOLON, "Expected ';' after assignment");

    return std::make_unique<AssignStmt>(ln, name, std::move(value));
}

// ─────────────────────────────────────────────────────────────────────
// Parse if statement: 'if' '(' expr ')' block ['else' block]
// 'if' keyword has already been consumed.
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<IfStmt> Parser::parseIfStatement() {
    int ln = previous().line;

    expect(TokenType::LPAREN, "Expected '(' after 'if'");
    auto condition = parseExpression();
    expect(TokenType::RPAREN, "Expected ')' after if condition");

    auto thenBranch = parseBlock();

    std::unique_ptr<Statement> elseBranch = nullptr;
    if (match(TokenType::KW_ELSE)) {
        elseBranch = parseBlock();
    }

    return std::make_unique<IfStmt>(ln, std::move(condition),
                                     std::move(thenBranch),
                                     std::move(elseBranch));
}

// ─────────────────────────────────────────────────────────────────────
// Parse while statement: 'while' '(' expr ')' block
// 'while' keyword has already been consumed.
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<WhileStmt> Parser::parseWhileStatement() {
    int ln = previous().line;

    expect(TokenType::LPAREN, "Expected '(' after 'while'");
    auto condition = parseExpression();
    expect(TokenType::RPAREN, "Expected ')' after while condition");

    auto body = parseBlock();

    return std::make_unique<WhileStmt>(ln, std::move(condition), std::move(body));
}

// ─────────────────────────────────────────────────────────────────────
// Parse a block: '{' statement* '}'
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<BlockStmt> Parser::parseBlock() {
    int ln = peek().line;
    expect(TokenType::LBRACE, "Expected '{'");

    auto block = std::make_unique<BlockStmt>(ln);

    while (!check(TokenType::RBRACE) && !isAtEnd()) {
        auto stmt = parseStatement();
        if (stmt) {
            block->statements.push_back(std::move(stmt));
        } else {
            advance(); // skip to avoid infinite loop
        }
    }

    expect(TokenType::RBRACE, "Expected '}'");
    return block;
}

// ═══════════════════════════════════════════════════════════════════════
//  Expression Parsing (Precedence Climbing)
// ═══════════════════════════════════════════════════════════════════════

/*
 * Expression precedence (lowest to highest):
 *   1. Comparison: ==, !=, <, >, <=, >=
 *   2. Addition:   +, -
 *   3. Multiplication: *, /
 *   4. Primary: literals, identifiers, parenthesized expressions
 */

// ─────────────────────────────────────────────────────────────────────
// expr → comparison
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<Expression> Parser::parseExpression() {
    return parseComparison();
}

// ─────────────────────────────────────────────────────────────────────
// comparison → addition ((== | != | < | > | <= | >=) addition)*
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<Expression> Parser::parseComparison() {
    auto left = parseAddition();

    while (check(TokenType::EQUAL) || check(TokenType::NOT_EQUAL) ||
           check(TokenType::LESS) || check(TokenType::GREATER) ||
           check(TokenType::LESS_EQUAL) || check(TokenType::GREATER_EQUAL)) {
        Token op = advance();
        auto right = parseAddition();
        left = std::make_unique<BinaryExpr>(
            op.line, op.value, std::move(left), std::move(right));
    }

    return left;
}

// ─────────────────────────────────────────────────────────────────────
// addition → multiplication (('+' | '-') multiplication)*
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<Expression> Parser::parseAddition() {
    auto left = parseMultiplication();

    while (check(TokenType::PLUS) || check(TokenType::MINUS)) {
        Token op = advance();
        auto right = parseMultiplication();
        left = std::make_unique<BinaryExpr>(
            op.line, op.value, std::move(left), std::move(right));
    }

    return left;
}

// ─────────────────────────────────────────────────────────────────────
// multiplication → primary (('*' | '/') primary)*
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<Expression> Parser::parseMultiplication() {
    auto left = parsePrimary();

    while (check(TokenType::STAR) || check(TokenType::SLASH)) {
        Token op = advance();
        auto right = parsePrimary();
        left = std::make_unique<BinaryExpr>(
            op.line, op.value, std::move(left), std::move(right));
    }

    return left;
}

// ─────────────────────────────────────────────────────────────────────
// primary → INT_LITERAL | FLOAT_LITERAL | CHAR_LITERAL 
//         | IDENTIFIER | '(' expr ')'
// ─────────────────────────────────────────────────────────────────────
std::unique_ptr<Expression> Parser::parsePrimary() {
    // Integer literal
    if (match(TokenType::INT_LITERAL)) {
        return std::make_unique<IntLiteralExpr>(
            previous().line, std::stoi(previous().value));
    }

    // Float literal
    if (match(TokenType::FLOAT_LITERAL)) {
        return std::make_unique<FloatLiteralExpr>(
            previous().line, std::stof(previous().value));
    }

    // Character literal
    if (match(TokenType::CHAR_LITERAL)) {
        char c = previous().value.empty() ? '\0' : previous().value[0];
        return std::make_unique<CharLiteralExpr>(previous().line, c);
    }

    // Identifier (variable reference)
    if (match(TokenType::IDENTIFIER)) {
        return std::make_unique<IdentifierExpr>(
            previous().line, previous().value);
    }

    // Parenthesized expression
    if (match(TokenType::LPAREN)) {
        auto expr = parseExpression();
        expect(TokenType::RPAREN, "Expected ')' after expression");
        return expr;
    }

    // Error: unexpected token in expression
    std::cerr << "  Parse Error (line " << peek().line 
              << "): Expected expression, got '" << peek().value << "'\n";
    advance(); // skip to avoid infinite loop
    return std::make_unique<IntLiteralExpr>(peek().line, 0); // error recovery
}
