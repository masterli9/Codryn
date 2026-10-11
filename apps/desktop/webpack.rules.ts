import type { RuleSetRule } from 'webpack';

const rules: RuleSetRule[] = [
  {
    test: /\.tsx?$/,
    exclude: /node_modules/,
    use: {
      loader: 'ts-loader',
      options: { transpileOnly: true }
    }
  }
];

export default rules;
