
import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';

// https://material-web.dev/components/list/
// https://material-web.dev/components/switch/

@customElement('mailier-list-subscription')
export class ListSubscription extends LitElement {

  static properties = {
    mailingListId: { type: String },
    name: { type: String },
    description: { type: String },
    subscribed: { type: Boolean },
  };

  mailingListId?: string;
  name?: string;
  description?: string;
  subscribed: boolean = false;

  static styles = css`
    .name { font-weight: 600 }
    .description { font-style: italic; } 
  `;

  render(){
    return html`<label>
      <span class="name">${this.name}</span>
      <span class="description">${this.description}</span>
      <input name="mailing-list" value=${this.mailingListId} type="checkbox" ?checked=${this.subscribed}>
    </label>`;
  }

}