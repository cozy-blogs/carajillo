import { LitElement, html, css } from 'lit';
import { Task } from '@lit/task';
import { msg } from '@lit/localize';
import { customElement, property } from 'lit/decorators.js';
import { apiRoot } from './context';

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function validateResponse(response: Response): Promise<any> {
  const result = await response.json() as {success: boolean, error: string, reason?: string};
  if (result.success)
    return result;
  else {
    switch (result.reason) {
      case 'expired-token':
        throw new TokenExpiredError(msg('Authorization token has expired'));
      case 'invalid-token':
        throw new Error(msg('Invalid authorization token'));
      default:
        throw new Error(result.error);
    }
  }
}

@customElement('ca-token-refresh')
class TokenRefresh extends LitElement {
  @property({type: String, attribute: false})
  public token?: string;

  @property({type: String})
  public error?: string;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
  `;

  protected render() {
    return this.refreshTokenTask.render({
      initial: () => html`<ca-status-message><md-icon slot="icon">error</md-icon>${this.error ?? msg('Authorization token has expired')}</ca-status-message>
      <md-filled-button @click=${() => this.refreshTokenTask.run([this.token])}>${msg('Resend confirmation email with new token')}</md-filled-button>`,
      pending: () => html`<md-circular-progress four-color indeterminate></md-circular-progress>`,
      complete: () => html`<ca-status-message><md-icon slot="icon">check</md-icon>${msg('Fresh token has been sent to your email.')}</ca-status-message>`,
      error: (error) => html`<ca-status-message><md-icon slot="icon">error</md-icon>${(error as Error).message}</ca-status-message>`
    });
  }

  private refreshTokenTask = new Task<[string | undefined], void>(this, {
    task: async ([token], {signal}) => {
      if (token === undefined) {
        throw new Error(msg('Missing authorization token'));
      }
      const response = await fetch(`${apiRoot}/user/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({}),
        signal
      });
      await validateResponse(response);
    },
    args: () => [this.token],
    autoRun: false,
  });
}