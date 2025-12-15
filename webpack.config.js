// Frontend build

const webpack = require('webpack');
const path = require('path');


const HtmlWebpackPlugin = require('html-webpack-plugin');
const GenerateJsonPlugin = require('generate-json-webpack-plugin');

// @todo only use RECAPTCHA_SITE_KEY
// https://webpack.js.org/configuration/dotenv/
require('dotenv').config();

module.exports = {
  mode: process.env.NODE_ENV === 'develepoment' ? 'development' : 'production',
  entry: {
    main: path.resolve(__dirname, 'frontend/main.ts'),
  },
  output: {
    path: path.resolve(__dirname, 'frontend/dist'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Subscribe control panel',
      template: 'frontend/index.html'
    }),
    new HtmlWebpackPlugin({
      filename: '404.html',
      template: 'frontend/404.html'
    }),
    new GenerateJsonPlugin('api/recaptcha', {
      success: true,
      recaptcha_site_key: process.env.RECAPTCHA_SITE_KEY
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};

