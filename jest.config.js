module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/backend'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch)/)',
  ],
  collectCoverageFrom: [
    'backend/**/*.ts',
    '!backend/**/*.d.ts',
    '!backend/openapi-spec.ts',
    '!backend/__tests__/**',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/backend/__tests__/setup.ts'],
};

