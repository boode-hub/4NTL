import { describe, expect, it } from 'vitest';
import { expandIPv6, isPublicAddress, isPublicIPv4, isPublicIPv6 } from './ip';

describe('isPublicIPv4', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '185.220.101.4',
    '100.63.255.255',
    '100.128.0.0',
    '172.15.255.255',
    '172.32.0.0',
    '223.255.255.255',
  ])('%s is public', (ip) => {
    expect(isPublicIPv4(ip)).toBe(true);
  });

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.10',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.251',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
  ])('%s is not public', (ip) => {
    expect(isPublicIPv4(ip)).toBe(false);
  });
});

describe('expandIPv6', () => {
  it.each([
    ['::', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['::1', [0, 0, 0, 0, 0, 0, 0, 1]],
    ['2001:db8::1', [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]],
    ['fe80::', [0xfe80, 0, 0, 0, 0, 0, 0, 0]],
    ['1:2:3:4:5:6:7:8', [1, 2, 3, 4, 5, 6, 7, 8]],
  ])('%s', (ip, groups) => {
    expect(expandIPv6(ip)).toEqual(groups);
  });

  it.each(['1::2::3', '1:2:3', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7::8', 'g::1'])(
    'rejects %s',
    (ip) => {
      expect(expandIPv6(ip)).toBeNull();
    },
  );
});

describe('isPublicIPv6', () => {
  it.each([
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '2a00:1450:4001::200e',
    '::ffff:808:808',
  ])('%s is public', (ip) => {
    expect(isPublicIPv6(ip)).toBe(true);
  });

  it.each([
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '2001:db8::1',
    '3fff::1',
    '3fff:fff::1',
    '64:ff9b::808:808',
    '::ffff:a00:1', // ::ffff:10.0.0.1
    '::ffff:c0a8:101', // ::ffff:192.168.1.1
    'not-an-ip',
  ])('%s is not public', (ip) => {
    expect(isPublicIPv6(ip)).toBe(false);
  });

  it('treats the rest of 3fff::/16 outside the /20 as public', () => {
    expect(isPublicIPv6('3fff:1000::1')).toBe(true);
  });
});

describe('isPublicAddress', () => {
  it('only filters IP addresses', () => {
    expect(isPublicAddress({ type: 'ipv4', value: '10.0.0.1' })).toBe(false);
    expect(isPublicAddress({ type: 'ipv6', value: '::1' })).toBe(false);
    expect(isPublicAddress({ type: 'ipv4', value: '8.8.8.8' })).toBe(true);
    expect(isPublicAddress({ type: 'domain', value: 'localhost.localdomain' })).toBe(true);
    expect(isPublicAddress({ type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e' })).toBe(true);
  });
});
