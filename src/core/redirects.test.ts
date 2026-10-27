import { describe, expect, it } from 'vitest';
import { unwrapRedirect } from './redirects';

const enc = encodeURIComponent;

describe('unwrapRedirect', () => {
  it.each([
    [
      'Outlook Safe Links',
      `https://nam02.safelinks.protection.outlook.com/?url=${enc('https://evil.com/login?a=1')}&data=05%7C01&reserved=0`,
      'https://evil.com/login?a=1',
    ],
    [
      'Proofpoint v1',
      `https://urldefense.proofpoint.com/v1/url?u=${enc('http://evil.com/x')}&k=abc`,
      'http://evil.com/x',
    ],
    [
      'Proofpoint v2',
      'https://urldefense.proofpoint.com/v2/url?u=https-3A__www.evil.com_path-3Fa-3D1&d=DwMF&c=x&r=y',
      'https://www.evil.com/path?a=1',
    ],
    [
      'Proofpoint v3',
      'https://urldefense.com/v3/__https://evil.com/a*b__;Kw!!AbCd$',
      'https://evil.com/a+b',
    ],
    [
      'Proofpoint v3 with a run of replaced characters',
      'https://urldefense.com/v3/__https://evil.com/**Ax__;Kz8!!AbCd$',
      'https://evil.com/+?x',
    ],
    [
      'Barracuda',
      `https://linkprotect.cudasvc.com/url?a=${enc('https://evil.com/')}&c=E,1`,
      'https://evil.com/',
    ],
    [
      'Google',
      `https://www.google.com/url?q=${enc('https://evil.com/')}&sa=D`,
      'https://evil.com/',
    ],
    [
      'Google (country)',
      `https://www.google.co.uk/url?url=${enc('https://evil.com/')}`,
      'https://evil.com/',
    ],
    [
      'Facebook',
      `https://l.facebook.com/l.php?u=${enc('https://evil.com/')}&h=AT0`,
      'https://evil.com/',
    ],
    ['Instagram', `https://l.instagram.com/?u=${enc('https://evil.com/')}`, 'https://evil.com/'],
    [
      'YouTube',
      `https://www.youtube.com/redirect?q=${enc('https://evil.com/')}&v=x`,
      'https://evil.com/',
    ],
    ['Slack', `https://slack-redir.net/link?url=${enc('https://evil.com/')}`, 'https://evil.com/'],
    [
      'LinkedIn',
      `https://www.linkedin.com/safety/go?url=${enc('https://evil.com/')}`,
      'https://evil.com/',
    ],
    [
      'Steam',
      `https://steamcommunity.com/linkfilter/?url=${enc('https://evil.com/')}`,
      'https://evil.com/',
    ],
  ])('%s', (_name, wrapped, destination) => {
    expect(unwrapRedirect(wrapped)).toBe(destination);
  });

  it('unwraps nested wrappers', () => {
    const inner = `https://urldefense.proofpoint.com/v1/url?u=${enc('https://evil.com/deep')}`;
    const outer = `https://eur01.safelinks.protection.outlook.com/?url=${enc(inner)}`;
    expect(unwrapRedirect(outer)).toBe('https://evil.com/deep');
  });

  it.each([
    'https://evil.com/login?url=https://other.com/',
    'https://www.google.com/search?q=https://evil.com',
    `https://www.google.com/url?q=${enc('javascript:alert(1)')}`,
    'https://urldefense.com/v3/__broken',
    'https://urldefense.com/v3/__https://evil.com/*__;!!!x',
    'https://urldefense.proofpoint.com/v2/url?u=-ZZ',
    'not a url',
  ])('leaves %s alone', (url) => {
    expect(unwrapRedirect(url)).toBe(url);
  });
});
