import {createContext} from '@lit/context';

export const tokenContext = createContext<string | undefined>('token');

// @todo move to attributes
export interface Settings {
  /**
   * The Language to use in UI.
   * 
   * ISO_639-1 two letter language code 
   */
  language: string;

  /**
   * Event - what triggered the user subscription.
   * 
   * Custom string passed from the subscripton form
   */
  event?: string;
}
export const settingsContext = createContext<Settings>('settings');