import type { Configuration } from 'webpack';
import rules from './webpack.rules.js';

const config: Configuration = {
  target: 'electron-main',
  entry: {
    index: './src/main.ts',
    'repo-map-worker': './../../backend/infrastructure/src/context/repo-map-worker.ts',
    'typescript-query-worker': './../../backend/infrastructure/src/typescript/typescript-query-worker.ts'
  },
  output: { filename: '[name].js' },
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,
  module: { rules },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
    extensionAlias: { '.js': ['.js', '.ts'] }
  }
};

export default config;
