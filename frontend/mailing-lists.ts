
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { query } from 'lit/decorators/query.js';
import { queryAll } from 'lit/decorators/query-all.js';
import { repeat } from 'lit/directives/repeat.js';
import { Task } from '@lit/task';
import { consume } from '@lit/context';
import { msg } from '@lit/localize';
import { MdSwitch } from '@material/web/switch/switch';
import { apiRoot, tokenContext } from './context';
import { SubscriptionStatus, UpdateSubscriptionRequest } from '../backend/subscription';

@customElement('mailer-subscription-control')
export class Subscription extends LitElement {
  @consume({context: tokenContext})
  @property({attribute: false})
  private token?: string;

  @property({
    attribute: false,
    hasChanged: (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b)
  })
  public data?: SubscriptionStatus;

  @property({type: Boolean})
  public autosubscribe?: boolean = true;

  @query('#subscribe')
  private subscribeSwitch?: MdSwitch;

  @queryAll('mailer-list-subscription')
  private mailingListItems?: NodeListOf<ListSubscription>;

  // @todo update name?

  // @todo autosubscribe
  // https://lit.dev/docs/components/events/#adding-event-listeners-to-other-elements

  render() {
    if (this.data !== undefined) {
      const data = this.data;
      const status = this.updateSubscriptionTask.render({
        pending: () => html`<md-linear-progress indeterminate></md-linear-progress>`,
        complete: () => html``,
        error: (error) => html`<md-suggestion-chip><md-icon slot="icon">error</md-icon>${String(error)}</md-suggestion-chip>`
      })

      // @todo show e-mail, company name
      // @todo use fab https://material-web.dev/components/fab/ for main subscription
      // @todo label https://material-web.dev/components/switch/#label
      return html`
        <md-list>
          <md-list-item type="button">
            <div slot="headline">${msg('Subscribe for newsletter')}</div>
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
        throw new Error(msg('missing authorization token'));
      }
      if (this.data === undefined)
        return;
      
      const email = this.data.email;
      const subscribe : boolean = this.subscribeSwitch?.selected || false;
      const mailingLists : Record<string, boolean> = {};
      this.mailingListItems?.forEach((list) => {
        mailingLists[list.id] = list.subscribed;
      })

      const request : UpdateSubscriptionRequest = {email, subscribe, mailingLists};
      try {
        const response = await fetch(`${apiRoot}/subscription`, {
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

        this.data.subscribed = subscribe;
        this.data.mailingLists.forEach((list) => {
          list.subscribed = mailingLists[list.id];
        });
      } catch (error) {
        this.dispatchEvent(new CustomEvent('error', {detail: {error}}));
      }
    },
    args: () => [this.data, this.token],
    autoRun: false,
  });

  private async onChange(e: Event) {
    this.updateSubscriptionTask.run();
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