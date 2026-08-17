export default {
  forbidden: [
    {
      name: 'core-must-not-import-infrastructure',
      severity: 'error',
      from: { path: '^backend/core/' },
      to: { path: '^(backend/infrastructure/|apps/desktop/)' }
    },
    {
      name: 'shared-must-stay-independent',
      severity: 'error',
      from: { path: '^shared/' },
      to: { path: '^(backend/|apps/desktop/|tests/)' }
    },
    {
      name: 'renderer-must-use-preload',
      severity: 'error',
      from: { path: '^apps/desktop/src/renderer/' },
      to: { path: '^(backend/|apps/desktop/src/(composition-root|ipc|smoke))' }
    },
    {
      name: 'production-must-not-import-test-support',
      severity: 'error',
      from: { path: '^(apps/|backend/|shared/)' },
      to: { path: '^tests/support/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'] },
    exclude: { path: '(node_modules|out|dist|coverage)' }
  }
};
