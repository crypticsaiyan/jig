/*
 * sample.cpp - A simple C++ program with templates, map, and unordered_map
 */
#include <iostream>
#include <map>
#include <unordered_map>
#include <vector>
#include <string>

// Generic template for computing nth element in a sequence
template<typename T>
T power(T base, int exp) {
    if (exp == 0) return static_cast<T>(1);
    T result = base;
    for (int i = 1; i < exp; ++i) {
        result *= base;
    }
    return result;
}

// Template class for factorial computation
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

int main() {
    // Demonstrate template function
    std::cout << "Template function results:" << std::endl;
    std::cout << "2^10 = " << power(2, 10) << std::endl;
    std::cout << "3.5^3 = " << power(3.5, 3) << std::endl;

    // Demonstrate template class
    std::cout << "\nTemplate class factorial results:" << std::endl;
    std::cout << "5! = " << Factorial<5>::value << std::endl;
    std::cout << "10! = " << Factorial<10>::value << std::endl;

    // Unordered map example
    std::unordered_map<std::string, int> scores;
    scores["Alice"] = 95;
    scores["Bob"] = 87;
    scores["Charlie"] = 92;
    
    std::cout << "\nUnordered map:" << std::endl;
    for (const auto& pair : scores) {
        std::cout << "  " << pair.first << " -> " << pair.second << std::endl;
    }

    // Ordered map example
    std::map<std::string, int> grades;
    grades["Alice"] = 95;
    grades["Bob"] = 87;
    grades["Charlie"] = 92;

    std::cout << "\nOrdered map:" << std::endl;
    for (const auto& pair : grades) {
        std::cout << "  " << pair.first << " -> " << pair.second << std::endl;
    }

    // Generic container example
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    std::cout << "\nVector with template elements:" << std::endl;
    for (const auto& num : numbers) {
        std::cout << num << " ";
    }
    std::cout << std::endl;

    return 0;
}
