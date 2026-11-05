/* The plan layer: what the book is, before any page is drawn.
   Structure → intensity curve → devices → photo allocation.
   Every step is explainable: the plan comes back with reasons, so a page can
   be traced to "why this page looks like this". */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var DEVICES = {
    /* key        family        photos     intensity window      coverage aim */
    full:      { family: 'full',     n: [1, 1], I: [0.82, 1.00], cov: 0.86, name: '满版' },
    gutter:    { family: 'gutter',   n: [1, 1], I: [0.88, 1.00], cov: 1.00, name: '跨中缝' },
    contact:   { family: 'wall',     n: [5, 9], I: [0.48, 0.70], cov: 0.62, name: '接触印' },
    diptych:   { family: 'diptych',  n: [2, 2], I: [0.38, 0.58], cov: 0.46, name: '对页' },
    clash:     { family: 'clash',    n: [2, 2], I: [0.52, 0.68], cov: 0.52, name: '对页对抗' },
    strip:     { family: 'strip',    n: [3, 4], I: [0.30, 0.48], cov: 0.38, name: '序列带' },
    plate:     { family: 'single',   n: [1, 1], I: [0.36, 0.66], cov: 0.42, name: '版心单图' },
    type:      { family: 'type-led', n: [1, 2], I: [0.22, 0.42], cov: 0.30, name: '图文对话' },
    breath:    { family: 'blank',    n: [0, 0], I: [0.00, 0.16], cov: 0.04, name: '白场' },
    divider:   { family: 'divider',  n: [0, 0], I: [0.00, 0.14], cov: 0.05, name: '章节页' }
  };

  /* which devices a composition setting is allowed to use */
  var ALLOWED = {
    restrained: ['plate', 'diptych', 'strip', 'type', 'breath', 'divider'],
    flexible:   ['plate', 'diptych', 'clash', 'strip', 'type', 'contact', 'full', 'breath', 'divider'],
    experimental: ['plate', 'diptych', 'clash', 'strip', 'type', 'contact', 'full', 'gutter', 'breath', 'divider']
  };

  /* the four editorial structures. A curve, plus where the weight sits. */
  var STRUCTURES = {
    /* long take: stay in one place, then one hit */
    longTake: {
      name: '长镜头', why: '同一主题连着几页，然后一张满版把前面全部兑现',
      curve: function (n) {
        var out = [];
        for (var i = 0; i < n; i++) {
          var t = i / Math.max(1, n - 1);
          var base = 0.40 + 0.10 * Math.sin(t * Math.PI * 2);
          if (t > 0.70 && t < 0.80) base = 0.95;          // the one hit
          if (i === n - 1) base = 0.55;
          out.push(base);
        }
        return out;
      }
    },
    /* crescendo: small peaks, a big one at 60%, another at 85% */
    crescendo: {
      name: '渐强链', why: '每三四页一个小峰，六成处一个大的，八成半再一个',
      curve: function (n) {
        var out = [];
        for (var i = 0; i < n; i++) {
          var t = i / Math.max(1, n - 1);
          var base = 0.42 + 0.12 * Math.sin(i * 1.7);
          if (i % 4 === 3) base = 0.66;
          if (Math.abs(t - 0.60) < 0.05) base = 1.0;
          if (Math.abs(t - 0.85) < 0.04) base = 0.88;
          out.push(Math.max(0.2, Math.min(1, base)));
        }
        return out;
      }
    },
    /* intercut: steady, paired, meaning from juxtaposition */
    intercut: {
      name: '交错', why: '成对翻页，密度平稳，靠左右并置产生意义',
      curve: function (n) {
        var out = [];
        for (var i = 0; i < n; i++) {
          var base = 0.46 + (i % 2 ? 0.08 : -0.06);
          if (i === 0) base = 0.5;
          if (i === n - 1) base = 0.42;
          out.push(base);
        }
        return out;
      }
    },
    /* jump cut: no preparation, hard switches */
    jumpCut: {
      name: '跳切', why: '不铺垫，尺度和内容突然换，制造陌生感',
      curve: function (n) {
        var seq = [0.62, 0.95, 0.28, 0.55, 0.98, 0.22, 0.6, 0.34, 0.9, 0.3];
        var out = [];
        for (var i = 0; i < n; i++) out.push(seq[i % seq.length]);
        return out;
      }
    }
  };

  function snap4(n) { return Math.max(4, Math.round(n / 4) * 4); }

  /* how many pages this set of photos honestly supports */
  function suggestPages(photoCount, kind) {
    if (kind === 'social') return 9;
    var byPhotos = Math.max(8, Math.round(photoCount / 2.2));
    return snap4(byPhotos);
  }

  /* pick a device for one intensity value */
  function deviceFor(I, allowed, opts) {
    var best = null, bestD = 9;
    allowed.forEach(function (k) {
      var d = DEVICES[k];
      if (!d) return;
      var mid = (d.I[0] + d.I[1]) / 2;
      var dist = Math.abs(I - mid);
      if (I < d.I[0]) dist += (d.I[0] - I) * 2;
      if (I > d.I[1]) dist += (I - d.I[1]) * 2;
      if (opts && opts.avoid && opts.avoid.indexOf(k) >= 0) dist += 0.35;
      if (dist < bestD) { bestD = dist; best = k; }
    });
    return best || 'plate';
  }

  /* the hard constraints from the design doc */
  function satisfy(plan, opts) {
    var n = plan.length;
    for (var i = 1; i < n; i++) {
      /* no three of the same device in a row */
      if (i >= 2 && plan[i].device === plan[i - 1].device && plan[i].device === plan[i - 2].device) {
        plan[i] = Object.assign({}, plan[i], { device: 'plate', reason: plan[i].reason + '（同装置连三，换成版心单图）' });
      }
      /* breaths never adjacent */
      if (plan[i].device === 'breath' && plan[i - 1].device === 'breath') {
        plan[i] = Object.assign({}, plan[i], { device: 'plate' });
      }
    }
    /* the strongest page must be the biggest thing in the book */
    var peak = 0;
    plan.forEach(function (p, i) { if (p.I > plan[peak].I) peak = i; });
    if (plan[peak].device !== 'full' && plan[peak].device !== 'gutter') {
      plan[peak].device = 'full';
      plan[peak].reason += '（全书最高点，给满版）';
    }
    /* a scale jump every 8 pages: small-then-big or big-then-small */
    for (var s = 8; s < n; s += 8) {
      var prev = plan[s - 1].device, cur = plan[s].device;
      var big = ['full', 'gutter', 'contact'], small = ['plate', 'breath', 'type'];
      if (big.indexOf(prev) >= 0 && big.indexOf(cur) >= 0) plan[s].device = 'plate';
      if (small.indexOf(prev) >= 0 && small.indexOf(cur) >= 0) plan[s].device = 'full';
    }
    return plan;
  }

  /* counts per device, reconciled to the exact photo count */
  function allocate(plan, photoCount) {
    plan.forEach(function (p) { p.n = DEVICES[p.device].n[0]; });
    var sum = function () { return plan.reduce(function (a, p) { return a + p.n; }, 0); };
    var guard = 0;
    while (sum() < photoCount && guard++ < 500) {
      var grow = plan.filter(function (p) {
        var d = DEVICES[p.device];
        return d.n[1] > p.n && (p.device === 'contact' || p.device === 'strip' || p.device === 'type');
      });
      if (!grow.length) break;
      grow.sort(function (a, b) { return (DEVICES[b.device].n[1] - b.n) - (DEVICES[a.device].n[1] - a.n); });
      grow[0].n++;
    }
    guard = 0;
    while (sum() > photoCount && guard++ < 500) {
      var shrink = plan.filter(function (p) {
        return p.n > DEVICES[p.device].n[0] && (p.device === 'contact' || p.device === 'strip' || p.device === 'type');
      });
      if (!shrink.length) break;
      shrink.sort(function (a, b) { return b.n - a.n; });
      shrink[0].n--;
    }
    return { plan: plan, used: sum() };
  }

  /* the whole plan */
  function plan(photoCount, brief) {
    brief = brief || {};
    var rhythm = STRUCTURES[brief.rhythm] ? brief.rhythm : 'crescendo';
    var comp = brief.composition || 'flexible';
    var allowed = ALLOWED[comp] || ALLOWED.flexible;
    var kind = brief.kind || 'memory';

    var target = brief.length && brief.length.targetPages
      ? snap4(brief.length.targetPages)
      : suggestPages(photoCount, kind);

    var I = STRUCTURES[rhythm].curve(target);

    /* density shifts the device mix, it does not change the curve */
    var density = brief.density || 'balanced';
    var mix = {
      minimal: { breath: 5, prefer: ['plate', 'full', 'type', 'diptych'] },
      balanced: { breath: 10, prefer: ['plate', 'diptych', 'contact', 'strip', 'full'] },
      rich: { breath: 16, prefer: ['contact', 'diptych', 'strip', 'full', 'clash'] }
    }[density] || { breath: 10, prefer: [] };

    var pages = I.map(function (v, i) {
      var device = deviceFor(v, allowed.filter(function (k) {
        if (k === 'breath') return i % mix.breath === mix.breath - 1 && i > 2 && i < target - 2;
        if (k === 'divider') return i > 0 && i % 12 === 0;
        return true;
      }), { avoid: i > 1 ? [pages ? pages[pages.length - 1] : ''] : [] });
      return {
        i: i, I: +v.toFixed(2), device: device,
        name: DEVICES[device].name,
        reason: '强度 ' + v.toFixed(2) + ' → ' + DEVICES[device].name
      };
    });

    /* section dividers: a reset every 12 pages — but never on top of a peak.
       Walk to the nearest page that is already quiet, otherwise skip it. */
    if (target >= 16) {
      for (var d = 12; d < target - 1; d += 12) {
        var spot = -1;
        for (var off = 0; off <= 2 && spot < 0; off++) {
          [d - off, d + off].forEach(function (cand) {
            if (spot >= 0 || cand < 2 || cand >= target - 1) return;
            if (pages[cand].I < 0.45) spot = cand;
          });
        }
        if (spot < 0) continue;
        pages[spot] = { i: spot, I: 0.05, device: 'divider', name: '章节页', reason: '每 12 页一次换气' };
        if (spot - 1 > 1 && pages[spot - 1].I < 0.6) {
          pages[spot - 1] = { i: spot - 1, I: 0.06, device: 'breath', name: '白场', reason: '章节前的空白' };
        }
      }
    }

    pages = satisfy(pages, { target: target });
    var alloc = allocate(pages, photoCount);

    return {
      rhythm: rhythm, rhythmName: STRUCTURES[rhythm].name, why: STRUCTURES[rhythm].why,
      density: density, composition: comp, kind: kind,
      targetPages: target, I: I, pages: alloc.plan, used: alloc.used,
      advise: advise(photoCount, target, alloc.used, kind)
    };
  }

  /* never silently change the page count: say what would happen instead */
  function advise(photos, target, used, kind) {
    if (used === photos) return null;
    if (used < photos) {
      return '这个页数放不下全部 ' + photos + ' 张（排进去 ' + used + ' 张）。' +
        '建议加到 ' + snap4(target + Math.ceil((photos - used) / 3)) + ' 页，或者减少选片。';
    }
    return '按 ' + target + ' 页排完还空 ' + (used - photos) + ' 张的量，建议减到 ' +
      snap4(target - Math.ceil((used - photos) / 3)) + ' 页。';
  }

  M.PLAN = {
    DEVICES: DEVICES,
    STRUCTURES: STRUCTURES,
    suggestPages: suggestPages,
    snap4: snap4,
    plan: plan,
    deviceFor: deviceFor
  };
})(window.MEM);
