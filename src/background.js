importScripts('lib.js');

const GJ = globalThis.GmgnJev;
const DEFAULTS = { enabled: true, model: GJ.MODEL, apiKey: '', endpoint: '' };
const cache = new Map();
const inflight = new Map();
const queue = [];
let active = 0;
let authBroken = false;

function pump() {
  while (active < 2 && queue.length) {
    const job = queue.shift();
    active += 1;
    job.task().then(job.resolve, job.reject).finally(function () {
      active -= 1;
      pump();
    });
  }
}

function enqueue(task) {
  return new Promise(function (resolve, reject) {
    queue.push({ task: task, resolve: resolve, reject: reject });
    pump();
  });
}

function settings() {
  return chrome.storage.local.get(DEFAULTS);
}

function errorText(status, text) {
  let message = '';
  try {
    const body = JSON.parse(text);
    message = (body.error && (body.error.message || body.error)) || body.message || '';
    if (message && typeof message !== 'string') message = JSON.stringify(message);
  } catch (error) {
    message = '';
  }
  message = String(message || text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (status === 401 || status === 403) return message || 'Jev Key 无效或没有权限';
  if (status === 429) return 'Jev 限流，稍后再试';
  return message || ('Jev HTTP ' + status);
}

async function callJev(apiKey, body, endpoint) {
  const resolved = GJ.resolveEndpoint(endpoint);
  if (resolved.error) throw new Error(resolved.error);
  let response;
  try {
    response = await fetch(resolved.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error('连不上供应商。换过地址的话，请在弹窗里重新保存并允许访问');
  }
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(errorText(response.status, text));
    error.status = response.status;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Jev 返回的不是 JSON');
  }
  return GJ.parseScoreResponse(parsed);
}

async function readCached(id, fingerprint) {
  const memory = cache.get(id);
  if (memory && memory.fingerprint === fingerprint) return memory;
  const stored = await chrome.storage.session.get(id);
  const value = stored[id];
  if (value && value.fingerprint === fingerprint) {
    cache.set(id, value);
    return value;
  }
  return null;
}

async function writeCached(id, value) {
  cache.set(id, value);
  try {
    await chrome.storage.session.set({ [id]: value });
  } catch (error) {
    // Session storage can fill up. The in-memory cache still covers this worker.
  }
}

async function scoreOne(raw) {
  const config = await settings();
  if (config.enabled === false) return { error: '已暂停' };
  const apiKey = String(config.apiKey || '').trim();
  if (!apiKey) return { error: '未配置 Jev Key' };
  if (authBroken) return { error: 'Jev Key 无效', authError: true };
  const snapshot = GJ.sanitizeSnapshot(raw);
  const hard = GJ.hardReject(snapshot, config.rules);
  if (hard) return { hard: true, label: hard.label, detail: hard.detail };
  if (!snapshot.address) return { error: '缺少合约地址' };
  const id = 'gj2:' + GJ.cardId(snapshot);
  const fp = GJ.fingerprint(snapshot);
  const cached = await readCached(id, fp);
  if (cached) return cached.result;
  if (inflight.has(id + '|' + fp)) return inflight.get(id + '|' + fp);
  const job = enqueue(function () {
    return callJev(apiKey, GJ.buildRequest(snapshot, config.model), config.endpoint);
  }).then(async function (result) {
    await writeCached(id, { fingerprint: fp, result: result });
    return result;
  }).catch(function (error) {
    if (error.status === 401 || error.status === 403) authBroken = true;
    return { error: error.message || '打分失败', authError: error.status === 401 || error.status === 403 };
  }).finally(function () {
    inflight.delete(id + '|' + fp);
  });
  inflight.set(id + '|' + fp, job);
  return job;
}

async function testKey() {
  const config = await settings();
  const apiKey = String(config.apiKey || '').trim();
  if (!apiKey) return { ok: false, error: '先保存 Key' };
  try {
    const result = await callJev(apiKey, GJ.buildRequest({
      chain: 'sol',
      address: 'test',
      symbol: 'TEST',
      name: 'settings ping',
      usd_market_cap: 1000,
      holder_count: 1,
    }, config.model), config.endpoint);
    authBroken = false;
    return { ok: true, stars: result.stars };
  } catch (error) {
    return { ok: false, error: error.message || '测试失败' };
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;
  if (message.type === 'GET_SETTINGS') {
    settings().then(function (config) {
      const resolved = GJ.resolveEndpoint(config.endpoint);
      const apiKey = String(config.apiKey || '').trim();
      const response = {
        enabled: config.enabled !== false,
        model: config.model || GJ.MODEL,
        hasKey: !!apiKey,
        endpoint: resolved.error ? GJ.ENDPOINT : resolved.url,
        rules: GJ.normalizeRules(config.rules),
      };
      if (message.includeKey) response.apiKey = apiKey;
      sendResponse(response);
    });
    return true;
  }
  if (message.type === 'SAVE_SETTINGS') {
    const patch = {};
    if (typeof message.apiKey === 'string') patch.apiKey = message.apiKey.trim();
    if (typeof message.enabled === 'boolean') patch.enabled = message.enabled;
    if (typeof message.model === 'string' && message.model.trim()) patch.model = message.model.trim();
    if (typeof message.endpoint === 'string') {
      const resolved = GJ.resolveEndpoint(message.endpoint);
      if (resolved.error) {
        sendResponse({ ok: false, error: resolved.error });
        return;
      }
      patch.endpoint = resolved.official ? '' : resolved.url;
    }
    if (message.rules && typeof message.rules === 'object') patch.rules = GJ.normalizeRules(message.rules);
    chrome.storage.local.set(patch).then(function () {
      authBroken = false;
      cache.clear();
      chrome.tabs.query({ url: ['https://gmgn.ai/*', 'https://*.gmgn.ai/*'] }, function (tabs) {
        (tabs || []).forEach(function (tab) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS' }, function () {
            void chrome.runtime.lastError;
          });
        });
      });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'SCORE') {
    scoreOne(message.snapshot).then(sendResponse);
    return true;
  }
  if (message.type === 'TEST') {
    testKey().then(sendResponse);
    return true;
  }
});
