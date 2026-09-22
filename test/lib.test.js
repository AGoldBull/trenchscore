const test = require('node:test');
const assert = require('node:assert/strict');
const GJ = require('../src/lib.js');

const sample = {
  chain: 'sol',
  address: '4pvUg2FULtTEEwqWjmyY9eHJg4pJVPYzr4wKxQF5pump',
  symbol: 'sol',
  name: 'goku coin',
  logo: 'https://example.invalid/secret.webp',
  creator: '2u2CKcRhUQojeK7rgcVftsTb5QJ13P3y8wsLVMGWsmfb',
  twitter: 'https://x.com/example',
  website: '',
  usd_market_cap: 3262.5,
  liquidity: 2045.1,
  holder_count: 3.2,
  top_10_holder_rate: 0.0874,
  bundler_trader_amount_rate: 0,
  rug_ratio: 0,
  is_wash_trading: false,
  creator_token_status: 'creator_hold',
  renounced_mint: '1',
  progress: 0,
  created_timestamp: 1_700_000_000,
  complete_timestamp: 0,
};

test('sanitize keeps the score state and drops identifiers that are not needed', function () {
  const state = GJ.sanitizeSnapshot(sample, 1_700_000_030_000);
  assert.equal(state.address, sample.address);
  assert.equal(state.holder_count, 3);
  assert.equal(state.has_twitter, true);
  assert.equal(state.age_seconds, 30);
  assert.equal(state.renounced_mint, true);
  assert.equal(Object.hasOwn(state, 'logo'), false);
  assert.equal(Object.hasOwn(state, 'creator'), false);
  assert.equal(Object.hasOwn(state, 'twitter'), false);
  assert.equal(Object.hasOwn(state, 'complete_timestamp'), false);
});

test('fingerprint ignores tiny market-cap noise and changes when structure changes', function () {
  const left = GJ.sanitizeSnapshot(sample, 1_700_000_030_000);
  const right = GJ.sanitizeSnapshot(Object.assign({}, sample, { usd_market_cap: 3300 }), 1_700_000_030_000);
  const washed = GJ.sanitizeSnapshot(Object.assign({}, sample, { is_wash_trading: true }), 1_700_000_030_000);
  assert.equal(GJ.fingerprint(left), GJ.fingerprint(right));
  assert.notEqual(GJ.fingerprint(left), GJ.fingerprint(washed));
});

test('request body is a score question and does not contain the API key', function () {
  const body = GJ.buildRequest(sample, 'jev-1.13.0');
  assert.equal(body.model, 'jev-1.13.0');
  assert.equal(body.questions.quality.type, 'score');
  assert.equal(body.questions.quality.criteria.length, 5);
  assert.equal(JSON.stringify(body).includes('Bearer'), false);
  assert.equal(Object.hasOwn(body.state, 'logo'), false);
});

test('score response maps onto 0-100 and a Chinese label', function () {
  const parsed = GJ.parseScoreResponse({
    answers: {
      quality: {
        type: 'score',
        score: 3,
        confidence: 0.81,
        legend: {},
        probabilities: {},
      },
    },
  });
  assert.equal(parsed.stars, 4);
  assert.equal(parsed.confidence, 0.81);
  assert.equal(GJ.badgeClass(parsed.stars), 'gj-score gj-good');
  assert.equal(GJ.tooltip(parsed), '4 星 · 不是买卖建议');
});

test('endpoint defaults to the official System One URL', function () {
  assert.deepEqual(GJ.resolveEndpoint(''), {
    url: 'https://api.typesafe.ai/v1/systemone',
    official: true,
    origin: 'https://api.typesafe.ai',
  });
  assert.equal(GJ.resolveEndpoint('  https://api.typesafe.ai/v1/systemone/ ').official, true);
});

test('endpoint accepts another https provider and local http only', function () {
  const custom = GJ.resolveEndpoint('https://openrouter.ai/api/alpha/decisions');
  assert.equal(custom.official, false);
  assert.equal(custom.url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(GJ.resolveEndpoint('http://127.0.0.1:8787/v1/systemone').url, 'http://127.0.0.1:8787/v1/systemone');
  assert.equal(GJ.resolveEndpoint('http://example.com/v1/systemone').error, '供应商地址只接受 https，或本机的 http');
  assert.equal(GJ.resolveEndpoint('https://user:secret@example.com/v1/systemone').error, '不要把 Key 写进地址');
  assert.equal(GJ.resolveEndpoint('https://example.com').error, '请填写完整接口路径，例如 https://api.typesafe.ai/v1/systemone');
});

test('hard gates skip only when the field is present and over the line', function () {
  assert.equal(GJ.hardReject({ is_wash_trading: true }).label, '洗盘');
  assert.equal(GJ.hardReject({}), null);
  assert.equal(GJ.hardReject({ renounced_mint: false }).label, '可增发');
  assert.equal(GJ.hardReject({ renounced_mint: true }), null);
  assert.equal(GJ.hardReject({ buy_tax: 0.1, total_buy_tax: 0.5 }), null);
  assert.equal(GJ.hardReject({ sell_tax: 0.11 }).label, '高税');
  assert.equal(GJ.hardReject({ holder_count: 19, top_10_holder_rate: 0.9 }), null);
  assert.equal(GJ.hardReject({ holder_count: 20, top_10_holder_rate: 0.5 }), null);
  assert.equal(GJ.hardReject({ holder_count: 20, top_10_holder_rate: 0.51 }).label, '前十');
  assert.equal(GJ.hardReject({ creator_created_count: 10 }), null);
  assert.equal(GJ.hardReject({ creator_created_count: 10, creator_created_open_ratio: 0.04 }).label, '连环盘');
  assert.equal(GJ.hardReject({ creator_created_count: 10, creator_created_open_ratio: 0.05 }), null);
  assert.equal(GJ.hardReject({ is_wash_trading: true }, { wash: { on: false } }), null);
});

test('concurrency defaults to 1 and stays between 1 and 5', function () {
  assert.equal(GJ.concurrencyLimit(), 1);
  assert.equal(GJ.concurrencyLimit(''), 1);
  assert.equal(GJ.concurrencyLimit(0), 1);
  assert.equal(GJ.concurrencyLimit(1), 1);
  assert.equal(GJ.concurrencyLimit(3.6), 4);
  assert.equal(GJ.concurrencyLimit(9), 5);
});

test('rate-limit waits use Retry-After and stay within one minute', function () {
  assert.equal(GJ.retryDelay(''), 4000);
  assert.equal(GJ.retryDelay('2'), 2000);
  assert.equal(GJ.retryDelay('0.2'), 1000);
  assert.equal(GJ.retryDelay('120'), 60000);
  assert.equal(GJ.retryDelay('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:28:03 GMT')), 1000);
  assert.equal(GJ.retryDelay('not-a-date'), 4000);
});

test('a missing score is an error, not a zero', function () {
  assert.throws(function () {
    GJ.parseScoreResponse({ answers: {} });
  }, /没有返回分数/);
});
