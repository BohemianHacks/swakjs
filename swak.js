// Type definitions
/**
 * @typedef {Object} GenerationOptions
 * @property {number} [minLength=10] - Minimum length of generated text
 * @property {number} [maxLength=50] - Maximum length of generated text
 * @property {number} [temperature=1.0] - Temperature for controlling randomness
 * @property {boolean} [endOnSentence=true] - Whether to end on sentence boundaries
 */

/**
 * @typedef {Object} ModelStats
 * @property {number} vocabularySize - Size of model vocabulary
 * @property {number} totalTransitions - Total number of transitions
 * @property {number} startSequences - Number of start sequences
 * @property {number} endSequences - Number of end sequences
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class EnhancedLLM {
  /**
   * @param {number} [order=1] - Order of the Markov chain
   * @throws {ValidationError} If order is invalid
   */
  constructor(order = 1) {
    this.validateOrder(order);
    this.order = order;
    this.wordTransitions = new Map();
    this.startSequences = new Set();
    this.endSequences = new Set();
    this.totalTokens = 0;
  }

  /**
   * Validates the Markov chain order
   * @private
   * @param {number} order - Order to validate
   * @throws {ValidationError} If order is invalid
   */
  validateOrder(order) {
    if (!Number.isInteger(order) || order < 1 || order > 5) {
      throw new ValidationError('Order must be an integer between 1 and 5');
    }
  }

  /**
   * Validates and preprocesses input text
   * @private
   * @param {string} text - Text to validate and preprocess
   * @returns {string[]} Preprocessed tokens
   * @throws {ValidationError} If text is invalid
   */
  preprocessText(text) {
    if (typeof text !== 'string') {
      throw new ValidationError('Input text must be a string');
    }

    if (!text.trim()) {
      throw new ValidationError('Input text cannot be empty');
    }

    // Clean and tokenize text
    const tokens = text
      .replace(/\s+/g, ' ')
      .replace(/([.!?])\s*/g, ' $1 ')
      .trim()
      .split(/\s+/);

    if (tokens.length < this.order + 1) {
      throw new ValidationError(
        `Input text must contain at least ${this.order + 1} tokens`
      );
    }

    return tokens;
  }

  /**
   * Gets n-gram sequence from tokens
   * @private
   * @param {string[]} tokens - Array of tokens
   * @param {number} startIndex - Starting index
   * @returns {string} N-gram sequence
   */
  getNGram(tokens, startIndex) {
    return tokens.slice(startIndex, startIndex + this.order).join(' ');
  }

  /**
   * Validates generation options
   * @private
   * @param {GenerationOptions} options - Options to validate
   * @throws {ValidationError} If options are invalid
   */
  validateOptions(options) {
    const {
      minLength = 10,
      maxLength = 50,
      temperature = 1.0,
      endOnSentence = true
    } = options;

    if (!Number.isInteger(minLength) || minLength < 1) {
      throw new ValidationError('minLength must be a positive integer');
    }

    if (!Number.isInteger(maxLength) || maxLength < minLength) {
      throw new ValidationError('maxLength must be >= minLength');
    }

    if (typeof temperature !== 'number' || temperature <= 0) {
      throw new ValidationError('temperature must be a positive number');
    }

    if (typeof endOnSentence !== 'boolean') {
      throw new ValidationError('endOnSentence must be a boolean');
    }
  }

  /**
   * Trains the model on input text
   * @param {string} text - Training text
   * @throws {ValidationError} If input is invalid
   */
  train(text) {
    const tokens = this.preprocessText(text);
    this.totalTokens += tokens.length;

    // Store starting sequences
    this.startSequences.add(this.getNGram(tokens, 0));

    for (let i = 0; i < tokens.length - this.order; i++) {
      const currentGram = this.getNGram(tokens, i);
      const nextToken = tokens[i + this.order];

      // Handle sentence endings
      if (nextToken.match(/[.!?]$/)) {
        this.endSequences.add(currentGram);
      }

      // Update transition probabilities
      if (!this.wordTransitions.has(currentGram)) {
        this.wordTransitions.set(currentGram, new Map());
      }

      const transitions = this.wordTransitions.get(currentGram);
      transitions.set(nextToken, (transitions.get(nextToken) || 0) + 1);
    }
  }

  /**
   * Selects next token using weighted random selection
   * @private
   * @param {Map<string, number>} transitions - Transition probabilities
   * @param {number} temperature - Temperature for randomness
   * @returns {string} Selected token
   */
  selectNextToken(transitions, temperature) {
    const entries = Array.from(transitions.entries());
    const total = entries.reduce((sum, [_, prob]) => 
      sum + Math.pow(prob, 1 / temperature), 0);

    const rand = Math.random() * total;
    let cumulative = 0;

    for (const [token, prob] of entries) {
      cumulative += Math.pow(prob, 1 / temperature);
      if (rand <= cumulative) {
        return token;
      }
    }

    return entries[entries.length - 1][0];
  }

  /**
   * Generates text based on the trained model
   * @param {string} [startPhrase] - Optional starting phrase
   * @param {GenerationOptions} [options] - Generation options
   * @returns {string} Generated text
   * @throws {ValidationError} If parameters are invalid
   */
  generate(startPhrase = null, options = {}) {
    if (!this.wordTransitions.size) {
      throw new ValidationError('Model must be trained before generating text');
    }

    this.validateOptions(options);

    const {
      minLength = 10,
      maxLength = 50,
      temperature = 1.0,
      endOnSentence = true
    } = options;

    // Validate start phrase if provided
    let currentGram;
    if (startPhrase !== null) {
      if (typeof startPhrase !== 'string') {
        throw new ValidationError('Start phrase must be a string');
      }
      currentGram = startPhrase.toLowerCase();
      if (!this.wordTransitions.has(currentGram)) {
        throw new ValidationError('Start phrase not found in training data');
      }
    } else {
      currentGram = Array.from(this.startSequences)[
        Math.floor(Math.random() * this.startSequences.size)
      ];
    }

    const generatedTokens = currentGram.split(' ');

    try {
      while (generatedTokens.length < maxLength) {
        const transitions = this.wordTransitions.get(currentGram);
        if (!transitions) break;

        const nextToken = this.selectNextToken(transitions, temperature);
        generatedTokens.push(nextToken);

        // Update current gram
        currentGram = generatedTokens
          .slice(-(this.order))
          .join(' ');

        // Check ending conditions
        if (endOnSentence && 
            nextToken.match(/[.!?]$/) && 
            generatedTokens.length >= minLength) {
          break;
        }
      }

      return generatedTokens.join(' ');
    } catch (error) {
      throw new ValidationError('Error during text generation: ' + error.message);
    }
  }

  /**
   * Gets model statistics
   * @returns {ModelStats} Model statistics
   */
  getStats() {
    return {
      vocabularySize: this.wordTransitions.size,
      totalTransitions: Array.from(this.wordTransitions.values())
        .reduce((sum, transitions) => 
          sum + Array.from(transitions.values())
            .reduce((s, count) => s + count, 0), 0),
      startSequences: this.startSequences.size,
      endSequences: this.endSequences.size,
      totalTokens: this.totalTokens,
      averageTransitionsPerState: this.wordTransitions.size > 0
        ? Array.from(this.wordTransitions.values())
          .reduce((sum, transitions) => sum + transitions.size, 0) / 
          this.wordTransitions.size
        : 0
    };
  }
}

