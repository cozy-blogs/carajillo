
import {LitElement, html, css, PropertyDeclarations} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Task} from '@lit/task';
import {repeat} from 'lit/directives/repeat.js';
import {consume} from '@lit/context';
import {Settings, tokenContext, settingsContext} from './context';
import {MdSwitch} from '@material/web/switch/switch';
import {SubscriptionStatus, UpdateSubscriptionRequest} from '../backend/subscribe';

@customElement('mailer-subscription-control')
export class Subscription extends LitElement {
  static properties = {
    data: { type: Object, attribute: false },
    autosubscribe: { type: Boolean },
  }

  @consume({context: tokenContext})
  @property({attribute: false})
  private token?: string;

  // @todo not needed?
  @consume({context: settingsContext})
  @property({attribute: false})
  public settings?: Settings;

  data?: SubscriptionStatus;
  autosubscribe?: boolean = true;

  // @todo autosubscribe
  // https://lit.dev/docs/components/events/#adding-event-listeners-to-other-elements

  render() {
    if (this.data !== undefined) {
      const data = this.data;
      const status = this.updateSubscriptionTask.render({
        pending: () => html`<md-linear-progress indeterminate></md-linear-progress>`,
        complete: () => html``,
        error: (error) => html`<md-suggestion-chip><md-icon slot="icon">error</md-icon>${error}</md-suggestion-chip>`
      })

      // @todo show e-mail, company name
      // @todo use fab https://material-web.dev/components/fab/ for main subscription
      // @todo label https://material-web.dev/components/switch/#label
      return html`
        <md-list>
          <md-list-item type="button">
            <div slot="headline">Subscribe for newsletter</div>
            <div slot="trailing-supporting-text">
              <md-switch icons id="subscribe" ?selected=${data.subscribed} @change=${this.onChange}></md-switch>
            </div>
          </md-list-item>
          ${repeat(
            data.mailingLists,
            (list) => list.id,
            (list, index) => html`
              <mailer-list-subscription id=${list.id} name=${list.name} description=${list.description}
                ?selected=${list.subscribed} ?disabled=${!data.subscribed}
                @change=${this.onChange}>
              </mailer-list-subscription>`
          )}
        </md-list>
        ${status}`;
    }
  }

  private updateSubscriptionTask = new Task(this, {
    task: async ([data, token], {signal}) => {
      if (token === undefined) {
        throw new Error('missing authorization token');
      }
      if (data === undefined)
        return;
      
      const email = data.email;
      const subscribe : boolean = this.querySelector<MdSwitch>('#subscribe')?.selected || false;
      const mailingLists : Record<string, boolean> = {};
      this.querySelectorAll<ListSubscription>('mailer-list-subscription').forEach((list) => {
        mailingLists[list.id] = list.subscribed;
      })

      const request : UpdateSubscriptionRequest = {email, subscribe, mailingLists};
      try {
        const response = await fetch(`/api/subscribe`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(request)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        this.dispatchEvent(new CustomEvent('error', {detail: {error}}));
      }
    },
    args: () => [this.data, this.token],
    autoRun: false,
  });

  private async onChange(e: Event) {
    this.updateSubscriptionTask.run();
    //if (this.data === undefined)
    //  return;
    //const email = this.data.email;
    //const subscribe : boolean = this.querySelector<MdSwitch>('#subscribe')?.selected || false;
    //const mailingLists : Record<string, boolean> = {};
    //this.querySelectorAll<ListSubscription>('mailer-list-subscription').forEach((list) => {
    //  mailingLists[list.id] = list.subscribed;
    //})

    //const request : UpdateSubscriptionRequest = {email, subscribe, mailingLists};
    //try {
    //  // @todo show processing state
    //  await fetch(`/api/subscribe`, {
    //    method: 'PUT',
    //    headers: {
    //      'Authorization': `Bearer ${this.token}`,
    //      'Accept': 'application/json',
    //      'Content-Type': 'application/json; charset=utf-8',
    //    },
    //    body: JSON.stringify(request)
    //  });
    //} catch (error) {
    //  this.dispatchEvent(new CustomEvent('error', {detail: {error}}));
    //}
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