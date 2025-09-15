/**
 * TrustRails Embeddable Widget
 *
 * A secure, white-label widget for 401(k) rollovers that can be embedded
 * on any website using Web Components technology.
 */

export { TrustRailsWidget } from './trustrails-widget.js';

// Auto-register the web component when this module is imported
import './trustrails-widget.js';

// Export types for TypeScript consumers
export interface TrustRailsWidgetConfig {
  partnerId: string;
  apiKey: string;
  environment?: 'sandbox' | 'production';
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    borderRadius?: string;
  };
}

// Export version
export const VERSION = '1.0.0';