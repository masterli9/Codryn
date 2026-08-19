import type { Configuration } from 'webpack';
import rules from './webpack.rules.js';

const config: Configuration = {
  target: 'web',
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,
  module: {
    rules: [
      ...rules,
      { test: /\.css$/, type: 'asset/source' }
    ]
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
    extensionAlias: { '.js': ['.js', '.ts'] }
  }
};

export default config;
