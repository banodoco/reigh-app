module.exports = {
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['tailwind', 'apply', 'layer', 'property', 'screen'],
      },
    ],
    'selector-attribute-operator-disallowed-list': ['*=', '^='],
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global', 'has'],
      },
    ],
  },
  ignoreFiles: ['dist/**', 'node_modules/**', '.desloppify/**'],
};
