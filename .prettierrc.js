module.exports = {
  printWidth: 80,
  useTabs: false,
  tabWidth: 2,
  trailingComma: "none",
  arrowParens: "avoid",
  overrides: [
    {
      files: "*.json",
      options: {
        parser: "json",
        useTabs: false
      }
    }
  ]
};
