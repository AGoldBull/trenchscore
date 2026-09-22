(() => {
  function library() {
    if (typeof GmgnJev !== 'undefined' && GmgnJev && typeof GmgnJev.normalizeRules === 'function') return GmgnJev;
    var scopes = [];
    if (typeof globalThis !== 'undefined') scopes.push(globalThis);
    if (typeof window !== 'undefined') scopes.push(window);
    if (typeof self !== 'undefined') scopes.push(self);
    for (var i = 0; i < scopes.length; i++) {
      var found = scopes[i] && scopes[i].GmgnJev;
      if (found && typeof found.normalizeRules === 'function') return found;
    }
    return null;
  }

  const GJ = library();
  if (!GJ) return;
  if (window.__GJ_CONTENT__) return;
  window.__GJ_CONTENT__ = true;
  const results = new Map();
  const pending = new Set();
  const waiting = new Map();
  let enabled = true;
  let hasKey = false;
  let authError = '';
  let rules = GJ.normalizeRules();
  let visibleSkip = 0;
  let pageCards = 0;
  let readableCards = null;

  function dock() {
    let node = document.getElementById('gj-dock');
    if (!node) {
      node = document.createElement('div');
      node.id = 'gj-dock';
      node.addEventListener('mousedown', function (event) { event.stopPropagation(); });
      (document.documentElement || document.body).appendChild(node);
    }
    return node;
  }

  function paintDock(extra) {
    const cards = document.querySelectorAll('[data-gj-card]').length;
    const node = dock();
    if (!cards && !(pageCards > 0)) {
      node.hidden = true;
      return;
    }
    if (!cards && pageCards > 0 && readableCards === 0) {
      node.hidden = false;
      node.textContent = 'JEV 读不到战壕数据';
      return;
    }
    node.hidden = false;
    if (!hasKey) {
      node.textContent = visibleSkip ? 'JEV 未配置 Key · 跳过 ' + visibleSkip : 'JEV 未配置 Key';
      return;
    }
    if (!enabled) {
      node.textContent = 'JEV 已暂停';
      return;
    }
    if (authError) {
      node.textContent = 'JEV Key 无效';
      node.title = authError;
      return;
    }
    if (extra) {
      node.textContent = extra;
      return;
    }
    node.textContent = (pending.size ? 'JEV 打分中 ' + pending.size : 'JEV ' + results.size) + (visibleSkip ? ' · 跳过 ' + visibleSkip : '');
    node.title = '星级贴在币名后面。';
  }

  function symbolOf(card) {
    return card.querySelector('[data-sentry-component="TooltipCopy"]');
  }

  function tipNode() {
    let node = document.getElementById('gj-tip');
    if (!node) {
      node = document.createElement('div');
      node.id = 'gj-tip';
      node.hidden = true;
      (document.documentElement || document.body).appendChild(node);
    }
    return node;
  }

  function showTip(badge) {
    const text = badge && badge.dataset.gjTip;
    const tip = tipNode();
    if (!text) {
      tip.hidden = true;
      return;
    }
    tip.textContent = text;
    tip.hidden = false;
    tip.dataset.for = badge.dataset.gjBadge || '';
    const rect = badge.getBoundingClientRect();
    tip.style.left = (rect.left + rect.width / 2) + 'px';
    tip.style.top = (rect.top - 6) + 'px';
  }

  function hideTip() {
    const tip = document.getElementById('gj-tip');
    if (tip) tip.hidden = true;
  }

  function setTip(badge, text) {
    if (text) badge.dataset.gjTip = text;
    else delete badge.dataset.gjTip;
    badge.removeAttribute('title');
    const tip = document.getElementById('gj-tip');
    if (tip && !tip.hidden && tip.dataset.for === badge.dataset.gjBadge) {
      if (text) showTip(badge);
      else hideTip();
    }
  }

  function watchCard(card) {
    if (card.dataset.gjWatch) return;
    card.dataset.gjWatch = '1';
    card.addEventListener('mousemove', function (event) {
      const badge = card.querySelector('.gj-score');
      if (!badge) return;
      const rect = badge.getBoundingClientRect();
      const inside = event.clientX >= rect.left - 2 && event.clientX <= rect.right + 2 && event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 2;
      if (inside) showTip(badge);
      else if (tipNode().dataset.for === badge.dataset.gjBadge) hideTip();
    });
    card.addEventListener('mouseleave', hideTip);
  }

  function ensureBadge(card) {
    const symbol = symbolOf(card);
    if (!symbol || !symbol.parentElement) return null;
    const id = card.getAttribute('data-gj-card');
    let badge = card.querySelector('.gj-score');
    if (!badge) badge = document.createElement('span');
    badge.dataset.gjBadge = id || '';
    badge.style.position = '';
    badge.style.left = '';
    badge.style.top = '';
    badge.style.zIndex = '';
    if (badge.previousElementSibling !== symbol) symbol.insertAdjacentElement('afterend', badge);
    watchCard(card);
    return badge;
  }

  function paintBadge(card, result) {
    const badge = ensureBadge(card);
    if (!badge) return;
    if (!result) {
      badge.className = 'gj-score gj-pending';
      badge.textContent = '…';
      setTip(badge, GJ.tooltip(null));
      return;
    }
    if (result.hard) {
      badge.className = 'gj-score gj-bad';
      paintStars(badge, 0);
      setTip(badge, result.detail || result.label || '未请求 Jev');
      return;
    }
    if (result.error) {
      badge.className = 'gj-score gj-error';
      badge.textContent = '!';
      setTip(badge, result.error);
      return;
    }
    badge.className = GJ.badgeClass(result.stars);
    if (result.confidence != null && result.confidence < 0.4) badge.classList.add('gj-unsure');
    paintStars(badge, result.stars);
    setTip(badge, GJ.tooltip(result));
  }

  function paintStars(badge, stars) {
    badge.replaceChildren();
    if (stars > 0) {
      const filled = document.createElement('span');
      filled.className = 'gj-on';
      filled.textContent = '★'.repeat(stars);
      badge.append(filled);
    }
    const emptyCount = 5 - stars;
    if (emptyCount <= 0) return;
    const empty = document.createElement('span');
    empty.className = stars > 0 ? 'gj-off' : 'gj-on';
    empty.textContent = '☆'.repeat(emptyCount);
    badge.append(empty);
  }

  function clearBadges() {
    hideTip();
    document.querySelectorAll('.gj-score').forEach(function (badge) { badge.remove(); });
  }

  function remember(id, fp, cardFp, fields) {
    results.set(id, Object.assign({ fingerprint: fp, cardFp: cardFp }, fields));
  }

  function findCard(id) {
    const nodes = document.querySelectorAll('[data-gj-card]');
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-gj-card') === id) return nodes[i];
    }
    return null;
  }

  function inView(element) {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    const width = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > -80 && rect.top < height + 80 && rect.right > 0 && rect.left < width;
  }

  function flushVisible() {
    const ready = [];
    waiting.forEach(function (snapshot, key) {
      const card = findCard(GJ.cardId(snapshot));
      if (!card || !inView(card)) return;
      if (snapshot._cardFp && card.getAttribute('data-gj-fp') && card.getAttribute('data-gj-fp') !== snapshot._cardFp) {
        waiting.delete(key);
        return;
      }
      ready.push({ snapshot: snapshot, top: card.getBoundingClientRect().top });
    });
    ready.sort(function (a, b) { return a.top - b.top; });
    ready.forEach(function (item) { requestScore(item.snapshot); });
  }

  function acceptSnapshots(snapshots) {
    const visible = [];
    (snapshots || []).forEach(function (snapshot) {
      const id = GJ.cardId(snapshot);
      const fp = GJ.fingerprint(snapshot);
      const card = findCard(id);
      if (card && inView(card)) visible.push({ snapshot: snapshot, top: card.getBoundingClientRect().top });
      else waiting.set(id + '|' + fp, snapshot);
    });
    visible.sort(function (a, b) { return a.top - b.top; });
    visible.forEach(function (item) { requestScore(item.snapshot); });
  }

  function requestScore(snapshot) {
    const id = GJ.cardId(snapshot);
    const cardFp = snapshot._cardFp || '';
    const fp = GJ.fingerprint(snapshot);
    waiting.delete(id + '|' + fp);
    const hard = GJ.hardReject(snapshot, rules);
    if (hard) {
      remember(id, fp, cardFp, { hard: true, label: hard.label, detail: hard.detail });
      paintAll();
      return;
    }
    if (!hasKey || authError) return;
    const known = results.get(id);
    if (known && known.fingerprint === fp) {
      if (cardFp && known.cardFp !== cardFp) known.cardFp = cardFp;
      paintAll();
      return;
    }
    if (pending.has(id + '|' + fp)) return;
    pending.add(id + '|' + fp);
    paintDock();
    chrome.runtime.sendMessage({ type: 'SCORE', snapshot: snapshot }, function (response) {
      pending.delete(id + '|' + fp);
      const current = results.get(id);
      if (current && current.fingerprint !== fp) {
        paintAll();
        return;
      }
      if (chrome.runtime.lastError) {
        remember(id, fp, cardFp, { error: chrome.runtime.lastError.message });
      } else if (response && response.authError) {
        authError = response.error || 'Key 无效';
        remember(id, fp, cardFp, { error: authError });
      } else if (response.hard) {
        remember(id, fp, cardFp, { hard: true, label: response.label, detail: response.detail || response.label });
      } else if (!response || response.error) {
        remember(id, fp, cardFp, { error: (response && response.error) || '打分失败' });
      } else {
        authError = '';
        remember(id, fp, cardFp, {
          stars: response.stars,
          confidence: response.confidence,
          score: response.score,
        });
      }
      paintAll();
    });
  }

  function paintAll() {
    visibleSkip = 0;
    if (!enabled) {
      clearBadges();
      paintDock();
      return;
    }
    document.querySelectorAll('[data-gj-card]').forEach(function (card) {
      const id = card.getAttribute('data-gj-card');
      const fp = card.getAttribute('data-gj-fp');
      const known = results.get(id);
      let busy = false;
      pending.forEach(function (key) {
        if (key.indexOf(id + '|') === 0) busy = true;
      });
      const fresh = known && (known.cardFp === fp || !busy) ? known : null;
      if (fresh && fresh.hard) {
        visibleSkip += 1;
        paintBadge(card, fresh);
        return;
      }
      if (!hasKey) {
        const badge = card.querySelector('.gj-score');
        if (badge) badge.remove();
        return;
      }
      paintBadge(card, fresh);
    });
    paintDock();
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== 'trenchscore') return;
    if (event.data.type === 'SNAPSHOTS' && enabled) {
      acceptSnapshots(event.data.snapshots);
    }
    if (event.data.type === 'STATUS') {
      pageCards = Number(event.data.cards) || 0;
      readableCards = Number(event.data.readable) || 0;
    }
    paintAll();
  });

  chrome.runtime.onMessage.addListener(function (message) {
    if (!message || message.type !== 'SETTINGS') return;
    refreshSettings(true);
  });

  function refreshSettings(rescan) {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, function (settings) {
      if (chrome.runtime.lastError || !settings) return;
      enabled = settings.enabled !== false;
      hasKey = !!settings.hasKey;
      rules = GJ.normalizeRules(settings.rules);
      if (rescan) authError = '';
      if (rescan && enabled) {
        results.clear();
        waiting.clear();
        window.postMessage({ source: 'trenchscore-content', type: 'HELLO' }, '*');
      }
      paintAll();
    });
  }

  window.addEventListener('scroll', flushVisible, true);
  window.setInterval(function () {
    flushVisible();
    paintAll();
  }, 700);
  refreshSettings(true);
})();
