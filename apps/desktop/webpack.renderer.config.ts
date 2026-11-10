import type { Configuration } from 'webpack';
import rules from './webpack.rules.js';

const config: Configuration = {
  target: 'web',
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,
  module: {
    rules: [
      ...rules,
      { test: /\.css$/, type: 'asset/source' },
      { test: /\.woff2$/,type:'asset/resource' }
    ]
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx', '.json'],
    extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
  }
};

export default config;
