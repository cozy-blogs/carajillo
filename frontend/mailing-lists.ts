
import {LitElement, html, css, PropertyDeclarations} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Task} from '@lit/task';
import {repeat} from 'lit/directives/repeat.js';
import {consume} from '@lit/context';
import {Settings, tokenContext, settingsContext} from './context';
import {MdSwitch} from '@material/web/switch/switch';
import {UpdateSubscriptionRequest} from '../backend/subscribe';

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

    subscribed: boolean;
}

export interface SubscriptionStatus {
  success: boolean;
  email: string;
  subscribed: boolean;
  mailingLists: MailingList[];
}

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

  // @property({attribute: true})
  // public subscribed?: boolean = true;

  _fetchSubscriptionsTask = new Task(this, {
    task: async ([token, settings], {signal}) => {
      const response = await fetch(`/api/subscribe`, {
        headers: {Authorization: `Bearer ${token}`},
        signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // @todo handle token refresh
      return await response.json() as SubscriptionStatus;
    },
    args: () => [this.token, this.settings]
  });

  render() {
    // @todo label https://material-web.dev/components/switch/#label
    return this._fetchSubscriptionsTask.render({
      pending: () => html`<md-circular-progress four-color indeterminate></md-circular-progress>`,
      complete: (status) => html`
        <div style="width:20rem">
          <md-list>
            <md-list-item type="button">
              <div slot="headline">Subscribe for newsletter</div>
              <div slot="trailing-supporting-text">
                <md-switch icons id="subscribe" ?selected=${status.subscribed} @change=${this.onChange}></md-switch>
              </div>
            </md-list-item>
            ${repeat(
              status.mailingLists,
              (list) => list.id,
              (list, index) => html`
                <mailer-list-subscription id=${list.id} name=${list.name} description=${list.description}
                  ?selected=${list.subscribed} ?disabled=${!status.subscribed}
                  @change=${this.onChange}>
                </mailer-list-subscription>`
      )}

          </md-list>
          <md-linear-progress indeterminate></md-linear-progress>
        </div>
        `,
      error: (e) => html`<p>Error: ${e}</p>`
    });
  }

  private async onChange(e: Event) {
    const subscribe : boolean = this.querySelector<MdSwitch>('#subscribe')?.selected || false;
    const mailingLists : Record<string, boolean> = {};
    this.querySelectorAll<ListSubscription>('mailer-list-subscription').forEach((list) => {
      mailingLists[list.id] = list.subscribed;
    })

    // const request : UpdateSubscriptionRequest = {subscribe, mailingLists};
    
    // const response = await fetch(`/api/subscribe`, {
    //   method: 'PUT',
    //   headers: {
    //     'Authorization': `Bearer ${this.token}`,
    //     'Accept': 'application/json',
    //     'Content-Type': 'application/json; charset=utf-8',
    //   },
    //   body: JSON.stringify(request)
    // });
    // @todo handle error
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
          <md-switch icons ?selected=${this.subscribed} ?disabled=${this.disabled} @change=${this.onChange}></md-switch>
        </div>
      </md-list-item>
    `;
  }

  private onChange(e: Event) {
    const subscribe = (e.target as MdSwitch).selected;
    this.subscribed = subscribe;
    this.dispatchEvent(new SubscriptionChangeEvent(this.mailingListId, subscribe));
  }
}

class SubscriptionChangeEvent extends Event {
  subscribe: boolean;
  mailingListId?: string;

  constructor(mailingListId: string | undefined, subscribe: boolean) {
    super('change');
    this.mailingListId = mailingListId;
    this.subscribe = subscribe;
  }
}