/*
 * lexer.cpp - Lexical Analyzer Implementation
 * 
 * Scans the source code character by character, producing tokens.
 * Handles keywords, identifiers, numeric literals (int and float),
 * character literals, operators, and punctuation.
 * Also skips whitespace and comments (// and /* ... *​/).
 */

#include "lexer.h"
#include <cctype>
#include <iostream>

// ─────────────────────────────────────────────────────────────────────
// Convert TokenType enum to a readable string (for debug output)
// ─────────────────────────────────────────────────────────────────────
std::string tokenTypeToString(TokenType type) {
    switch (type) {
        case TokenType::KW_INT:         return "KW_INT";
        case TokenType::KW_FLOAT:       return "KW_FLOAT";
        case TokenType::KW_CHAR:        return "KW_CHAR";
        case TokenType::KW_IF:          return "KW_IF";
        case TokenType::KW_ELSE:        return "KW_ELSE";
        case TokenType::KW_WHILE:       return "KW_WHILE";
        case TokenType::IDENTIFIER:     return "IDENTIFIER";
        case TokenType::INT_LITERAL:    return "INT_LITERAL";
        case TokenType::FLOAT_LITERAL:  return "FLOAT_LITERAL";
        case TokenType::CHAR_LITERAL:   return "CHAR_LITERAL";
        case TokenType::PLUS:           return "PLUS";
        case TokenType::MINUS:          return "MINUS";
        case TokenType::STAR:           return "STAR";
        case TokenType::SLASH:          return "SLASH";
        case TokenType::ASSIGN:         return "ASSIGN";
        case TokenType::EQUAL:          return "EQUAL";
        case TokenType::NOT_EQUAL:      return "NOT_EQUAL";
        case TokenType::LESS:           return "LESS";
        case TokenType::GREATER:        return "GREATER";
        case TokenType::LESS_EQUAL:     return "LESS_EQUAL";
        case TokenType::GREATER_EQUAL:  return "GREATER_EQUAL";
        case TokenType::LPAREN:         return "LPAREN";
        case TokenType::RPAREN:         return "RPAREN";
        case TokenType::LBRACE:         return "LBRACE";
        case TokenType::RBRACE:         return "RBRACE";
        case TokenType::SEMICOLON:      return "SEMICOLON";
        case TokenType::COMMA:          return "COMMA";
        case TokenType::END_OF_FILE:    return "EOF";
        case TokenType::UNKNOWN:        return "UNKNOWN";
        default:                        return "???";
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Lexer class implementation
// ═══════════════════════════════════════════════════════════════════════

Lexer::Lexer(const std::string& sourceCode) 
    : source(sourceCode), pos(0), line(1), length(sourceCode.length()) {}

// ─────────────────────────────────────────────────────────────────────
// Get the current character
// ─────────────────────────────────────────────────────────────────────
char Lexer::current() const {
    if (pos < length) return source[pos];
    return '\0';
}

// ─────────────────────────────────────────────────────────────────────
// Peek at the next character without consuming it
// ─────────────────────────────────────────────────────────────────────
char Lexer::peek() const {
    if (pos + 1 < length) return source[pos + 1];
    return '\0';
}

// ─────────────────────────────────────────────────────────────────────
// Advance to the next character, tracking line numbers
// ─────────────────────────────────────────────────────────────────────
void Lexer::advance() {
    if (pos < length) {
        if (source[pos] == '\n') line++;
        pos++;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Skip whitespace characters (space, tab, newline, carriage return)
// ─────────────────────────────────────────────────────────────────────
void Lexer::skipWhitespace() {
    while (pos < length && std::isspace(current())) {
        advance();
    }
}

// ─────────────────────────────────────────────────────────────────────
// Skip single-line and multi-line comments
// ─────────────────────────────────────────────────────────────────────
void Lexer::skipComments() {
    // Single-line comment: // ...
    if (current() == '/' && peek() == '/') {
        while (pos < length && current() != '\n') {
            advance();
        }
    }
    // Multi-line comment: /* ... */
    else if (current() == '/' && peek() == '*') {
        advance(); // skip '/'
        advance(); // skip '*'
        while (pos < length) {
            if (current() == '*' && peek() == '/') {
                advance(); // skip '*'
                advance(); // skip '/'
                break;
            }
            advance();
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// Read a numeric literal (integer or float)
// Examples: 42, 3.14, 100, 0.5
// ─────────────────────────────────────────────────────────────────────
Token Lexer::readNumber() {
    int startLine = line;
    std::string num;
    bool isFloat = false;

    // Read the integer part
    while (pos < length && std::isdigit(current())) {
        num += current();
        advance();
    }

    // Check for a decimal point (making it a float)
    if (current() == '.' && std::isdigit(peek())) {
        isFloat = true;
        num += current();
        advance();

        // Read the fractional part
        while (pos < length && std::isdigit(current())) {
            num += current();
            advance();
        }
    }

    return Token(isFloat ? TokenType::FLOAT_LITERAL : TokenType::INT_LITERAL,
                 num, startLine);
}

// ─────────────────────────────────────────────────────────────────────
// Read an identifier or keyword
// Identifiers start with a letter or underscore, followed by 
// alphanumeric characters or underscores.
// ─────────────────────────────────────────────────────────────────────
Token Lexer::readIdentifier() {
    int startLine = line;
    std::string word;

    while (pos < length && (std::isalnum(current()) || current() == '_')) {
        word += current();
        advance();
    }

    // Check if it's a keyword
    TokenType kwType = checkKeyword(word);
    return Token(kwType, word, startLine);
}

// ─────────────────────────────────────────────────────────────────────
// Read a character literal enclosed in single quotes  
// Example: 'a', 'Z', '0'
// ─────────────────────────────────────────────────────────────────────
Token Lexer::readCharLiteral() {
    int startLine = line;
    advance(); // skip opening '

    std::string ch;
    if (pos < length && current() != '\'') {
        // Handle escape sequences
        if (current() == '\\') {
            ch += current();
            advance();
        }
        ch += current();
        advance();
    }

    if (current() == '\'') {
        advance(); // skip closing '
    }

    return Token(TokenType::CHAR_LITERAL, ch, startLine);
}

// ─────────────────────────────────────────────────────────────────────
// Check if a word is a keyword; if not, it's an IDENTIFIER
// ─────────────────────────────────────────────────────────────────────
TokenType Lexer::checkKeyword(const std::string& word) const {
    if (word == "int")    return TokenType::KW_INT;
    if (word == "float")  return TokenType::KW_FLOAT;
    if (word == "char")   return TokenType::KW_CHAR;
    if (word == "if")     return TokenType::KW_IF;
    if (word == "else")   return TokenType::KW_ELSE;
    if (word == "while")  return TokenType::KW_WHILE;
    return TokenType::IDENTIFIER;
}

// ─────────────────────────────────────────────────────────────────────
// Main tokenization: scan the entire source and produce a token list
// ─────────────────────────────────────────────────────────────────────
std::vector<Token> Lexer::tokenize() {
    std::vector<Token> tokens;

    while (pos < length) {
        // Skip whitespace and comments (loop until none remain)
        bool skipped = true;
        while (skipped) {
            skipped = false;
            // Skip whitespace
            while (pos < length && std::isspace(current())) {
                advance();
                skipped = true;
            }
            // Skip comments
            if (pos < length && current() == '/') {
                if (peek() == '/') {
                    // Single-line comment
                    while (pos < length && current() != '\n') advance();
                    skipped = true;
                } else if (peek() == '*') {
                    // Multi-line comment
                    advance(); advance();
                    while (pos < length) {
                        if (current() == '*' && peek() == '/') {
                            advance(); advance();
                            break;
                        }
                        advance();
                    }
                    skipped = true;
                }
            }
        }

        if (pos >= length) break;

        char c = current();

        // ── Numbers ──────────────────────────────────────────────
        if (std::isdigit(c)) {
            tokens.push_back(readNumber());
            continue;
        }

        // ── Identifiers / Keywords ──────────────────────────────
        if (std::isalpha(c) || c == '_') {
            tokens.push_back(readIdentifier());
            continue;
        }

        // ── Character Literals ──────────────────────────────────
        if (c == '\'') {
            tokens.push_back(readCharLiteral());
            continue;
        }

        // ── Two-character operators ─────────────────────────────
        if (c == '=' && peek() == '=') {
            tokens.push_back(Token(TokenType::EQUAL, "==", line));
            advance(); advance();
            continue;
        }
        if (c == '!' && peek() == '=') {
            tokens.push_back(Token(TokenType::NOT_EQUAL, "!=", line));
            advance(); advance();
            continue;
        }
        if (c == '<' && peek() == '=') {
            tokens.push_back(Token(TokenType::LESS_EQUAL, "<=", line));
            advance(); advance();
            continue;
        }
        if (c == '>' && peek() == '=') {
            tokens.push_back(Token(TokenType::GREATER_EQUAL, ">=", line));
            advance(); advance();
            continue;
        }

        // ── Single-character tokens ─────────────────────────────
        switch (c) {
            case '+': tokens.push_back(Token(TokenType::PLUS,      "+", line)); break;
            case '-': tokens.push_back(Token(TokenType::MINUS,     "-", line)); break;
            case '*': tokens.push_back(Token(TokenType::STAR,      "*", line)); break;
            case '/': tokens.push_back(Token(TokenType::SLASH,     "/", line)); break;
            case '=': tokens.push_back(Token(TokenType::ASSIGN,    "=", line)); break;
            case '<': tokens.push_back(Token(TokenType::LESS,      "<", line)); break;
            case '>': tokens.push_back(Token(TokenType::GREATER,   ">", line)); break;
            case '(': tokens.push_back(Token(TokenType::LPAREN,    "(", line)); break;
            case ')': tokens.push_back(Token(TokenType::RPAREN,    ")", line)); break;
            case '{': tokens.push_back(Token(TokenType::LBRACE,    "{", line)); break;
            case '}': tokens.push_back(Token(TokenType::RBRACE,    "}", line)); break;
            case ';': tokens.push_back(Token(TokenType::SEMICOLON, ";", line)); break;
            case ',': tokens.push_back(Token(TokenType::COMMA,     ",", line)); break;
            default:
                // Unknown character - report and skip
                tokens.push_back(Token(TokenType::UNKNOWN, 
                                       std::string(1, c), line));
                break;
        }
        advance();
    }

    // Append end-of-file token
    tokens.push_back(Token(TokenType::END_OF_FILE, "", line));
    return tokens;
}
