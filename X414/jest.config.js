module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  transformIgnorePatterns: [
    'node_modules/(?!(@noble|expo|@expo|react-native|@react-native)/)',
  ],
};
