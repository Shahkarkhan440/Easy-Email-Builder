import EMPTY_EMAIL_MESSAGE from './sample/empty-email-message';

// Sample templates are imported dynamically to reduce the initial bundle size
// They are only loaded when needed, so sample data is not bundled up front
const sampleTemplates: Record<string, () => Promise<any>> = {
  // Starter templates with preset header/footer
  'starter-welcome': () => import('./starterTemplates').then(m => m.buildStarterTemplate('welcome')),
  'starter-newsletter': () => import('./starterTemplates').then(m => m.buildStarterTemplate('newsletter')),
  'starter-promotion': () => import('./starterTemplates').then(m => m.buildStarterTemplate('promotion')),
  'starter-order-confirmation': () => import('./starterTemplates').then(m => m.buildStarterTemplate('order-confirmation')),
  'starter-shipping-update': () => import('./starterTemplates').then(m => m.buildStarterTemplate('shipping-update')),
  'starter-password-reset': () => import('./starterTemplates').then(m => m.buildStarterTemplate('password-reset')),
  'starter-verification-code': () => import('./starterTemplates').then(m => m.buildStarterTemplate('verification-code')),
  'starter-event-invitation': () => import('./starterTemplates').then(m => m.buildStarterTemplate('event-invitation')),
  'starter-abandoned-cart': () => import('./starterTemplates').then(m => m.buildStarterTemplate('abandoned-cart')),
  'starter-feedback-request': () => import('./starterTemplates').then(m => m.buildStarterTemplate('feedback-request')),
  'starter-product-announcement': () => import('./starterTemplates').then(m => m.buildStarterTemplate('product-announcement')),
  'starter-personal-letter': () => import('./starterTemplates').then(m => m.buildStarterTemplate('personal-letter')),
  'starter-zigzag-features': () => import('./starterTemplates').then(m => m.buildStarterTemplate('zigzag-features')),
  'starter-product-grid': () => import('./starterTemplates').then(m => m.buildStarterTemplate('product-grid')),
  'starter-blog-digest': () => import('./starterTemplates').then(m => m.buildStarterTemplate('blog-digest')),
  'starter-split-hero': () => import('./starterTemplates').then(m => m.buildStarterTemplate('split-hero')),
  'starter-stats-report': () => import('./starterTemplates').then(m => m.buildStarterTemplate('stats-report')),
  'starter-magazine': () => import('./starterTemplates').then(m => m.buildStarterTemplate('magazine')),
  'starter-webinar-agenda': () => import('./starterTemplates').then(m => m.buildStarterTemplate('webinar-agenda')),
  'starter-testimonials': () => import('./starterTemplates').then(m => m.buildStarterTemplate('testimonials')),
  'starter-holiday-greeting': () => import('./starterTemplates').then(m => m.buildStarterTemplate('holiday-greeting')),
  'starter-coffee-menu': () => import('./starterTemplates').then(m => m.buildStarterTemplate('coffee-menu')),
  'starter-fashion-lookbook': () => import('./starterTemplates').then(m => m.buildStarterTemplate('fashion-lookbook')),
  'starter-sneaker-black-friday': () => import('./starterTemplates').then(m => m.buildStarterTemplate('sneaker-black-friday')),
  'starter-travel-deals': () => import('./starterTemplates').then(m => m.buildStarterTemplate('travel-deals')),
  'starter-restaurant-specials': () => import('./starterTemplates').then(m => m.buildStarterTemplate('restaurant-specials')),
  'starter-fitness-membership': () => import('./starterTemplates').then(m => m.buildStarterTemplate('fitness-membership')),
  'starter-real-estate-listings': () => import('./starterTemplates').then(m => m.buildStarterTemplate('real-estate-listings')),
  'starter-skincare-launch': () => import('./starterTemplates').then(m => m.buildStarterTemplate('skincare-launch')),
  'starter-saas-product-update': () => import('./starterTemplates').then(m => m.buildStarterTemplate('saas-product-update')),
  'starter-festival-tickets': () => import('./starterTemplates').then(m => m.buildStarterTemplate('festival-tickets')),
};

// Cache of loaded templates
const templateCache: Record<string, any> = {};

export default function getConfiguration(template: string): any {
  // Sync version: only handles empty, code and json templates
  // Sample templates load asynchronously; for compatibility return an empty template here
  if (template.startsWith('#sample/')) {
    // Return an empty template; the caller handles the actual loading
    return EMPTY_EMAIL_MESSAGE;
  }

  // Supports #code/ format: base64-encoded JSON (for sharing)
  if (template.startsWith('#code/')) {
    const encodedString = template.replace('#code/', '');
    try {
      const configurationString = decodeURIComponent(atob(encodedString));
      return JSON.parse(configurationString);
    } catch {
      return EMPTY_EMAIL_MESSAGE;
    }
  }

  // Supports #json/ format: URL-encoded JSON string (more readable)
  if (template.startsWith('#json/')) {
    const encodedString = template.replace('#json/', '');
    try {
      const configurationString = decodeURIComponent(encodedString);
      return JSON.parse(configurationString);
    } catch {
      return EMPTY_EMAIL_MESSAGE;
    }
  }

  return EMPTY_EMAIL_MESSAGE;
}

// Load a sample template asynchronously
export async function loadSampleTemplate(sampleName: string): Promise<any> {
  const loader = sampleTemplates[sampleName];
  if (!loader) {
    return EMPTY_EMAIL_MESSAGE;
  }

  // Return from cache if available
  if (templateCache[sampleName]) {
    return templateCache[sampleName];
  }

  // Load the template dynamically
  const template = await loader();
  templateCache[sampleName] = template;
  return template;
}

/**
 * Decode a shared-template hash: `#z/` (deflate-raw + base64url, used by the MCP server's preview links),
 * `#code/` or `#json/`. Returns null for anything else or on failure.
 */
export async function decodeTemplateHash(hash: string): Promise<any | null> {
  if (hash.startsWith('#z/')) {
    try {
      const b64 = hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(stream).text());
    } catch {
      return null;
    }
  }
  if (hash.startsWith('#code/') || hash.startsWith('#json/')) {
    const config = getConfiguration(hash);
    return config === EMPTY_EMAIL_MESSAGE ? null : config;
  }
  return null;
}

/**
 * Convert a JSON configuration to a hash URL
 * @param config - Email template configuration JSON
 * @param format - Encoding format: 'json' (URL-encoded) or 'code' (base64, shorter but encoded)
 * @returns hash URL, e.g. #json/... or #code/...
 */
export function configToHash(config: any, format: 'json' | 'code' = 'json'): string {
  const jsonString = JSON.stringify(config);

  if (format === 'code') {
    // base64 encoding (shorter, but encoded)
    const encoded = btoa(encodeURIComponent(jsonString));
    return `#code/${encoded}`;
  } else {
    // URL encoding (readable directly in the address bar)
    const encoded = encodeURIComponent(jsonString);
    return `#json/${encoded}`;
  }
}
