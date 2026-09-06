import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import mainConfig from './webpack.main.config.js';
import rendererConfig from './webpack.renderer.config.js';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Codryn',
    executableName: 'Codryn',
    extraResource: [
      path.resolve(__dirname, '../../tests/support/fixtures/process'),
      path.resolve(__dirname, '../../tests/support/fixtures/r2-project')
    ]
  },
  makers: [
    new MakerSquirrel({ name: 'codryn' }),
    new MakerZIP({}, ['win32'])
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [{
          html: './src/renderer/index.html',
          js: './src/renderer/index.ts',
          name: 'main_window',
          preload: { js: './src/preload.ts' }
        }]
      }
    })
  ]
};

export default config;
