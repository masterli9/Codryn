import type { Configuration } from 'webpack';
import rules from './webpack.rules.js';

const config: Configuration = {
  target: 'electron-main',
  entry: './src/main.ts',
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,
  module: { rules },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
    extensionAlias: { '.js': ['.js', '.ts'] }
  }
};

export default config;
