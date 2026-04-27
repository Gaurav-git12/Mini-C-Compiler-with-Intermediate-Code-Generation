/*
 * main.cpp - Semantic Analyzer Entry Point
 * 
 * Pipeline: Read file → Lexer → Parser → Semantic Analyzer → Report
 * 
 * Usage: SemanticAnalyzer.exe <input_file.c>
 *        SemanticAnalyzer.exe               (defaults to input.c)
 */

#include <iostream>
#include <fstream>
#include <sstream>
#include <string>

#include "lexer.h"
#include "parser.h"
#include "semantic.h"

// Read the entire contents of a file into a string
std::string readFile(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: Cannot open file '" << filename << "'\n";
        return "";
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

// Print a banner header
void printBanner() {
    std::cout << "\n";
    std::cout << "╔══════════════════════════════════════════════════════╗\n";
    std::cout << "║     C SEMANTIC ANALYZER                             ║\n";
    std::cout << "║     Subset: int, float, char, if, while             ║\n";
    std::cout << "╚══════════════════════════════════════════════════════╝\n";
}

// Print all tokens (for debugging/demonstration)
void printTokens(const std::vector<Token>& tokens) {
    std::cout << "\n── Token Stream ────────────────────────────────────\n";
    for (const auto& tok : tokens) {
        if (tok.type == TokenType::END_OF_FILE) break;
        std::cout << "  [Line " << tok.line << "] "
                  << tokenTypeToString(tok.type)
                  << "  '" << tok.value << "'\n";
    }
    std::cout << "────────────────────────────────────────────────────\n";
}

int main(int argc, char* argv[]) {
    printBanner();

    // Determine input file (default: input.c)
    std::string filename = "input.c";
    if (argc > 1) {
        filename = argv[1];
    }

    std::cout << "\n📂 Reading file: " << filename << "\n";

    // ── Step 1: Read source file ─────────────────────────────────
    std::string source = readFile(filename);
    if (source.empty()) {
        std::cerr << "Error: File is empty or could not be read.\n";
        return 1;
    }

    // Print source code
    std::cout << "\n── Source Code ─────────────────────────────────────\n";
    std::cout << source;
    std::cout << "────────────────────────────────────────────────────\n";

    // ── Step 2: Lexical Analysis ─────────────────────────────────
    std::cout << "\n🔍 Phase 1: Lexical Analysis...\n";
    Lexer lexer(source);
    std::vector<Token> tokens = lexer.tokenize();
    printTokens(tokens);

    // ── Step 3: Parsing ──────────────────────────────────────────
    std::cout << "\n🔧 Phase 2: Parsing (building AST)...\n";
    Parser parser(tokens);
    auto program = parser.parse();
    std::cout << "  AST built with " << program->statements.size() 
              << " top-level statement(s).\n";

    // ── Step 4: Semantic Analysis ────────────────────────────────
    std::cout << "\n🧪 Phase 3: Semantic Analysis...\n";
    SemanticAnalyzer analyzer;
    analyzer.analyze(program.get());

    // ── Step 5: Report Results ───────────────────────────────────
    analyzer.printResults();

    return analyzer.hasErrors() ? 1 : 0;
}
