const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    bundle: [ './src/app.js' ]
  },
  output: {
    path: __dirname + '/public',
    filename: 'app.js'
  },
  module: {
    rules: [
      {
        // Las dependencias en node_modules son CommonJS y no usan extensiones
        // en sus imports relativos; con "type":"module" en package.json,
        // webpack las trataría como ESM "fully specified" y fallaría a
        // resolverlas (p.ej. 'bpmn-js/lib/Modeler').
        test: /\.m?js$/,
        resolve: { fullySpecified: false }
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ]
      },
      {
        test: /\.bpmn$/,
        use: 'raw-loader'
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/index.html', to: '.' }
      ]
    }),
    // En local (npm run dev) se deja vacío y mcpClient.js usa el proxy /mcp
    // de webpack-dev-server. En producción (npm run build) se define con la
    // URL pública del servidor MCP desplegado, p.ej.
    // MCP_SERVER_URL=https://tfm-bpmn-mcp-server.onrender.com npm run build
    new webpack.DefinePlugin({
      MCP_SERVER_URL: JSON.stringify(process.env.MCP_SERVER_URL || '')
    })
  ],
  devServer: {
    proxy: [
      {
        context: ['/mcp'],
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    ]
  },
  mode: 'development',
  devtool: 'source-map'
};
