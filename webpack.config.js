const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const buildFolder = path.resolve(__dirname, 'build')

module.exports = (_env, argv) => {
  const commonConfig = {
    output: {
      path: buildFolder,
      filename: '[name].js'
    },
    // Source maps in files. The default for development builds uses eval,
    // which Electron warns about.
    devtool: argv.mode == 'development' ? 'source-map' : false,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.ts', '.tsx', '.jsx', '.json']
    },
    node: {
      __dirname: false
    }
  }

  return [
    {
      name: 'main',
      target: 'electron-main',
      entry: { main: './src/main/index.ts' },
      ...commonConfig
    },
    {
      name: 'gui',
      target: 'electron-renderer',
      entry: { gui: './src/gui/index.tsx' },
      plugins: [
        new HtmlWebpackPlugin({
          template: 'src/gui/index.html'
        })
      ],
      // Used by yarn dev-server. The main process loads the GUI from here in dev mode.
      devServer: {
        static: buildFolder,
        port: 8080
      },
      ...commonConfig
    }
  ]
}
