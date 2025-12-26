
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdSwitch } from '@material/web/switch/switch';
import '@material/web/icon/icon';

@customElement('mailer-list-subscription')
export class ListSubscription extends LitElement {

  @property({type: String})
  public mailingListId?: string;

  @property({type: String})
  public name?: string;

  @property({type: String})
  public description?: string;

  @property({type: Boolean})
  public subscribed: boolean = false;

  @property({type: Boolean})
  public disabled: boolean = false;

  static styles = css`
    .name { font-weight: 600 }
    .description { font-style: italic; } 
  `;

  protected render(){
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

export class SubscriptionChangeEvent extends Event {
  subscribe: boolean;
  mailingListId?: string;

  constructor(mailingListId: string | undefined, subscribe: boolean) {
    super('change');
    this.mailingListId = mailingListId;
    this.subscribe = subscribe;
  }
}