// Example test suite
function runTests() {
  const tests = [
    // Constructor tests
    () => {
      const llm = new EnhancedLLM(2);
      console.assert(llm.order === 2, 'Constructor should set correct order');
    },
    () => {
      try {
        new EnhancedLLM(0);
        throw new Error('Should not allow order < 1');
      } catch (e) {
        console.assert(e instanceof ValidationError, 'Should throw ValidationError');
      }
    },

    // Training tests
    () => {
      const llm = new EnhancedLLM(1);
      llm.train('This is a test.');
      console.assert(llm.wordTransitions.size > 0, 'Training should populate transitions');
    },
    () => {
      const llm = new EnhancedLLM(1);
      try {
        llm.train('');
        throw new Error('Should not allow empty training text');
      } catch (e) {
        console.assert(e instanceof ValidationError, 'Should throw ValidationError');
      }
    },

    // Generation tests
    () => {
      const llm = new EnhancedLLM(1);
      llm.train('This is a test. This is another test.');
      const generated = llm.generate(null, { minLength: 3, maxLength: 10 });
      console.assert(typeof generated === 'string' && generated.length > 0,
        'Should generate non-empty text');
    },
    () => {
      const llm = new EnhancedLLM(1);
      try {
        llm.generate();
        throw new Error('Should not generate without training');
      } catch (e) {
        console.assert(e instanceof ValidationError, 'Should throw ValidationError');
      }
    }
  ];

  let passed = 0;
  tests.forEach((test, index) => {
    try {
      test();
      passed++;
      console.log(`Test ${index + 1}: Passed`);
    } catch (error) {
      console.error(`Test ${index + 1}: Failed - ${error.message}`);
    }
  });

  console.log(`\n${passed}/${tests.length} tests passed`);
}

// Usage example
try {
  const llm = new EnhancedLLM(2);
  llm.train("The quick brown fox jumps over the lazy dog. The dog barks at the fox. The fox runs away quickly.");

  console.log("Generated text:", llm.generate(null, {
    minLength: 8,
    maxLength: 20,
    temperature: 0.8,
    endOnSentence: true
  }));

  console.log("Model stats:", llm.getStats());

  // Run tests
  runTests();
} catch (error) {
  console.error("Error:", error.message);
}
