
import {LitElement, html, css, PropertyDeclarations} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Task} from '@lit/task';
import {repeat} from 'lit/directives/repeat.js';
import {consume} from '@lit/context';
import {Settings, tokenContext, settingsContext} from './context';

// https://material-web.dev/components/list/
// https://material-web.dev/components/switch/
// todo show e-mail, company name

interface MailingList {
    /**
     * The ID of the list.
     */
    id: string;
    /**
     * The name of the list.
     */
    name: string;
    /**
     * The list's description.
     */
    description: string | null;
}

type SubscriptionResponse = MailingList[];

@customElement('mailer-subscription-control')
export class Subscription extends LitElement {
  static properties = {
    mailingLists: { type: Object, attribute: false }
  }

  @consume({context: tokenContext})
  @property({attribute: false})
  private token?: string;

  @consume({context: settingsContext})
  @property({attribute: false})
  public settings?: Settings;

  @property({attribute: true})
  public subscribed?: boolean = true;

  _fetchSubscriptionsTask = new Task(this, {
    task: async ([token, settings], {signal}) => {
      const response = await fetch(`/api/subscribe`, {signal});
      if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
      return await response.json() as SubscriptionResponse;
    },
    args: () => [this.token, this.settings]
  });

  render() {
    return this._fetchSubscriptionsTask.render({
      pending: () => html`<md-circular-progress four-color indeterminate></md-circular-progress>`,
      complete: (mailingLists) => html`
        <div style="width:20rem">
          <md-list>
            <md-list-item type="button">
              <div slot="headline">Subscribe for newsletter</div>
              <div slot="trailing-supporting-text">
                <md-switch icons ?selected=${this.subscribed}></md-switch>
              </div>
            </md-list-item>
            ${repeat(
              mailingLists,
              (list) => list.id,
              (list, index) => html`
                <mailer-list-subscription id=${list.id} name=${list.name} description=${list.description} ?disabled=${!this.subscribed}>
                </mailer-list-subscription>`
      )}

          </md-list>
          <md-linear-progress indeterminate></md-linear-progress>
        </div>
        `,
      error: (e) => html`<p>Error: ${e}</p>`
    });
  }
}

@customElement('mailer-list-subscription')
export class ListSubscription extends LitElement {

  static properties = {
    mailingListId: { type: String },
    name: { type: String },
    description: { type: String },
    subscribed: { type: Boolean },
    disabled: { type: Boolean },
  };

  mailingListId?: string;
  name?: string;
  description?: string;
  subscribed: boolean = false;
  disabled: boolean = false;

  static styles = css`
    .name { font-weight: 600 }
    .description { font-style: italic; } 
  `;

  render(){
    return html`
      <md-list-item type="button">
        <md-icon slot="start">label</md-icon>
        <div slot="headline">${this.name}</div>
        <div slot="supporting-text">${this.description}</div>
        <div slot="trailing-supporting-text">
          <md-switch icons ?selected=${this.subscribed} ?disabled=${this.disabled}></md-switch>
        </div>
      </md-list-item>
    `;
  }

}
