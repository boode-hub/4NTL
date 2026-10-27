import { describe, expect, it } from 'vitest';
import {
  extractIndicators,
  indicatorKey,
  isIndicatorType,
  MAX_CHOICES,
  MAX_SELECTION_LENGTH,
  parseIndicator,
  refang,
  resolveSelection,
  type Indicator,
} from './indicator';

const ip4 = (value: string): Indicator => ({ type: 'ipv4', value });
const ip6 = (value: string): Indicator => ({ type: 'ipv6', value });
const domain = (value: string): Indicator => ({ type: 'domain', value });
const url = (value: string): Indicator => ({ type: 'url', value });

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const SHA1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('refang', () => {
  it.each([
    ['1.2.3[.]4', '1.2.3.4'],
    ['evil[.]com', 'evil.com'],
    ['evil(.)com', 'evil.com'],
    ['evil{.}com', 'evil.com'],
    ['evil[dot]com', 'evil.com'],
    ['evil[ . ]com', 'evil.com'],
    ['evil\\.com', 'evil.com'],
    ['hxxp://evil.com', 'http://evil.com'],
    ['hXXps://evil.com', 'https://evil.com'],
    ['h**ps://evil.com', 'https://evil.com'],
    ['hxxps[://]evil.com', 'https://evil.com'],
    ['hxxp[:]//evil.com', 'http://evil.com'],
    ['evil.com[/]path', 'evil.com/path'],
    ['plain text', 'plain text'],
  ])('%s → %s', (input, expected) => {
    expect(refang(input)).toBe(expected);
  });
});

describe('parseIndicator', () => {
  describe('IPv4', () => {
    it.each([
      ['8.8.8.8', ip4('8.8.8.8')],
      ['  8.8.8.8 \n', ip4('8.8.8.8')],
      ['8.8.8.8:443', ip4('8.8.8.8')],
      ['192.168.001.010', ip4('192.168.1.10')],
      ['0.0.0.0', ip4('0.0.0.0')],
      ['255.255.255.255', ip4('255.255.255.255')],
      ['1.2.3[.]4', ip4('1.2.3.4')],
      ['1[.]2[.]3[.]4', ip4('1.2.3.4')],
      ['(1.2.3.4)', ip4('1.2.3.4')],
      ['"1.2.3.4",', ip4('1.2.3.4')],
      ['<1.2.3.4>', ip4('1.2.3.4')],
      ['[1.2.3.4]', ip4('1.2.3.4')],
      ['[1.2.3.4]:8080', ip4('1.2.3.4')],
      ['1.2.3.4.', ip4('1.2.3.4')],
      ['1.2.3.4]', ip4('1.2.3.4')],
      ['src=1.2.3.4', ip4('1.2.3.4')],
    ])('%j', (input, expected) => {
      expect(parseIndicator(input)).toEqual(expected);
    });

    it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', '1.2.3.4/24', '1.2.3.a', '01.02.03.1234'])(
      'rejects %j',
      (input) => {
        expect(parseIndicator(input)).toBeNull();
      },
    );
  });

  describe('IPv6', () => {
    it.each([
      ['2001:4860:4860::8888', ip6('2001:4860:4860::8888')],
      ['2001:0DB8:0000:0000:0000:0000:0000:0001', ip6('2001:db8::1')],
      ['[2001:db8::1]', ip6('2001:db8::1')],
      ['[2001:db8::1]:443', ip6('2001:db8::1')],
      ['[2001:db8::1].', ip6('2001:db8::1')],
      ['fe80::1%eth0', ip6('fe80::1')],
      ['::1', ip6('::1')],
      ['::ffff:1.2.3.4', ip6('::ffff:102:304')],
    ])('%j', (input, expected) => {
      expect(parseIndicator(input)).toEqual(expected);
    });

    it.each(['aa:bb:cc:dd:ee:ff', '12:34:56', '2001:db8:::1', 'std::string', '1:2:3:4:5:6:7:8:9'])(
      'rejects %j',
      (input) => {
        expect(parseIndicator(input)).toBeNull();
      },
    );
  });

  describe('hashes', () => {
    it.each([
      [MD5.toUpperCase(), { type: 'md5', value: MD5 }],
      [SHA1, { type: 'sha1', value: SHA1 }],
      [`"${SHA256}"`, { type: 'sha256', value: SHA256 }],
      [`sha256=${SHA256}`, { type: 'sha256', value: SHA256 }],
    ])('%j', (input, expected) => {
      expect(parseIndicator(input)).toEqual(expected);
    });

    it.each([MD5.slice(1), `${MD5}0`, `${MD5.slice(1)}g`, 'f'.repeat(128)])(
      'rejects %j',
      (input) => {
        expect(parseIndicator(input)).toBeNull();
      },
    );
  });

  describe('domains', () => {
    it.each([
      ['example.com', domain('example.com')],
      ['Example.COM.', domain('example.com')],
      ['evil[.]com', domain('evil.com')],
      ['evil(dot)com', domain('evil.com')],
      ['sub.evil.co.uk', domain('sub.evil.co.uk')],
      ['xn--80ak6aa92e.com', domain('xn--80ak6aa92e.com')],
      ['пример.рф', domain('xn--e1afmkfd.xn--p1ai')],
      ['evil.com:8080', domain('evil.com')],
      ['_dmarc.example.com', domain('_dmarc.example.com')],
      ['payload.zip', domain('payload.zip')],
      ['www.evil.com,', domain('www.evil.com')],
    ])('%j', (input, expected) => {
      expect(parseIndicator(input)).toEqual(expected);
    });

    it.each([
      'invoice.pdf',
      'Node.js',
      'setup.exe',
      'localhost',
      'a.b',
      '-evil.com',
      'evil-.com',
      'e.g.',
    ])('rejects %j', (input) => {
      expect(parseIndicator(input)).toBeNull();
    });
  });

  describe('URLs', () => {
    it.each([
      ['https://evil.com/path?q=1&r=2', url('https://evil.com/path?q=1&r=2')],
      ['hxxps://evil[.]com/login', url('https://evil.com/login')],
      ['hXXp[:]//evil[.]com', url('http://evil.com')],
      ['evil.com/payload.exe', url('http://evil.com/payload.exe')],
      ['1.2.3.4/admin', url('http://1.2.3.4/admin')],
      ['evil.com:8080/x', url('http://evil.com:8080/x')],
      ['https://en.wikipedia.org/wiki/Foo_(bar)', url('https://en.wikipedia.org/wiki/Foo_(bar)')],
      ['(https://evil.com/x).', url('https://evil.com/x')],
      ['ftp://files.evil.com/a', url('ftp://files.evil.com/a')],
      ['<https://evil.com/>', url('https://evil.com/')],
    ])('%j', (input, expected) => {
      expect(parseIndicator(input)).toEqual(expected);
    });

    it.each(['10.0.0.0/8', '/usr/bin/env', 'http://', 'notadomain/path', 'file:///etc/passwd'])(
      'rejects %j',
      (input) => {
        expect(parseIndicator(input)).toBeNull();
      },
    );
  });

  it.each(['', '   ', 'hello world', 'x'.repeat(3000), '!!!', '[]'])('rejects junk %j', (input) => {
    expect(parseIndicator(input)).toBeNull();
  });

  it('is idempotent on canonical values (the router re-validates them)', () => {
    const samples = [
      '8.8.8.8:53',
      '[2001:DB8::1]:443',
      '::ffff:1.2.3.4',
      MD5.toUpperCase(),
      'Пример.РФ',
      'hxxps://evil[.]com/x?y=1',
      'evil.com/payload',
    ];
    for (const sample of samples) {
      const first = parseIndicator(sample);
      expect(first).not.toBeNull();
      expect(parseIndicator(first?.value ?? '')).toEqual(first);
    }
  });
});

