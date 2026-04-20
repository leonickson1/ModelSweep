/**
 * Starter Coding Suite
 *
 * Pre-built coding scenarios with test cases for the Docker sandbox.
 * Models must implement a function called `solve()` that takes a single argument.
 *
 * Covers: string manipulation, math/logic, data structures, algorithms,
 * and edge case handling across Python and JavaScript.
 */

export const STARTER_CODING_SUITES = [
  {
    id: "builtin-coding-sandbox",
    name: "Coding Sandbox Basics",
    description: "Test whether models can write correct, runnable code. Each scenario runs in a Docker sandbox with real test cases.",
    suiteType: "coding",
    codingScenarios: [
      // ── Easy: String & Math ─────────────────────────────────────────────

      {
        id: "code-01-reverse-string",
        name: "Reverse a String",
        description: "Write a function that reverses a string.",
        language: "python",
        functionSignature: "def solve(s: str) -> str",
        testCases: [
          { id: "tc-01a", input: "hello", expectedOutput: "olleh", description: "Basic word" },
          { id: "tc-01b", input: "racecar", expectedOutput: "racecar", description: "Palindrome" },
          { id: "tc-01c", input: "", expectedOutput: "", description: "Empty string" },
          { id: "tc-01d", input: "a", expectedOutput: "a", description: "Single character" },
          { id: "tc-01e", input: "Hello World!", expectedOutput: "!dlroW olleH", description: "Mixed case with punctuation" },
        ],
        difficulty: "easy",
        timeLimitMs: 10000,
      },
      {
        id: "code-02-fizzbuzz",
        name: "FizzBuzz",
        description: "Given a number n, return a list of strings from 1 to n. For multiples of 3 use 'Fizz', for multiples of 5 use 'Buzz', for both use 'FizzBuzz'.",
        language: "python",
        functionSignature: "def solve(n: int) -> list[str]",
        testCases: [
          { id: "tc-02a", input: 5, expectedOutput: ["1", "2", "Fizz", "4", "Buzz"], description: "First 5" },
          { id: "tc-02b", input: 15, expectedOutput: ["1","2","Fizz","4","Buzz","Fizz","7","8","Fizz","Buzz","11","Fizz","13","14","FizzBuzz"], description: "First 15 (includes FizzBuzz)" },
          { id: "tc-02c", input: 1, expectedOutput: ["1"], description: "Just 1" },
          { id: "tc-02d", input: 3, expectedOutput: ["1", "2", "Fizz"], description: "Up to first Fizz" },
        ],
        difficulty: "easy",
        timeLimitMs: 10000,
      },
      {
        id: "code-03-is-palindrome",
        name: "Palindrome Check",
        description: "Check if a string is a palindrome, ignoring case and non-alphanumeric characters.",
        language: "python",
        functionSignature: "def solve(s: str) -> bool",
        testCases: [
          { id: "tc-03a", input: "racecar", expectedOutput: true, description: "Simple palindrome" },
          { id: "tc-03b", input: "A man, a plan, a canal: Panama", expectedOutput: true, description: "Classic with punctuation" },
          { id: "tc-03c", input: "hello", expectedOutput: false, description: "Not a palindrome" },
          { id: "tc-03d", input: "", expectedOutput: true, description: "Empty string is palindrome" },
          { id: "tc-03e", input: "Race a Car", expectedOutput: false, description: "Almost palindrome" },
        ],
        difficulty: "easy",
        timeLimitMs: 10000,
      },

      // ── Easy: JavaScript ────────────────────────────────────────────────

      {
        id: "code-04-two-sum-js",
        name: "Two Sum (JavaScript)",
        description: "Given an array of numbers and a target, return the indices of the two numbers that add up to the target. Return them as a sorted pair.",
        language: "javascript",
        functionSignature: "function solve({ nums, target })",
        testCases: [
          { id: "tc-04a", input: { nums: [2, 7, 11, 15], target: 9 }, expectedOutput: [0, 1], description: "First two elements" },
          { id: "tc-04b", input: { nums: [3, 2, 4], target: 6 }, expectedOutput: [1, 2], description: "Non-adjacent" },
          { id: "tc-04c", input: { nums: [3, 3], target: 6 }, expectedOutput: [0, 1], description: "Duplicate values" },
          { id: "tc-04d", input: { nums: [1, 5, 3, 7, 2], target: 8 }, expectedOutput: [1, 2], description: "Multiple possibilities (first valid)" },
        ],
        difficulty: "easy",
        timeLimitMs: 10000,
      },

      // ── Medium: Algorithms ──────────────────────────────────────────────

      {
        id: "code-05-fibonacci",
        name: "Nth Fibonacci Number",
        description: "Return the nth Fibonacci number (0-indexed). F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2).",
        language: "python",
        functionSignature: "def solve(n: int) -> int",
        testCases: [
          { id: "tc-05a", input: 0, expectedOutput: 0, description: "F(0)" },
          { id: "tc-05b", input: 1, expectedOutput: 1, description: "F(1)" },
          { id: "tc-05c", input: 10, expectedOutput: 55, description: "F(10)" },
          { id: "tc-05d", input: 20, expectedOutput: 6765, description: "F(20)" },
          { id: "tc-05e", input: 30, expectedOutput: 832040, description: "F(30) — needs efficient solution" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },
      {
        id: "code-06-anagram-groups",
        name: "Group Anagrams",
        description: "Given a list of strings, group the anagrams together. Return a list of groups (order within groups doesn't matter, but sort each group alphabetically).",
        language: "python",
        functionSignature: "def solve(strs: list[str]) -> list[list[str]]",
        testCases: [
          {
            id: "tc-06a",
            input: ["eat", "tea", "tan", "ate", "nat", "bat"],
            expectedOutput: [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]],
            description: "Mixed anagram groups",
          },
          {
            id: "tc-06b",
            input: [""],
            expectedOutput: [[""]],
            description: "Single empty string",
          },
          {
            id: "tc-06c",
            input: ["a"],
            expectedOutput: [["a"]],
            description: "Single character",
          },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },
      {
        id: "code-07-valid-parens",
        name: "Valid Parentheses",
        description: "Given a string containing just '(', ')', '{', '}', '[' and ']', determine if the input string has valid (properly nested and matched) brackets.",
        language: "javascript",
        functionSignature: "function solve(s)",
        testCases: [
          { id: "tc-07a", input: "()", expectedOutput: true, description: "Simple pair" },
          { id: "tc-07b", input: "()[]{}", expectedOutput: true, description: "Multiple types" },
          { id: "tc-07c", input: "(]", expectedOutput: false, description: "Mismatched" },
          { id: "tc-07d", input: "([{}])", expectedOutput: true, description: "Nested" },
          { id: "tc-07e", input: "((()))", expectedOutput: true, description: "Deep nesting" },
          { id: "tc-07f", input: "({[)]}", expectedOutput: false, description: "Interleaved" },
          { id: "tc-07g", input: "", expectedOutput: true, description: "Empty string" },
          { id: "tc-07h", input: "(", expectedOutput: false, description: "Unclosed" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },

      // ── Medium: Data Structures ─────────────────────────────────────────

      {
        id: "code-08-flatten-nested",
        name: "Flatten Nested List",
        description: "Given a nested list of integers, flatten it into a single list. Input can have arbitrary depth.",
        language: "python",
        functionSignature: "def solve(nested: list) -> list[int]",
        testCases: [
          { id: "tc-08a", input: [1, [2, 3], [4, [5, 6]]], expectedOutput: [1, 2, 3, 4, 5, 6], description: "Mixed nesting" },
          { id: "tc-08b", input: [[1, 2], [3, 4]], expectedOutput: [1, 2, 3, 4], description: "Flat two-level" },
          { id: "tc-08c", input: [1, 2, 3], expectedOutput: [1, 2, 3], description: "Already flat" },
          { id: "tc-08d", input: [[[1]], [[2]], [[3]]], expectedOutput: [1, 2, 3], description: "Deep nesting" },
          { id: "tc-08e", input: [], expectedOutput: [], description: "Empty list" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },
      {
        id: "code-09-most-frequent",
        name: "Most Frequent Element",
        description: "Given a list of integers, return the element that appears most frequently. If there's a tie, return the smallest.",
        language: "python",
        functionSignature: "def solve(nums: list[int]) -> int",
        testCases: [
          { id: "tc-09a", input: [1, 2, 2, 3, 3, 3], expectedOutput: 3, description: "Clear winner" },
          { id: "tc-09b", input: [1, 1, 2, 2], expectedOutput: 1, description: "Tie — return smallest" },
          { id: "tc-09c", input: [5], expectedOutput: 5, description: "Single element" },
          { id: "tc-09d", input: [7, 7, 7, 7], expectedOutput: 7, description: "All same" },
          { id: "tc-09e", input: [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5], expectedOutput: 5, description: "Longer list" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },

      // ── Hard: Algorithms ────────────────────────────────────────────────

      {
        id: "code-10-longest-substr",
        name: "Longest Substring Without Repeating Characters",
        description: "Given a string, find the length of the longest substring without repeating characters.",
        language: "python",
        functionSignature: "def solve(s: str) -> int",
        testCases: [
          { id: "tc-10a", input: "abcabcbb", expectedOutput: 3, description: "'abc' = 3" },
          { id: "tc-10b", input: "bbbbb", expectedOutput: 1, description: "All same" },
          { id: "tc-10c", input: "pwwkew", expectedOutput: 3, description: "'wke' = 3" },
          { id: "tc-10d", input: "", expectedOutput: 0, description: "Empty" },
          { id: "tc-10e", input: "abcdefg", expectedOutput: 7, description: "All unique" },
          { id: "tc-10f", input: "aab", expectedOutput: 2, description: "'ab' = 2" },
        ],
        difficulty: "hard",
        timeLimitMs: 10000,
      },
      {
        id: "code-11-merge-intervals",
        name: "Merge Overlapping Intervals",
        description: "Given a list of intervals [start, end], merge all overlapping intervals and return the result sorted by start.",
        language: "python",
        functionSignature: "def solve(intervals: list[list[int]]) -> list[list[int]]",
        testCases: [
          { id: "tc-11a", input: [[1,3],[2,6],[8,10],[15,18]], expectedOutput: [[1,6],[8,10],[15,18]], description: "Overlapping pair" },
          { id: "tc-11b", input: [[1,4],[4,5]], expectedOutput: [[1,5]], description: "Touching intervals" },
          { id: "tc-11c", input: [[1,4],[0,4]], expectedOutput: [[0,4]], description: "Contained interval" },
          { id: "tc-11d", input: [[1,2]], expectedOutput: [[1,2]], description: "Single interval" },
          { id: "tc-11e", input: [[1,4],[2,3]], expectedOutput: [[1,4]], description: "Fully contained" },
          { id: "tc-11f", input: [[6,8],[1,3],[2,4],[10,12]], expectedOutput: [[1,4],[6,8],[10,12]], description: "Unsorted input" },
        ],
        difficulty: "hard",
        timeLimitMs: 10000,
      },
      {
        id: "code-12-binary-search",
        name: "Binary Search (JavaScript)",
        description: "Implement binary search. Given a sorted array and a target value, return the index if found, or -1 if not.",
        language: "javascript",
        functionSignature: "function solve({ nums, target })",
        testCases: [
          { id: "tc-12a", input: { nums: [-1, 0, 3, 5, 9, 12], target: 9 }, expectedOutput: 4, description: "Found in middle" },
          { id: "tc-12b", input: { nums: [-1, 0, 3, 5, 9, 12], target: 2 }, expectedOutput: -1, description: "Not found" },
          { id: "tc-12c", input: { nums: [5], target: 5 }, expectedOutput: 0, description: "Single element found" },
          { id: "tc-12d", input: { nums: [5], target: 3 }, expectedOutput: -1, description: "Single element not found" },
          { id: "tc-12e", input: { nums: [1, 2, 3, 4, 5], target: 1 }, expectedOutput: 0, description: "First element" },
          { id: "tc-12f", input: { nums: [1, 2, 3, 4, 5], target: 5 }, expectedOutput: 4, description: "Last element" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },

      // ── Hard: Edge Cases & Real-World ───────────────────────────────────

      {
        id: "code-13-matrix-rotate",
        name: "Rotate Matrix 90 Degrees",
        description: "Given an NxN matrix, rotate it 90 degrees clockwise in-place and return it.",
        language: "python",
        functionSignature: "def solve(matrix: list[list[int]]) -> list[list[int]]",
        testCases: [
          {
            id: "tc-13a",
            input: [[1,2,3],[4,5,6],[7,8,9]],
            expectedOutput: [[7,4,1],[8,5,2],[9,6,3]],
            description: "3x3 matrix",
          },
          {
            id: "tc-13b",
            input: [[1,2],[3,4]],
            expectedOutput: [[3,1],[4,2]],
            description: "2x2 matrix",
          },
          {
            id: "tc-13c",
            input: [[1]],
            expectedOutput: [[1]],
            description: "1x1 matrix",
          },
          {
            id: "tc-13d",
            input: [[5,1,9,11],[2,4,8,10],[13,3,6,7],[15,14,12,16]],
            expectedOutput: [[15,13,2,5],[14,3,4,1],[12,6,8,9],[16,7,10,11]],
            description: "4x4 matrix",
          },
        ],
        difficulty: "hard",
        timeLimitMs: 10000,
      },
      {
        id: "code-14-caesar-cipher",
        name: "Caesar Cipher",
        description: "Implement a Caesar cipher. Shift each letter by `shift` positions in the alphabet. Wrap around (z+1=a). Preserve case. Non-letter characters unchanged. Input is {text, shift}.",
        language: "python",
        functionSignature: "def solve(data: dict) -> str",
        testCases: [
          { id: "tc-14a", input: { text: "abc", shift: 1 }, expectedOutput: "bcd", description: "Simple shift" },
          { id: "tc-14b", input: { text: "xyz", shift: 3 }, expectedOutput: "abc", description: "Wrap around" },
          { id: "tc-14c", input: { text: "Hello, World!", shift: 13 }, expectedOutput: "Uryyb, Jbeyq!", description: "ROT13 with punctuation" },
          { id: "tc-14d", input: { text: "abc", shift: 0 }, expectedOutput: "abc", description: "No shift" },
          { id: "tc-14e", input: { text: "abc", shift: 26 }, expectedOutput: "abc", description: "Full rotation" },
          { id: "tc-14f", input: { text: "ABC", shift: 1 }, expectedOutput: "BCD", description: "Uppercase" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },
      {
        id: "code-15-roman-numerals",
        name: "Integer to Roman Numeral",
        description: "Convert an integer (1-3999) to its Roman numeral representation.",
        language: "python",
        functionSignature: "def solve(num: int) -> str",
        testCases: [
          { id: "tc-15a", input: 3, expectedOutput: "III", description: "Simple" },
          { id: "tc-15b", input: 58, expectedOutput: "LVIII", description: "L + V + III" },
          { id: "tc-15c", input: 1994, expectedOutput: "MCMXCIV", description: "M + CM + XC + IV" },
          { id: "tc-15d", input: 4, expectedOutput: "IV", description: "Subtractive notation" },
          { id: "tc-15e", input: 9, expectedOutput: "IX", description: "Subtractive IX" },
          { id: "tc-15f", input: 3999, expectedOutput: "MMMCMXCIX", description: "Maximum value" },
          { id: "tc-15g", input: 1, expectedOutput: "I", description: "Minimum value" },
        ],
        difficulty: "medium",
        timeLimitMs: 10000,
      },
    ],
  },
];
