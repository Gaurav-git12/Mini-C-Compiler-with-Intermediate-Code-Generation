/*
 * lexer.h - Lexical Analyzer (Tokenizer)
 * 
 * Breaks the raw C source code into a stream of tokens.
 * Each token carries its type (keyword, identifier, number, operator, etc.),
 * its string value, and the line number where it appeared.
 * 
 * Supported tokens:
 *   - Keywords:    int, float, char, if, else, while
 *   - Identifiers: variable names
 *   - Literals:    integer (42), float (3.14), char ('a')
 *   - Operators:   + - * / = == != < > <= >=
 *   - Punctuation: ( ) { } ; ,
 */

#ifndef LEXER_H
#define LEXER_H

#include <string>
#include <vector>

// ─────────────────────────────────────────────────────────────────────
// Token types recognized by the lexer
// ─────────────────────────────────────────────────────────────────────
enum class TokenType {
    // Keywords
    KW_INT,         // "int"
    KW_FLOAT,       // "float"
    KW_CHAR,        // "char"
    KW_IF,          // "if"
    KW_ELSE,        // "else"
    KW_WHILE,       // "while"

    // Identifiers and Literals
    IDENTIFIER,     // variable/function names
    INT_LITERAL,    // e.g., 42
    FLOAT_LITERAL,  // e.g., 3.14
    CHAR_LITERAL,   // e.g., 'a'

    // Operators
    PLUS,           // +
    MINUS,          // -
    STAR,           // *
    SLASH,          // /
    ASSIGN,         // =
    EQUAL,          // ==
    NOT_EQUAL,      // !=
    LESS,           // <
    GREATER,        // >
    LESS_EQUAL,     // <=
    GREATER_EQUAL,  // >=

    // Punctuation
    LPAREN,         // (
    RPAREN,         // )
    LBRACE,         // {
    RBRACE,         // }
    SEMICOLON,      // ;
    COMMA,          // ,

    // Special
    END_OF_FILE,    // End of input
    UNKNOWN         // Unrecognized character
};

// Convert a TokenType to a printable string (for debugging)
std::string tokenTypeToString(TokenType type);

// ─────────────────────────────────────────────────────────────────────
// Token - A single lexical unit
// ─────────────────────────────────────────────────────────────────────
struct Token {
    TokenType type;         // What kind of token
    std::string value;      // The actual text (e.g., "int", "myVar", "42")
    int line;               // Line number in source file

    Token() : type(TokenType::UNKNOWN), value(""), line(0) {}
    Token(TokenType t, const std::string& v, int ln)
        : type(t), value(v), line(ln) {}
};

// ─────────────────────────────────────────────────────────────────────
// Lexer - Tokenizes raw source code
// 
// Usage:
//   Lexer lexer(sourceCode);
//   std::vector<Token> tokens = lexer.tokenize();
// ─────────────────────────────────────────────────────────────────────
class Lexer {
private:
    std::string source;     // The entire source code string
    int pos;                // Current character position
    int line;               // Current line number
    int length;             // Total source length

    // Get the current character (or '\0' if at end)
    char current() const;

    // Get the next character without consuming (or '\0' if at end)
    char peek() const;

    // Advance position by one character
    void advance();

    // Skip whitespace and comments
    void skipWhitespace();

    // Skip single-line (//) and multi-line (/* */) comments
    void skipComments();

    // Read a complete number (integer or float literal)
    Token readNumber();

    // Read an identifier or keyword
    Token readIdentifier();

    // Read a character literal (e.g., 'a')
    Token readCharLiteral();

    // Check if a string is a keyword and return the corresponding TokenType
    TokenType checkKeyword(const std::string& word) const;

public:
    // Construct a lexer with the source code to tokenize
    explicit Lexer(const std::string& sourceCode);

    // Tokenize the entire source code into a vector of tokens
    std::vector<Token> tokenize();
};

#endif // LEXER_H
