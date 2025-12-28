
import '@material/web/all.js'; // @todo minimize imports
import './mailing-lists';
import './company';
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { provide } from '@lit/context';
import { Task } from '@lit/task';
import { msg } from '@lit/localize';
import { apiRoot, tokenContext } from './context';
import { initializeLocale } from './localize';
import { SubscriptionChangeEvent } from './mailing-lists';
import type { SubscriptionStatus, UpdateSubscriptionRequest } from '../backend/subscription';
import type { Company } from './company';
import JSConfetti from 'js-confetti';

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
  private confetti = new JSConfetti();

  @property({type: Boolean})
  public autosubscribe?: boolean;

  @provide({context: tokenContext})
  protected token: string | undefined = getToken();

  @state()
  protected company?: Company;

  @state()
  protected subscription?: SubscriptionStatus;

  public async connectedCallback() {
    super.connectedCallback();
    await initializeLocale();
    if (window.document.visibilityState === 'visible') {
      this.handleAutosubscribe();
    }
    window.addEventListener('visibilitychange', this.handleAutosubscribe.bind(this));
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('visibilitychange', this.handleAutosubscribe.bind(this));
  }

  public subscribe() {
    this.updateSubscriptionTask.run([{
      email: this.subscription!.email,
      subscribe: true,
    }]);
  }

  public unsubscribe() {
    this.updateSubscriptionTask.run([{
      email: this.subscription!.email,
      subscribe: false,
    }]);
  }

  protected onMailingListChange(e: SubscriptionChangeEvent) {
    this.updateSubscriptionTask.run([{
      email: this.subscription!.email,
      subscribe: true,
      mailingLists: {[e.mailingListId]: e.subscribe}
    }]);
  }

  protected get useMailingLists(): boolean {
    return this.subscription?.mailingLists !== undefined && this.subscription.mailingLists.length > 0;
  }

  static styles = css`
    :host {
      font-family: var(--md-sys-typeface-plain);
      color: var(--md-sys-color-on-surface);
      background-color: var(--md-sys-color-surface);
    }
    .container {
      box-sizing: border-box;
      height: 100vh;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 1rem;
    }
    @media (min-width: 600px) {
      .container {
        width: 500px;
        height: fit-content;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 1rem;
      }
    }

    .update-status {
      min-height: var(--md-linear-progress-active-indicator-height, 4px);
    }
  `;

  protected render() {
    return this.fetchSubscriptionTask.render({
      pending: () => html`<md-circular-progress four-color indeterminate></md-circular-progress>`,
      complete: ([company, subscription]) => {
        const updateStatus = this.updateSubscriptionTask.render({
          pending: () => html`<md-linear-progress indeterminate></md-linear-progress>`,
          complete: () => html``,
          error: (error) => html`<md-suggestion-chip><md-icon slot="icon">error</md-icon>${String(error)}</md-suggestion-chip>`
        });
        return html`
          <div class="container">  
            <mailer-company .company=${company}></mailer-company>
            <div class="update-status">
              ${updateStatus}
            </div>
            ${this.renderSubscriptionStatus(company, subscription)}
          </div>`;
      },
      error: (error) => html`<mailer-status-message><md-icon slot="icon">error</md-icon>${String(error)}</mailer-status-message>`
    });
  }

  protected renderSubscriptionStatus(company: Company, subscription: SubscriptionStatus) {
    const subscribed = subscription.optInStatus === 'accepted';

    if (subscribed) {
      return html`
        <mailer-status-message><md-icon slot="icon">check_circle</md-icon>${msg('Your subscription has been confirmed.')}<br/>
          ${msg('You may now close this window or update your subscription.')}</mailer-status-message>
        ${subscription.mailingLists?.length > 0
           ? html`<mailer-mailing-lists
           .mailingLists=${subscription.mailingLists}
           ?disabled=${!subscription.subscribed}
           @change=${this.onMailingListChange}></mailer-mailing-lists>` : html``}
        <md-outlined-button @click=${this.unsubscribe}>${msg('Unsubscribe')}<md-icon slot="icon">unsubscribe</md-icon></md-outlined-button>
      `;
    } else {
      return html`
        <mailer-status-message><md-icon slot="icon">unsubscribe</md-icon>${msg('You are unsubscribed from all mailing lists.')}</mailer-status-message>
        <md-filled-button @click=${this.subscribe}>${msg('Subscribe')}<md-icon slot="icon">mail</md-icon></md-filled-button>`;
    }
  }

  private fetchSubscriptionTask = new Task(this, {
    task: async ([token], {signal}) => {
      if (token === undefined) {
        throw new Error(msg('Missing authorization token'));
      }
      const [companyResponse, subscriptionResponse] = await Promise.all([
        fetch(`${apiRoot}/company`, {
          headers: {Authorization: `Bearer ${token}`},
          signal
        }), fetch(`${apiRoot}/subscription`, {
          headers: {Authorization: `Bearer ${token}`},
          signal
        })
      ]);
      if (!companyResponse.ok) {
        throw new Error(msg('Failed to fetch company information'));
      }
      if (!subscriptionResponse.ok) {
        // @todo handle token refresh
        throw new Error(msg('Failed to fetch subscription status'));
      }
      this.company = await companyResponse.json() as Company;

      this.subscription = await subscriptionResponse.json() as SubscriptionStatus;
      this.handleAutosubscribe();

      return [this.company, this.subscription];
    },
    args: () => [this.token]
  });
  
  private updateSubscriptionTask = new Task<[UpdateSubscriptionRequest], void>(this, {
    task: async ([update], {signal}) => {
      if (this.token === undefined) {
        throw new Error(msg('Missing authorization token'));
      }
      if (this.subscription === undefined)
        throw new Error(msg('Subscription not found'));
      
      const response = await fetch(`${apiRoot}/subscription`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(update),
        signal
      });
      if (!response.ok) {
        throw new Error(msg('Failed to update subscription'));
      }

      if (this.subscription.optInStatus === 'pending' && update.subscribe) {
        this.confetti.addConfetti({
          emojis: ['🎉', '🎊', '🦄', '🎁', '✉️']
        });
      }

      this.subscription.subscribed = update.subscribe;
      this.subscription.optInStatus = update.subscribe ? 'accepted' : 'rejected';
      if (update.mailingLists !== undefined) {
        Object.entries(update.mailingLists).forEach(([listId, subscribed]) => {
          this.subscription!.mailingLists.find((list) => list.id === listId)!.subscribed = subscribed;
        });
      }
      this.requestUpdate();
    },
    autoRun: false,
  });

  private handleAutosubscribe() {
    console.info('handleAutosubscribe', window.document.visibilityState, this.autosubscribe, this.subscription?.optInStatus);
    if (window.document.visibilityState === 'visible' && this.autosubscribe && this.subscription?.optInStatus === 'pending') {
      this.updateSubscriptionTask.run([{
        email: this.subscription!.email,
        subscribe: true,
      }]);
    }
  }

}

@customElement('mailer-status-message')
export class StatusMessage extends LitElement {

  static styles = css`
    :host {
      display: block;
    }
    p {
      display: flex;
      flex-direction: row;
      gap: 1rem;
      margin-top: 1rem;
      margin-bottom: 1rem;
    }
  `;

  protected render() {
    return html`<p><slot name="icon"></slot><slot></slot></p>`;
  }
}