const enabledInput = document.getElementById('enabled');
const apiKeyInput = document.getElementById('apiKey');
const toggleKeyButton = document.getElementById('toggleKey');
const modelInput = document.getElementById('model');
const endpointInput = document.getElementById('endpoint');
const statusNode = document.getElementById('status');

function setStatus(text, kind) {
  statusNode.textContent = text || '';
  statusNode.className = 'status' + (kind ? ' ' + kind : '');
}

const RULE_FIELDS = [
  { key: 'wash', label: '洗盘' },
  { key: 'mint', label: '可增发' },
  { key: 'freeze', label: '可冻结' },
  { key: 'tax', label: '买卖税', inputs: [{ name: 'maxPct', suffix: '% 以上' }] },
  { key: 'rug', label: 'rug', inputs: [{ name: 'maxPct', suffix: '% 以上' }] },
  { key: 'bundler', label: '捆绑', inputs: [{ name: 'maxPct', suffix: '% 以上' }] },
  { key: 'rat', label: '老鼠仓', inputs: [{ name: 'maxPct', suffix: '% 以上' }] },
  { key: 'top10', label: '前十', inputs: [{ name: 'minHolders', suffix: '人起' }, { name: 'maxPct', suffix: '% 以上' }] },
  { key: 'bot', label: '机器人', inputs: [{ name: 'minHolders', suffix: '人起' }, { name: 'maxPct', suffix: '% 以上' }] },
  { key: 'serial', label: '连环盘', inputs: [{ name: 'minCreated', suffix: '个起' }, { name: 'maxOpenPct', suffix: '% 以下' }] },
];

function fillRules(rules) {
  const list = document.getElementById('ruleList');
  list.replaceChildren();
  RULE_FIELDS.forEach(function (field) {
    const rule = rules[field.key];
    const row = document.createElement('label');
    row.className = 'rule';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.rule = field.key;
    box.dataset.part = 'on';
    box.checked = !!rule.on;
    const name = document.createElement('span');
    name.textContent = field.label;
    const nums = document.createElement('span');
    nums.className = 'rule-nums';
    (field.inputs || []).forEach(function (input) {
      const number = document.createElement('input');
      number.type = 'number';
      number.min = '0';
      number.step = '1';
      number.dataset.rule = field.key;
      number.dataset.part = input.name;
      number.value = rule[input.name];
      const suffix = document.createElement('span');
      suffix.textContent = input.suffix;
      nums.append(number, suffix);
    });
    row.append(box, name, nums);
    list.append(row);
  });
}

function collectRules() {
  const rules = {};
  RULE_FIELDS.forEach(function (field) {
    rules[field.key] = {};
  });
  document.querySelectorAll('#ruleList [data-rule]').forEach(function (input) {
    const rule = rules[input.dataset.rule];
    if (input.dataset.part === 'on') rule.on = input.checked;
    else rule[input.dataset.part] = input.value;
  });
  return GmgnJev.normalizeRules(rules);
}

function setKeyVisible(visible) {
  apiKeyInput.type = visible ? 'text' : 'password';
  toggleKeyButton.textContent = visible ? '隐藏' : '显示';
  toggleKeyButton.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

function load() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS', includeKey: true }, function (settings) {
    if (chrome.runtime.lastError || !settings) {
      setStatus('读不到设置', 'bad');
      return;
    }
    enabledInput.checked = settings.enabled !== false;
    apiKeyInput.value = settings.apiKey || '';
    modelInput.value = settings.model || 'jev-latest';
    endpointInput.value = settings.endpoint || 'https://api.typesafe.ai/v1/systemone';
    fillRules(GmgnJev.normalizeRules(settings.rules));
  });
}

fillRules(GmgnJev.normalizeRules());

function ensureOrigin(resolved) {
  if (resolved.official) return Promise.resolve(true);
  const origin = resolved.origin + '/*';
  return chrome.permissions.contains({ origins: [origin] }).then(function (has) {
    if (has) return true;
    return chrome.permissions.request({ origins: [origin] });
  });
}

document.getElementById('save').addEventListener('click', function () {
  const resolved = GmgnJev.resolveEndpoint(endpointInput.value);
  if (resolved.error) {
    setStatus(resolved.error, 'bad');
    return;
  }
  setStatus('保存中…');
  ensureOrigin(resolved).then(function (allowed) {
    if (!allowed) {
      setStatus('没有允许访问这个供应商，地址没保存', 'bad');
      return;
    }
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      apiKey: apiKeyInput.value,
      enabled: enabledInput.checked,
      model: modelInput.value,
      endpoint: resolved.official ? '' : resolved.url,
      rules: collectRules(),
    }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        setStatus((response && response.error) || '保存失败', 'bad');
        return;
      }
      setStatus(resolved.official ? '已保存，使用官方地址。' : '已保存，使用 ' + resolved.url, 'ok');
      load();
    });
  }).catch(function (error) {
    setStatus(error && error.message ? error.message : '申请访问权限失败', 'bad');
  });
});

document.getElementById('test').addEventListener('click', function () {
  setStatus('正在请求 Jev…');
  chrome.runtime.sendMessage({ type: 'TEST' }, function (response) {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, 'bad');
      return;
    }
    if (!response || !response.ok) {
      setStatus((response && response.error) || '测试失败', 'bad');
      return;
    }
    setStatus('通了。样例 ' + response.stars + ' 星', 'ok');
  });
});

enabledInput.addEventListener('change', function () {
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', enabled: enabledInput.checked });
});

toggleKeyButton.addEventListener('click', function () {
  setKeyVisible(apiKeyInput.type === 'password');
});

load();
