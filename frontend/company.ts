import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface Company {
  name: string;
  address: string;
  logo?: string;
}

@customElement('ca-company')
export class CompanyInfo extends LitElement {
  @property({type: Object, attribute: false})
  public company?: Company;

  static styles = css`
    .company-info {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    img {
      max-width: 50%;
      object-fit: contain;
      margin-bottom: 1rem;
    }
    p {
      margin-bottom: 0;
    }
  `;

  protected render() {
    return html`
      <div class="company-info">
        ${this.company?.logo ? html`<img src="${this.company?.logo}" alt="${this.company?.name}" />` : html``}
        <p>${this.company?.name}</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ca-company': CompanyInfo;
  }
}