import type { RuleSetRule } from 'webpack';

const rules: RuleSetRule[] = [
  {
    test: /\.ts$/,
    exclude: /node_modules/,
    use: {
      loader: 'ts-loader',
      options: { transpileOnly: true }
    }
  }
];

export default rules;
