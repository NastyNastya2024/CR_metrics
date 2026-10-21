/* Дашборд метрик рефинансирования. Запускается из auth.js после входа. */
window.startApp = function () {
  "use strict";
  if (window.__appStarted) return;
  window.__appStarted = true;
  const M = window.METRICS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NB = " ";
  const nf = new Intl.NumberFormat("ru-RU");
  const num = (v) => nf.format(Math.round(v));
  const money = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + NB + "млрд" + NB + "₽";
    if (a >= 1e6) return (v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + NB + "млн" + NB + "₽";
    if (a >= 1e3) return nf.format(Math.round(v / 1e3)) + NB + "тыс" + NB + "₽";
    return num(v) + NB + "₽";
  };
  const pc = (v, d = 1) => (v * 100).toLocaleString("ru-RU", { maximumFractionDigits: d }) + NB + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // детерминированный шум для демо
  function rnd(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  const S = { period: 30, mode: "api", view: "okb", rgPartner: "sovcom" };
  const partnerOf = () => (S.view === "okb" ? null : M.partners.find((p) => p.id === S.view));

  /* ---------- расчёт всех показателей из базовых значений ---------- */
  function model() {
    const k = S.period / 30;
    const pilot = S.mode === "pilot";
    const funnelBase = (pilot ? M.funnelPilot : M.funnelApi).map((f) => ({ ...f, v: f.v * k }));
    const fv = Object.fromEntries(funnelBase.map((f) => [f.id, f.v]));
    const active = M.partners.filter((p) => !pilot || p.pre);
    const wSum = active.reduce((s, p) => s + p.share * (pilot ? 1 : p.appr), 0);
    const sentTotal = pilot ? 0 : fv.sent;
    const rows = active.map((p) => {
      const w = (p.share * (pilot ? 1 : p.appr)) / wSum;
      const requests = pilot ? 0 : sentTotal * p.share * 4.2;          // в среднем запрос уходит в 4,2 банка
      const approved = requests * p.appr;
      const redirects = fv.redirect * w;
      const issued = redirects * p.conv * (pilot ? 0.7 : 1);
      const volume = issued * p.avg;
      const fee = volume * p.cpa / 100;
      const leaks = issued * p.leak / (1 - p.leak);                    // выдачи без нашей ссылки у «смотревших»
      return { ...p, requests, approved, redirects, issued, volume, fee, leaks };
    });
    const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
    const issued = sum("issued");
    funnelBase.forEach((f) => { if (f.id === "issued") f.v = issued; if (f.id === "closed") f.v = issued * 0.87; });
    return { k, pilot, funnel: funnelBase, fv, rows, issued, redirects: sum("redirects"), volume: sum("volume"), fee: sum("fee"), leaks: sum("leaks"), requests: sum("requests"), approved: sum("approved") };
  }

  /* ---------- шапка ---------- */
  function renderHead(m) {
    const P = partnerOf();
    $("#asOf").textContent = `Данные на ${M.asOf}, обновление раз в час`;
    $("#ovEyebrow").textContent = `${S.period === 90 ? "Квартал" : "Последние " + S.period + " дней"} · ${m.pilot ? "пилот на реестрах предодобрений" : "онлайн-запросы по API"}`;
    $("#ovTitle").textContent = P ? `Кабинет партнёра: ${P.name}` : "Метрики рефинансирования";
    $("#ovNote").textContent = P
      ? "Партнёр видит только свои запросы, лиды и расчёты. Данные других банков и общая воронка платформы скрыты."
      : m.pilot
        ? "Пилот: банки раз в сутки присылают реестры предодобрений, клиент переходит на сайт банка. Онлайн-запросов и ответов по API нет."
        : "Главная метрика — подтверждённые по кредитной истории выдачи. Переходы без выдачи не оплачиваются.";
    $("#whoMark").textContent = P ? P.name[0] : "ОКБ";
    $("#whoName").textContent = P ? `${P.name} · выйти` : "Продукт · выйти";
    $$("[data-okb-only]").forEach((el) => (el.hidden = !!P));
  }

  /* ---------- KPI ---------- */
  function kpiTile(label, value, sub, delta, spark) {
    const up = delta >= 0;
    return `<article class="kpi card mx-kpi">
      <span class="kpi__label">${label}</span>
      <strong class="kpi__value">${value}</strong>
      ${delta == null ? "" : `<span class="mx-delta ${up ? "is-up" : "is-down"}">${up ? "▲" : "▼"} ${pc(Math.abs(delta), 0)} <small>к прошлому периоду</small></span>`}
      ${sub ? `<p class="kpi__hint">${sub}</p>` : ""}
    </article>`;
  }
  function renderKpis(m) {
    const P = partnerOf();
    let html;
    if (P) {
      const r = m.rows.find((x) => x.id === P.id);
      if (!r) { $("#kpis").innerHTML = `<p class="muted">В пилоте ${P.name} не передаёт реестры предодобрений.</p>`; return; }
      html = (m.pilot ? kpiTile("Клиентов из вашего реестра увидели предложение", num(m.fv.shown * r.share / 0.58), "по реестру от 20.10", 0.06) :
        kpiTile("Получено запросов", num(r.requests), `одобрено ${pc(r.appr, 0)} · ответ p95 ${r.p95} с`, 0.12)) +
        kpiTile("Переходов на ваш сайт", num(r.redirects), "с lead_id и UTM-метками", 0.09) +
        kpiTile("Подтверждённых выдач", num(r.issued), `${pc(r.issued / r.redirects, 0)} от переходов · сумма ${money(r.volume)}`, 0.14) +
        kpiTile("Вознаграждение к оплате", money(r.fee), `${r.cpa.toLocaleString("ru-RU")}% от суммы выдачи`, 0.14);
    } else if (m.pilot) {
      html = kpiTile("Клиентов в реестрах", num(m.fv.registry), `найдено в ЛК ${pc(m.fv.matched / m.fv.registry, 0)}`, 0.04) +
        kpiTile("Переходов на сайт банка", num(m.redirects), `${pc(m.redirects / m.fv.shown, 1)} от увидевших`, 0.08) +
        kpiTile("Подтверждённых выдач", num(m.issued), `сумма ${money(m.volume)}`, 0.11) +
        kpiTile("Вознаграждение", money(m.fee), "по актам сверки", 0.11);
    } else {
      html = kpiTile("Подтверждённых выдач", num(m.issued), `сумма ${money(m.volume)} · ${pc(m.issued / m.fv.shown, 2)} от увидевших экономию`, 0.18) +
        kpiTile("Вознаграждение", money(m.fee), `средний чек ${money(m.volume / m.issued)}`, 0.18) +
        kpiTile("Конверсия запрос → одобрение", pc(m.fv.approved / m.fv.sent, 0), `ответили все банки за 2 мин — 93%`, 0.03) +
        kpiTile("Средняя экономия клиента", money(M.value.payDiff) + "/мес", `ставка ${M.value.avgRateBefore.toLocaleString("ru-RU")}% → ${(m.rows.reduce((s, r) => s + r.rate * r.issued, 0) / m.issued).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`, 0.05);
    }
    $("#kpis").innerHTML = html;
  }

  /* ---------- тренд: переходы и выдачи ---------- */
  function series(m) {
    const P = partnerOf();
    const r = P ? m.rows.find((x) => x.id === P.id) : null;
    const totR = r ? r.redirects : m.redirects, totI = r ? r.issued : m.issued;
    const weekly = S.period === 90, n = weekly ? 13 : S.period;
    const g = rnd(S.period * 7 + (S.mode === "api" ? 3 : 11) + (P ? P.id.length * 13 : 0));
    const wr = [], wi = [];
    for (let i = 0; i < n; i++) {
      const trend = 0.8 + 0.4 * (i / (n - 1));
      const dow = weekly ? 1 : [0.75, 1.05, 1.1, 1.08, 1.06, 1.0, 0.82][i % 7];
      wr.push(trend * dow * (0.9 + 0.2 * g()));
      wi.push(trend * dow * (0.85 + 0.3 * g()) * (i < 3 ? 0.7 : 1));
    }
    const nr = wr.reduce((a, b) => a + b), ni = wi.reduce((a, b) => a + b);
    const end = new Date(2026, 9, 20);
    const labels = Array.from({ length: n }, (_, i) => {
      const d = new Date(end); d.setDate(end.getDate() - (n - 1 - i) * (weekly ? 7 : 1));
      return (weekly ? "нед. " : "") + d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
    });
    return { labels, a: wr.map((v) => (v / nr) * totR), b: wi.map((v) => (v / ni) * totI), weekly };
  }
  function renderTrend(m) {
    const s = series(m);
    $("#trendTitle").textContent = `Переходы и подтверждённые выдачи · ${s.weekly ? "по неделям" : "по дням"}`;
    $("#trendLegend").innerHTML = `<span class="lg"><i style="background:var(--c1)"></i>Переходы на сайт банка</span><span class="lg"><i style="background:var(--c2)"></i>Выдачи по КИ</span>`;
    const W = 640, H = 220, pl = 44, pr = 12, pt = 12, pb = 28;
    const max = niceMax(Math.max(...s.a));
    const x = (i) => pl + (i / (s.labels.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - v / max) * (H - pt - pb);
    const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
    const step = Math.ceil(s.labels.length / 6);
    const last = s.labels.length - 1;
    $("#trend").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="tr" role="img" aria-label="График переходов и выдач">
        ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${num(t)}</text>`).join("")}
        ${s.labels.map((l, i) => (i % step === 0 || i === last) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ax">${l}</text>` : "").join("")}
        <path d="${path(s.a)} L ${x(last)} ${y(0)} L ${x(0)} ${y(0)} Z" class="area1"/>
        <path d="${path(s.a)}" class="ln ln1"/>
        <path d="${path(s.b)}" class="ln ln2"/>
        <circle cx="${x(last)}" cy="${y(s.a[last])}" r="3.5" class="dot1"/>
        <circle cx="${x(last)}" cy="${y(s.b[last])}" r="3.5" class="dot2"/>
        <line class="hair" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/>
        <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" fill="transparent" class="hit"/>
      </svg>`;
    const svg = $("#trend svg"), hair = svg.querySelector(".hair"), hit = svg.querySelector(".hit");
    const move = (ev) => {
      const pt0 = svg.createSVGPoint(); pt0.x = ev.clientX; pt0.y = ev.clientY;
      const p = pt0.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(last, Math.round(((p.x - pl) / (W - pl - pr)) * last)));
      hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("visibility", "visible");
      showTip(ev, `<b>${s.labels[i]}</b><span><i style="background:var(--c1)"></i>${num(s.a[i])} переходов</span><span><i style="background:var(--c2)"></i>${num(s.b[i])} выдач</span>`);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { hair.setAttribute("visibility", "hidden"); hideTip(); });
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p / 2) * 2 * p || 1; }

  /* ---------- ценность для клиента ---------- */
  function renderValue(m) {
    const V = M.value;
    $("#value").innerHTML = `
      <dl class="mx-facts">
        <div><dt>Средняя экономия платежа</dt><dd>${money(V.payDiff)} <small>в месяц</small></dd></div>
        <div><dt>Средняя экономия переплаты</dt><dd>${money(V.intDiff)} <small>за срок</small></dd></div>
        <div><dt>Нагрузка (ПДН)</dt><dd>${V.pdnBefore}% → ${V.pdnAfter}%</dd></div>
        <div><dt>Все выбранные цели достигнуты</dt><dd>${pc(V.goalsMet, 0)} <small>расчётов</small></dd></div>
        <div><dt>Средняя ставка до → после</dt><dd>ставка ${V.avgRateBefore.toLocaleString("ru-RU")}% → ${(m.rows.reduce((s, r) => s + r.rate * r.issued, 0) / m.issued).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</dd></div>
        <div><dt>Средняя ставка по рынку</dt><dd>ставка ${M.marketRate.toLocaleString("ru-RU")}%</dd></div>
      </dl>
      <p class="note">По подтверждённым выдачам: платёж и ставка до — из КИ по закрытым кредитам, после — по новому кредиту в КИ.</p>`;
  }

  /* ---------- воронка ---------- */
  function renderFunnel(m) {
    const P = partnerOf();
    let steps = m.funnel;
    if (P) {
      const r = m.rows.find((x) => x.id === P.id);
      steps = r ? (m.pilot
        ? [{ name: "Переходов на ваш сайт", v: r.redirects, src: "lead_id" }, { name: "Подтверждённых выдач", v: r.issued, src: "сверка по КИ" }]
        : [{ name: "Получено запросов", v: r.requests, src: "API" }, { name: "Одобрено", v: r.approved, src: "API" }, { name: "Переходов на ваш сайт", v: r.redirects, src: "lead_id" }, { name: "Подтверждённых выдач", v: r.issued, src: "сверка по КИ" }]) : [];
    }
    $("#fnHint").textContent = P ? "Только ваши запросы и лиды" : "Конверсия считается от предыдущего шага и от первого";
    const max = steps.length ? steps[0].v : 1;
    $("#funnelChart").innerHTML = `<ol class="fn">${steps.map((f, i) => {
      const prev = i ? steps[i - 1].v : f.v;
      const w = Math.max(0.6, (f.v / max) * 100);
      return `<li class="fn__row" tabindex="0" data-tip="${esc(`<b>${num(f.v)}</b><span>${f.name}</span><span>источник: ${f.src}</span>`)}">
        <span class="fn__name">${f.name}<small>${f.src}</small></span>
        <span class="fn__bar"><span style="width:${w}%"></span></span>
        <span class="fn__v">${num(f.v)}</span>
        <span class="fn__c">${i ? pc(f.v / prev, f.v / prev < 0.1 ? 1 : 0) : "—"}<small>${i ? "от шага" : ""}</small></span>
      </li>`;
    }).join("")}</ol>`;
  }

  /* ---------- партнёры ---------- */
  function renderPartners(m) {
    const P = partnerOf();
    const rows = P ? m.rows.filter((r) => r.id === P.id) : m.rows.slice().sort((a, b) => b.issued - a.issued);
    const maxI = Math.max(...m.rows.map((r) => r.issued));
    $("#ptHint").textContent = m.pilot ? "В пилоте участвуют банки, приславшие реестры предодобрений" : "Сортировка по подтверждённым выдачам";
    const head = m.pilot
      ? ["Банк", "Переходов", "Выдач по КИ", "Конверсия", "Сумма выдач", "Ставка, годовых", "Вознаграждение"]
      : ["Банк", "Запросов", "Одобрено", "Переходов", "Выдач по КИ", "Конверсия", "Сумма выдач", "Ставка, годовых", "Вознаграждение"];
    $("#ptTable").innerHTML = `<thead><tr>${head.map((h, i) => `<th class="${i ? "r" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `
      <tr>
        <th scope="row"><span class="bank-mark bank-mark--sm" style="--bank:${r.color}">${r.name[0]}</span>${r.name}${r.pre ? ` <span class="badge badge--ok">Предодобрения</span>` : ""}</th>
        ${m.pilot ? "" : `<td class="r">${num(r.requests)}</td><td class="r">${pc(r.appr, 0)}</td>`}
        <td class="r">${num(r.redirects)}</td>
        <td class="r"><span class="cellbar"><span style="width:${(r.issued / maxI) * 100}%"></span></span>${num(r.issued)}</td>
        <td class="r">${pc(r.issued / r.redirects, 0)}</td>
        <td class="r">${money(r.volume)}</td>
        <td class="r">${r.rate.toLocaleString("ru-RU")}%<small>рынок ${M.marketRate.toLocaleString("ru-RU")}%</small></td>
        <td class="r"><b>${money(r.fee)}</b><small>${r.cpa.toLocaleString("ru-RU")}% от суммы</small></td>
      </tr>`).join("")}</tbody>
      ${P ? "" : `<tfoot><tr><th>Итого</th>${m.pilot ? "" : `<td class="r">${num(m.requests)}</td><td class="r">${pc(m.approved / m.requests, 0)}</td>`}<td class="r">${num(m.redirects)}</td><td class="r">${num(m.issued)}</td><td class="r">${pc(m.issued / m.redirects, 0)}</td><td class="r">${money(m.volume)}</td><td></td><td class="r"><b>${money(m.fee)}</b></td></tr></tfoot>`}`;
    if (!m.pilot) $("#ptTable tbody").insertAdjacentHTML("beforeend", "");
  }

  /* ---------- реестр расчётов ---------- */
  const STATUS = [
    ["confirmed", "Выдача подтверждена", "ok"], ["pending", "Ожидает сверки", "warn"], ["other", "Выдача у другого банка", "primary"],
    ["none", "Не подтверждено", "no"], ["dispute", "Оспаривается партнёром", "no"]
  ];
  function leads(m, pid) {
    const r = m.rows.find((x) => x.id === pid);
    if (!r) return { r: null, list: [] };
    const g = rnd(pid.length * 101 + S.period + (S.mode === "api" ? 1 : 2));
    const goals = ["Меньше платёж", "Ниже ставка", "Больше денег", "Платёж + ставка"];
    const list = Array.from({ length: 14 }, (_, i) => {
      const x = g();
      const st = x < 0.36 ? STATUS[0] : x < 0.70 ? STATUS[1] : x < 0.76 ? STATUS[2] : x < 0.97 ? STATUS[3] : STATUS[4];
      const day = Math.max(1, 20 - Math.floor(g() * 19));
      const amount = Math.round((r.avg * (0.5 + g())) / 10000) * 10000;
      const issuedAmt = st[0] === "confirmed" || st[0] === "dispute" ? Math.round((amount * (0.93 + g() * 0.1)) / 1000) * 1000 : 0;
      return {
        lead: "CR-" + (73000 + Math.floor(g() * 9000)).toString(36).toUpperCase() + "-" + (100 + i),
        date: `${String(day).padStart(2, "0")}.10.2026`, client: "id••" + Math.floor(1000 + g() * 8999),
        goal: goals[Math.floor(g() * goals.length)], amount, st, issuedAmt,
        issuedDate: issuedAmt ? `${String(Math.min(20, day + 1 + Math.floor(g() * 4))).padStart(2, "0")}.10.2026` : "",
        fee: st[0] === "confirmed" ? (issuedAmt * r.cpa) / 100 : 0
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
    return { r, list };
  }
  function renderRegistry(m) {
    const P = partnerOf();
    const opts = (P ? [P] : m.rows).map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
    const sel = $("#rgPartner");
    sel.innerHTML = opts;
    if (P) S.rgPartner = P.id;
    if (!m.rows.find((r) => r.id === S.rgPartner)) S.rgPartner = m.rows[0].id;
    sel.value = S.rgPartner; sel.disabled = !!P;
    const { r, list } = leads(m, S.rgPartner);
    if (!r) { $("#rgKpis").innerHTML = ""; $("#rgTable").innerHTML = ""; return; }
    const confirmed = r.issued, pending = r.redirects * 0.34, none = r.redirects - confirmed - pending - r.redirects * 0.05;
    $("#rgKpis").innerHTML =
      kpiTile("Лидов за период", num(r.redirects), "переходы с lead_id") +
      kpiTile("Выдача подтверждена", num(confirmed), `сумма ${money(r.volume)}`) +
      kpiTile("Ожидают сверки", num(pending), "окно 30 дней от перехода") +
      kpiTile("К оплате партнёром", money(r.fee), `акт: ${P ? "ждёт вашего согласования" : "черновик, отправка 01.11"}`);
    $("#rgTable").innerHTML = `<thead><tr><th>Лид</th><th>Переход</th><th>Клиент</th><th>Цель</th><th class="r">Сумма запроса</th><th>Выдача по КИ</th><th>Статус сверки</th><th class="r">Вознаграждение</th>${P ? "<th></th>" : ""}</tr></thead>
      <tbody>${list.map((l) => `<tr>
        <td><code>${l.lead}</code></td><td>${l.date}</td><td>${l.client}</td><td>${l.goal}</td>
        <td class="r">${money(l.amount)}</td>
        <td>${l.issuedAmt ? `${money(l.issuedAmt)}<small>${l.issuedDate}</small>` : "—"}</td>
        <td><span class="badge badge--${l.st[2]}">${l.st[1]}</span></td>
        <td class="r">${l.fee ? money(l.fee) : "—"}</td>
        ${P ? `<td>${l.st[0] === "confirmed" ? `<button class="link" type="button" data-dispute="${l.lead}">Оспорить</button>` : ""}</td>` : ""}
      </tr>`).join("")}</tbody>`;
    $("#rgNote").textContent = `Правило сверки: лид подтверждён, если в течение 30 дней после перехода в КИ клиента появился кредит ${r.name} на сумму в пределах ±10% от запроса и закрыт хотя бы один рефинансируемый кредит. Показаны последние 14 лидов из ${num(r.redirects)}.`;
    S._rows = list; S._r = r;
  }
  $("#rgPartner").addEventListener("change", (e) => { S.rgPartner = e.target.value; renderRegistry(model()); });
  $("#rgExport").addEventListener("click", () => {
    const rows = [["lead_id", "дата перехода", "клиент", "цель", "сумма запроса", "сумма выдачи", "дата выдачи", "статус", "вознаграждение"]]
      .concat((S._rows || []).map((l) => [l.lead, l.date, l.client, l.goal, l.amount, l.issuedAmt || "", l.issuedDate, l.st[1], Math.round(l.fee)]));
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `registry_${S.rgPartner}_${S.period}d.csv`; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { /* в песочнице скачивание может быть запрещено */ }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-dispute]"); if (!b) return;
    const td = b.parentElement; td.innerHTML = `<span class="badge badge--no">Спор открыт</span>`;
  });

  /* ---------- атрибуция ---------- */
  function renderAttr(m) {
    const P = partnerOf();
    const rows = P ? m.rows.filter((r) => r.id === P.id) : m.rows.slice().sort((a, b) => b.leak - a.leak);
    const Sv = M.survey, k = m.k;
    const lostShare = Sv.found + Sv.compared;
    const leaksTotal = rows.reduce((s, r) => s + r.leaks, 0);
    const lostFee = rows.reduce((s, r) => s + r.leaks * lostShare * r.avg * r.cpa / 100, 0);
    const maxLeak = Math.max(...m.rows.map((r) => r.leak));
    $("#attrGrid").innerHTML = `
      <article class="card mx-card">
        <header class="mx-card__head"><h3 class="h3">Выдачи в обход ссылки</h3></header>
        <p class="mx-big">${num(leaksTotal)}</p>
        <p class="muted">клиенты смотрели предложение банка в Кредистории, а кредит в этом банке оформили без перехода по нашей ссылке (окно 30 дней)</p>
        <ul class="hb">${rows.map((r) => `<li tabindex="0" data-tip="${esc(`<b>${pc(r.leak, 0)}</b><span>${r.name}: ${num(r.leaks)} выдач без ссылки</span>`)}"><span class="hb__n">${r.name}</span><span class="hb__t"><span style="width:${(r.leak / maxLeak) * 100}%;${r.leak > 0.2 ? "background:var(--c3)" : ""}"></span></span><span class="hb__v">${pc(r.leak, 0)}</span></li>`).join("")}</ul>
        <p class="note">Доля = выдачи без ссылки / (выдачи по ссылке + без ссылки). Выше 20% — повод для разговора с партнёром.</p>
      </article>
      <article class="card mx-card">
        <header class="mx-card__head"><h3 class="h3">Опрос «Помогла ли Кредистория?»</h3></header>
        <p class="mx-big">${num(Sv.answered * k)} <small>ответов из ${num(Sv.shown * k)} · ${pc(Sv.answered / Sv.shown, 0)}</small></p>
        ${stack([["Нашла предложение здесь", Sv.found, "var(--c1)"], ["Сравнила здесь, оформила в банке", Sv.compared, "var(--c2)"], ["Решила без Кредистории", Sv.none, "var(--c0)"]])}
        <p class="muted mx-sub">Как оформили (если помогла)</p>
        ${stack([["Приложение или сайт банка", Sv.chApp, "var(--c1)"], ["Банк позвонил сам", Sv.chCall, "var(--c3)"], ["Отделение", Sv.chOffice, "var(--c0)"]])}
        <p class="note">«Банк позвонил сам» — сильный сигнал, что банк забрал клиента после просмотра у нас.</p>
      </article>
      <article class="card mx-card">
        <header class="mx-card__head"><h3 class="h3">Оценка недополученного вознаграждения</h3></header>
        <p class="mx-big">${money(lostFee)}</p>
        <p class="muted">= выдачи в обход ссылки × доля ответов «помогла» (${pc(lostShare, 0)}) × средний чек × ставка вознаграждения партнёра</p>
        <dl class="mx-facts mx-facts--1">
          <div><dt>Выдачи в обход ссылки</dt><dd>${num(leaksTotal)}</dd></div>
          <div><dt>Из них, по опросу, повлияла Кредистория</dt><dd>≈ ${num(leaksTotal * lostShare)}</dd></div>
          <div><dt>Подтверждённые выдачи по ссылке</dt><dd>${num(rows.reduce((s, r) => s + r.issued, 0))}</dd></div>
        </dl>
        <p class="note">Оценка для переговоров с партнёрами, не основание для выставления счёта.</p>
      </article>`;
  }
  function stack(items) {
    return `<div class="stk" role="img" aria-label="${esc(items.map((i) => i[0] + " " + pc(i[1], 0)).join(", "))}">${items.map((i) => `<span style="width:${i[1] * 100}%;background:${i[2]}" tabindex="0" data-tip="${esc(`<b>${pc(i[1], 0)}</b><span>${i[0]}</span>`)}"></span>`).join("")}</div>
      <ul class="stk__lg">${items.map((i) => `<li><i style="background:${i[2]}"></i>${i[0]} <b>${pc(i[1], 0)}</b></li>`).join("")}</ul>`;
  }

  /* ---------- качество ---------- */
  function renderQuality(m) {
    const P = partnerOf();
    let left;
    if (m.pilot) {
      const loads = M.registryLoads.filter((l) => !P || l.bank === P.name);
      left = `<article class="card mx-card"><header class="mx-card__head"><h3 class="h3">Загрузка реестров предодобрений</h3></header>
        <div class="table-wrap"><table class="mx-table"><thead><tr><th>Получен</th><th>Банк</th><th class="r">Строк</th><th class="r">Ошибок</th><th>Статус</th></tr></thead><tbody>
        ${loads.map((l) => `<tr><td>${l.date}<small>${l.file}</small></td><td>${l.bank}</td><td class="r">${num(l.rows)}</td><td class="r ${l.errors / l.rows > 0.02 ? "bad" : ""}">${num(l.errors)}</td><td><span class="badge badge--${l.status === "ok" ? "ok" : "warn"}">${l.status === "ok" ? "Загружен" : "Ошибок > 2%"}</span></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Реестров от партнёра не было</td></tr>`}
        </tbody></table></div>
        <p class="note">Реестр устаревает через 72 часа: предодобрения из него перестают показываться клиентам.</p></article>`;
    } else {
      const rows = P ? m.rows.filter((r) => r.id === P.id) : m.rows;
      left = `<article class="card mx-card"><header class="mx-card__head"><h3 class="h3">API банков: скорость и ошибки</h3></header>
        <div class="table-wrap"><table class="mx-table"><thead><tr><th>Банк</th><th class="r">Ответ p95</th><th class="r">Нет ответа</th><th class="r">Ошибки API</th><th>SLA</th></tr></thead><tbody>
        ${rows.map((r) => { const err = (r.na * 0.6); const ok = r.p95 <= 90 && r.na <= 0.05; return `<tr><td>${r.name}</td><td class="r ${r.p95 > 90 ? "bad" : ""}">${r.p95} с</td><td class="r ${r.na > 0.05 ? "bad" : ""}">${pc(r.na, 0)}</td><td class="r">${pc(err, 1)}</td><td><span class="badge badge--${ok ? "ok" : "warn"}">${ok ? "В норме" : "Нарушен"}</span></td></tr>`; }).join("")}
        </tbody></table></div>
        <p class="note">SLA ответа — 90 с (p95), «нет ответа» — не больше 5%. Медиана времени до ответа всех банков — 74 с.</p></article>`;
    }
    const maxT = Math.max(...M.tickets.map((t) => t.base));
    const right = P ? "" : `<article class="card mx-card"><header class="mx-card__head"><h3 class="h3">Обращения в поддержку по пути клиента</h3><span class="legend"><span class="lg"><i style="background:var(--c0)"></i>Квартал до запуска</span><span class="lg"><i style="background:var(--c1)"></i>Текущий квартал</span></span></header>
      <ul class="tk">${M.tickets.map((t) => `<li tabindex="0" data-tip="${esc(`<b>${t.base} → ${t.now}</b><span>${t.name}</span>`)}"><span class="tk__n">${t.name}<small>${t.c}</small></span>
        <span class="tk__bars"><span class="tk__b tk__b--base" style="width:${(t.base / maxT) * 100}%"></span><span class="tk__b" style="width:${(t.now / maxT) * 100}%"></span></span>
        <span class="tk__v">${t.base} → <b>${t.now}</b></span></li>`).join("")}</ul>
      <p class="note">Категории из аналитики обращений IMSB2C-1978. Цель — снизить вдвое: было ${M.tickets.reduce((s, t) => s + t.base, 0)}, сейчас ${M.tickets.reduce((s, t) => s + t.now, 0)}.</p></article>`;
    $("#qualityGrid").innerHTML = left + right;
    $("#qualityGrid").classList.toggle("mx-grid--1", !!P);
  }

  /* ---------- подсказка ---------- */
  const tip = $("#tip");
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  document.addEventListener("pointerover", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) showTip(e, t.dataset.tip); });
  document.addEventListener("pointermove", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) showTip(e, t.dataset.tip); });
  document.addEventListener("pointerout", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) hideTip(); });
  document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) { const r = t.getBoundingClientRect(); showTip({ clientX: r.left + 20, clientY: r.bottom }, t.dataset.tip); } });
  document.addEventListener("focusout", hideTip);

  /* ---------- фильтры ---------- */
  function seg(sel, key) {
    $(sel).addEventListener("click", (e) => {
      const b = e.target.closest(".seg__btn"); if (!b) return;
      $$(".seg__btn", $(sel)).forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-checked", x === b); });
      S[key] = key === "period" ? +b.dataset.v : b.dataset.v; render();
    });
  }
  seg("#fPeriod", "period"); seg("#fMode", "mode");
  $("#fView").addEventListener("change", (e) => { S.view = e.target.value; render(); });

  function render() {
    const m = model();
    renderHead(m); renderKpis(m); renderTrend(m); renderValue(m); renderFunnel(m); renderPartners(m); renderRegistry(m); renderAttr(m); renderQuality(m);
  }
  render();

  const links = $$(".subnav a");
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  ["overview", "funnel", "partners", "registry", "attr", "quality"].forEach((id) => io.observe(document.getElementById(id)));
};
