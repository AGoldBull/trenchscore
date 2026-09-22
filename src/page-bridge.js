(() => {
  if (window.__GJ_PAGE_BRIDGE__) return;
  window.__GJ_PAGE_BRIDGE__ = true;

  const KEYS = [
    'chain', 'address', 'symbol', 'name', 'launchpad_platform', 'exchange', 'creator_token_status',
    'top_10_holder_rate', 'bundler_trader_amount_rate', 'rat_trader_amount_rate', 'entrapment_ratio',
    'fresh_wallet_rate', 'suspected_insider_hold_rate', 'dev_team_hold_rate', 'creator_balance_rate',
    'rug_ratio', 'bot_degen_rate', 'dev_token_burn_ratio', 'creator_created_open_ratio',
    'private_vault_hold_rate', 'top70_sniper_hold_rate', 'buy_tax', 'sell_tax',
    'holder_count', 'smart_degen_count', 'renowned_count', 'bot_degen_count',
    'creator_created_count', 'creator_created_open_count', 'creator_created_inner_count',
    'callout_count', 'image_dup', 'twitter_dup', 'website_dup', 'telegram_dup', 'twitter_rename_count',
    'buys_24h', 'sells_24h', 'swaps_24h',
    'usd_market_cap', 'liquidity', 'volume_24h', 'total_fee',
    'created_timestamp', 'complete_timestamp', 'open_timestamp', 'progress',
    'is_wash_trading', 'cto_flag', 'offchain', 'twitter_change_flag',
    'renounced_mint', 'renounced_freeze_account',
    'twitter', 'website', 'telegram'
  ];
  const lastFingerprint = new Map();

  function post(type, payload) {
    window.postMessage(Object.assign({ source: 'trenchscore', type: type }, payload || {}), '*');
  }

  function fiberOf(element) {
    if (!element) return null;
    const key = Object.getOwnPropertyNames(element).find(function (name) {
      return name.indexOf('__reactFiber') === 0;
    });
    return key ? element[key] : null;
  }

  function readToken(card) {
    const start = card.querySelector('[data-sentry-component="TooltipCopy"]') || card;
    let node = fiberOf(start);
    for (let depth = 0; depth < 32 && node; depth += 1) {
      const props = node.memoizedProps;
      const data = props && (props.data || props.item);
      if (data && typeof data === 'object' && data.address && data.symbol) return data;
      node = node.return;
    }
    return null;
  }

  function pick(data) {
    const snapshot = {};
    KEYS.forEach(function (key) {
      if (data[key] != null && data[key] !== '') snapshot[key] = data[key];
    });
    if (!snapshot.chain) {
      snapshot.chain = new URLSearchParams(location.search).get('chain') || '';
    }
    return snapshot;
  }

  function cardId(snapshot) {
    return (snapshot.chain || '?') + ':' + snapshot.address;
  }

  function roughFingerprint(snapshot) {
    return [
      snapshot.usd_market_cap, snapshot.holder_count, snapshot.top_10_holder_rate,
      snapshot.bundler_trader_amount_rate, snapshot.rug_ratio, snapshot.buy_tax, snapshot.sell_tax,
      snapshot.is_wash_trading, snapshot.renounced_mint, snapshot.renounced_freeze_account,
      snapshot.creator_created_count, snapshot.creator_created_open_ratio, snapshot.bot_degen_rate,
      snapshot.rat_trader_amount_rate
    ].join('|');
  }

  function tag(card, snapshot) {
    const id = cardId(snapshot);
    const fp = roughFingerprint(snapshot);
    if (card.getAttribute('data-gj-card') !== id) card.setAttribute('data-gj-card', id);
    if (card.getAttribute('data-gj-fp') !== fp) card.setAttribute('data-gj-fp', fp);
    return fp;
  }

  let detailKey = '';
  let detailAt = 0;
  let detailBusy = false;
  let detailSnapshot = null;

  function detailRoute() {
    const parts = location.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('token');
    if (at < 1 || !parts[at + 1]) return null;
    return { chain: parts[at - 1], address: decodeURIComponent(parts[at + 1]) };
  }

  function detailHost() {
    const symbol = document.querySelector('[data-testid="token-detail-symbol"]');
    if (!symbol) return null;
    const copy = symbol.closest('[data-sentry-component="TooltipCopy"]');
    return (copy && copy.parentElement) || symbol.parentElement;
  }

  function finite(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function keep(snapshot) {
    Object.keys(snapshot).forEach(function (key) {
      if (snapshot[key] == null || snapshot[key] === '') delete snapshot[key];
    });
    return snapshot;
  }

  function mapDetail(full, win) {
    const security = full.security || {};
    const creator = full.creator_stat || {};
    const link = full.link || {};
    const price = (win && win.price) || {};
    const supply = finite(full.total_supply);
    const px = finite(price.price);
    const created = finite(full.creator_created_count);
    const opened = finite(creator.open_token_count);
    return keep({
      chain: full.chain,
      address: full.address,
      symbol: full.symbol,
      name: full.name,
      launchpad_platform: full.launchpad_platform,
      exchange: full.tpool && full.tpool.exchange,
      creator_token_status: full.creator_token_status,
      usd_market_cap: px != null && supply != null ? px * supply : null,
      liquidity: full.liquidity,
      volume_24h: price.volume_24h,
      total_fee: full.total_fee,
      holder_count: full.holder_count,
      top_10_holder_rate: full.top_10_holder_rate,
      bundler_trader_amount_rate: full.top_bundler_trader_percentage,
      rat_trader_amount_rate: full.top_rat_trader_percentage,
      entrapment_ratio: full.top_entrapment_trader_percentage,
      fresh_wallet_rate: full.fresh_wallet_rate,
      dev_team_hold_rate: full.dev_team_hold_rate,
      creator_balance_rate: full.creator_hold_rate,
      rug_ratio: full.rug_ratio,
      bot_degen_rate: full.bot_degen_rate,
      dev_token_burn_ratio: security.dev_token_burn_ratio,
      creator_created_open_ratio: created > 0 && opened != null ? opened / created : null,
      private_vault_hold_rate: full.private_vault_hold_rate,
      top70_sniper_hold_rate: full.top70_sniper_hold_rate,
      buy_tax: security.buy_tax,
      sell_tax: security.sell_tax,
      creator_created_count: full.creator_created_count,
      creator_created_open_count: creator.open_token_count,
      creator_created_inner_count: creator.inner_token_count,
      image_dup: win && win.image_dup_count,
      buys_24h: price.buys_24h,
      sells_24h: price.sells_24h,
      swaps_24h: price.swaps_24h,
      created_timestamp: full.creation_timestamp,
      complete_timestamp: full.migrated_timestamp,
      open_timestamp: win && win.open_timestamp,
      progress: full.launchpad_progress,
      offchain: win && win.offchain,
      renounced_mint: security.renounced_mint,
      renounced_freeze_account: security.renounced_freeze_account,
      twitter: link.twitter_username || link.twitter,
      website: link.website,
      telegram: link.telegram,
    });
  }

  function loadDetail(route) {
    const body = JSON.stringify({ chain: route.chain, addresses: [route.address] });
    const headers = { 'content-type': 'application/json' };
    return Promise.all([
      fetch('/mrwapi/v1/multi_token_full_info', { method: 'POST', headers: headers, body: body }).then(function (response) { return response.json(); }),
      fetch('/api/v1/mutil_window_token_info', { method: 'POST', headers: headers, body: body }).then(function (response) { return response.json(); }),
    ]).then(function (parts) {
      const full = parts[0] && parts[0].data && parts[0].data[0];
      const win = parts[1] && parts[1].data && parts[1].data[0];
      if (!full || full.address !== route.address) throw new Error('代币详情没有返回数据');
      return mapDetail(full, win || {});
    });
  }

  function attachDetail(snapshot) {
    const host = detailHost();
    if (!host || !snapshot || !snapshot.address) return '';
    const id = cardId(snapshot);
    const fp = tag(host, snapshot);
    if (lastFingerprint.get(id) !== fp) {
      lastFingerprint.set(id, fp);
      snapshot._cardFp = fp;
      post('SNAPSHOTS', { snapshots: [snapshot] });
    }
    return id;
  }

  function scan(force) {
    const cards = document.querySelectorAll('[data-testid="trench-token-card"]');
    const changed = [];
    const seen = new Set();
    cards.forEach(function (card) {
      const data = readToken(card);
      if (!data || !data.address) return;
      const snapshot = pick(data);
      const id = cardId(snapshot);
      seen.add(id);
      const fp = tag(card, snapshot);
      if (force || lastFingerprint.get(id) !== fp) {
        lastFingerprint.set(id, fp);
        snapshot._cardFp = fp;
        changed.push(snapshot);
      }
    });
    const route = detailRoute();
    const host = detailHost();
    if (!route || !host) {
      detailKey = '';
      detailSnapshot = null;
    } else {
      const key = route.chain + ':' + route.address;
      if (detailKey !== key) {
        detailKey = key;
        detailSnapshot = null;
        detailAt = 0;
      }
      if (detailSnapshot && detailSnapshot.address === route.address) {
        const id = attachDetail(detailSnapshot);
        if (id) seen.add(id);
      }
      const stale = !detailSnapshot || force || Date.now() - detailAt > 20000;
      if (stale && !detailBusy) {
        detailBusy = true;
        const requested = key;
        loadDetail(route).then(function (snapshot) {
          if (detailKey !== requested) return;
          detailSnapshot = snapshot;
          detailAt = Date.now();
          scan(false);
        }).catch(function () {
          if (detailKey === requested) detailAt = Date.now();
        }).finally(function () {
          detailBusy = false;
        });
      }
    }
    Array.from(lastFingerprint.keys()).forEach(function (id) {
      if (!seen.has(id)) lastFingerprint.delete(id);
    });
    if (changed.length) post('SNAPSHOTS', { snapshots: changed });
    const detailCount = host && detailSnapshot ? 1 : 0;
    post('STATUS', { cards: cards.length + detailCount, readable: seen.size });
  }

  let timer = 0;
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { scan(false); }, 300);
  }

  function boot() {
    if (!document.documentElement) return;
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== 'trenchscore-content') return;
    if (event.data.type === 'HELLO') scan(true);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
