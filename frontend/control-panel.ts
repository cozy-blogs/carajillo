// material components
import '@material/web/icon/icon';
import '@material/web/button/filled-button';
import '@material/web/button/filled-tonal-button';
import '@material/web/progress/linear-progress';
import '@material/web/progress/circular-progress';
import '@material/web/icon/icon';

// custom components
import './mailing-lists';
import './company';

// application
import { apiRoot, tokenContext } from './context';
import { initializeLocale } from './localize';
import { SubscriptionChangeEvent } from './mailing-lists';
import type { SubscriptionStatus, UpdateSubscriptionRequest } from '../backend/subscription';
import type { Company } from './company';

// lit
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { provide } from '@lit/context';
import { Task } from '@lit/task';
import { msg } from '@lit/localize';

// other third-party
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

@customElement('ca-control-panel')
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

  public close() {
    if (this.subscription?.referer) {
      window.location.href = this.subscription.referer;
    } else {
      window.location.href = `https://google.com/`;
    }
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
      --md-icon-size: 32px;
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
          error: (error) => html`<ca-status-message><md-icon slot="icon">error</md-icon>${String(error)}</ca-status-message>`
        });
        return html`
          <div class="container">  
            <ca-company .company=${company}></ca-company>
            <div class="update-status">
              ${updateStatus}
            </div>
            ${this.renderSubscriptionStatus(company, subscription)}
            ${subscription.referer ? html`<md-filled-button @click=${this.close}>${msg('Go back')}<md-icon slot="icon">sentiment_satisfied</md-icon></md-filled-button>` : html``}
          </div>`;
      },
      error: (error) => html`<ca-status-message><md-icon slot="icon">error</md-icon>${String(error)}</ca-status-message>`
    });
  }

  protected renderSubscriptionStatus(company: Company, subscription: SubscriptionStatus) {
    const subscribed = subscription.optInStatus === 'accepted';

    if (subscribed) {
      return html`
        <ca-status-message><md-icon slot="icon">verified</md-icon>${msg('Your subscription has been confirmed.')}<br/>
          ${msg('You may now close this window or update your subscription.')}</ca-status-message>
        ${subscription.mailingLists?.length > 0
           ? html`<ca-mailing-lists
           .mailingLists=${subscription.mailingLists}
           ?disabled=${!subscription.subscribed}
           @change=${this.onMailingListChange}></ca-mailing-lists>` : html``}
        <md-filled-tonal-button @click=${this.unsubscribe}>${msg('Unsubscribe')}<md-icon slot="icon">sentiment_dissatisfied</md-icon></md-filled-tonal-button>
      `;
    } else {
      return html`
        <ca-status-message><md-icon slot="icon">unsubscribe</md-icon>${msg('You are unsubscribed from all mailing lists.')}</ca-status-message>
        <md-filled-button @click=${this.subscribe}>${msg('Subscribe')}<md-icon slot="icon">mark_email_read</md-icon></md-filled-button>`;
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

@customElement('ca-status-message')
export class StatusMessage extends LitElement {

  static styles = css`
    :host {
      display: block;
    }
    p {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
      margin-bottom: 1rem;
    }
  `;

  protected render() {
    return html`<p><slot name="icon"></slot><slot></slot></p>`;
  }
}