describe('extractIndicators', () => {
  it('finds indicators in a log line, in order', () => {
    const line = `src=10.0.0.5 dst=185.220.101.4 hash=44d88612fea8a8f36de82e1278abb02f action=blocked`;
    expect(extractIndicators(line)).toEqual([
      ip4('10.0.0.5'),
      ip4('185.220.101.4'),
      { type: 'md5', value: '44d88612fea8a8f36de82e1278abb02f' },
    ]);
  });

  it('refangs and de-duplicates', () => {
    expect(extractIndicators('1.2.3.4, 1.2.3[.]4; (1.2.3.4) evil[.]com|evil.com')).toEqual([
      ip4('1.2.3.4'),
      domain('evil.com'),
    ]);
  });

  it('respects the limit', () => {
    const text = Array.from({ length: 20 }, (_, i) => `10.0.0.${i}`).join(' ');
    expect(extractIndicators(text, 3)).toHaveLength(3);
  });

  it('returns nothing for prose', () => {
    expect(extractIndicators('The quick brown fox, e.g. a fox.')).toEqual([]);
  });
});

describe('resolveSelection', () => {
  it('treats a clean selection as a single indicator', () => {
    expect(resolveSelection('evil[.]com')).toEqual({
      kind: 'single',
      indicator: domain('evil.com'),
    });
  });

  it('pulls the only indicator out of surrounding text', () => {
    expect(resolveSelection('Callback IP: 8.8.8.8 (observed twice)')).toEqual({
      kind: 'single',
      indicator: ip4('8.8.8.8'),
    });
  });

  it('offers a choice when several indicators are selected', () => {
    expect(resolveSelection('8.8.8.8 and 1.1.1.1')).toEqual({
      kind: 'multiple',
      indicators: [ip4('8.8.8.8'), ip4('1.1.1.1')],
      truncated: false,
    });
  });

  it('caps the choices and says so', () => {
    const text = Array.from({ length: 30 }, (_, i) => `1.1.1.${i}`).join('\n');
    const result = resolveSelection(text);
    expect(result.kind).toBe('multiple');
    if (result.kind !== 'multiple') return;
    expect(result.indicators).toHaveLength(MAX_CHOICES);
    expect(result.truncated).toBe(true);
  });

  it('reports when nothing usable is selected', () => {
    expect(resolveSelection('nothing to see here')).toEqual({ kind: 'none' });
    expect(resolveSelection('')).toEqual({ kind: 'none' });
  });

  it('ignores text beyond the selection length limit', () => {
    expect(resolveSelection(`${' '.repeat(MAX_SELECTION_LENGTH)}8.8.8.8`)).toEqual({
      kind: 'none',
    });
  });
});

describe('helpers', () => {
  it('isIndicatorType', () => {
    expect(isIndicatorType('sha256')).toBe(true);
    expect(isIndicatorType('sha512')).toBe(false);
    expect(isIndicatorType(42)).toBe(false);
  });

  it('indicatorKey', () => {
    expect(indicatorKey(ip4('1.2.3.4'))).toBe('ipv4:1.2.3.4');
  });
});

describe('wrapped links', () => {
  it('looks up the real destination of Safe Links / Proofpoint URLs', () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://evil.com/login')}&data=x`;
    expect(parseIndicator(wrapped)).toEqual(url('https://evil.com/login'));
    expect(
      parseIndicator(
        `hxxps://nam02.safelinks.protection.outlook[.]com/?url=${encodeURIComponent('https://evil.com/')}`,
      ),
    ).toEqual(url('https://evil.com/'));
  });
});
