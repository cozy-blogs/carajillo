// Frontend build

const webpack = require('webpack');
const path = require('path');


const HtmlWebpackPlugin = require('html-webpack-plugin');
const GenerateJsonPlugin = require('generate-json-webpack-plugin');

// @todo only use RECAPTCHA_SITE_KEY
// https://webpack.js.org/configuration/dotenv/
require('dotenv').config();

function generateCaptchaConfig() {
  switch (process.env.CAPTCHA_PROVIDER || 'none') {
    case 'none':
      return {
        success: true,
        provider: 'none',
        site_key: '',
      };
    case 'recaptcha':
      return {
        success: true,
        provider: 'recaptcha',
        site_key: process.env.RECAPTCHA_SITE_KEY,
      };
    case 'hcaptcha':
      return {
        success: true,
        provider: 'hcaptcha',
        site_key: process.env.HCAPTCHA_SITE_KEY,
      };
    default:
      throw new Error(`Unsupported CAPTCHA provider: ${process.env.CAPTCHA_PROVIDER}`);
  }
}

module.exports = {
  mode: process.env.NODE_ENV === 'develepoment' ? 'development' : 'production',
  entry: {
    'subscribe': path.resolve(__dirname, 'frontend/subscribe.ts'),
    'control-panel': path.resolve(__dirname, 'frontend/control-panel.ts'),
  },
  output: {
    path: path.resolve(__dirname, 'frontend/dist'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Subscribe',
      filename: 'index.html',
      template: 'frontend/index.html',
      chunks: ['subscribe'],
    }),
    new HtmlWebpackPlugin({
      title: 'Subscription control panel',
      filename: 'control-panel.html',
      template: 'frontend/control-panel.html',
      chunks: ['control-panel'],
    }),
    new HtmlWebpackPlugin({
      filename: '404.html',
      template: 'frontend/404.html',
      chunks: [],
    }),
    new GenerateJsonPlugin('api/captcha', generateCaptchaConfig()),
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

