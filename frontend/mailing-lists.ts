// material components
import '@material/web/list/list';
import '@material/web/list/list-item';
import '@material/web/divider/divider';
import '@material/web/switch/switch';
import '@material/web/icon/icon';
import type { MdSwitch } from '@material/web/switch/switch';

// lit
import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { customElement, property } from 'lit/decorators.js';
import { msg } from '@lit/localize';

// application
import type { MailingList } from '../backend/subscription';


@customElement('ca-mailing-lists')
export class MailingLists extends LitElement {

  @property({type: Object, attribute: false})
  public mailingLists?: MailingList[];

  @property({type: Boolean})
  public disabled: boolean = false;

  protected render() {
    return html`
      <md-list>
        <md-list-item type="text"><b style="font-weight: 500">${msg('Choose what you are interested in:')}</b></md-list-item>
        ${repeat(
          this.mailingLists ?? [],
          (list) => list.id,
          (list, index) => html`
            <ca-list-subscription .mailingListId=${list.id} .name=${list.name} .description=${list.description}
              ?subscribed=${list.subscribed} ?disabled=${this.disabled}>
            </ca-list-subscription>`
        )}
      </md-list>`;
  }
}

@customElement('ca-list-subscription')
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
        <div slot="headline"><label for=${this.mailingListId}>${this.name}</label></div>
        <div slot="supporting-text"><label for=${this.mailingListId}>${this.description}</label></div>
        <div slot="end">
          <md-switch icons id=${this.mailingListId} ?selected=${this.subscribed} ?disabled=${this.disabled} @change=${this.onChange}></md-switch>
        </div>
      </md-list-item>
    `;
  }

  private onChange(e: Event) {
    const subscribe = (e.target as MdSwitch).selected;
    this.subscribed = subscribe;
    this.dispatchEvent(new SubscriptionChangeEvent(this.mailingListId!, subscribe));
  }
}

export class SubscriptionChangeEvent extends Event {
  subscribe: boolean;
  mailingListId: string;

  constructor(mailingListId: string, subscribe: boolean) {
    super('change', {bubbles: true, composed: true});
    this.mailingListId = mailingListId;
    this.subscribe = subscribe;
  }
}