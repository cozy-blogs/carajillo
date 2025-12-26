
import '@material/web/all.js'; // @todo minimize imports
import './mailing-lists';
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { provide } from '@lit/context';
import { Task } from '@lit/task';
import { msg } from '@lit/localize';
import { MdSwitch } from '@material/web/switch/switch';
import { query } from 'lit/decorators/query.js';
import { queryAll } from 'lit/decorators/query-all.js';
import { repeat } from 'lit/directives/repeat.js';
import { apiRoot, tokenContext } from './context';
import { initializeLocale } from './localize';
import { ListSubscription } from './mailing-lists';
import type { SubscriptionStatus, UpdateSubscriptionRequest } from '../backend/subscription';

function getToken(): string | undefined {
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  if (token === null) {
    return undefined;
  } else {
    return token;
  }
}

@customElement('mailer-control-panel')
export class ControlPanel extends LitElement {

  @property({type: Boolean})
  public autosubscribe?: boolean = true;

  @provide({context: tokenContext})
  protected token = getToken();

  @state()
  protected data?: SubscriptionStatus;

  @query('#subscribe')
  private subscribeSwitch?: MdSwitch;

  @queryAll('mailer-list-subscription')
  private mailingListItems?: NodeListOf<ListSubscription>;

  public async connectedCallback() {
    super.connectedCallback();
    await initializeLocale();
  }

  // @todo update name?

  // @todo autosubscribe
  // https://lit.dev/docs/components/events/#adding-event-listeners-to-other-elements

  protected render() {
    return this.fetchSubscriptionTask.render({
      pending: () => html`<md-circular-progress four-color indeterminate></md-circular-progress>`,
      complete: (status) => {
        return this.renderSubscriptionStatus(status);
      },
      error: (error) => html`<md-suggestion-chip><md-icon slot="icon">error</md-icon>${String(error)}</md-suggestion-chip>`
    });
  }

  protected renderSubscriptionStatus(subscription: SubscriptionStatus) {
    const data = subscription;
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
            <mailer-list-subscription .mailingListId=${list.id} .name=${list.name} .description=${list.description}
              ?subscribed=${list.subscribed} ?disabled=${!data.subscribed}
              @change=${this.onChange}>
            </mailer-list-subscription>`
        )}
      </md-list>
      ${status}`;
  }

  private fetchSubscriptionTask = new Task(this, {
    task: async ([token], {signal}) => {
      if (token === undefined) {
        throw new Error(msg('Missing authorization token'));
      }
      const response = await fetch(`${apiRoot}/subscription`, {
        headers: {Authorization: `Bearer ${token}`},
        signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // @todo handle token refresh
      this.data = await response.json() as SubscriptionStatus;
      return this.data;
    },
    args: () => [this.token]
  });
  
  private updateSubscriptionTask = new Task(this, {
    task: async ([data, token], {signal}) => {
      if (token === undefined) {
        throw new Error(msg('Missing authorization token'));
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