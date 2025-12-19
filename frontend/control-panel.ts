import './mailing-lists';

import '@material/web/all.js'; // @todo minimize imports
import '@material/web/icon/icon';

import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import {provide} from '@lit/context';
import {Settings, tokenContext, settingsContext} from './context';

const query = new URLSearchParams(window.location.search);
function getToken(): string | undefined {
  const token = query.get('token');
  if (token === null)
    return undefined;
    // throw new Error('missing authorization token');
  return token;
}
function getSettings(): Settings {
  return {
    language: query.get('lang') || 'en',
    event: query.get('event') || undefined,
  };
}

@customElement('mailer-control-panel')
export class ControlPanel extends LitElement {

  @provide({context: tokenContext})
  token = getToken();

  @provide({context: settingsContext})
  settings: Settings = getSettings();

  render() {
    return html`<mailer-subscription-control></mailer-subscription-control>`;
  }
}