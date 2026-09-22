var GmgnJev = (function () {
  var api = (function () {
  const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
  const MODEL = 'jev-latest';

  // Ordered worst → best. Nearest level becomes 1–5 stars.
  const LEVELS = [
    {
      en: 'Skip. Extreme concentration, wash trading, a serial deployer, or almost no real activity.',
      zh: '很差',
    },
    {
      en: 'Weak. Thin or contradictory data. Not enough to act on.',
      zh: '较差',
    },
    {
      en: 'Mixed. Some real activity, but holder or deployer risk is unresolved.',
      zh: '一般',
    },
    {
      en: 'Decent. Activity and holder structure are usable for a closer look.',
      zh: '较好',
    },
    {
      en: 'Strong relative to a typical just-launched trench token. Cleaner structure, not a promise of profit.',
      zh: '很好',
    },
  ];

  const RATE_FIELDS = [
    'top_10_holder_rate',
    'bundler_trader_amount_rate',
    'rat_trader_amount_rate',
    'entrapment_ratio',
    'fresh_wallet_rate',
    'suspected_insider_hold_rate',
    'dev_team_hold_rate',
    'creator_balance_rate',
    'rug_ratio',
    'bot_degen_rate',
    'dev_token_burn_ratio',
    'creator_created_open_ratio',
    'private_vault_hold_rate',
    'top70_sniper_hold_rate',
    'buy_tax',
    'sell_tax',
  ];

  const COUNT_FIELDS = [
    'holder_count',
    'smart_degen_count',
    'renowned_count',
    'bot_degen_count',
    'creator_created_count',
    'creator_created_open_count',
    'creator_created_inner_count',
    'callout_count',
    'image_dup',
    'twitter_dup',
    'website_dup',
    'telegram_dup',
    'twitter_rename_count',
    'buys_24h',
    'sells_24h',
    'swaps_24h',
  ];

  const USD_FIELDS = ['usd_market_cap', 'liquidity', 'volume_24h', 'total_fee'];
  const TIME_FIELDS = ['created_timestamp', 'complete_timestamp', 'open_timestamp'];
  const TEXT_FIELDS = ['chain', 'address', 'symbol', 'name', 'launchpad_platform', 'exchange', 'creator_token_status'];
  const BOOL_FIELDS = ['is_wash_trading', 'cto_flag', 'offchain', 'twitter_change_flag'];

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clip(value, max) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    return text.length > max ? text.slice(0, max) : text;
  }

  function boolish(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (text === 'true' || text === 'yes') return true;
      if (text === 'false' || text === 'no' || text === '') return false;
    }
    return null;
  }

  function present(value) {
    return !(value == null || value === '');
  }

  function sanitizeSnapshot(raw, nowMs) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const state = {};
    TEXT_FIELDS.forEach(function (key) {
      const text = clip(source[key], key === 'address' ? 80 : key === 'name' ? 80 : 40);
      if (text) state[key] = text;
    });
    RATE_FIELDS.concat(USD_FIELDS).forEach(function (key) {
      const value = number(source[key]);
      if (value != null) state[key] = value;
    });
    COUNT_FIELDS.forEach(function (key) {
      const value = number(source[key]);
      if (value != null) state[key] = Math.round(value);
    });
    TIME_FIELDS.forEach(function (key) {
      const value = number(source[key]);
      if (value != null && value > 0) state[key] = Math.round(value);
    });
    BOOL_FIELDS.forEach(function (key) {
      const value = boolish(source[key]);
      if (value != null) state[key] = value;
    });
    ['renounced_mint', 'renounced_freeze_account'].forEach(function (key) {
      const value = boolish(source[key]);
      if (value != null) state[key] = value;
    });
    const progress = number(source.progress);
    if (progress != null) state.progress = progress;
    if (present(source.twitter)) state.has_twitter = true;
    if (present(source.website)) state.has_website = true;
    if (present(source.telegram)) state.has_telegram = true;
    if (state.created_timestamp) {
      state.age_seconds = Math.max(0, Math.round(now / 1000 - state.created_timestamp));
    }
    state._notes = 'Rates are fractions from 0 to 1, not percents. usd_market_cap, liquidity, volume_24h and total_fee are USD. progress is GMGN bonding-curve progress as reported. Missing fields were not on the card.';
    return state;
  }

  function sig2(value) {
    const numberValue = number(value);
    if (numberValue == null || numberValue === 0) return 0;
    const power = Math.pow(10, Math.floor(Math.log10(Math.abs(numberValue))) - 1);
    return Math.round(numberValue / power) * power;
  }

  function ageBucket(ageSeconds) {
    if (ageSeconds == null) return '';
    const size = ageSeconds < 120 ? 30 : 300;
    return Math.floor(ageSeconds / size);
  }

  function fingerprint(snapshot) {
    const state = snapshot && snapshot._notes ? snapshot : sanitizeSnapshot(snapshot);
    return [
      state.chain || '',
      state.address || '',
      sig2(state.usd_market_cap),
      state.holder_count == null ? '' : state.holder_count,
      state.top_10_holder_rate == null ? '' : Math.round(state.top_10_holder_rate * 1000),
      state.bundler_trader_amount_rate == null ? '' : Math.round(state.bundler_trader_amount_rate * 1000),
      state.rug_ratio == null ? '' : Math.round(state.rug_ratio * 1000),
      state.creator_token_status || '',
      state.is_wash_trading ? 1 : 0,
      state.progress == null ? '' : Math.round(state.progress * 100),
      ageBucket(state.age_seconds),
    ].join('|');
  }

  function cardId(snapshot) {
    return (snapshot.chain || '?') + ':' + (snapshot.address || '');
  }

  function buildRequest(snapshot, model) {
    return {
      model: clip(model, 60) || MODEL,
      state: snapshot && snapshot._notes ? snapshot : sanitizeSnapshot(snapshot),
      questions: {
        quality: {
          type: 'score',
          instructions: 'Rate this GMGN trench token as a short-term launch using only this snapshot. Higher means cleaner structure and more credible activity, not a larger payoff. Do not treat the name or a social link as proof.',
          criteria: LEVELS.map(function (level) { return level.en; }),
        },
      },
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseScoreResponse(body) {
    const answer = body && body.answers && body.answers.quality;
    if (!answer || typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
      throw new Error('Jev 没有返回分数');
    }
    const maxLevel = LEVELS.length - 1;
    const level = clamp(Math.round(answer.score), 0, maxLevel);
    const stars = level + 1;
    const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
      ? clamp(answer.confidence, 0, 1)
      : null;
    return {
      score: answer.score,
      stars: stars,
      level: level,
      label: LEVELS[level].zh,
      confidence: confidence,
    };
  }

  function badgeClass(stars) {
    if (stars == null) return 'gj-score gj-pending';
    if (stars <= 1) return 'gj-score gj-bad';
    if (stars === 2) return 'gj-score gj-weak';
    if (stars === 3) return 'gj-score gj-mid';
    return 'gj-score gj-good';
  }

  function tooltip(result) {
    if (!result) return '正在问 Jev';
    if (result.error) return result.error;
    return result.stars + ' 星 · 不是买卖建议';
  }

  const DEFAULT_RULES = {
    wash: { on: true },
    mint: { on: true },
    freeze: { on: true },
    tax: { on: true, maxPct: 10 },
    rug: { on: true, maxPct: 50 },
    bundler: { on: true, maxPct: 40 },
    rat: { on: true, maxPct: 30 },
    top10: { on: true, minHolders: 20, maxPct: 50 },
    bot: { on: true, minHolders: 20, maxPct: 75 },
    serial: { on: true, minCreated: 10, maxOpenPct: 5 },
  };

  function clampNum(value, fallback, min, max) {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeRules(input) {
    const source = input && typeof input === 'object' ? input : {};
    const rules = {};
    Object.keys(DEFAULT_RULES).forEach(function (key) {
      const base = DEFAULT_RULES[key];
      const raw = source[key] && typeof source[key] === 'object' ? source[key] : {};
      const rule = { on: raw.on == null ? base.on : !!raw.on };
      if ('maxPct' in base) rule.maxPct = clampNum(raw.maxPct, base.maxPct, 0, 100);
      if ('minHolders' in base) rule.minHolders = Math.round(clampNum(raw.minHolders, base.minHolders, 1, 100000));
      if ('minCreated' in base) rule.minCreated = Math.round(clampNum(raw.minCreated, base.minCreated, 1, 100000));
      if ('maxOpenPct' in base) rule.maxOpenPct = clampNum(raw.maxOpenPct, base.maxOpenPct, 0, 100);
      rules[key] = rule;
    });
    return rules;
  }

  function hasNumber(state, field) {
    return Object.prototype.hasOwnProperty.call(state, field) && typeof state[field] === 'number';
  }

  function abovePct(state, field, maxPct) {
    return hasNumber(state, field) && state[field] > maxPct / 100;
  }

  function hardReject(snapshot, rulesInput) {
    const rules = normalizeRules(rulesInput);
    const state = snapshot && snapshot._notes ? snapshot : sanitizeSnapshot(snapshot);
    if (rules.wash.on && state.is_wash_trading === true) {
      return { code: 'wash', label: '洗盘', detail: 'GMGN 标记洗盘' };
    }
    if (rules.mint.on && state.renounced_mint === false) {
      return { code: 'mint', label: '可增发', detail: '铸币权没有放弃' };
    }
    if (rules.freeze.on && state.renounced_freeze_account === false) {
      return { code: 'freeze', label: '可冻结', detail: '冻结权没有放弃' };
    }
    if (rules.tax.on && (abovePct(state, 'buy_tax', rules.tax.maxPct) || abovePct(state, 'sell_tax', rules.tax.maxPct))) {
      return { code: 'tax', label: '高税', detail: '买卖税超过 ' + rules.tax.maxPct + '%' };
    }
    if (rules.rug.on && abovePct(state, 'rug_ratio', rules.rug.maxPct)) {
      return { code: 'rug', label: 'rug', detail: 'rug 比例超过 ' + rules.rug.maxPct + '%' };
    }
    if (rules.bundler.on && abovePct(state, 'bundler_trader_amount_rate', rules.bundler.maxPct)) {
      return { code: 'bundler', label: '捆绑', detail: '捆绑成交超过 ' + rules.bundler.maxPct + '%' };
    }
    if (rules.rat.on && abovePct(state, 'rat_trader_amount_rate', rules.rat.maxPct)) {
      return { code: 'rat', label: '老鼠仓', detail: '老鼠仓成交超过 ' + rules.rat.maxPct + '%' };
    }
    if (rules.top10.on && hasNumber(state, 'holder_count') && state.holder_count >= rules.top10.minHolders && abovePct(state, 'top_10_holder_rate', rules.top10.maxPct)) {
      return { code: 'top10', label: '前十', detail: '持币人至少 ' + rules.top10.minHolders + '，前十超过 ' + rules.top10.maxPct + '%' };
    }
    if (rules.bot.on && hasNumber(state, 'holder_count') && state.holder_count >= rules.bot.minHolders && abovePct(state, 'bot_degen_rate', rules.bot.maxPct)) {
      return { code: 'bot', label: '机器人', detail: '持币人至少 ' + rules.bot.minHolders + '，机器人持仓超过 ' + rules.bot.maxPct + '%' };
    }
    if (rules.serial.on && hasNumber(state, 'creator_created_count') && state.creator_created_count >= rules.serial.minCreated && hasNumber(state, 'creator_created_open_ratio') && state.creator_created_open_ratio < rules.serial.maxOpenPct / 100) {
      return { code: 'serial', label: '连环盘', detail: '该地址发过至少 ' + rules.serial.minCreated + ' 个，毕业比例低于 ' + rules.serial.maxOpenPct + '%' };
    }
    return null;
  }

  function resolveEndpoint(value) {
    const text = String(value == null ? '' : value).trim();
    const officialUrl = new URL(ENDPOINT);
    if (!text) return { url: ENDPOINT, official: true, origin: officialUrl.origin };
    let url;
    try {
      url = new URL(text);
    } catch (error) {
      return { error: '供应商地址不是合法的 URL' };
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      return { error: '供应商地址只接受 https，或本机的 http' };
    }
    if (url.username || url.password) return { error: '不要把 Key 写进地址' };
    const path = url.pathname.replace(/\/+$/, '');
    if (!path) return { error: '请填写完整接口路径，例如 https://api.typesafe.ai/v1/systemone' };
    const normalized = url.origin + path;
    const official = normalized === ENDPOINT;
    return { url: official ? ENDPOINT : normalized, official: official, origin: url.origin };
  }

  return {
    ENDPOINT: ENDPOINT,
    MODEL: MODEL,
    LEVELS: LEVELS,
    sanitizeSnapshot: sanitizeSnapshot,
    fingerprint: fingerprint,
    cardId: cardId,
    buildRequest: buildRequest,
    parseScoreResponse: parseScoreResponse,
    badgeClass: badgeClass,
    tooltip: tooltip,
    resolveEndpoint: resolveEndpoint,
    DEFAULT_RULES: DEFAULT_RULES,
    normalizeRules: normalizeRules,
    hardReject: hardReject,
  };
  })();
  var targets = [];
  if (typeof globalThis !== 'undefined') targets.push(globalThis);
  if (typeof self !== 'undefined') targets.push(self);
  if (typeof window !== 'undefined') targets.push(window);
  for (var i = 0; i < targets.length; i++) {
    try { targets[i].GmgnJev = api; } catch (error) {}
  }
  if (typeof module === 'object' && module && module.exports) {
    try { module.exports = api; } catch (error) {}
  }
  return api;
})();
